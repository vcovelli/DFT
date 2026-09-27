import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: vi.fn() }),
}));
vi.mock("../lib/server/env", () => ({
  env: () => ({
    APP_URL: "https://example.test",
    OWNER_LOGIN_EMAIL: "owner@example.test",
    OWNER_USER_ID: "00000000-0000-4000-8000-000000000001",
  }),
}));
vi.mock("../lib/server/providers", () => ({
  authClient: () => ({ auth: { signInWithOtp: mocks.send } }),
}));
vi.mock("../lib/server/http", async (original) => ({
  ...(await original<typeof import("../lib/server/http")>()),
  rateLimit: vi.fn(),
}));
import { POST } from "../app/api/owner/auth/route";
let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  mocks.send.mockReset();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
const request = (email = "owner@example.test") =>
  new Request("https://example.test/api/owner/auth", {
    method: "POST",
    headers: {
      origin: "https://example.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
it("preserves the owner restriction before contacting the email provider", async () => {
  expect((await POST(request("other@example.test"))).status).toBe(401);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("explains the sending limit while preserving the 429 response", async () => {
  mocks.send.mockResolvedValue({
    error: {
      code: "over_email_send_rate_limit",
      status: 429,
      message: "private-provider-details",
    },
  });
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({
    error:
      "The email sending limit has been reached. Please wait before requesting another code.",
  });
  expect(JSON.stringify(log.mock.calls)).not.toContain(
    "private-provider-details",
  );
});
it("keeps provider failures actionable without exposing credentials", async () => {
  mocks.send.mockResolvedValue({
    error: {
      code: "invalid code with private data",
      status: 500,
      message: "private-provider-details",
    },
  });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain(
    "Supabase Auth email settings and logs",
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain("private data");
  expect(JSON.stringify(log.mock.calls)).not.toContain(
    "private-provider-details",
  );
});
it("requests a code only for an existing account", async () => {
  mocks.send.mockResolvedValue({ error: null });
  expect(await (await POST(request())).json()).toEqual({ sent: true });
  expect(mocks.send).toHaveBeenCalledWith({
    email: "owner@example.test",
    options: { shouldCreateUser: false },
  });
});
