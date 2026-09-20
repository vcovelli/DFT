import "server-only";
import type Stripe from "stripe";
import { paymentSummary, type Ledger } from "../domain";
import { type DB, transaction } from "./db";
import { getOrder, activity, type Order } from "./orders";
import { assert } from "./http";
import { stripe } from "./providers";
import { queueEmail } from "./emails";
export function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}
export async function summary(tx: DB, order: Order) {
  const credit = Number(
    (
      await tx.query(
        "SELECT COALESCE(SUM(credit_cents),0) AS credit FROM order_adjustments WHERE order_id=$1",
        [order.id],
      )
    ).rows[0].credit,
  );
  return {
    ...paymentSummary(
      order.total - credit,
      order.deposit,
      (
        await tx.query<Ledger>(
          "SELECT received,refunded,disputed FROM payments WHERE order_id=$1",
          [order.id],
        )
      ).rows,
    ),
    credit,
  };
}
async function recordIntent(
  tx: DB,
  api: Stripe,
  order: Order,
  intentId: string,
  kind: "deposit" | "balance",
  expected: number,
) {
  const pi = await api.paymentIntents.retrieve(intentId);
  assert(
    objectId(pi.customer) === order.stripe_customer_id &&
      pi.currency === order.currency &&
      pi.amount === expected,
    "Payment relationship mismatch",
  );
  if (kind === "deposit")
    assert(
      pi.metadata.order_id === order.id && pi.metadata.kind === "deposit",
      "Deposit relationship mismatch",
    );
  if (pi.status !== "succeeded") return;
  assert(pi.amount_received === expected, "Payment amount mismatch");
  for await (const charge of api.charges.list({
    payment_intent: pi.id,
    limit: 100,
  })) {
    if (!charge.paid || !charge.captured) continue;
    assert(
      objectId(charge.customer) === order.stripe_customer_id &&
        objectId(charge.payment_intent) === pi.id &&
        charge.currency === order.currency &&
        charge.amount_captured === expected,
      "Charge relationship mismatch",
    );
    let disputed = 0;
    if (charge.disputed) {
      for await (const dispute of api.disputes.list({
        charge: charge.id,
        limit: 100,
      })) {
        if (dispute.status !== "won" && dispute.status !== "warning_closed")
          disputed += dispute.amount;
      }
    }
    disputed = Math.min(
      disputed,
      charge.amount_captured - charge.amount_refunded,
    );
    const existing = (
      await tx.query(
        "SELECT order_id FROM payments WHERE stripe_charge_id=$1",
        [charge.id],
      )
    ).rows[0];
    assert(
      !existing || existing.order_id === order.id,
      "Charge already associated with another order",
    );
    await tx.query(
      `INSERT INTO payments(stripe_charge_id,order_id,stripe_payment_intent_id,kind,received,refunded,disputed,currency)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(stripe_charge_id) DO UPDATE SET received=EXCLUDED.received,refunded=EXCLUDED.refunded,disputed=EXCLUDED.disputed,updated_at=now()`,
      [
        charge.id,
        order.id,
        pi.id,
        kind,
        charge.amount_captured,
        charge.amount_refunded,
        disputed,
        order.currency,
      ],
    );
  }
}
export async function reconcile(tx: DB, order: Order, api: Stripe = stripe()) {
  if (order.checkout_id) {
    const session = await api.checkout.sessions.retrieve(order.checkout_id);
    assert(
      session.metadata?.order_id === order.id &&
        session.client_reference_id === order.id &&
        objectId(session.customer) === order.stripe_customer_id &&
        session.amount_total === order.deposit &&
        session.currency === order.currency,
      "Checkout relationship mismatch",
    );
    const pi = objectId(session.payment_intent);
    if (pi) await recordIntent(tx, api, order, pi, "deposit", order.deposit);
    await tx.query("UPDATE orders SET checkout_status=$2 WHERE id=$1", [
      order.id,
      session.status,
    ]);
    if (
      session.status === "expired" &&
      order.fulfillment === "AWAITING_DEPOSIT"
    )
      await queueEmail(tx, order, "failed", "", ":deposit");
  }
  if (order.invoice_id) {
    const invoice = await api.invoices.retrieve(order.invoice_id);
    assert(
      invoice.metadata?.order_id === order.id &&
        objectId(invoice.customer) === order.stripe_customer_id &&
        invoice.currency === order.currency,
      "Invoice relationship mismatch",
    );
    // Credit notes / dashboard adjustments never count as cash received. Only verified charges do.
    for await (const payment of api.invoicePayments.list({
      invoice: invoice.id,
      status: "paid",
      limit: 100,
    })) {
      const pi = objectId(payment.payment.payment_intent);
      assert(
        objectId(payment.invoice) === invoice.id &&
          payment.currency === order.currency,
        "Invoice payment mismatch",
      );
      if (pi && payment.amount_paid)
        await recordIntent(tx, api, order, pi, "balance", payment.amount_paid);
    }
    await tx.query("UPDATE orders SET invoice_status=$2 WHERE id=$1", [
      order.id,
      invoice.status,
    ]);
  }
  const paid = await summary(tx, order);
  await tx.query("UPDATE orders SET payment_status=$2 WHERE id=$1", [
    order.id,
    paid.status,
  ]);
  if (paid.net >= order.deposit && order.fulfillment === "AWAITING_DEPOSIT") {
    await tx.query(
      "UPDATE orders SET fulfillment='NEW',delivery_deadline=COALESCE(delivery_deadline,now()+($2 * interval '1 hour')) WHERE id=$1",
      [order.id, order.pricing.turnaroundHours],
    );
    await queueEmail(tx, order, "deposit");
    await queueEmail(tx, order, "new_order");
    await activity(tx, order.id, "stripe", "deposit_verified");
  }
  if (paid.net >= order.deposit)
    await tx.query(
      "UPDATE email_outbox SET suppressed_at=now() WHERE order_id=$1 AND id=$2 AND sent_at IS NULL",
      [order.id, `${order.id}:failed:deposit`],
    );
  if (paid.status === "PAID_IN_FULL") {
    await tx.query(
      "UPDATE email_outbox SET suppressed_at=now() WHERE order_id=$1 AND kind IN ('balance','failed') AND sent_at IS NULL",
      [order.id],
    );
    if (order.fulfillment !== "CANCELLED") await queueEmail(tx, order, "paid");
  } else {
    await tx.query(
      "UPDATE email_outbox SET suppressed_at=now() WHERE order_id=$1 AND kind='paid' AND sent_at IS NULL",
      [order.id],
    );
  }
  if (order.fulfillment === "CANCELLED" && paid.net > 0)
    await queueEmail(tx, order, "review");
  if (paid.refunded > 0 || paid.disputed > 0)
    await queueEmail(tx, order, "review");
  return paid;
}
async function orderForIntent(
  api: Stripe,
  intentId: string,
): Promise<string | undefined> {
  const pi = await api.paymentIntents.retrieve(intentId);
  if (pi.metadata.order_id) return pi.metadata.order_id;
  for await (const payment of api.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: pi.id },
    limit: 100,
  })) {
    const invoice = await api.invoices.retrieve(objectId(payment.invoice)!);
    if (invoice.metadata?.order_id) return invoice.metadata.order_id;
  }
}
export async function eventOrder(
  api: Stripe,
  event: Stripe.Event,
): Promise<string | undefined> {
  const obj = event.data.object as unknown as {
    id: string;
    object: string;
    metadata?: Record<string, string>;
    payment_intent?: string;
    charge?: string;
  };
  if (obj.metadata?.order_id) return obj.metadata.order_id;
  if (obj.object === "payment_intent") return orderForIntent(api, obj.id);
  if (obj.object === "charge") {
    const charge = await api.charges.retrieve(obj.id);
    const pi = objectId(charge.payment_intent);
    if (pi) return orderForIntent(api, pi);
  }
  if (obj.object === "dispute" || obj.object === "refund") {
    const chargeId = objectId(obj.charge);
    if (chargeId) {
      const charge = await api.charges.retrieve(chargeId);
      const pi = objectId(charge.payment_intent);
      if (pi) return orderForIntent(api, pi);
    }
  }
}
export async function processEvent(
  event: Stripe.Event,
  api: Stripe = stripe(),
  run = transaction,
) {
  const relevant =
    /^(checkout\.session\.|payment_intent\.|invoice\.|charge\.(refunded|dispute\.)|refund\.)/.test(
      event.type,
    );
  if (!relevant) return;
  const id = await eventOrder(api, event);
  await run(async (tx) => {
    const inserted = await tx.query(
      "INSERT INTO stripe_events(id,type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id",
      [event.id, event.type],
    );
    if (!inserted.rows.length) return;
    if (!id) return;
    const order = await getOrder(id, tx, true);
    await reconcile(tx, order, api);
    if (
      event.type === "payment_intent.payment_failed" ||
      event.type === "invoice.payment_failed" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const paid = await summary(tx, order);
      if (
        paid.status !== "PAID_IN_FULL" &&
        (event.type === "invoice.payment_failed" || paid.net < order.deposit)
      )
        await queueEmail(
          tx,
          order,
          "failed",
          "",
          event.type === "invoice.payment_failed" ? ":invoice" : ":deposit",
        );
    }
    await activity(tx, id, "stripe", "payment_reconciled", {
      eventId: event.id,
      type: event.type,
    });
  });
}
