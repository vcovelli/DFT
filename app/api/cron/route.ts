import { timingSafeEqual } from "node:crypto";
import { endpoint, assert } from "@/lib/server/http";
import { maintenance } from "@/lib/server/maintenance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const run = endpoint(async (request) => {
  const received = Buffer.from(request.headers.get("authorization") || ""),
    expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  assert(
    (process.env.CRON_SECRET?.length || 0) >= 32 &&
      received.length === expected.length &&
      timingSafeEqual(received, expected),
    "Unauthorized",
    401,
  );
  await maintenance();
  return Response.json({ ok: true });
});

// GET is retained for the unchanged Vercel staging cron.
export const GET = run;
export const POST = run;
