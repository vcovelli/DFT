# Developer handoff and launch checklist

## Before production authorization

- [ ] Business owns source repository, Vercel, Supabase, Stripe/bank, Resend, domain,
  mailbox, backups, billing, recovery contacts, and MFA recovery codes.
- [ ] Owner approves prices, deposit percentage and odd-cent rule, manual delivery,
  preparation deadlines, rush scope, revisions, refunds, tax handling, privacy,
  paid-record retention schedule, file limits, and founder claims.
- [ ] Public policy wording reviewed and finalized; remove the prelaunch review
  sentence from the notice only after approved text is ready.
- [ ] Owner approves production deployment and live payment activation explicitly.
- [ ] Staging account credentials installed securely; runtime DB login has only
  dft_app permissions; migration credentials excluded from runtime.
- [ ] All migrations run on staging; private bucket and RLS tested as anon,
  ordinary authenticated user, and runtime role.
- [ ] Owner OTP email, Resend sender domain, and customer email delivery verified.
- [ ] Stripe webhook destination/API version/event subscriptions verified.
- [ ] Commercial Vercel plan and ten-minute cron approved and verified running.
- [ ] Database AND file backup restore drill completed to agreed recovery targets.
- [ ] Automated checks pass; actual results saved in VALIDATION.md.

## Stripe test-mode acceptance (requires owner-controlled staging)

Use Stripe's documented test payment methods only. Never use real customer card
information. This list was **not run against external providers** by the local suite.

- [ ] Place each service/duration, with/without rush; confirm cents and deposit.
- [ ] Submit an odd-cent total and verify deposit + balance equals total.
- [ ] Upload a valid PDF; reject renamed HTML, oversized file, second unauthorized
  file, wrong order token, and uploads after Checkout creation.
- [ ] Double-click, retry after dropped response, and send duplicate request keys;
  confirm exactly one order, deposit session, and attached template.
- [ ] Pay the deposit; check order, ledger, deadline, customer email, owner email.
- [ ] Visit the success URL without paying; no paid state must appear.
- [ ] Replay duplicate and older webhooks; confirmations and credits remain singular.
- [ ] Decline/expire/cancel Checkout; verify no payment credit or fulfillment grant.
- [ ] Prepare work, record an optional credit, request balance twice; one correct
  invoice, one line item, one balance notification.
- [ ] Pay final invoice, verify actual charge and PAID_IN_FULL, email materials
  manually, then mark delivered. Attempt delivery before full payment and reject it.
- [ ] Refund deposit/final payment; verify net balance and retained payment history.
- [ ] Simulate a dispute and resolution; prevent fulfillment while unresolved.
- [ ] Simulate out-of-band marked-paid invoice; do not grant cash payment credit.
- [ ] Interrupt Stripe calls/DB commits and reconnect exact objects through owner UI.
- [ ] Force email failure; payment persists, retry recovers, duplicates are avoided.
- [ ] Verify ambiguous email review after the safe idempotency window.
- [ ] Test unauthorized owner routes, another Supabase user, expired session,
  cross-origin mutation, rate limits, bad webhook signature, wrong Stripe mode.
- [ ] Test storage/database/Stripe outages and owner-friendly errors.
- [ ] Run cleanup on aged test records; paid or ambiguous requests are retained.
- [ ] Owner independently completes sign-in, fulfillment, settings, pause, refunds,
  notifications, recovery, backup retrieval, and account-access removal.

## Final transfer

Give the owner the operating guide and credentials through their password manager.
Record provider URLs, billing dates, support channels, backup locations, launch
approval, test evidence, deployed commit/release, and any open limitations.
Transfer all account ownership and repository/deployment connections. Remove the
developer's temporary access, rotate shared setup credentials, and verify orders,
webhooks, notifications, maintenance, and owner login still work. Leave no personal
server or developer-owned account in the production dependency chain.
