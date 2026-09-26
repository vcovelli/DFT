# Developer handoff and launch checklist

This preparation does **not** authorize a domain connection, live Stripe activation
or production ordering. Keep ORDERING_ENABLED=false, SHOW_DEMO_BANNER=true and
ALLOW_LIVE_PAYMENTS=false. Provider steps and secret entries are performed with the
owner **one action at a time**; do not request a batch of credentials in chat.

## Account ownership and recovery register

Keep this register in the owner's password manager/private operations folder,
containing account URLs, owner identities, recovery contacts and dates, not in Git.

| Account | Ownership / MFA / recovery | Billing and emergency responsibility |
| --- | --- | --- |
| Netlify Free | Owner's own login and repo connection; MFA and offline recovery codes. Free account may not support collaborator seats; do not share login. Owner performs provider UI steps. | Owner receives usage/credit notices; confirm Free plan, billing cycle and limits. No paid upgrade/add-on without approval. Pause deployment if needed. |
| Vercel staging | Retain current owner, integration, URL and isolated credentials. Secure with MFA. | Keep existing plan; no production dependency. Do not delete staging or repoint it at customer data. |
| Supabase | Owner organization/projects; MFA; confirmed owner Auth user; mailbox protected with MFA. | Free quotas, inactive-project notices, daily encrypted exports. Designate technical recovery operator. |
| Stripe | Business legal owner, verified representative and owner-controlled bank account; MFA/passkey and recovery codes. | Owner alone supplies identity, tax/business details and payout bank verification directly to Stripe. Confirm requirements/capabilities and payout status later; test mode remains active now. |
| Resend and Auth SMTP | Owner organization, verified sender domain and restricted sending access; provider MFA where available. | Owner monitors sending quotas, bounces, suppressions and DNS status. API sending and Supabase OTP SMTP both need delivery tests. |
| Registrar / DNS | Owner registrant, MFA, registrar lock and offline recovery. Record DNS host separately if different. | Confirm domain ownership, renewal dates, auto-renew and billing contact. Export existing zone before authorized changes. No production DNS changes in this task. |
| Business mailbox | Owner and designated recovery contact; MFA and recovery method independent of the site. | Verify owner control and delivery for orders@doneforteachers.com before launch. Owner handles customer notices during outages. |
| Source repository | Owner organization/account, MFA, protected default branch and review of deploy connections. | Record source license, deployed commit and ability to rebuild without developer accounts. |
| Backups / password manager | Business-owned encrypted destinations and separately stored recovery keys. | Named backup operator, daily changed-data exports, quarterly restore drill and agreed retention. |

Verify recovery contacts are current and recovery codes can be found without the
original developer. Do not place MFA seeds/recovery codes, card data or identity
documents in this repository or chat. Test account recovery without disabling MFA.
The application uses owner email OTP, not a second-factor challenge of its own;
protect that mailbox and all provider administration accounts with MFA.

## Before production authorization

- [ ] Business owns source repository, Netlify Free, Vercel staging, Supabase, Stripe/bank, Resend, domain,
  mailbox, backups, billing, recovery contacts, and MFA recovery codes.
- [ ] Owner approves prices, deposit percentage and odd-cent rule, manual delivery,
  preparation deadlines, rush scope, revisions, refunds, tax handling, privacy,
  paid-record retention schedule, file limits, and founder claims.
- [ ] Public policy wording reviewed and finalized; remove the prelaunch review
  sentence from the notice only after approved text is ready.
- [ ] Owner approves production deployment and live payment activation explicitly.
- [ ] Staging account credentials installed securely; runtime DB login has only
  dft_app permissions; migration credentials excluded from runtime.
- [ ] All seven migrations run on the separate candidate database and staging; private bucket and RLS tested as anon,
  ordinary authenticated user, and runtime role.
- [ ] Owner OTP email, Resend sender domain, and customer email delivery verified.
- [ ] Stripe webhook destination/API version/event subscriptions verified.
- [ ] Netlify scheduled function runs with its own bearer secret; heartbeat and timeout behavior verified. Existing daily Vercel staging cron is preserved.
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
- [ ] Run cleanup on aged test records; all submitted unpaid, paid and ambiguous requests remain. Only eligible terminal templates/orphans are removed.
- [ ] Owner independently completes sign-in, fulfillment, settings, pause, refunds,
  notifications, recovery, backup retrieval, and account-access removal.

## Netlify hosted acceptance evidence

These checks require provider access and are not implied by local tests:

- [ ] Record Netlify site URL, published commit, adapter version/build log summary
  and Node version. Verify Next 16 build, all Node routes and `after` callbacks.
- [ ] Temporary host shows DEMO / STAGING and paused ordering. Health returns only
  boolean status with no-store. Changing the server banner flag changes the next
  response after the platform applies/redeploys runtime configuration.
- [ ] Test exact raw Stripe signed bytes through Netlify; forged signatures and
  wrong mode fail. Keep original staging webhook destination active and isolated.
- [ ] Upload/download a PDF at the 3 MB boundary; verify private bucket, attachment
  disposition, 60-second link expiry, and failed upload preserving the order.
- [ ] Verify hosted transaction-pooler TLS, runtime privileges, DB statement timeout
  and concurrency. Application instances each have a two-connection pool.
- [ ] Check native scheduled function secret/runtime scope, manual invocation and
  next automatic invocation. Prove two invocations do not duplicate work, a killed
  lease expires, failed maintenance does not renew heartbeat, and /owner displays it.
- [ ] In controlled test data, simulate unavailable DB, Stripe, Storage and failed
  Resend send; ordering closes, payment/event/outbox records survive. Simulate stale
  maintenance and a backlog. Recover using /owner without resetting idempotency keys.
- [ ] Verify shared throttling on Netlify, including caller-supplied forwarded IPs.
- [ ] Verify quota notices and the account's actual Free allowance. Do not exhaust
  the real account just to test it; walk through paused-site recovery and costs.
- [ ] Complete an isolated database + file restore and record achieved RPO/RTO.
- [ ] Owner completes routine work by entering only /owner; provider exceptions
  use its Stripe link or the recovery register with technical support.

## Emergency procedures

1. **Stop new intake:** pause in /owner. If unavailable, the owner/support operator
   sets ORDERING_ENABLED=false in Netlify and applies the change, or disables the
   site. Do not disable working webhook recovery unnecessarily. Existing Stripe
   sessions/invoices may remain payable; review/expire or void them in Stripe as
   appropriate. Never erase orders or assume a refund happened.
2. **Free quota exhaustion/outage:** follow OPERATIONS.md. Hosting recovery may need
   a quota reset or separately approved upgrade. Leave orders paused, reconcile
   every affected order/payment, review ambiguous sends and run maintenance before
   considering reopening. Do not send duplicate invoices or substitute Vercel's
   staging database for production.
3. **Suspected compromise:** pause intake, revoke affected provider credentials,
   remove temporary collaborators/deploy tokens, revoke Supabase Auth sessions and
   secure the mailbox. Preserve audit evidence privately, involve qualified support,
   assess notification duties and rotate using ENVIRONMENT.md. Never paste logs
   containing secrets or customer data into support tickets.
4. **Lost account access:** use the owner's offline recovery codes or provider's
   verified recovery process. Do not create a developer-owned replacement account.
5. **Bad release:** roll back Netlify to the last verified compatible deployment;
   keep database records and additive migrations. Restore a backup only for an
   actual data-loss incident with Stripe/email reconciliation.

## Final transfer and revocation

Record ownership, recovery verification date, billing dates, support contacts,
backup locations, restore evidence, deployed commit, adapter version, policy
approvals and unresolved limits in the private register. Keep the source and guides
in the business repository. No developer-owned server or paid account is required.

Remove temporary developer access from repository, Netlify (if any), Vercel,
Supabase, Stripe, Resend, DNS and password manager. Revoke personal access tokens,
deploy hooks and unused keys; rotate shared setup credentials in the documented
order. Keep platform-owned deployment integrations necessary to operate the app.
Recheck owner login, health, staging isolation, test webhooks, notifications,
private downloads and schedule after revocation. Confirm the owner can export and
restore with a replacement technical operator. Production ordering stays paused;
final launch requires separate explicit authorization after all evidence is accepted.
