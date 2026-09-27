"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { requestJson } from "@/app/lib/request";
export default function Login() {
  const router = useRouter();
  const [sent, setSent] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false),
    [email, setEmail] = useState(""),
    [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const locked = useRef(false),
    codeInput = useRef<HTMLInputElement>(null),
    emailInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    if (sent) codeInput.current?.focus();
  }, [sent]);
  async function send(verify: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await requestJson("/api/owner/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          ...(verify ? { code: code.trim() } : {}),
        }),
      });
      if (verify) {
        router.push("/owner");
        router.refresh();
      } else {
        setSent(true);
        setCode("");
        setCooldown(60);
        setMessage(
          "Code requested. Check your inbox and spam folder, then enter the newest code.",
        );
        codeInput.current?.focus();
      }
    } catch (e) {
      setFailed(true);
      setMessage(
        e instanceof Error ? e.message : "Sign-in unavailable. Please retry.",
      );
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send(sent);
  }
  return (
    <main className="owner-shell login-shell">
      <Link className="back-link" href="/">
        ← Done For Teachers
      </Link>
      <header>
        <p className="eyebrow">Your workspace</p>
        <h1>Owner sign-in</h1>
        <p>
          Manage orders, payments, and the details that make each request yours.
        </p>
      </header>
      <form onSubmit={submit} aria-busy={busy}>
        <label>
          Owner email
          <input
            ref={emailInput}
            name="email"
            type="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            readOnly={sent}
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {!sent && (
          <p className="field-help">
            We’ll email a one-time code to the owner account. No password
            needed.
          </p>
        )}
        {sent && (
          <label>
            Email code
            <input
              ref={codeInput}
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              maxLength={10}
              disabled={busy}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
              aria-describedby="code-help"
            />
            <span id="code-help" className="field-help">
              Enter the 6–10 digit code from your most recent email.
            </span>
          </label>
        )}
        <button disabled={busy}>
          {busy
            ? sent
              ? "Checking code…"
              : "Requesting code…"
            : sent
              ? "Sign in"
              : "Send a sign-in code"}
        </button>
        {sent && (
          <div className="owner-actions">
            <button
              className="action-secondary"
              type="button"
              disabled={busy || cooldown > 0}
              onClick={() => void send(false)}
            >
              {cooldown > 0
                ? `Resend available in ${cooldown}s`
                : "Send a new code"}
            </button>
            <button
              className="action-secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setCode("");
                setMessage("");
                requestAnimationFrame(() => emailInput.current?.focus());
              }}
            >
              Change email
            </button>
          </div>
        )}
        {message && (
          <p
            className={`form-feedback ${failed ? "is-error" : "is-success"}`}
            role={failed ? "alert" : "status"}
          >
            {message}
          </p>
        )}
      </form>
    </main>
  );
}
