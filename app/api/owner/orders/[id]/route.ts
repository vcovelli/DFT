import { after } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/server/auth";
import { endpoint, jsonBody, sameOrigin, assert } from "@/lib/server/http";
import { transaction } from "@/lib/server/db";
import { getOrder, activity } from "@/lib/server/orders";
import { reconcile } from "@/lib/server/payments";
import { requestBalance } from "@/lib/server/invoices";
import { storage, stripe } from "@/lib/server/providers";
import { canTransition } from "@/lib/domain";
import { queueEmail, flushEmails } from "@/lib/server/emails";
export const runtime = "nodejs";
export const maxDuration = 60;
const actionSchema = z
  .object({
    action: z.enum([
      "IN_PROGRESS",
      "READY_FOR_BALANCE",
      "DELIVERED",
      "CANCELLED",
      "invoice",
      "reconcile",
    ]),
    confirmed: z.literal(true),
  })
  .strict();
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return endpoint(async (req) => {
    sameOrigin(req);
    const owner = await requireOwner();
    z.uuid().parse(id);
    const { action } = actionSchema.parse(await jsonBody(req));
    if (action === "invoice") {
      const result = await requestBalance(id, owner.id);
      after(async () => {
        try {
          await flushEmails(5);
        } catch {
          console.error(
            JSON.stringify({ level: "error", code: "email_flush_failed" }),
          );
        }
      });
      return Response.json(result);
    }
    await transaction(async (tx) => {
      const order = await getOrder(id, tx, true),
        api = stripe();
      const paid = await reconcile(tx, order, api);
      if (action === "reconcile") {
        await activity(tx, id, owner.id, "manual_reconciliation");
        return;
      }
      // Re-read because reconciliation can promote AWAITING_DEPOSIT to NEW.
      const current = await getOrder(id, tx);
      assert(
        canTransition(
          current.fulfillment,
          action,
          paid.status === "PAID_IN_FULL",
        ),
        "This fulfillment change is not allowed.",
      );
      if (current.fulfillment === action) return;
      if (action === "IN_PROGRESS" || action === "READY_FOR_BALANCE")
        assert(
          paid.status === "DEPOSIT_PAID" || paid.status === "PAID_IN_FULL",
          "Resolve payment issues before continuing work.",
        );
      if (action === "CANCELLED") {
        if (order.checkout_id) {
          const session = await api.checkout.sessions.retrieve(
            order.checkout_id,
          );
          if (session.status === "open")
            await api.checkout.sessions.expire(session.id);
        }
        if (order.invoice_id) {
          const invoice = await api.invoices.retrieve(order.invoice_id);
          if (invoice.status === "open")
            await api.invoices.voidInvoice(invoice.id);
        }
        await tx.query(
          "UPDATE email_outbox SET suppressed_at=now() WHERE order_id=$1 AND sent_at IS NULL AND kind NOT IN ('review','cancelled')",
          [id],
        );
        await queueEmail(tx, order, "cancelled");
      }
      await tx.query(
        "UPDATE orders SET fulfillment=$2,delivered_at=CASE WHEN $2='DELIVERED' THEN now() ELSE delivered_at END,cancelled_at=CASE WHEN $2='CANCELLED' THEN now() ELSE cancelled_at END WHERE id=$1",
        [id, action],
      );
      await activity(tx, id, owner.id, "fulfillment_changed", {
        from: current.fulfillment,
        to: action,
      });
      if (action === "DELIVERED") await queueEmail(tx, order, "delivered");
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
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return endpoint(async () => {
    const owner = await requireOwner();
    z.uuid().parse(id);
    const order = await getOrder(id);
    assert(order.template_key, "No template available", 404);
    const { data, error } = await storage()
      .storage.from("templates")
      .createSignedUrl(order.template_key, 60, {
        download: order.template_name || "template.pdf",
      });
    assert(!error && data, "Template download unavailable", 503);
    await transaction((tx) => activity(tx, id, owner.id, "template_download"));
    return Response.redirect(data.signedUrl, 303);
  })(request);
}
