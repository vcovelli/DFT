"use client";
import Link from "next/link";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="owner-shell login-shell">
      <Link href="/">← Done For Teachers</Link>
      <section className="owner-card">
        <p className="eyebrow">Let’s try that again</p>
        <h1>This page couldn’t load</h1>
        <p>
          A connection may be temporarily unavailable. If you just submitted a
          request or payment, check its status before starting another.
        </p>
        <button onClick={() => retry()}>Try again</button>
        <a href="mailto:orders@doneforteachers.com">Contact support</a>
      </section>
    </main>
  );
}
