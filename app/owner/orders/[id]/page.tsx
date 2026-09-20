import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import { getOrder } from "@/lib/server/orders";
import { db } from "@/lib/server/db";
import { summary } from "@/lib/server/payments";
import { money } from "@/lib/domain";
import RecoveryForm from "../../recovery-form";
import { Action } from "../../controls";
export const dynamic = "force-dynamic";
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireOwner();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/owner/login");
    throw e;
  }
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const order = await getOrder(id);
  const paid = await summary(db, order);
  const log = (
    await db.query(
      "SELECT action,created_at FROM activity WHERE order_id=$1 ORDER BY created_at DESC LIMIT 30",
      [id],
    )
  ).rows;
  const url = `/api/owner/orders/${id}`;
  const emails = (
    await db.query<{ id: string; kind: string }>(
      "SELECT id,kind FROM email_outbox WHERE order_id=$1 AND review_required AND sent_at IS NULL AND suppressed_at IS NULL",
      [id],
    )
  ).rows;
  return (
    <main className="owner-shell">
      <a href="/owner">← All orders</a>
      <h1>{order.reference}</h1>
      <section className="owner-card">
        <h2>{order.customer_name}</h2>
        <a href={`mailto:${order.customer_email}`}>{order.customer_email}</a>
        <p>
          {order.pricing.service} · {order.pricing.duration} ·{" "}
          {order.details.subject} · {order.details.grade} ·{" "}
          {order.details.state}
        </p>
        <h3>{order.details.topic}</h3>
        <pre>{order.details.instructions}</pre>
        {order.template_key && (
          <a href={url}>Download private template: {order.template_name}</a>
        )}
        <p>
          Preparation deadline:{" "}
          {order.delivery_deadline
            ? new Date(order.delivery_deadline).toLocaleString("en-US", {
                timeZone: "UTC",
              }) + " UTC"
            : "Starts after verified deposit"}
        </p>
      </section>
      <section className="owner-card">
        <h2>Payments</h2>
        <p>
          {order.payment_status} · Fulfillment: {order.fulfillment}
        </p>
        <p>
          Total: {money(order.total)} · Received: {money(paid.received)} ·
          Credits: {money(paid.credit)} · Refunded: {money(paid.refunded)} ·
          Disputed: {money(paid.disputed)} · Outstanding:{" "}
          {money(paid.outstanding)}
        </p>
        <p>
          Invoice: {order.invoice_id || "Not requested"} (
          {order.invoice_status || "—"})
        </p>
        <p>
          Use Stripe for refunds and disputes, then refresh payment status here.
          Cancellation does not refund automatically. Never mark an invoice paid
          manually as a substitute for a verified payment.
        </p>
        <Action
          url={url}
          label="Refresh payment status"
          action="reconcile"
          confirmation="Retrieve the latest payment records from Stripe?"
        />
      </section>
      <section className="owner-card">
        <h2>Fulfillment</h2>
        <div className="owner-actions">
          {order.fulfillment === "NEW" && (
            <Action
              url={url}
              label="Start work"
              action="IN_PROGRESS"
              confirmation="Mark this order in progress?"
            />
          )}
          {order.fulfillment === "IN_PROGRESS" && (
            <Action
              url={url}
              label="Work complete"
              action="READY_FOR_BALANCE"
              confirmation="Are the materials complete and ready for final payment?"
            />
          )}
          {order.fulfillment === "READY_FOR_BALANCE" && (
            <>
              <Action
                url={url}
                label="Request balance"
                action="invoice"
                confirmation={`Request the outstanding ${money(paid.outstanding)} through a Stripe invoice? An existing invoice will be reused.`}
              />
              {paid.status === "PAID_IN_FULL" && (
                <Action
                  url={url}
                  label="Mark delivered"
                  action="DELIVERED"
                  confirmation="Have you emailed the completed materials to this customer? This records delivery; it does not send the files."
                />
              )}
            </>
          )}
          {!["DELIVERED", "CANCELLED"].includes(order.fulfillment) && (
            <Action
              url={url}
              label="Cancel order"
              action="CANCELLED"
              confirmation="Cancel this order and close unpaid Checkout/invoice collection? This does not issue a refund. Refund separately in Stripe if needed."
            />
          )}
        </div>
      </section>
      <RecoveryForm id={id} emails={emails} />
      <section className="owner-card">
        <h2>Activity</h2>
        {log.map((entry, i) => (
          <p key={i}>
            {new Date(entry.created_at).toISOString()} · {entry.action}
          </p>
        ))}
      </section>
    </main>
  );
}
