import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { env } from "../lib/server/env";
beforeEach(() => {
  const fixture = {
    DATABASE_URL: "postgresql://fixture:fixture@localhost/test",
    SUPABASE_URL: "https://example.test",
    SUPABASE_SECRET_KEY: "fixture-not-a-provider-key",
    SUPABASE_ANON_KEY: "fixture-not-a-provider-key",
    OWNER_USER_ID: "00000000-0000-4000-8000-000000000001",
    OWNER_LOGIN_EMAIL: "owner@example.test",
    APP_URL: "https://example.test",
    STRIPE_SECRET_KEY: "sk_test_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    RESEND_API_KEY: "fixture-not-a-provider-key",
    EMAIL_FROM: "mail@example.test",
    CRON_SECRET: "x".repeat(32),
    RATE_LIMIT_SECRET: "y".repeat(32),
  };
  for (const [key, value] of Object.entries(fixture)) vi.stubEnv(key, value);
  for (const key of [
    "ORDERING_ENABLED",
    "SHOW_DEMO_BANNER",
    "ALLOW_LIVE_PAYMENTS",
    "VERCEL",
  ])
    vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());
it("defaults to paused ordering, visible demo banner and test-only payments", () => {
  expect(env()).toMatchObject({
    ORDERING_ENABLED: "false",
    SHOW_DEMO_BANNER: "true",
    ALLOW_LIVE_PAYMENTS: "false",
  });
});
it("rejects live keys unless explicitly authorized, and always rejects them on Vercel staging", () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fixture");
  expect(() => env()).toThrow("Live payments disabled");
  vi.stubEnv("ALLOW_LIVE_PAYMENTS", "true");
  vi.stubEnv("VERCEL", "1");
  expect(() => env()).toThrow("Staging requires test payments");
});
it("validation errors never contain input values", () => {
  vi.stubEnv("DATABASE_URL", "private-invalid-configuration");
  expect(() => env()).toThrow(/^Server configuration unavailable$/);
});
it("rejects credential-bearing and non-HTTPS hosted origins", () => {
  vi.stubEnv("APP_URL", "https://fixture:fixture@example.test");
  expect(() => env()).toThrow("APP_URL must be an origin");
  vi.stubEnv("APP_URL", "http://example.test");
  vi.stubEnv("NODE_ENV", "production");
  expect(() => env()).toThrow("HTTPS required");
});
