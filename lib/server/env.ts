import "server-only";
import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z
    .url()
    .refine((value) =>
      ["postgres:", "postgresql:"].includes(new URL(value).protocol),
    ),
  DATABASE_CA_CERT: z.string().optional(),
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  SUPABASE_ANON_KEY: z.string().min(20),
  OWNER_USER_ID: z.uuid(),
  OWNER_LOGIN_EMAIL: z.email(),
  APP_URL: z.url(),
  STRIPE_SECRET_KEY: z.string().regex(/^sk_(test|live)_/),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  RESEND_API_KEY: z.string().min(10),
  EMAIL_FROM: z.email(),
  CRON_SECRET: z.string().min(32),
  RATE_LIMIT_SECRET: z.string().min(32),
  ALLOW_LIVE_PAYMENTS: z.enum(["true", "false"]).default("false"),
});
export function env() {
  const e = schema.parse(process.env);
  const origin = new URL(e.APP_URL);
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  )
    throw new Error("APP_URL must be an origin");
  e.APP_URL = origin.origin;
  if (
    process.env.NODE_ENV === "production" &&
    !e.APP_URL.startsWith("https://")
  )
    throw new Error("HTTPS required");
  if (
    e.STRIPE_SECRET_KEY.startsWith("sk_live_") &&
    e.ALLOW_LIVE_PAYMENTS !== "true"
  )
    throw new Error("Live payments disabled");
  if (e.EMAIL_FROM.toLowerCase().endsWith("@gmail.com"))
    throw new Error("Verified domain sender required");
  return e;
}
