import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { env } from "./env";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  message = "Action unavailable",
  status = 409,
): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
export function sameOrigin(request: Request) {
  assert(
    request.headers.get("origin") === new URL(env().APP_URL).origin,
    "Invalid request origin",
    403,
  );
}
export async function readBody(request: Request, max = 16384) {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new HttpError(413, "Request too large");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(413, "Request too large");
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
export async function jsonBody(request: Request) {
  try {
    return JSON.parse((await readBody(request)).toString());
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid JSON");
  }
}
export async function rateLimit(request: Request, scope: string, limit = 15) {
  // Vercel overwrites x-vercel-forwarded-for. Ignore spoofable x-forwarded-for.
  const ip = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for") || "unknown"
    : "local";
  const key = createHmac("sha256", env().RATE_LIMIT_SECRET)
    .update(`${scope}:${ip}:${Math.floor(Date.now() / 3600000)}`)
    .digest("hex");
  const { rows } = await db.query(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+interval '1 hour') ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1 RETURNING count",
    [key],
  );
  assert(
    rows[0].count <= limit,
    "Too many requests. Please try again later.",
    429,
  );
}
export function endpoint(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      const response = await fn(request);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (e) {
      const status =
        e instanceof HttpError ? e.status : e instanceof z.ZodError ? 400 : 503;
      if (status >= 500)
        console.error(
          JSON.stringify({
            level: "error",
            code: "request_failed",
            route: new URL(request.url).pathname
              .split("/")
              .map((segment) =>
                /^[0-9a-f-]{36}$/.test(segment) ? ":id" : segment,
              )
              .join("/"),
          }),
        );
      return Response.json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : status === 400
                ? "Please check the submitted fields."
                : "Service temporarily unavailable. Please retry the same request.",
        },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
