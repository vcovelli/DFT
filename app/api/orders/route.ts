import { createHmac } from "node:crypto";
import { z } from "zod";
import { createOrder } from "@/lib/server/orders";
import { endpoint, jsonBody, rateLimit, sameOrigin } from "@/lib/server/http";
import { env } from "@/lib/server/env";
export const runtime = "nodejs";
export const POST = endpoint(async (request) => {
  sameOrigin(request);
  await rateLimit(request, "orders");
  const key = z.uuid().parse(request.headers.get("Idempotency-Key"));
  const token = createHmac("sha256", env().RATE_LIMIT_SECRET)
    .update(`order-access:${key}`)
    .digest("hex");
  const { order } = await createOrder(
    await jsonBody(request),
    key,
    undefined,
    token,
  );
  return Response.json({
    id: order.id,
    reference: order.reference,
    token,
    pricing: order.pricing,
    hasTemplate: !!order.template_key,
  });
});
