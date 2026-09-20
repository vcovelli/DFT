import { cookies } from "next/headers";
import { z } from "zod";
import { authClient } from "@/lib/server/providers";
import { authorizeOwner, sessionCookie } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import {
  assert,
  endpoint,
  jsonBody,
  rateLimit,
  sameOrigin,
} from "@/lib/server/http";
const schema = z
  .object({
    email: z.email(),
    code: z
      .string()
      .regex(/^\d{6,10}$/)
      .optional(),
  })
  .strict();
export const POST = endpoint(async (request) => {
  sameOrigin(request);
  await rateLimit(request, "owner-auth", 10);
  const body = schema.parse(await jsonBody(request)),
    e = env(),
    client = authClient();
  assert(
    body.email.toLowerCase() === e.OWNER_LOGIN_EMAIL.toLowerCase(),
    "Unable to sign in with those details.",
    401,
  );
  if (!body.code) {
    const { error } = await client.auth.signInWithOtp({
      email: body.email,
      options: { shouldCreateUser: false },
    });
    assert(!error, "Unable to send a sign-in code. Please retry later.", 503);
    return Response.json({ sent: true });
  }
  const { data, error } = await client.auth.verifyOtp({
    email: body.email,
    token: body.code,
    type: "email",
  });
  assert(!error && data.session, "Invalid or expired sign-in code.", 401);
  authorizeOwner(data.user, e.OWNER_USER_ID);
  (await cookies()).set(sessionCookie, data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.min(data.session.expires_in, 3600),
  });
  return Response.json({ ok: true });
});
export const DELETE = endpoint(async (request) => {
  sameOrigin(request);
  (await cookies()).delete(sessionCookie);
  return Response.json({ ok: true });
});
