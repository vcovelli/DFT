"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/app/lib/request";
export function Action({
  url,
  label,
  action,
  confirmation,
  successMessage = "Saved.",
  variant = "primary",
}: {
  url: string;
  label: string;
  action?: string;
  confirmation: string;
  successMessage?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false),
    [invoiceUrl, setInvoiceUrl] = useState("");
  const locked = useRef(false);
  const router = useRouter();
  return (
    <div className="action-control" aria-busy={busy}>
      <button
        type="button"
        className={`action-${variant}`}
        disabled={busy}
        onClick={async () => {
          if (locked.current || !window.confirm(confirmation)) return;
          locked.current = true;
          setBusy(true);
          setMessage("");
          setFailed(false);
          try {
            const data = await requestJson<{ url?: string }>(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action, confirmed: true }),
            });
            if (action === "invoice" && data.url) {
              const link = new URL(data.url);
              if (
                link.protocol === "https:" &&
                link.hostname === "invoice.stripe.com"
              )
                setInvoiceUrl(link.href);
            }
            setMessage(successMessage);
            router.refresh();
          } catch (e) {
            setFailed(true);
            setMessage(e instanceof Error ? e.message : "Please retry.");
          } finally {
            setBusy(false);
            locked.current = false;
          }
        }}
      >
        {busy ? "Working…" : label}
      </button>
      {message && (
        <p
          className={`form-feedback ${failed ? "is-error" : "is-success"}`}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      {invoiceUrl && (
        <a
          className="invoice-link"
          href={invoiceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open balance payment page ↗
        </a>
      )}
    </div>
  );
}
export function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = useRef(false);
  return (
    <div className="action-control">
      <button
        type="button"
        className="action-secondary"
        disabled={busy}
        onClick={async () => {
          if (locked.current) return;
          locked.current = true;
          setBusy(true);
          setError("");
          try {
            await requestJson("/api/owner/auth", { method: "DELETE" });
            router.push("/owner/login");
            router.refresh();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Unable to sign out. Please retry.",
            );
          } finally {
            locked.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <p role="alert" className="form-feedback is-error">
          {error}
        </p>
      )}
    </div>
  );
}
