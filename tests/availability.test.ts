import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { requireOrderingAvailable } from "../lib/server/availability";
import type { DB } from "../lib/server/db";
const query = vi.fn();
const db = { query } as DB;
beforeEach(() => {
  vi.stubEnv("ORDERING_ENABLED", "true");
  vi.stubEnv("ALLOW_TEST_EMAIL_FAILURES", "true");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("ALLOW_LIVE_PAYMENTS", "false");
  vi.stubEnv("SHOW_DEMO_BANNER", "true");
  query
    .mockReset()
    .mockResolvedValue({
      rows: [{ fresh: true, mail_ready: false }],
      rowCount: 1,
    });
});
afterEach(() => vi.unstubAllEnvs());
it("allows test intake with failed emails only when explicitly enabled", async () => {
  await expect(requireOrderingAvailable(db)).resolves.toBeUndefined();
});
it.each([
  ["ALLOW_TEST_EMAIL_FAILURES", undefined],
  ["ALLOW_TEST_EMAIL_FAILURES", "false"],
  ["STRIPE_SECRET_KEY", "sk_live_fixture"],
  ["STRIPE_SECRET_KEY", undefined],
  ["ALLOW_LIVE_PAYMENTS", "true"],
  ["ALLOW_LIVE_PAYMENTS", undefined],
  ["SHOW_DEMO_BANNER", "false"],
  ["SHOW_DEMO_BANNER", undefined],
])("keeps failed email blocking intake with %s=%s", async (key, value) => {
  vi.stubEnv(key, value);
  await expect(requireOrderingAvailable(db)).rejects.toThrow(
    "temporarily unavailable",
  );
});
it("still honors the deployment pause during email testing", async () => {
  vi.stubEnv("ORDERING_ENABLED", "false");
  await expect(requireOrderingAvailable(db)).rejects.toThrow("paused");
  expect(query).not.toHaveBeenCalled();
});
it("still requires healthy maintenance during email testing", async () => {
  query.mockResolvedValue({ rows: [{ fresh: false, mail_ready: false }] });
  await expect(requireOrderingAvailable(db)).rejects.toThrow(
    "temporarily unavailable",
  );
});
it("does not bypass database failures or missing maintenance state", async () => {
  query.mockRejectedValueOnce(new Error("database_unavailable"));
  await expect(requireOrderingAvailable(db)).rejects.toThrow(
    "database_unavailable",
  );
  query.mockResolvedValueOnce({ rows: [] });
  await expect(requireOrderingAvailable(db)).rejects.toThrow(
    "temporarily unavailable",
  );
});
it("allows normal ordering with healthy email when the exception is off", async () => {
  vi.stubEnv("ALLOW_TEST_EMAIL_FAILURES", "false");
  query.mockResolvedValue({ rows: [{ fresh: true, mail_ready: true }] });
  await expect(requireOrderingAvailable(db)).resolves.toBeUndefined();
});
