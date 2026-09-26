# Reliability, recovery, privacy, and rollback

## Transaction boundaries

- Order creation has a UUID request key, validated payload hash, transaction lock,
  unique constraint, and immutable pricing trigger. The browser retains only a
  request fingerprint/key in session storage; it does not persist customer fields.
- Order rows are locked while current Stripe objects are read and payment records
  reconciled. Charge IDs are globally unique. Duplicate event IDs commit in the
  same SQL transaction as reconciliation. Failed processing returns non-2xx so
  Stripe retries; API outages do not consume events permanently.
- Checkout/invoice operation keys commit **before** provider calls. Provider calls
  use stable idempotency keys. Interrupted operations stop automatic retries after
  20 hours, before the providers' typical 24-hour key retention boundary.
- A SQL rollback cannot roll back a provider action. Owner recovery reconnects
  verified external objects. Never clear operation guards just to make a retry work.
- Email intent commits with the payment; sending happens afterward. The first-send
  timestamp commits before the request. Idempotent retries stop after 20 hours and
  require owner review. Provider acceptance IDs are kept. No email body contains
  customer instructions, storage URLs, templates, payment credentials, or API keys.
- Email rows include customer address and order summary and are private business
  data. Do not include them in public issue reports.

## Outages

| Incident | Owner action | Recovery |
| --- | --- | --- |
| Database unavailable | Pause through provider/hosting if dashboard is unavailable; contact provider | Restore connection, retry same order request; Stripe retries events |
| Stripe unavailable | Pause new orders; do not manually assume payment | Restore provider, refresh affected orders/replay failed Stripe events |
| Storage unavailable | Tell customer to retry same upload; pause if prolonged | Retry same request; seven-day orphan cleanup removes interrupted uploads |
| Resend failure/bounce | Check Resend domain, quota, suppression and delivery events | Correct settings; retry safe outbox; manually review older ambiguous sends |
| Cron failure | Run maintenance in owner screen; inspect the Netlify scheduled function result (Vercel for staging) | Restore schedule and secret; verify backlog decreases |
| Ambiguous invoice/Checkout | Do not create replacement charges | Reconnect exact Stripe object using owner screen |
| Refund/dispute after delivery | Retain delivery history, review Stripe | Refresh financial state; resolve through Stripe and contact customer |

Logs contain stable error codes, route shapes, and internal IDs, not customer text,
email addresses, raw provider payloads, or secrets. Inspect provider request/event
IDs in the protected dashboards. Alert the owner on hosting errors, Stripe failed
webhooks, and Resend delivery problems. No custom telemetry or personal server is
required. The app does not implement external-provider monitoring itself.

## Backups and restoration

Use [BACKUP.md](BACKUP.md) for the Supabase Free daily encrypted export, separate
Storage byte copy and isolated restore drill. Managed PITR is not assumed.
Ordinary provider outages do not call for restoring an old database.

If restoration is necessary, keep ORDERING_ENABLED=false, pause business settings,
and prevent restored outbox processing by leaving the recovery host unpublished
and disconnected from schedules/webhooks until reconciliation is planned. Restore
into an isolated owner-owned project, verify counts/files/grants, then coordinate
cutover of Netlify's server settings. Never point Vercel staging at customer data.
Reconcile Stripe events/payments since the backup's *start* time; compare Resend
acceptance IDs before releasing old mail. Do not reset operation keys. Recreate
owner Auth and update its verified UUID if necessary. Test recovery while paused.
Only explicit owner authorization can reopen production.

## Fail-closed behavior and Free exhaustion

- ORDERING_ENABLED defaults false; the owner DB pause and policy approval are
  additional checks. New orders require a fresh successful maintenance heartbeat
  (two hours, or 26 hours for Vercel's daily staging schedule). An observed
  maintenance failure blocks ordering immediately until a later successful run.
- Failed/review-required unsent emails, or unsent mail older than 15 minutes, block
  new intake and checkout. Database failures deny writes. Checkout checks the pause
  controls and private bucket before contacting Stripe. Provider errors cannot
  generate a successful checkout response. Maintenance probes Stripe and Storage.
- No provider health request can predict an imminent quota limit or guarantee email
  delivery. Resend failures are detected on actual durable sends; a payment already
  in flight can finish before that failure is observed. Its order and outbox remain
  saved. Owner monitors bounces/suppression and provider quota notices; there is no
  universal real-time quota API. Supabase Auth failure denies owner access.
- An order is acknowledged only after its database transaction commits. A database
  failure before commit is an unsuccessful submission, not a saved order. Retry the
  same form/request key. Never announce success or accept payment without a saved
  order. Unknown commit outcomes resolve through the same idempotency key.
- Saved unpaid requests are no longer automatically anonymized after seven days.
  They and their linked files survive long outages for owner review. Existing
  request-key retries return the saved record even when new intake is paused.
- Netlify exhaustion can stop the entire site, cron and webhooks. It does not erase
  Supabase orders or Stripe payments. Previously opened Stripe payment pages can
  still collect money; app pause does not invalidate already-issued payment URLs.
  During prolonged incidents use Stripe to expire open sessions/void unpaid invoices
  when appropriate. Never infer payment status from the return page.
- When hosting returns, leave ordering paused. Review all orders spanning the outage
  using `/owner` and Refresh payment status. Reconnect any interrupted Stripe object,
  replay missed events where available, review Resend acceptance, then retry mail.
  [Stripe retries](https://docs.stripe.com/webhooks#automatic-retries) are finite: for a long outage use current Stripe objects and ledger
  reconciliation, not an assumption that every event will still be delivered.
- If Supabase storage/database allowances approach capacity, stop intake before the
  limit. Export records; remove only files covered by approved retention, or obtain
  approval to upgrade. Never delete submitted orders to free space.

Maintenance is single-run leased and restartable: one queued email, one expired
terminal-order template, up to ten unlinked files, rate-limit cleanup and stale
operation marking per run. Under low volume, webhook/owner `after` callbacks also
attempt mail. An accepted email is not inbox delivery. Repeated failures, stale
heartbeat or growing backlog require `/owner` recovery and provider diagnosis;
never bypass the gate by manually setting a heartbeat. A killed invocation's lease
expires after two minutes. Completed work remains durable for the next run.

## Data deletion and security incidents

The automatic job removes unlinked objects older than seven days, retains submitted unpaid orders for review, and removes retained templates
90 days after delivery/cancellation. It preserves ambiguous provider operations
and paid financial records. Cleanup is bounded per run; monitor backlog and job
failures. Uploads and deletion run through Storage APIs, never by deleting storage
metadata directly.

Before launch, owner approves a paid-order record retention schedule appropriate to
accounting obligations and customer privacy requests. It is **not silently invented
by this code**. A privacy deletion request requires identity verification and a
review of financial-record obligations. Authorized support can anonymize customer
name/email/details and purge related email content/files while preserving required
transaction IDs, integer totals, audit history, and immutable snapshots. Backups
must age out under the same documented policy. The request hash is irreversible but
retained for idempotency. Stripe/Resend/mailbox records have their own deletion and
retention controls; handle those in the owner's provider accounts too.

PDF header/trailer, size, extension, and MIME checks are not a parser or malware
scanner. PDFs can contain active content or exploits. No files are rendered inline
or executed by this app. Assess managed malware scanning before launch according to
the owner's risk decision; require it if serving a broader/untrusted audience. The
PDF-only limit is deliberate. Office-file support needs a separate security review.
No student records should be collected. Legal review of privacy/terms, tax,
revisions/refunds, retention, and founder statements is a launch gate. No FERPA,
PCI certification, or other compliance claim is made.

For suspected compromise, pause orders, revoke affected keys and Auth sessions,
preserve audit evidence, rotate credentials in owner accounts, evaluate affected
records with qualified support, and follow the applicable notification process.

## Rollback

Use the owner Netlify dashboard to restore the last verified production deployment;
use Vercel rollback only for staging. Pause orders
first if schema/API compatibility is uncertain. Additive schema migrations support
code rollback; do not drop paid order tables or revert data to make old code work.
Restore from backup only as a coordinated incident recovery, then reconcile Stripe
and email activity after the backup time. Keep older signing secrets during an
intentional provider rollover only where documented and tested; this app accepts
one configured Stripe webhook secret per environment.
