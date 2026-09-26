import { env } from "@/lib/server/env";
import { settings } from "@/lib/server/orders";
import { db } from "@/lib/server/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  let ok = false;
  try {
    env();
    await settings();
    const result = await db.query(
      "SELECT id FROM maintenance_state WHERE id=true",
    );
    ok = result.rows.length === 1;
  } catch {
    /* Deliberately reveal no configuration, identities, or database diagnostics. */
  }
  return Response.json(
    { ok },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    },
  );
}
