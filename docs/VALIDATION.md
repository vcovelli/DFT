# Phase 2 validation record

Validated locally on 20 September 2026 with Node 22.15.0, Next 16.3.5,
Stripe SDK 22.6.2 (API version `2026-08-26.dahlia`), Vitest 4.1.11, PGlite,
and Chromium through Playwright. No live customer data or real payment details
were used. No provider accounts, DNS, or production deployment were modified.

## Actual final command results

| Check | Result |
| --- | --- |
| `npm run format:check` | Pass |
| `npm run lint` | Pass, no remaining lint findings |
| `npm run typecheck` | Pass |
| `npm test` | **47 passed**, 5 test files |
| `npm run build` | Pass, production routes generated |
| `npm run test:e2e` | **4 passed**, Chromium against production build |
| `npm audit` | **0 vulnerabilities**, including development dependencies |
| `git diff --check` | Pass |

Next reports an unrelated parent-directory package-lock outside this Git repository
and ignores it. Playwright reports a harmless NO_COLOR/FORCE_COLOR conflict in this
environment. The paused homepage emits the expected `ordering_unavailable` code
when no provider environment is configured. These did not fail any checks.

During development, a test-helper type error, framework navigation lint findings,
and reused fixture IDs were found and corrected. npm 10's optional-peer resolver
failed while upgrading the test runner. npm 11.6.2 resolved the compatible upgrade;
non-breaking audit fixes then removed the remaining tooling advisories. The final
lockfile records the tested dependencies. The failed intermediate attempts are not
counted as successful validation.

## Stage outcomes and changed areas

| Stage | Implementation / principal files | What is verified; remaining dependency |
| --- | --- | --- |
| A — audit | `docs/AUDIT.md`, existing design retained in `app/components/home.tsx` | Repository, installed Next guides, provider design reviewed; owner policy decisions remain |
| B — data / validation | `lib/domain.ts`, `lib/server/{db,orders,http,env}.ts`, `db/migrations/` | Integer pricing, odd-cent rounding, input rejection, duplicate orders, SQL constraints and immutable snapshots tested |
| C — private storage | `lib/server/files.ts`, upload/download routes, storage migrations | PDF bounds/signatures, scoped tokens, one-file limit, retries, storage failures, private-bucket SQL, cleanup tested with mocked Storage; hosted storage/signing/scanning assessment remains |
| D — deposits | `lib/server/checkout.ts`, order/Checkout routes, `app/components/order-form.tsx` | Server-derived deposit and duplicate Checkout prevention tested with mocked Stripe; real Stripe test-mode acceptance remains |
| E — webhooks | `lib/server/payments.ts`, webhook route | Actual SDK signature verification, durable event deduplication, out-of-order payloads, failed/expired payments, wrong relationships, refunds/disputes tested; hosted event delivery remains |
| F — balances | `lib/server/invoices.ts`, owner action/recovery routes | One invoice/line item on retry, final charge verification, credit-adjusted balance, stale-operation guard tested; real hosted invoice payment remains |
| G — email | `lib/server/emails.ts`, outbox/supersession migrations | Provider failure preserves payment, acceptance retry deduplication, old-send review, obsolete notice suppression tested; domain verification, inbox/bounce testing remains |
| H — owner workflow | `app/owner/`, owner routes, Supabase Auth wrapper | Owner-ID checks, actual unauthorized route denial, browser sign-in redirect, settings/fulfillment implementation checked; authenticated hosted owner walkthrough remains |
| I — hardening | `tests/`, security headers, RLS runtime role, body/rate limits, `vercel.json` | Automated results above; hosted rate-limit headers, multi-connection contention, provider outages and platform cron must be checked in staging |
| J — handoff | `.env.example`, README, `docs/{SETUP,OWNER-GUIDE,OPERATIONS,HANDOFF}.md` | Concrete setup, operations, rollback, backup and acceptance instructions written; owner account transfer and restore drill remain |

## Scope of evidence

PGlite runs real PostgreSQL SQL in-process. All six migrations are executed in a
local test with a **minimal fixture** of Supabase-owned roles/storage tables.
Anonymous and ordinary authenticated roles cannot read orders; the runtime group
can access business settings and cannot alter orders. This validates migration SQL
and the intended grants; it does not validate the live Supabase platform or its
Storage/Auth configuration. Tests do not reproduce real multi-connection database
contention or arbitrary provider/network scheduling.

Stripe, Storage, and email workflow tests use controlled mock responses. The SDK
signature test uses generated test signatures against exact raw bytes. Browser
smoke tests exercise the unconfigured build: marketing rendering/mobile width,
paused ordering, protected owner route redirect, private API denial, return-page
wording, policy page, and security headers. They do **not** prove a customer can
complete a real hosted payment, receive email, or sign in to a configured owner
account. Complete the owner-controlled staging acceptance checklist before launch.

## Release status

**Locally implemented and tested; not approved or verified for production.**
Ordering defaults to paused, policy approval defaults to false, and live Stripe
keys are blocked unless explicitly enabled. The requested 50% split is a draft
configuration, with the odd cent rounded into the deposit and no minimum-order
policy invented. No owner approval was assumed.

Remaining launch dependencies: owner accounts and credentials entered securely;
hosted migrations and RLS/storage verification; verified sender/OTP email; Stripe
test-mode end-to-end checks; commercial managed cron setup; approved legal, tax,
refund, revision, rush and record-retention policies; malware-scanning decision;
separate file backups and an actual restore drill; explicit production authorization.
