"use client";
import { useState, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
type EmailReview = { id: string; kind: string };
export default function RecoveryForm({
  id,
  emails,
}: {
  id: string;
  emails: EmailReview[];
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const creditKey = useRef("");
  const router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const action = String(form.get("action"));
    if (
      !window.confirm(
        action === "credit"
          ? "Record this reduction of the amount owed? This does not refund payments and is recorded in the activity history."
          : "Have you checked the exact order and outcome in the provider dashboard? Only continue after verifying it.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      let payload: object;
      if (action === "email")
        payload = {
          action,
          emailId: form.get("emailId"),
          resolution: form.get("resolution"),
          confirmed: true,
        };
      else if (action === "credit") {
        const raw = String(form.get("amount"));
        if (!/^\d+(\.\d{1,2})?$/.test(raw))
          throw new Error(
            "Enter a dollar amount with at most two decimal places.",
          );
        const [whole, fraction = ""] = raw.split(".");
        creditKey.current ||= crypto.randomUUID();
        payload = {
          action,
          cents: Number(whole) * 100 + Number(fraction.padEnd(2, "0")),
          reason: form.get("reason"),
          key: creditKey.current,
          confirmed: true,
        };
      } else
        payload = {
          action,
          externalId: form.get("externalId"),
          confirmed: true,
        };
      const response = await fetch(`/api/owner/orders/${id}/recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage("Saved and reconciled.");
      creditKey.current = "";
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Recovery unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="owner-card">
      <h2>Adjustments & recovery</h2>
      <details>
        <summary>Record a credit before invoicing</summary>
        <form onSubmit={submit}>
          <input type="hidden" name="action" value="credit" />
          <label>
            Credit in dollars
            <input name="amount" required inputMode="decimal" />
          </label>
          <label>
            Reason
            <input name="reason" minLength={3} maxLength={300} required />
          </label>
          <button disabled={busy}>Confirm credit</button>
        </form>
      </details>
      <details>
        <summary>Reconnect an interrupted Stripe action</summary>
        <p>
          Find the existing object in Stripe using this order’s metadata. Copy
          its Checkout Session or Invoice ID. This verifies and reconnects it;
          it does not create a replacement charge.
        </p>
        <form onSubmit={submit}>
          <label>
            Object
            <select name="action">
              <option value="checkout">Checkout Session</option>
              <option value="invoice">Balance invoice</option>
            </select>
          </label>
          <label>
            Stripe object ID
            <input name="externalId" required placeholder="cs_test_… or in_…" />
          </label>
          <button disabled={busy}>Verify and reconnect</button>
        </form>
      </details>
      {emails.map((email) => (
        <form onSubmit={submit} key={email.id}>
          <h3>Review {email.kind} email</h3>
          <p>
            Check Resend for this order reference before authorizing another
            email.
          </p>
          <input type="hidden" name="action" value="email" />
          <input type="hidden" name="emailId" value={email.id} />
          <label>
            Verified provider outcome
            <select name="resolution">
              <option value="accepted">
                Resend accepted the original email
              </option>
              <option value="not_sent">
                Resend did not accept it — authorize a new email
              </option>
            </select>
          </label>
          <button disabled={busy}>Record reviewed outcome</button>
        </form>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
