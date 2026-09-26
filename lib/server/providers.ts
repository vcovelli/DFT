import "server-only";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
export function stripe() {
  return new Stripe(env().STRIPE_SECRET_KEY, {
    maxNetworkRetries: 0,
    timeout: 5000,
  });
}
export function storage() {
  const e = env();
  return createClient(e.SUPABASE_URL, e.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(5000) }),
    },
  });
}
export function authClient() {
  const e = env();
  return createClient(e.SUPABASE_URL, e.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(5000) }),
    },
  });
}
