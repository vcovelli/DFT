"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function Action({
  url,
  label,
  action,
  confirmation,
}: {
  url: string;
  label: string;
  action?: string;
  confirmation: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <div>
      <button
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(confirmation)) return;
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action, confirmed: true }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setMessage("Saved.");
            router.refresh();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Please retry.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : label}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
export function SignOut() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/owner/auth", { method: "DELETE" });
        router.push("/owner/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
