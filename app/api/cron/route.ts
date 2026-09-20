import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/server/env";
import { endpoint, assert } from "@/lib/server/http";
import { maintenance } from "@/lib/server/maintenance";
export const maxDuration = 60;
export const GET = endpoint(async (request) => {
  const received = Buffer.from(request.headers.get("authorization") || ""),
    expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  assert(
    received.length === expected.length && timingSafeEqual(received, expected),
    "Unauthorized",
    401,
  );
  await maintenance();
  return Response.json({ ok: true });
});
