# Netlify readiness validation — 26 September 2026

Local checks ran against Next.js 16.3.5, Node 22, Vitest/PGlite and Chromium.
No provider credentials were entered, no hosted migrations/deployments were run,
and no domain, live payments or production ordering was enabled. Vercel deployment
configuration is unchanged. Concurrent contact-address corrections in the shared
workspace were preserved.

## Final results

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass; Next route type generation and TypeScript |
| `npm test` | **65 passed**, 7 files |
| `npm run build` | Pass; all application/API routes generated |
| `npm run test:e2e` | **5 passed**, Chromium against the production build |
| `npm run format:check` | Pass |
| `git diff --check` | Pass |
| Repository credential-pattern check | No matches for long Stripe keys/signing secrets, private key blocks or credential-bearing Postgres URLs; values were never printed |
| `git diff -- vercel.json` | Empty; original daily staging schedule preserved |

The credential-pattern check is a bounded heuristic, not proof that every possible
secret format is absent. Server modules retain server-only boundaries; no provider
secrets use NEXT_PUBLIC or Next's public env configuration. Synthetic fixture keys
are used in tests. Real secret stores were not inspected or exported.

Expected warnings: Next ignores an unrelated parent-directory package lock;
Playwright reports NO_COLOR/FORCE_COLOR overlap; the unconfigured homepage logs only
the stable `ordering_not_configured` code. No npm audit was rerun for this change;
the previous validation's dependency-audit result is not claimed as current.

## What the automated evidence covers

- Real in-process Postgres migrations, including new 007 lease/heartbeat/RLS schema
  against a minimal Supabase-owned schema fixture; existing role access checks.
- Existing pricing/immutability, durable duplicate submissions, scoped PDF handling,
  payment/refund/dispute reconciliation, signed webhook verification, idempotent
  checkout/invoices, durable email retries and owner authorization regressions.
- Missing/default safety flags, live-key refusal, Vercel test-only enforcement,
  sanitized invalid configuration and hosted origin restrictions.
- Pause after submission blocks checkout; failed email blocks checkout; saved
  request retries survive pause; stale maintenance blocks intake.
- Submitted unpaid instructions and files survive long outages. Retention removes
  eligible terminal-order templates while preserving the order. A lease prevents
  overlapping maintenance; provider failure releases it, records failure and
  immediately closes intake despite a previous successful heartbeat.
- Public health returns only a boolean and 200/503, with no-store. Cron rejects
  missing, wrong-length and same-length incorrect bearer tokens before running
  work. The Netlify caller uses POST/header authorization, no redirects, a timeout,
  validates its response and sanitizes errors.
- Browser: paused homepage and visible banner, mobile width, owner login redirect,
  unauthorized private access, payment return-page wording, security headers,
  generic unhealthy response and unauthenticated maintenance denial.

The first test run found expected outdated unpaid-cleanup assertions; they were
changed to validate preservation. A new environment test caught URL refinement
throwing before sanitized validation; URL.canParse now guards parsing. Final
results above were collected after fixes, not from intermediate failed runs.

## Hosted checks remain pending

Local `next build` is not a Netlify deployment or adapter acceptance test. The
native scheduled function is tested with mocked fetch; actual scheduling, Function
runtime environment scopes, platform limits and HTTPS routing remain unverified.
Provider acceptance needs the owner-controlled account and secrets, entered one
step at a time. See SETUP.md and HANDOFF.md for the provider checklist.

Stripe, Supabase Auth/Storage and Resend calls use mocks in automated workflows.
PGlite does not reproduce real multi-connection contention, hosted RLS defaults,
transaction pooler/TLS behavior or quota exhaustion. Browser tests use an
unconfigured app and do not sign into a live owner account or pay a test invoice.
The backup procedure was documented, not executed against private data; an isolated
restore drill remains a launch gate.

Netlify Free exhaustion stops requests and webhooks; the code cannot keep a paused
host online or expire payment URLs while it is offline. Saved orders remain in
Supabase and Stripe activity must be reconciled after service returns. Resend
failure detection occurs on actual sends, not predictive quota monitoring. These
operational limits are documented in OPERATIONS.md; no zero-loss disaster recovery
or guaranteed uptime is claimed.

## Release state and next boundary

**Repository prepared and locally validated; hosted deployment/acceptance pending.**
ORDERING_ENABLED defaults false, owner policy approval remains required,
SHOW_DEMO_BANNER defaults true and ALLOW_LIVE_PAYMENTS defaults false. No migrations
run on build. The next assisted step requires the business owner's Netlify account;
stop for that single provider action before any account setup or secret entry.
