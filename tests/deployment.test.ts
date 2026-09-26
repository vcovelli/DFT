import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  query: vi.fn(),
  maintenance: vi.fn(),
  settings: vi.fn(),
  env: vi.fn(),
}));
vi.mock("../lib/server/db", () => ({ db: { query: state.query } }));
vi.mock("../lib/server/maintenance", () => ({
  maintenance: state.maintenance,
}));
vi.mock("../lib/server/orders", () => ({ settings: state.settings }));
vi.mock("../lib/server/env", () => ({ env: state.env }));
import { GET as health } from "../app/api/health/route";
import { POST as cron } from "../app/api/cron/route";
import { requireOrderingAvailable } from "../lib/server/availability";
import handler from "../netlify/functions/maintenance.mjs";
beforeEach(() => {
  vi.resetAllMocks();
  state.query.mockResolvedValue({
    rows: [{ id: true, fresh: true, mail_ready: true }],
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("health checks the application schema and returns only a boolean", async () => {
  const response = await health();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(state.settings).toHaveBeenCalled();
  expect(state.query).toHaveBeenCalled();
});
it("health never returns database error details", async () => {
  state.query.mockRejectedValue(new Error("private connection information"));
  const response = await health();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ok: false });
});
it("a failed email or stale scheduler prevents new ordering", async () => {
  vi.stubEnv("ORDERING_ENABLED", "true");
  for (const row of [
    { fresh: false, mail_ready: true },
    { fresh: true, mail_ready: false },
  ]) {
    state.query.mockResolvedValue({ rows: [row] });
    await expect(requireOrderingAvailable()).rejects.toThrow(
      "temporarily unavailable",
    );
  }
});
it("missing and incorrect cron credentials cannot execute maintenance", async () => {
  vi.stubEnv("CRON_SECRET", "x".repeat(32));
  for (const authorization of [
    "",
    "Bearer wrong",
    `Bearer ${"y".repeat(32)}`,
  ]) {
    const response = await cron(
      new Request("https://example.test/api/cron", {
        method: "POST",
        headers: { authorization },
      }),
    );
    expect(response.status).toBe(401);
  }
  expect(state.maintenance).not.toHaveBeenCalled();
});
it("authenticated cron runs maintenance and prevents caching", async () => {
  vi.stubEnv("CRON_SECRET", "x".repeat(32));
  const response = await cron(
    new Request("https://example.test/api/cron", {
      method: "POST",
      headers: { authorization: `Bearer ${"x".repeat(32)}` },
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(state.maintenance).toHaveBeenCalledTimes(1);
});
it("Netlify scheduler uses a bearer header with no redirects or secret in the URL", async () => {
  vi.stubEnv("APP_URL", "https://example.test");
  vi.stubEnv("CRON_SECRET", "x".repeat(32));
  const request = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", request);
  expect((await handler()).status).toBe(204);
  expect(String(request.mock.calls[0][0])).toBe(
    "https://example.test/api/cron",
  );
  expect(request.mock.calls[0][1]).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: { Authorization: `Bearer ${"x".repeat(32)}` },
  });
});
it("scheduler sanitizes failures and rejects insecure origins", async () => {
  vi.stubEnv("APP_URL", "http://example.test");
  vi.stubEnv("CRON_SECRET", "x".repeat(32));
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  await expect(handler()).rejects.toThrow("scheduled_maintenance_failed");
  expect(request).not.toHaveBeenCalled();
  vi.stubEnv("APP_URL", "https://example.test");
  request.mockRejectedValue(new Error("private provider response"));
  await expect(handler()).rejects.toThrow(/^scheduled_maintenance_failed$/);
});
