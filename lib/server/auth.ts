import "server-only";
import { cookies } from "next/headers";
import { authClient } from "./providers";
import { env } from "./env";
import { assert } from "./http";
export const sessionCookie = "dft-owner-session";
export function authorizeOwner(
  user: { id: string; email_confirmed_at?: string } | null,
  ownerId: string,
) {
  assert(
    user && user.id === ownerId && user.email_confirmed_at,
    "Owner sign-in required",
    401,
  );
  return user;
}
export async function requireOwner() {
  const token = (await cookies()).get(sessionCookie)?.value;
  assert(token, "Owner sign-in required", 401);
  const { data, error } = await authClient().auth.getUser(token);
  assert(!error, "Owner sign-in required", 401);
  return authorizeOwner(data.user, env().OWNER_USER_ID);
}
