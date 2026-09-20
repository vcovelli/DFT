"use client";
import { useState, type FormEvent } from "react";
import { services, type Service, type Settings } from "@/lib/domain";
import { useRouter } from "next/navigation";
function toCents(raw: FormDataEntryValue | null) {
  const value = String(raw);
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value))
    throw new Error("Use dollar amounts with at most two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export default function SettingsForm({ config }: { config: Settings }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !window.confirm(
        "Save these settings for new orders? Existing order prices will stay fixed. Unpausing opens ordering when policies are approved.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(e.currentTarget);
      const next = structuredClone(config);
      next.paused = form.has("paused");
      next.policyApproved = form.has("policyApproved");
      next.rushAvailable = form.has("rushAvailable");
      next.depositPercent = Number(form.get("depositPercent"));
      next.turnaroundHours = Number(form.get("turnaroundHours"));
      next.rushHours = Number(form.get("rushHours"));
      next.turnaroundMessage = String(form.get("turnaroundMessage"));
      next.available = form.getAll("available") as Service[];
      for (const [key, value] of Object.entries(next.prices)) {
        if (typeof value === "number") {
          (next.prices as Record<string, unknown>)[key] = toCents(
            form.get(key),
          );
        } else
          for (const duration of ["daily", "weekly", "monthly"] as const)
            value[duration] = toCents(form.get(`${key}.${duration}`));
      }
      const response = await fetch("/api/owner/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage("Settings saved.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      <h2>Business settings</h2>
      <label>
        <span>
          <input name="paused" type="checkbox" defaultChecked={config.paused} />{" "}
          Pause new orders
        </span>
      </label>
      <label>
        <span>
          <input
            name="policyApproved"
            type="checkbox"
            defaultChecked={config.policyApproved}
          />{" "}
          I approve the displayed prices, deposit split and rounding, manual
          delivery after full payment, published policies, and retention
          periods.
        </span>
      </label>
      <p>
        Do not enable ordering until the launch checklist and test-mode
        acceptance run are complete.
      </p>
      <div className="owner-settings-grid">
        <label>
          Deposit percentage
          <input
            name="depositPercent"
            type="number"
            min={1}
            max={99}
            defaultValue={config.depositPercent}
          />
        </label>
        <label>
          Standard preparation hours
          <input
            name="turnaroundHours"
            type="number"
            min={1}
            max={2160}
            defaultValue={config.turnaroundHours}
          />
        </label>
        <label>
          Rush preparation hours
          <input
            name="rushHours"
            type="number"
            min={1}
            max={2160}
            defaultValue={config.rushHours}
          />
        </label>
      </div>
      <label>
        Turnaround message
        <textarea
          name="turnaroundMessage"
          required
          maxLength={300}
          defaultValue={config.turnaroundMessage}
        />
      </label>
      <label>
        <span>
          <input
            name="rushAvailable"
            type="checkbox"
            defaultChecked={config.rushAvailable}
          />{" "}
          Offer rush service
        </span>
      </label>
      <h3>Available services</h3>
      {Object.entries(services).map(([key, label]) => (
        <label key={key}>
          <span>
            <input
              name="available"
              value={key}
              type="checkbox"
              defaultChecked={config.available.includes(key as Service)}
            />{" "}
            {label}
          </span>
        </label>
      ))}
      <h3>Prices in US dollars</h3>
      <div className="owner-settings-grid">
        {Object.entries(config.prices).flatMap(([key, value]) =>
          typeof value === "number" ? (
            <label key={key}>
              {key === "rush" ? "Rush" : services[key as Service]}
              <input
                name={key}
                inputMode="decimal"
                required
                defaultValue={(value / 100).toFixed(2)}
              />
            </label>
          ) : (
            Object.entries(value).map(([duration, cents]) => (
              <label key={`${key}.${duration}`}>
                {services[key as Service]} · {duration}
                <input
                  name={`${key}.${duration}`}
                  inputMode="decimal"
                  required
                  defaultValue={(cents / 100).toFixed(2)}
                />
              </label>
            ))
          ),
        )}
      </div>
      <button disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
