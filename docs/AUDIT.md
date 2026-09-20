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
never source files or chat. Notification destination: doneforteachers@gmail.com.
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
