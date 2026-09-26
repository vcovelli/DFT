# Netlify Free readiness audit — 26 September 2026

Repository reviewed before implementation: application pages/components, every
App Router API handler, server modules, migrations, scripts, tests, dependency and
hosting configuration, README and all existing guides. The prior Phase 2 audit is
retained below as history. No provider account or deployment was inspected/changed.

| Area | Finding and resulting change |
| --- | --- |
| Hosting / cron | Next 16.3.5 uses Node APIs. Vercel config is daily at noon UTC, despite old docs saying ten minutes. Preserve it; add Netlify OpenNext build config and native ten-minute scheduled caller using authenticated POST. |
| `/api/orders` | Origin, UUID idempotency, validation, DB rate limits and committed order before payment already present. Add default-off environment gate, fresh maintenance and email failure/backlog gate for new records; saved retries remain recoverable. |
| `/api/orders/[id]/checkout` | Scoped authorization, persisted provider operation key and transaction locks already present. It previously ignored a later pause; now rechecks switch/settings/readiness and private storage before Checkout. |
| `/api/orders/[id]/template` | Private PDF-only, 3 MB streaming bound, signature/name validation, one file/hash, expiring scoped token. Fits Netlify binary limit. Failures keep order retryable. No public bucket or local disk dependency. |
| `/api/stripe/webhook` | Raw body, SDK signature, mode check, transactional event deduplication and current-object reconciliation retained. Next after only accelerates durable outbox processing; schedule remains fallback. |
| `/api/owner/auth` | Same-origin POST/DELETE, throttled OTP, confirmed exact owner UUID, server getUser and secure HttpOnly cookie retained. Auth provider outage denies access. Provider administration MFA and owner mailbox MFA remain manual. |
| `/api/owner/settings` | Owner authorization, strict settings schema and transaction/audit retained. It cannot override deployment safety gate. |
| `/api/owner/orders/[id]` | Owner protected reads/mutations; private signed download; verified payment before delivery; explicit confirmation retained. Financial exceptions remain in Stripe linked from /owner. |
| `/api/owner/orders/[id]/recovery` | Owner-only object relinking, verified relationships, credit bounds and ambiguous email review retained. No replacement charges on uncertain outcomes. |
| `/api/owner/maintenance`, `/api/cron` | Owner/origin authorization or constant-time bearer authentication. Add durable overlap lease, bounded batches, success heartbeat, provider timeouts and preserve submitted unpaid orders. |
| `/api/health` (new) | Uncached Node response checks lazy server configuration, validated application settings and current DB schema; only boolean + 200/503 is exposed. Not a payment/provider readiness guarantee. |
| Database | Existing TLS verification and least-privilege dft_app retained. Two connections per instance, bounded statements/idle transactions, pool error code only. Serverless runtime uses transaction pooler; migration tool requires separate administrator and sanitizes errors. Migration 007 adds RLS-protected maintenance state. |
| Payments/invoices | Integer immutable snapshots, one invoice, stable idempotency keys, durable operations and verified charge ledger retained. Stripe stays test-only for implementation; Vercel live-key use explicitly blocked. Provider calls get finite timeout/no SDK automatic retry; application retries use persisted keys. |
| Resend | Durable outbox, persisted first attempt, idempotency/review window and safe logged codes retained. Failed/stale mail gates new intake. Quota/bounce visibility is provider/owner responsibility; send acceptance does not prove inbox delivery. |
| Environment/privacy | No NEXT_PUBLIC provider secrets. Lazy parse errors sanitized; build needs no credentials. Add ordering/banner flags and complete source/rotation inventory. Concurrent workspace correction to the contact mailbox was preserved; provider ownership/delivery still needs verification. |
| Client/owner | Server-rendered banner defaults visible; homepage fails closed. /owner shows deployment/readiness state and maintenance time; existing daily workflow remains reachable there. |
| Backups/docs | Previous paid-PITR/commercial-cron prerequisites replaced with Free export/restore procedure, failure recovery limits and provider ownership/MFA/billing/revocation register. |
| Tests | Extend database/workflow, maintenance, scheduler, health and browser safety coverage; hosted evidence remains separate in VALIDATION.md. |

Compatibility sources: [Netlify Next.js adapter](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/),
[function limits](https://docs.netlify.com/build/functions/configuration/),
[scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/),
[Supabase backups](https://supabase.com/docs/guides/platform/backups).
Installed Next documentation for route handlers, deployment, runtime environment
variables and maxDuration was read before code changes.

Remaining boundaries: no hosted Netlify adapter/package validation, actual schedule,
provider credentials, domain/payment activation or restore drill was performed.
Shared throttling is intentionally conservative for loorders@doneforteachers.com
cannot undo payment URLs already issued; recovery must reconcile them. Supabase
Free exports do not guarantee zero data loss after database destruction.

---

# Phase 2 repository audit

Audited 20 September 2026 before implementation. Existing local changes to README,
the homepage, styles, layout, and pricing module are preserved.

## Baseline

Next 16.3.5, React 19.2.8, TypeScript 5, Tailwind 4, App Router. One client
homepage, static pricing in dollars, no backend, database, authentication, payment,
email, deployment configuration, or tests. The form only sets local state and uses
`noValidate`; the old README overstates validation. Flat-price services also allow
stale duration selection. Marketing/design functionality is retained.

## Design

Vercel Node route handlers; Supabase Postgres via a small TLS connection pool;
Supabase Auth for owner email OTP and private Storage for PDF templates. Stripe
Checkout deposits and one hosted balance invoice per order; Resend email outbox.
Zod validates input. Integer cents throughout. PostgreSQL transactions and row
locks serialize financial operations; operation records guard provider retries
beyond provider idempotency windows. No customer accounts or custom payment UI.

The minimal owner screen adds instructions, fulfillment, settings, and secure
template access missing from Stripe's dashboard. Stripe remains the interface for
refunds, disputes, financial reports, and exceptional invoice corrections.
Delivery is manual email after verified full payment. PDF-only uploads reduce the
initial attack surface; adding Office formats requires additional validation.

## Decisions and release gates

Default draft policy: 50% deposit, odd cent rounded up, no minimum order. Owner
approval is required before accepting production orders. Prices, availability,
turnaround hours, deposit percentage, and pause switch live in database settings.
Policy changes affect new orders only. No automatic delivery.

Required owner accounts: Vercel, Supabase, Stripe, Resend, domain registrar/DNS,
and business mailbox. Owner authenticates and enters secrets in provider settings,
never source files or chat. Notification destination: orders@doneforteachers.com.
Sending identity must be verified on an owner-controlled domain.

Launch also requires approved terms/privacy, refund/revision/rush policies, tax
assessment, retention periods, verified founder claims, sender DNS, database/storage
backups, and a live-like test-mode acceptance run. No live deployment or DNS
changes are authorized by this task.

## Risks

Provider calls and SQL commits cannot share an atomic transaction. Persisted
operation keys, short retry windows, reconciliation, and a review queue handle
ambiguous outcomes. Webhooks retrieve current Stripe objects under order locks;
event payload arrival order is never used as payment truth. Email failures are
independent of payment commits. Owner must review ambiguous email sends after the
provider's idempotency window instead of risking duplicate mail.

Uploads are private and downloaded as attachments. Signature checks are not
malware scanning. No student records should be supplied. Production must assess
scanning requirements and retention with the owner. Database credentials and the
Supabase server key bypass public RLS and must stay server-only.

## Primary references

- Installed Next.js route, cookies, and authentication guides in node_modules/next/dist/docs.
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/api/idempotent_requests
- https://docs.stripe.com/api/invoices/create
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/storage/security/access-control
- https://resend.com/docs/dashboard/emails/idempotency-keys

Verification outcomes and remaining external checks are recorded in VALIDATION.md.
