"use client";
import { useRef, useState, type FormEvent } from "react";
import {
  services,
  money,
  quote,
  MAX_FILE,
  type Service,
  type Settings,
  type Snapshot,
  type OrderInput,
} from "@/lib/domain";
type Prepared = {
  id: string;
  reference: string;
  token: string;
  pricing: Snapshot;
};
async function api(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Please try again.");
  return data;
}
export default function OrderForm({ config }: { config: Settings }) {
  const [service, setService] = useState<Service>(config.available[0]);
  const [duration, setDuration] = useState("weekly");
  const [rush, setRush] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [prepared, setPrepared] = useState<Prepared | null>(null);
  const locked = useRef(false);
  const flat = service === "completeUnit" || service === "assessment";
  const estimate = quote(
    { service, duration: flat ? "unit" : duration, rush } as OrderInput,
    config,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const file = form.get("template") as File;
      if (file?.size > MAX_FILE)
        throw new Error("Please select one PDF up to 3 MB.");
      const payload = {
        name: form.get("name"),
        email: form.get("email"),
        subject: form.get("subject"),
        grade: form.get("grade"),
        state: form.get("state"),
        service,
        duration: flat ? "unit" : duration,
        topic: form.get("topic"),
        instructions: form.get("instructions"),
        rush,
        website: form.get("website"),
        termsAccepted: form.get("termsAccepted") === "on",
      };
      const fileHash = file?.size
        ? Array.from(
            new Uint8Array(
              await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
            ),
          ).join("")
        : "";
      const fingerprint = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify(payload) + fileHash),
          ),
        ),
      ).join("");
      const prior = JSON.parse(sessionStorage.getItem("dft-request") || "null");
      const key =
        prior?.fingerprint === fingerprint ? prior.key : crypto.randomUUID();
      sessionStorage.setItem(
        "dft-request",
        JSON.stringify({ key, fingerprint }),
      );
      const order = await api("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(payload),
      });
      if (file?.size && !order.hasTemplate)
        await api(`/api/orders/${order.id}/template`, {
          method: "POST",
          headers: {
            "Content-Type": file.type,
            "X-File-Name": encodeURIComponent(file.name),
            "X-Order-Token": order.token,
          },
          body: file,
        });
      setPrepared(order);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to prepare this order.",
      );
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  async function pay() {
    if (!prepared || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api(`/api/orders/${prepared.id}/checkout`, {
        method: "POST",
        headers: { "X-Order-Token": prepared.token },
      });
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open Checkout.");
      setBusy(false);
      locked.current = false;
    }
  }
  if (config.paused || !config.policyApproved)
    return (
      <div className="order-form">
        <h3>Orders are temporarily paused</h3>
        <p>
          Please contact{" "}
          <a href="mailto:orders@doneforteachers.com">
            orders@doneforteachers.com
          </a>{" "}
          for availability.
        </p>
      </div>
    );
  const summary = prepared?.pricing || estimate;
  return (
    <form className="order-form" onSubmit={submit}>
      <fieldset disabled={busy || !!prepared}>
        <legend>Tell us about your request</legend>
        <div className="form-grid">
          <label>
            Full name
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
            />
          </label>
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
            />
          </label>
          <label>
            Subject
            <select name="subject" required>
              <option value="">Select a subject</option>
              {[
                "Math",
                "English",
                "Reading",
                "Social Studies",
                "Spelling",
                "Writing",
                "Other",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Grade band
            <select name="grade" required>
              <option value="">Select a grade</option>
              {["Grade 1–2", "Grade 3–5", "Grade 6–8", "Grade 9–12"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
          <label>
            State or territory
            <input name="state" required minLength={2} maxLength={80} />
          </label>
          <label>
            Service
            <select
              value={service}
              onChange={(e) => setService(e.target.value as Service)}
            >
              {config.available.map((s) => (
                <option value={s} key={s}>
                  {services[s]}
                </option>
              ))}
            </select>
          </label>
          {!flat && (
            <label>
              Duration
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          )}
        </div>
        <label>
          Topic or unit focus
          <input name="topic" required minLength={2} maxLength={300} />
        </label>
        <label>
          Detailed instructions
          <textarea
            name="instructions"
            required
            minLength={5}
            maxLength={6000}
            rows={5}
          />
        </label>
        <p>
          Describe the learning goals. Do not include student names, grades,
          disability information, or other student records.
        </p>
        <label className="upload-field">
          Optional lesson template
          <input type="file" name="template" accept=".pdf,application/pdf" />
          <small>One PDF, maximum 3 MB. Templates are private.</small>
        </label>
        <div className="honeypot" aria-hidden="true">
          <label>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        {config.rushAvailable && (
          <label className="rush-toggle">
            <input
              type="checkbox"
              checked={rush}
              onChange={(e) => setRush(e.target.checked)}
            />
            <span>Add rush service · {money(config.prices.rush)}</span>
          </label>
        )}
        <label className="rush-toggle">
          <input name="termsAccepted" type="checkbox" required />
          <span>
            I agree to the{" "}
            <a href="/policies" target="_blank" rel="noreferrer">
              order terms and privacy notice
            </a>
            .
          </span>
        </label>
      </fieldset>
      <div className="order-summary">
        {prepared && (
          <p>
            Order {prepared.reference} is saved. Please confirm the final price
            below.
          </p>
        )}
        {summary.items.map((i) => (
          <div key={i.label}>
            <span>{i.label}</span>
            <strong>{money(i.cents)}</strong>
          </div>
        ))}
        <div className="summary-total">
          <span>Total</span>
          <strong>{money(summary.total)}</strong>
        </div>
        <p>
          {summary.depositPercent}% deposit: {money(summary.deposit)} · Balance:{" "}
          {money(summary.balance)}. Any odd cent goes into the deposit.
        </p>
        <p>{config.turnaroundMessage}</p>
      </div>
      {prepared ? (
        <button className="button" type="button" disabled={busy} onClick={pay}>
          {busy
            ? "Opening secure payment…"
            : `Pay ${money(prepared.pricing.deposit)} deposit`}
        </button>
      ) : (
        <button className="button submit-button" disabled={busy}>
          {busy ? "Saving your request…" : "Review final price"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
