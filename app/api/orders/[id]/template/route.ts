import { z } from "zod";
import { MAX_FILE } from "@/lib/domain";
import { endpoint, readBody, sameOrigin, rateLimit } from "@/lib/server/http";
import { uploadTemplate } from "@/lib/server/files";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return endpoint(async (req) => {
    sameOrigin(req);
    await rateLimit(req, "uploads", 30);
    z.uuid().parse(id);
    const name = decodeURIComponent(req.headers.get("X-File-Name") || "");
    await uploadTemplate(
      id,
      req.headers.get("X-Order-Token"),
      name,
      req.headers.get("Content-Type") || "",
      await readBody(req, MAX_FILE),
    );
    return Response.json({ ok: true });
  })(request);
}
