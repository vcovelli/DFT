import "server-only";
import { db, type DB } from "./db";
import { assert } from "./http";

export function orderingEnabled() {
  return process.env.ORDERING_ENABLED === "true";
}

export async function requireOrderingAvailable(client: DB = db) {
  assert(orderingEnabled(), "New orders are currently paused.", 503);
  // Vercel staging retains its daily cron; production must run at least every two hours.
  const age = process.env.VERCEL ? 26 * 60 : 120;
  const { rows } = await client.query(
    `SELECT (last_success_at > now()-($1 * interval '1 minute') AND (last_failure_at IS NULL OR last_success_at > last_failure_at)) AS fresh,
     NOT EXISTS(SELECT 1 FROM email_outbox WHERE sent_at IS NULL AND suppressed_at IS NULL
       AND (last_error IS NOT NULL OR review_required OR created_at < now()-interval '15 minutes')) AS mail_ready
     FROM maintenance_state WHERE id=true`,
    [age],
  );
  assert(
    rows[0]?.fresh && rows[0]?.mail_ready,
    "Ordering is temporarily unavailable. Existing requests are saved; please retry later.",
    503,
  );
}
