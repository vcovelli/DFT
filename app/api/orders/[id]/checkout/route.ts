import { z } from "zod";
import { endpoint, sameOrigin, rateLimit } from "@/lib/server/http";
import { checkout } from "@/lib/server/checkout";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return endpoint(async (req) => {
    sameOrigin(req);
    await rateLimit(req, "checkout", 30);
    z.uuid().parse(id);
    return Response.json({
      url: await checkout(id, req.headers.get("X-Order-Token") || ""),
    });
  })(request);
}
