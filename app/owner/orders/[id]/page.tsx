import { formatDate, readableStatus, statusTone } from "@/app/lib/labels";
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
  const order = await getOrder(id).catch((error) => {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  });
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
  const canWork = ["DEPOSIT_PAID", "PAID_IN_FULL"].includes(paid.status);
  const nextStep =
    order.fulfillment === "CANCELLED"
      ? "This order is cancelled. Review any remaining payments in Stripe."
      : order.fulfillment === "DELIVERED"
        ? "Materials are marked as sent. Keep the order here for your records."
        : ["DISPUTED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(paid.status)
          ? "Review and resolve the payment issue in Stripe before continuing work."
          : order.fulfillment === "AWAITING_DEPOSIT"
            ? "Waiting for a verified deposit. Refresh payment status if the customer has already paid."
            : order.fulfillment === "NEW"
              ? "Review the instructions and template, then start preparing the materials."
              : order.fulfillment === "IN_PROGRESS"
                ? "Prepare the materials. Mark the work complete when it is ready for final payment."
                : paid.status === "PAID_IN_FULL"
                  ? "Email the completed materials to the customer, then mark this order delivered."
                  : order.invoice_id
                    ? "The balance invoice is ready. Wait for verified payment before sending the materials."
                    : "Request the remaining balance. Materials are sent after full payment.";
  return (
    <main className="owner-shell">
      <a className="back-link" href="/owner">
        ← All orders
      </a>
      <header>
        <p className="eyebrow">Order details</p>
        <h1>{order.reference}</h1>
        <div className="status-row">
          <span className={`status-badge status-${statusTone(paid.status)}`}>
            {readableStatus(paid.status)}
          </span>
          <span
            className={`status-badge status-${statusTone(order.fulfillment)}`}
          >
            {readableStatus(order.fulfillment)}
          </span>
        </div>
      </header>
      <section className="owner-card">
        <h2>{order.customer_name}</h2>
        <a href={`mailto:${order.customer_email}`}>{order.customer_email}</a>
        <p>
          {order.pricing.service} ·{" "}
          {order.pricing.duration === "unit"
            ? "One-time request"
            : readableStatus(order.pricing.duration)}{" "}
          · {order.details.subject} · {order.details.grade} ·{" "}
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
            ? formatDate(order.delivery_deadline)
            : "Starts after verified deposit"}
        </p>
      </section>
      <section className="owner-card">
        <h2>Payments</h2>
        <dl className="payment-summary">
          {[
            ["Order total", order.total],
            ["Received", paid.received],
            ["Credits", paid.credit],
            ["Refunded", paid.refunded],
            ["Disputed", paid.disputed],
            ["Outstanding", paid.outstanding],
          ].map(([label, amount]) => (
            <div
              key={label}
              className={label === "Outstanding" ? "outstanding" : undefined}
            >
              <dt>{label}</dt>
              <dd>{money(Number(amount))}</dd>
            </div>
          ))}
        </dl>
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
          successMessage="Payment status refreshed from Stripe."
          variant="secondary"
        />
      </section>
      <section className="owner-card">
        <h2>Next step</h2>
        <p>{nextStep}</p>
        <div className="owner-actions">
          {order.fulfillment === "NEW" && canWork && (
            <Action
              url={url}
              label="Start work"
              successMessage="Work started."
              action="IN_PROGRESS"
              confirmation="Mark this order in progress?"
            />
          )}
          {order.fulfillment === "IN_PROGRESS" && canWork && (
            <Action
              url={url}
              label="Work complete"
              successMessage="Work marked complete. You can now request the balance."
              action="READY_FOR_BALANCE"
              confirmation="Are the materials complete and ready for final payment?"
            />
          )}
          {order.fulfillment === "READY_FOR_BALANCE" && (
            <>
              {paid.status === "DEPOSIT_PAID" && (
                <Action
                  url={url}
                  label={
                    order.invoice_id
                      ? "Get balance payment link"
                      : "Request balance"
                  }
                  successMessage="Invoice ready. Open the payment page below; email delivery is tracked separately."
                  action="invoice"
                  confirmation={`Request the outstanding ${money(paid.outstanding)} through a Stripe invoice? An existing invoice will be reused.`}
                />
              )}
              {paid.status === "PAID_IN_FULL" && (
                <Action
                  url={url}
                  label="Mark delivered"
                  successMessage="Delivery recorded."
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
              variant="danger"
              successMessage="Order cancelled. Any refunds must be handled in Stripe."
              action="CANCELLED"
              confirmation="Cancel this order and close unpaid Checkout/invoice collection? This does not issue a refund. Refund separately in Stripe if needed."
            />
          )}
        </div>
      </section>
      <RecoveryForm id={id} emails={emails} />
      <section className="owner-card">
        <h2>Activity</h2>
        <ol className="activity-list">
          {log.map((entry, i) => (
            <li key={i}>
              <span>{readableStatus(entry.action)}</span>
              <time dateTime={new Date(entry.created_at).toISOString()}>
                {formatDate(entry.created_at)}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
