import "server-only";
import { transaction } from "./db";
import { getOrder, activity } from "./orders";
import { prepareOperation, guardOperation } from "./operations";
import { stripe } from "./providers";
import { reconcile } from "./payments";
import { assert } from "./http";
import { queueEmail } from "./emails";
import { money } from "../domain";
export async function requestBalance(id: string, actor: string) {
  await prepareOperation(`invoice:${id}`, id);
  return transaction(async (tx) => {
    const order = await getOrder(id, tx, true),
      api = stripe();
    assert(
      order.fulfillment === "READY_FOR_BALANCE",
      "Mark the work complete before requesting payment.",
    );
    const paid = await reconcile(tx, order, api);
    if (order.invoice_id) {
      const existing = await api.invoices.retrieve(order.invoice_id);
      return { url: existing.hosted_invoice_url, status: existing.status };
    }
    assert(
      paid.status === "DEPOSIT_PAID" &&
        paid.outstanding > 0 &&
        order.stripe_customer_id,
      "Verify the deposit and resolve refunds/disputes first.",
    );
    await guardOperation(tx, `invoice:${id}`);
    const invoice = await api.invoices.create(
      {
        customer: order.stripe_customer_id,
        collection_method: "send_invoice",
        days_until_due: 7,
        auto_advance: false,
        pending_invoice_items_behavior: "exclude",
        metadata: { order_id: id, kind: "balance" },
        payment_settings: { payment_method_types: ["card"] },
        description: `${order.reference}: ${order.pricing.service} — remaining balance`,
      },
      { idempotencyKey: `invoice:${id}` },
    );
    await api.invoiceItems.create(
      {
        customer: order.stripe_customer_id,
        invoice: invoice.id,
        currency: order.currency,
        amount: paid.outstanding,
        description: `${order.reference} — balance after verified deposit`,
      },
      { idempotencyKey: `invoice-item:${id}` },
    );
    const finalized = await api.invoices.finalizeInvoice(
      invoice.id,
      { auto_advance: false },
      { idempotencyKey: `finalize:${id}` },
    );
    assert(
      finalized.total === paid.outstanding && finalized.hosted_invoice_url,
      "Invoice amount mismatch",
    );
    await tx.query(
      "UPDATE orders SET invoice_id=$2,invoice_status=$3 WHERE id=$1",
      [id, invoice.id, finalized.status],
    );
    await queueEmail(
      tx,
      order,
      "balance",
      `Outstanding balance: ${money(paid.outstanding)}\nSecure payment: ${finalized.hosted_invoice_url}`,
    );
    await activity(tx, id, actor, "balance_requested", {
      invoiceId: invoice.id,
      cents: paid.outstanding,
    });
    return { url: finalized.hosted_invoice_url, status: finalized.status };
  });
}
