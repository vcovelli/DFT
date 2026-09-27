// Keep provider response bodies out of the database and owner UI.
export const emailFailureMessages = {
  provider_error:
    "Delivery failed. Open the failed POST /emails request in Resend Logs for details.",
  email_domain_unverified:
    "Resend has not verified the sender domain. Verify the domain used by EMAIL_FROM, then retry.",
  email_test_recipient:
    "Resend's test sender can only email the account owner. Verify a sending domain to email customers, then retry.",
  email_credentials:
    "Resend rejected the sending credentials. Check the deployed RESEND_API_KEY and its sending permissions.",
  email_rate_limit:
    "Resend is rate limiting email requests. Wait before retrying.",
  email_quota:
    "The Resend sending quota has been reached. Check usage in Resend before retrying.",
  email_provider_unavailable: "Resend is temporarily unavailable. Retry later.",
} as const;
export type EmailFailureCode = keyof typeof emailFailureMessages;

export function classifyEmailFailure(
  status: number,
  body: unknown,
): EmailFailureCode {
  const value =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message =
    typeof value.message === "string" ? value.message.toLowerCase() : "";
  const name = typeof value.name === "string" ? value.name : "";
  if (status === 403 && message.includes("only send testing emails"))
    return "email_test_recipient";
  if (
    status === 403 &&
    message.includes("domain") &&
    message.includes("not verified")
  )
    return "email_domain_unverified";
  if (["daily_quota_exceeded", "monthly_quota_exceeded"].includes(name))
    return "email_quota";
  if (status === 429) return "email_rate_limit";
  if (
    status === 401 ||
    [
      "restricted_api_key",
      "suspended_api_key",
      "invalid_api_key",
      "invalid_permission",
    ].includes(name)
  )
    return "email_credentials";
  if (status >= 500) return "email_provider_unavailable";
  return "provider_error";
}

export function emailFailureMessage(code: string): string {
  return Object.hasOwn(emailFailureMessages, code)
    ? emailFailureMessages[code as EmailFailureCode]
    : emailFailureMessages.provider_error;
}
