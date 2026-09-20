import { after } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireOwner } from "@/lib/server/auth";
import { endpoint, jsonBody, sameOrigin, assert } from "@/lib/server/http";
import { transaction } from "@/lib/server/db";
import { getOrder, activity } from "@/lib/server/orders";
import { reconcile, summary, objectId } from "@/lib/server/payments";
import { stripe } from "@/lib/server/providers";
import { flushEmails, queueEmail } from "@/lib/server/emails";
import { money } from "@/lib/domain";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("checkout"),
      externalId: z.string().regex(/^cs_[a-zA-Z0-9_]+$/),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("invoice"),
      externalId: z.string().regex(/^in_[a-zA-Z0-9_]+$/),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("email"),
      emailId: z.string().max(200),
      resolution: z.enum(["accepted", "not_sent"]),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("credit"),
      cents: z.number().int().positive().max(1000000),
      reason: z.string().trim().min(3).max(300),
      key: z.uuid(),
      confirmed: z.literal(true),
    })
    .strict(),
]);
export const maxDuration = 60;
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return endpoint(async (req) => {
    sameOrigin(req);
    const owner = await requireOwner();
    z.uuid().parse(id);
    const body = schema.parse(await jsonBody(req));
    await transaction(async (tx) => {
      const order = await getOrder(id, tx, true),
        api = stripe();
      if (body.action === "email") {
        const email = (
          await tx.query(
            "SELECT * FROM email_outbox WHERE id=$1 AND order_id=$2 FOR UPDATE",
            [body.emailId, id],
          )
        ).rows[0];
        assert(
          email &&
            !email.sent_at &&
            !email.suppressed_at &&
            email.review_required,
          "This email is not awaiting review.",
        );
        if (body.resolution === "accepted")
          await tx.query(
            "UPDATE email_outbox SET sent_at=now(),review_required=false,last_error='owner_verified_acceptance' WHERE id=$1",
            [email.id],
          );
        else {
          await tx.query(
            "UPDATE email_outbox SET review_required=false,sent_at=now(),last_error='owner_authorized_replacement' WHERE id=$1",
            [email.id],
          );
          await tx.query(
            "INSERT INTO email_outbox(id,order_id,kind,recipient,subject,body) VALUES($1,$2,$3,$4,$5,$6)",
            [
              `${id}:retry:${randomUUID()}`,
              id,
              email.kind,
              email.recipient,
              email.subject,
              email.body,
            ],
          );
        }
      } else if (body.action === "credit") {
        const exists = (
          await tx.query("SELECT order_id FROM order_adjustments WHERE id=$1", [
            body.key,
          ])
        ).rows[0];
        if (exists) {
          assert(exists.order_id === id, "Adjustment reference conflict");
          return;
        }
        assert(
          !(
            await tx.query("SELECT 1 FROM operations WHERE key=$1", [
              `invoice:${id}`,
            ])
          ).rows.length &&
            !order.invoice_id &&
            !["CANCELLED", "DELIVERED"].includes(order.fulfillment),
          "Credits must be recorded before requesting a balance invoice. Use Stripe refunds for collected funds.",
        );
        const paid = await reconcile(tx, order, api);
        assert(
          body.cents <= paid.outstanding &&
            body.cents < order.total - paid.credit,
          "Credit exceeds the outstanding balance.",
        );
        await tx.query(
          "INSERT INTO order_adjustments(id,order_id,credit_cents,reason,actor) VALUES($1,$2,$3,$4,$5)",
          [body.key, id, body.cents, body.reason, owner.id],
        );
        await reconcile(tx, order, api);
      } else if (body.action === "checkout") {
        assert(
          !order.checkout_id || order.checkout_id === body.externalId,
          "Order already has a different Checkout.",
        );
        const session = await api.checkout.sessions.retrieve(body.externalId);
        assert(
          session.metadata?.order_id === id &&
            session.client_reference_id === id &&
            session.amount_total === order.deposit &&
            session.currency === order.currency &&
            objectId(session.customer),
          "Checkout does not match this order.",
        );
        await tx.query(
          "UPDATE orders SET checkout_id=$2,stripe_customer_id=$3 WHERE id=$1",
          [id, session.id, objectId(session.customer)],
        );
        await tx.query(
          "UPDATE operations SET result=$2,review_required=false WHERE key=$1",
          [`checkout:${id}`, JSON.stringify({ id: session.id })],
        );
        await reconcile(tx, await getOrder(id, tx), api);
      } else {
        assert(
          !order.invoice_id || order.invoice_id === body.externalId,
          "Order already has a different invoice.",
        );
        const invoice = await api.invoices.retrieve(body.externalId),
          paid = await summary(tx, order);
        assert(
          invoice.metadata?.order_id === id &&
            objectId(invoice.customer) === order.stripe_customer_id &&
            invoice.currency === order.currency &&
            invoice.status !== "draft" &&
            (order.invoice_id === invoice.id ||
              invoice.total === paid.outstanding),
          "Finalize the matching invoice with the exact outstanding amount in Stripe first.",
        );
        await tx.query(
          "UPDATE orders SET invoice_id=$2,invoice_status=$3 WHERE id=$1",
          [id, invoice.id, invoice.status],
        );
        await tx.query(
          "UPDATE operations SET result=$2,review_required=false WHERE key=$1",
          [`invoice:${id}`, JSON.stringify({ id: invoice.id })],
        );
        if (invoice.status === "open" && invoice.hosted_invoice_url)
          await queueEmail(
            tx,
            order,
            "balance",
            `Outstanding balance: ${money(paid.outstanding)}\nSecure payment: ${invoice.hosted_invoice_url}`,
          );
        await reconcile(tx, await getOrder(id, tx), api);
      }
      await activity(
        tx,
        id,
        owner.id,
        `owner_recovery_${body.action}`,
        body.action === "credit"
          ? { cents: body.cents, reason: body.reason }
          : {},
      );
    });
    after(async () => {
      try {
        await flushEmails(5);
      } catch {
        console.error(
          JSON.stringify({ level: "error", code: "email_flush_failed" }),
        );
      }
    });
    return Response.json({ ok: true });
  })(request);
}
