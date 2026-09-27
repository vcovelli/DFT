"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { requestJson } from "@/app/lib/request";
type Prepared = {
  id: string;
  reference: string;
  token: string;
  pricing: Snapshot;
};
export default function OrderForm({
  config,
  service,
  onServiceChange,
  onLockChange,
}: {
  config: Settings;
  service: Service;
  onServiceChange: (service: Service) => void;
  onLockChange: (locked: boolean) => void;
}) {
  const [duration, setDuration] = useState("weekly");
  const [rush, setRush] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [prepared, setPrepared] = useState<Prepared | null>(null);
  const locked = useRef(false);
  const priorRequest = useRef<{ key: string; fingerprint: string } | null>(
    null,
  );
  const review = useRef<HTMLDivElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (prepared) review.current?.focus();
  }, [prepared]);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  const flat = service === "completeUnit" || service === "assessment";
  const estimate = quote(
    { service, duration: flat ? "unit" : duration, rush } as OrderInput,
    config,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    onLockChange(true);
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const file = form.get("template") as File;
      if (file?.size > MAX_FILE)
        throw new Error("Please select one PDF up to 3 MB.");
      if (
        file?.size &&
        (!file.name.toLowerCase().endsWith(".pdf") ||
          (file.type && file.type !== "application/pdf"))
      )
        throw new Error(
          "Please choose a PDF file. Other file types cannot be uploaded.",
        );
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
      let prior = priorRequest.current;
      if (!prior) {
        try {
          prior = JSON.parse(sessionStorage.getItem("dft-request") || "null");
        } catch {
          /* Storage may be unavailable in private browsing. */
        }
      }
      const key =
        prior?.fingerprint === fingerprint && typeof prior.key === "string"
          ? prior.key
          : crypto.randomUUID();
      priorRequest.current = { key, fingerprint };
      try {
        sessionStorage.setItem(
          "dft-request",
          JSON.stringify(priorRequest.current),
        );
      } catch {
        /* The in-memory key still protects retries in this tab. */
      }
      const order = await requestJson<Prepared & { hasTemplate: boolean }>(
        "/api/orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(payload),
        },
      );
      if (file?.size && !order.hasTemplate)
        await requestJson(`/api/orders/${order.id}/template`, {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/pdf",
            "X-File-Name": encodeURIComponent(file.name),
            "X-Order-Token": order.token,
          },
          body: file,
        });
      setPrepared(order);
    } catch (e) {
      onLockChange(false);
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
      const result = await requestJson<{ url: string }>(
        `/api/orders/${prepared.id}/checkout`,
        {
          method: "POST",
          headers: { "X-Order-Token": prepared.token },
        },
      );
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
    <form className="order-form" onSubmit={submit} aria-busy={busy}>
      <ol className="order-progress" aria-label="Order progress">
        <li aria-current={!prepared ? "step" : undefined}>1. Your request</li>
        <li aria-current={prepared ? "step" : undefined}>
          2. Review & deposit
        </li>
      </ol>
      <p className="field-help">
        Review your final price before paying. All fields are required except
        the PDF template and rush service.
      </p>
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
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <label>
            <span id="subject-label">Subject</span>
            <select name="subject" required aria-labelledby="subject-label">
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
            <span id="grade-label">Grade band</span>
            <select name="grade" required aria-labelledby="grade-label">
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
            <input
              name="state"
              required
              minLength={2}
              maxLength={80}
              autoComplete="address-level1"
              placeholder="e.g. Ohio"
            />
          </label>
          <label>
            <span id="service-label">Service</span>
            <select
              aria-labelledby="service-label"
              id="order-service"
              value={service}
              onChange={(e) => onServiceChange(e.target.value as Service)}
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
              <span id="duration-label">Duration</span>
              <select
                aria-labelledby="duration-label"
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
            aria-describedby="instructions-help"
          />
        </label>
        <p id="instructions-help" className="field-help">
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
      <div
        className="order-summary"
        id="order-review"
        ref={review}
        tabIndex={-1}
        aria-label="Order price summary"
      >
        {prepared && (
          <p className="saved-reference" role="status">
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
      {error && (
        <p
          className="form-feedback is-error"
          role="alert"
          ref={feedback}
          tabIndex={-1}
        >
          {error}
        </p>
      )}
    </form>
  );
}
