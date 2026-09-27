import Link from "next/link";
import { formatDate, readableStatus, statusTone } from "@/app/lib/labels";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import { db } from "@/lib/server/db";
import { settings } from "@/lib/server/orders";
import { money } from "@/lib/domain";
import { Action, SignOut } from "./controls";
import {
  orderingEnabled,
  requireOrderingAvailable,
} from "@/lib/server/availability";
import SettingsForm from "./settings-form";
export const dynamic = "force-dynamic";
export default async function Owner({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  try {
    await requireOwner();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/owner/login");
    return (
      <main className="owner-shell">
        <h1>Owner tools unavailable</h1>
        <p>
          Account setup or a provider connection needs attention. See the setup
          guide.
        </p>
      </main>
    );
  }
  const page = Math.floor(
    Math.max(0, Math.min(100000, Number((await searchParams).page) || 0)),
  );
  const config = await settings();
  const orders = (
    await db.query(
      `SELECT o.*,COALESCE((SELECT SUM(received-refunded-disputed) FROM payments p WHERE p.order_id=o.id),0)::integer AS net,COALESCE((SELECT SUM(credit_cents) FROM order_adjustments a WHERE a.order_id=o.id),0)::integer AS credit FROM orders o ORDER BY created_at DESC LIMIT 31 OFFSET $1`,
      [Math.floor(page) * 30],
    )
  ).rows;
  const hasNextPage = orders.length > 30;
  const visibleOrders = orders.slice(0, 30);
  const notifications = (
    await db.query(
      "SELECT id,order_id,kind,attempts,last_error,review_required FROM email_outbox WHERE sent_at IS NULL AND suppressed_at IS NULL ORDER BY created_at LIMIT 30",
    )
  ).rows;
  const operations = (
    await db.query(
      "SELECT key,order_id FROM operations WHERE review_required=true ORDER BY created_at LIMIT 30",
    )
  ).rows;
  let accepting = false;
  try {
    await requireOrderingAvailable();
    accepting = true;
  } catch {
    /* display only */
  }
  const maintenance = (
    await db.query(
      "SELECT last_success_at FROM maintenance_state WHERE id=true",
    )
  ).rows[0];
  const status = !orderingEnabled()
    ? {
        label: "Ordering paused",
        detail:
          "The deployment switch is off. New orders remain closed until ordering is enabled in your hosting settings.",
      }
    : !accepting
      ? {
          label: "Service needs attention",
          detail:
            "Run maintenance and review pending notifications below before accepting new orders.",
        }
      : config.paused
        ? {
            label: "Ordering paused",
            detail:
              "You have paused new orders in Business settings. Existing orders can still be managed.",
          }
        : !config.policyApproved
          ? {
              label: "Approval needed",
              detail:
                "Review and approve your prices and policies in Business settings before opening orders.",
            }
          : {
              label: "Accepting orders",
              detail:
                "Customers can submit a request and pay their deposit. Your business settings apply to new orders.",
            };
  return (
    <main className="owner-shell">
      <header className="owner-header">
        <div>
          <p className="eyebrow">Done For Teachers</p>
          <h1>Owner workspace</h1>
          <p>
            Keep every request moving, from first deposit to finished materials.
          </p>
        </div>
        <nav className="owner-actions" aria-label="Owner navigation">
          <Link href="/">View website ↗</Link>
          <a
            href={
              process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
                ? "https://dashboard.stripe.com"
                : "https://dashboard.stripe.com/test"
            }
            target="_blank"
            rel="noreferrer"
          >
            Stripe dashboard ↗
          </a>
          <SignOut />
        </nav>
      </header>
      <section
        className="owner-card service-status"
        aria-labelledby="service-status-heading"
      >
        <div className="section-row">
          <h2 id="service-status-heading">Service status</h2>
          <span
            className={`status-badge status-${status.label === "Accepting orders" ? "success" : "attention"}`}
          >
            {status.label}
          </span>
        </div>
        <p>{status.detail}</p>
        <p className="field-help">
          Last completed maintenance:{" "}
          {maintenance?.last_success_at
            ? formatDate(maintenance.last_success_at)
            : "Not yet verified"}
        </p>
        <div className="owner-actions">
          <a href="#notifications">Notifications & recovery ↓</a>
          <a href="#business-settings">Business settings ↓</a>
        </div>
      </section>
      <section className="orders-section" aria-labelledby="orders-heading">
        <div className="section-row">
          <div>
            <h2 id="orders-heading">Orders</h2>
            <p className="field-help">
              Newest first. Open an order to review details and take the next
              step.
            </p>
          </div>
          <span className="field-help">Page {page + 1}</span>
        </div>
        <div className="owner-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Customer</th>
                <th scope="col">Payment</th>
                <th scope="col">Progress</th>
                <th scope="col">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    <h3>
                      {page === 0
                        ? "Your first order starts here"
                        : "No orders on this page"}
                    </h3>
                    <p>
                      {page === 0
                        ? "Saved requests will appear here, even before the deposit is paid."
                        : "Return to the previous page to see more orders."}
                    </p>
                    {page === 0 && <Link href="/">View your website ↗</Link>}
                  </td>
                </tr>
              )}
              {visibleOrders.map((o) => (
                <tr key={o.id}>
                  <td data-label="Order">
                    <a href={`/owner/orders/${o.id}`}>{o.reference} ↗</a>
                  </td>
                  <td data-label="Customer">{o.customer_name}</td>
                  <td data-label="Payment">
                    <span
                      className={`status-badge status-${statusTone(o.payment_status)}`}
                    >
                      {readableStatus(o.payment_status)}
                    </span>
                  </td>
                  <td data-label="Progress">{readableStatus(o.fulfillment)}</td>
                  <td data-label="Outstanding" className="money-value">
                    {money(Math.max(0, o.total - o.credit - o.net))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav className="owner-actions pagination" aria-label="Order pages">
          {page > 0 && <a href={`/owner?page=${page - 1}`}>Previous</a>}
          {hasNextPage && <a href={`/owner?page=${page + 1}`}>Next →</a>}
        </nav>
      </section>
      <section className="owner-card" id="notifications">
        <h2>Notifications & recovery</h2>
        <p>
          {notifications.length === 0
            ? "No pending notifications. You’re all caught up."
            : `${notifications.length} pending notifications shown. Review any flagged email in Resend before resending.`}
        </p>
        {notifications.map((n) => (
          <p key={n.id}>
            <a href={`/owner/orders/${n.order_id}`}>{readableStatus(n.kind)}</a>{" "}
            · {n.attempts} attempts ·{" "}
            {n.review_required
              ? "Review required"
              : n.last_error
                ? "Delivery failed — check email settings"
                : "Queued"}
          </p>
        ))}
        {operations.map((o) => (
          <p key={o.key}>
            Interrupted payment action:{" "}
            <a href={`/owner/orders/${o.order_id}`}>review order</a>. Reconcile
            its Stripe records using the recovery guide.
          </p>
        ))}
        <Action
          url="/api/owner/maintenance"
          label="Retry notifications & run cleanup"
          confirmation="Run notification retries and delete files past the approved retention window?"
          successMessage="Maintenance completed. Check any remaining notifications above."
          variant="secondary"
        />
      </section>
      <SettingsForm config={config} />
    </main>
  );
}
