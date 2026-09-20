import "server-only";
import { db, type DB } from "./db";
import { assert } from "./http";
export async function prepareOperation(key: string, id: string) {
  // Commit before any provider request. Never silently reuse an expired provider key.
  await db.query(
    "INSERT INTO operations(key,order_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [key, id],
  );
}
export async function guardOperation(tx: DB, key: string) {
  const op = (await tx.query("SELECT * FROM operations WHERE key=$1", [key]))
    .rows[0];
  assert(
    op &&
      !op.review_required &&
      Date.now() - new Date(op.created_at).getTime() < 20 * 3600000,
    "This interrupted operation needs owner review before it can be retried.",
  );
}
