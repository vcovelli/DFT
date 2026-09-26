import "server-only";
import { db, transaction, type DB } from "./db";
import type { Order } from "./orders";
import { money } from "../domain";
import { env } from "./env";
export const OWNER_EMAIL = "orders@doneforteachers.com";
export type EmailKind =
  | "deposit"
  | "new_order"
  | "balance"
  | "paid"
  | "delivered"
  | "failed"
  | "cancelled"
  | "review";
export async function queueEmail(
  tx: DB,
  order: Order,
  kind: EmailKind,
  extra = "",
  suffix = "",
) {
  const next: Record<EmailKind, string> = {
    deposit:
      "Your deposit is confirmed. We will review your instructions and prepare your materials. The remaining balance is due before delivery.",
    new_order:
      "A deposit has been verified. Open the owner orders screen to review instructions and any private template.",
    balance:
      "Your materials are ready. Please pay the outstanding balance using the secure Stripe invoice below. The owner will email your materials after payment.",
    paid: "Your payment is confirmed. The owner will email your completed materials. Delivery is a manual step; this message does not contain the materials.",
    delivered:
      "The owner has marked your materials as sent by email. If they have not arrived, check spam or contact us.",
    failed:
      "Payment has not been confirmed or Checkout has expired. Please contact us if you need help completing this order. Do not submit a second order if you believe you have already paid.",
    cancelled:
      "Your order has been cancelled. Any refund is handled separately; contact us with questions.",
    review:
      "This order needs payment review in Stripe. Check refunds, disputes, and outstanding balances before fulfillment.",
  };
  const title: Record<EmailKind, string> = {
    deposit: "Deposit confirmed",
    new_order: "New paid order",
    balance: "Your balance is ready",
    paid: "Payment confirmed",
    delivered: "Materials sent",
    failed: "Payment needs attention",
    cancelled: "Order cancelled",
    review: "Payment review required",
  };
  const body = `Done For Teachers\n\nOrder: ${order.reference}\nService: ${order.pricing.service} (${order.pricing.duration})\nOrder total: ${money(order.total)}\nOriginal deposit: ${money(order.deposit)}\n\n${next[kind]}\n${extra}\n\nContact: ${OWNER_EMAIL}\nPlease do not email student records.`;
  await tx.query(
    "INSERT INTO email_outbox(id,order_id,kind,recipient,subject,body) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
    [
      `${order.id}:${kind}${suffix}`,
      order.id,
      kind,
      kind === "new_order" || kind === "review"
        ? OWNER_EMAIL
        : order.customer_email,
      `${order.reference}: ${title[kind]}`,
      body,
    ],
  );
}
export type MailSender = (
  message: { to: string; subject: string; text: string },
  key: string,
) => Promise<string>;
export const sendMail: MailSender = async (message, key) => {
  const e = env();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${e.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({
      from: e.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      reply_to: OWNER_EMAIL,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("mail_provider_error");
  const result = await response.json();
  if (typeof result.id !== "string") throw new Error("mail_provider_error");
  return result.id;
};
export async function attemptEmail(
  tx: DB,
  id: string,
  sender: MailSender = sendMail,
) {
  const row = (
    await tx.query("SELECT * FROM email_outbox WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (!row || row.sent_at || row.suppressed_at || row.review_required) return;
  if (
    row.first_attempt_at &&
    Date.now() - new Date(row.first_attempt_at).getTime() > 20 * 3600000
  ) {
    await tx.query(
      "UPDATE email_outbox SET review_required=true,last_error='idempotency_window_expired' WHERE id=$1",
      [id],
    );
    return;
  }
  try {
    const providerId = await sender(
      { to: row.recipient, subject: row.subject, text: row.body },
      row.id,
    );
    await tx.query(
      "UPDATE email_outbox SET provider_id=$2,sent_at=now(),attempts=attempts+1,last_error=null WHERE id=$1",
      [id, providerId],
    );
  } catch {
    await tx.query(
      "UPDATE email_outbox SET attempts=attempts+1,last_error='provider_error' WHERE id=$1",
      [id],
    );
  }
}
export async function flushEmails(limit = 10) {
  const { rows } = await db.query(
    "SELECT id FROM email_outbox WHERE sent_at IS NULL AND suppressed_at IS NULL AND NOT review_required ORDER BY created_at LIMIT $1",
    [limit],
  );
  for (const row of rows) {
    // Persist first possible send time BEFORE the external request, even if that transaction crashes.
    await db.query(
      "UPDATE email_outbox SET first_attempt_at=COALESCE(first_attempt_at,now()) WHERE id=$1",
      [row.id],
    );
    await transaction((tx) => attemptEmail(tx, row.id));
  }
}
