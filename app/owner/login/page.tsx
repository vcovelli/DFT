"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
export default function Login() {
  const router = useRouter();
  const [sent, setSent] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/owner/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          ...(sent ? { code: form.get("code") } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (sent) {
        router.push("/owner");
        router.refresh();
      } else {
        setSent(true);
        setMessage("Check your owner mailbox for a sign-in code.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sign-in unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="owner-shell">
      <Link href="/">Done For Teachers</Link>
      <h1>Owner sign-in</h1>
      <form onSubmit={submit}>
        <label>
          Owner email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            readOnly={sent}
          />
        </label>
        {sent && (
          <label>
            Email code
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
            />
          </label>
        )}
        <button disabled={busy}>
          {busy ? "Please wait…" : sent ? "Sign in" : "Send a sign-in code"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </main>
  );
}
