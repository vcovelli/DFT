import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import { db } from "@/lib/server/db";
import { settings } from "@/lib/server/orders";
import { money } from "@/lib/domain";
import { Action, SignOut } from "./controls";
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
  const page = Math.max(
    0,
    Math.min(100000, Number((await searchParams).page) || 0),
  );
  const orders = (
    await db.query(
      `SELECT o.*,COALESCE((SELECT SUM(received-refunded-disputed) FROM payments p WHERE p.order_id=o.id),0)::integer AS net,COALESCE((SELECT SUM(credit_cents) FROM order_adjustments a WHERE a.order_id=o.id),0)::integer AS credit FROM orders o ORDER BY created_at DESC LIMIT 30 OFFSET $1`,
      [Math.floor(page) * 30],
    )
  ).rows;
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
  return (
    <main className="owner-shell">
      <div className="owner-actions">
        <Link href="/">Website</Link>
        <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">
          Stripe dashboard
        </a>
        <SignOut />
      </div>
      <h1>Orders</h1>
      <p>
        Prepare materials, request the balance, verify payment, then email the
        files and mark delivered.
      </p>
      <div className="owner-scroll">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Payment</th>
              <th>Fulfillment</th>
              <th>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <a href={`/owner/orders/${o.id}`}>{o.reference}</a>
                </td>
                <td>{o.customer_name}</td>
                <td>{o.payment_status}</td>
                <td>{o.fulfillment}</td>
                <td>{money(Math.max(0, o.total - o.credit - o.net))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="owner-actions">
        {page > 0 && <a href={`/owner?page=${page - 1}`}>Previous</a>}
        {orders.length === 30 && <a href={`/owner?page=${page + 1}`}>Next</a>}
      </div>
      <section className="owner-card">
        <h2>Notifications & recovery</h2>
        <p>
          {notifications.length} pending notifications shown. A “review
          required” email needs a check in Resend before any resend.
        </p>
        {notifications.map((n) => (
          <p key={n.id}>
            <a href={`/owner/orders/${n.order_id}`}>{n.kind}</a> · {n.attempts}{" "}
            attempts ·{" "}
            {n.review_required ? "Review required" : n.last_error || "Queued"}
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
        />
      </section>
      <SettingsForm config={await settings()} />
    </main>
  );
}
