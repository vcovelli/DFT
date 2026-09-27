import { afterEach, expect, it, vi } from "vitest";
import { attemptEmail, sendMail } from "../lib/server/emails";
import { emailFailureMessage } from "../lib/email-errors";
import type { DB } from "../lib/server/db";
vi.mock("../lib/server/env", () => ({
  env: () => ({
    RESEND_API_KEY: "fixture-key",
    EMAIL_FROM: "orders@example.test",
  }),
}));
afterEach(() => vi.unstubAllGlobals());
it.each([
  [
    403,
    {
      name: "validation_error",
      message: "The example.test domain is not verified.",
    },
    "email_domain_unverified",
  ],
  [
    403,
    {
      name: "validation_error",
      message:
        "You can only send testing emails to your own email address (private@example.test).",
    },
    "email_test_recipient",
  ],
  [401, { message: "private key rejected" }, "email_credentials"],
  [429, { name: "daily_quota_exceeded" }, "email_quota"],
  [429, { name: "rate_limit_exceeded" }, "email_rate_limit"],
  [503, { message: "private provider details" }, "email_provider_unavailable"],
  [400, { message: "unknown error with private details" }, "provider_error"],
])("persists a safe diagnostic for HTTP %s", async (status, body, code) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json(body, { status })),
  );
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
  query.mockResolvedValueOnce({
    rows: [
      { recipient: "teacher@example.test", subject: "Test", body: "Test" },
    ],
    rowCount: 1,
  });
  await attemptEmail({ query } as DB, "email-id", sendMail);
  expect(query).toHaveBeenLastCalledWith(
    "UPDATE email_outbox SET attempts=attempts+1,last_error=$2 WHERE id=$1",
    ["email-id", code],
  );
  expect(emailFailureMessage(code)).not.toContain("private");
});
it("handles non-JSON provider errors without storing the response", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("private proxy response", { status: 502 }),
      ),
  );
  await expect(
    sendMail(
      { to: "teacher@example.test", subject: "Test", text: "Test" },
      "email-id",
    ),
  ).rejects.toThrow("email_provider_unavailable");
});
it("keeps unknown stored errors out of the owner page", () => {
  expect(emailFailureMessage("private unexpected error")).toBe(
    emailFailureMessage("provider_error"),
  );
});
