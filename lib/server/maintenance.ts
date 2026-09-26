import "server-only";
import { db, transaction } from "./db";
import { getOrder, activity } from "./orders";
import { randomUUID } from "node:crypto";
import { stripe, storage } from "./providers";
import { flushEmails } from "./emails";
export async function maintenance() {
  // A durable lease works with transaction poolers and across overlapping invocations.
  const lease = randomUUID();
  const acquired = await db.query(
    "UPDATE maintenance_state SET lease_until=now()+interval '2 minutes',lease_token=$1 WHERE id=true AND (lease_until IS NULL OR lease_until<now()) RETURNING id",
    [lease],
  );
  if (!acquired.rows.length) return;
  const deadline = Date.now() + 20000;
  const remaining = () => {
    if (Date.now() >= deadline) throw new Error("maintenance_budget_exhausted");
  };
  try {
    const [, bucket] = await Promise.all([
      stripe().balance.retrieve(),
      storage().storage.getBucket("templates"),
    ]);
    if (bucket.error || !bucket.data || bucket.data.public)
      throw new Error("provider_unavailable");
    remaining();
    await flushEmails(1);
    remaining();
    // Never age out submitted requests: they may await outage/payment recovery.
    const old = (
      await db.query(
        "SELECT id FROM orders WHERE template_key IS NOT NULL AND COALESCE(delivered_at,cancelled_at)> '-infinity'::timestamptz AND COALESCE(delivered_at,cancelled_at)<now()-interval '90 days' LIMIT 1",
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
    remaining();
    const orphans = (
      await db.query(
        "SELECT name FROM storage.objects s WHERE bucket_id='templates' AND created_at<now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.template_key=s.name) LIMIT 10",
      )
    ).rows;
    if (orphans.length) {
      const { error } = await storage()
        .storage.from("templates")
        .remove(orphans.map((o) => o.name));
      if (error) throw new Error("orphan_cleanup_failed");
    }
    remaining();
    await db.query("DELETE FROM rate_limits WHERE expires_at<now()");
    await db.query(
      "UPDATE operations SET review_required=true WHERE result IS NULL AND created_at<now()-interval '20 hours' AND ((key LIKE 'checkout:%' AND NOT EXISTS(SELECT 1 FROM orders WHERE id=operations.order_id AND checkout_id IS NOT NULL)) OR (key LIKE 'invoice:%' AND NOT EXISTS(SELECT 1 FROM orders WHERE id=operations.order_id AND invoice_id IS NOT NULL)))",
    );
    remaining();
    await db.query(
      "UPDATE maintenance_state SET last_success_at=now() WHERE id=true AND lease_token=$1",
      [lease],
    );
  } catch {
    await db.query(
      "UPDATE maintenance_state SET last_failure_at=now() WHERE id=true AND lease_token=$1",
      [lease],
    );
    throw new Error("maintenance_failed");
  } finally {
    await db.query(
      "UPDATE maintenance_state SET lease_until=null,lease_token=null WHERE id=true AND lease_token=$1",
      [lease],
    );
  }
}
