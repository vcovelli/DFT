import "server-only";
import { db, transaction } from "./db";
import { getOrder, activity } from "./orders";
import { reconcile } from "./payments";
import { stripe, storage } from "./providers";
import { flushEmails } from "./emails";
export async function maintenance() {
  await flushEmails(10);
  // Batch size keeps each managed invocation bounded; failures remain eligible for the next run.
  const { rows } = await db.query(
    "SELECT id FROM orders WHERE fulfillment='AWAITING_DEPOSIT' AND created_at<now()-interval '7 days' AND (checkout_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM operations WHERE order_id=orders.id)) ORDER BY updated_at LIMIT 10",
  );
  for (const { id } of rows) {
    try {
      await transaction(async (tx) => {
        const order = await getOrder(id, tx, true);
        if (
          !order.checkout_id &&
          (await tx.query("SELECT 1 FROM operations WHERE order_id=$1", [id]))
            .rows.length
        )
          return; // ambiguous external operation: preserve for review
        const api = stripe();
        const paid = await reconcile(tx, order, api);
        if (paid.received > 0) return;
        if (order.checkout_id) {
          const session = await api.checkout.sessions.retrieve(
            order.checkout_id,
          );
          if (session.status === "open")
            await api.checkout.sessions.expire(session.id);
          else if (session.status !== "expired") return;
        }
        if (order.template_key) {
          const { error } = await storage()
            .storage.from("templates")
            .remove([order.template_key]);
          if (error) throw new Error("storage_cleanup_failed");
        }
        await tx.query(
          "UPDATE orders SET fulfillment='CANCELLED',cancelled_at=now(),template_key=null,template_name=null,template_size=null,template_sha256=null,customer_name='Expired unpaid request',customer_email='deleted@example.invalid',details='{}' WHERE id=$1",
          [id],
        );
        await tx.query("DELETE FROM email_outbox WHERE order_id=$1", [id]);
        await activity(tx, id, "scheduler", "abandoned_order_anonymized");
      });
    } catch {
      console.error(
        JSON.stringify({
          level: "error",
          code: "abandoned_cleanup_failed",
          orderId: id,
        }),
      );
    }
  }
  const old = (
    await db.query(
      "SELECT id FROM orders WHERE template_key IS NOT NULL AND COALESCE(delivered_at,cancelled_at)> '-infinity'::timestamptz AND COALESCE(delivered_at,cancelled_at)<now()-interval '90 days' LIMIT 20",
    )
  ).rows;
  for (const { id } of old) {
    await transaction(async (tx) => {
      const order = await getOrder(id, tx, true);
      if (!order.template_key) return;
      const { error } = await storage()
        .storage.from("templates")
        .remove([order.template_key]);
      if (error) throw new Error("retention_cleanup_failed");
      await tx.query(
        "UPDATE orders SET template_key=null,template_name=null,template_size=null,template_sha256=null WHERE id=$1",
        [id],
      );
      await activity(tx, id, "scheduler", "template_retention_deletion");
    });
  }
  const orphans = (
    await db.query(
      "SELECT name FROM storage.objects s WHERE bucket_id='templates' AND created_at<now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.template_key=s.name) LIMIT 100",
    )
  ).rows;
  if (orphans.length) {
    const { error } = await storage()
      .storage.from("templates")
      .remove(orphans.map((o) => o.name));
    if (error) throw new Error("orphan_cleanup_failed");
  }
  await db.query("DELETE FROM rate_limits WHERE expires_at<now()");
  await db.query(
    "UPDATE operations SET review_required=true WHERE result IS NULL AND created_at<now()-interval '20 hours' AND ((key LIKE 'checkout:%' AND NOT EXISTS(SELECT 1 FROM orders WHERE id=operations.order_id AND checkout_id IS NOT NULL)) OR (key LIKE 'invoice:%' AND NOT EXISTS(SELECT 1 FROM orders WHERE id=operations.order_id AND invoice_id IS NOT NULL)))",
  );
}
