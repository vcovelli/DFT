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
| Cron failure | Run maintenance in owner screen; inspect Vercel job results | Restore schedule and secret; verify backlog decreases |
| Ambiguous invoice/Checkout | Do not create replacement charges | Reconnect exact Stripe object using owner screen |
| Refund/dispute after delivery | Retain delivery history, review Stripe | Refresh financial state; resolve through Stripe and contact customer |

Logs contain stable error codes, route shapes, and internal IDs, not customer text,
email addresses, raw provider payloads, or secrets. Inspect provider request/event
IDs in the protected dashboards. Alert the owner on Vercel errors, Stripe failed
webhooks, and Resend delivery problems. No custom telemetry or personal server is
required. The app does not implement external-provider monitoring itself.

## Backups and restoration

Before launch, owner selects an acceptable recovery-point and recovery-time target
and a Supabase backup/PITR plan. Check actual plan retention and restore behavior in
the provider dashboard. **Database backups do not include Storage object bytes.**

1. Enable managed database backups/PITR and verify a successful backup. Keep an
   additional encrypted export when making migrations or major releases.
2. Keep an owner-controlled copy of templates needed for active work and delivered
   materials in the business's encrypted backup destination. Use Supabase's Storage
   dashboard for a small volume, or an owner-owned scheduled storage backup service
   as volume grows. This application does not implement offsite object replication;
   provision and test it before accepting files if manual copies cannot meet the
   approved recovery target. Never use public buckets or a developer drive.
3. Quarterly and before handoff, restore a database backup to an isolated staging
   project. Restore private objects at the same bucket paths from the file backup.
   Verify RLS, least-privilege credentials, order counts, totals, payments, email
   records, and sample template downloads. Record the date, backup point, time to
   restore, and owner who performed the drill.
4. For production recovery, pause ordering and email processing first. Restore DB
   and files, point business-owned Vercel secrets at the restored project, then
   reconnect/replay Stripe events since the backup point. Refresh every affected
   order before fulfilling it. Use provider idempotency/review guards for events
   whose email records may have been lost. Do not blindly replay outgoing mail
   from an old database backup; compare against Resend first.
5. Restore owner Auth identity or update `OWNER_USER_ID` to the new confirmed owner
   UUID, rotate access secrets, check webhook destinations, verify private downloads,
   run a test-mode order on staging, and reopen only with owner authorization.

## Data deletion and security incidents

The automatic job removes unlinked objects older than seven days, confirms and
anonymizes abandoned unpaid orders after seven days, and removes retained templates
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

Use the owner Vercel dashboard to promote the last verified deployment. Pause orders
first if schema/API compatibility is uncertain. Additive schema migrations support
code rollback; do not drop paid order tables or revert data to make old code work.
Restore from backup only as a coordinated incident recovery, then reconcile Stripe
and email activity after the backup time. Keep older signing secrets during an
intentional provider rollover only where documented and tested; this app accepts
one configured Stripe webhook secret per environment.
