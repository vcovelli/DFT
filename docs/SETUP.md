# Deployment setup (business-owner accounts only)

**Ordering ships paused, policies unapproved, and live Stripe keys blocked. Nothing
has been deployed or connected to a production account by this implementation.**

## Account register

| Service | Required owner | Purpose / access |
| --- | --- | --- |
| Netlify Free account | DFT business owner | Production candidate hosting, functions, schedule and quota notices |
| Vercel team and billing | DFT business owner | Existing staging only; leave deployment connection and daily cron intact |
| Supabase organization and project | DFT business owner | Postgres, private files, owner Auth |
| Stripe account and bank account | DFT business owner | Deposits, invoices, refunds, disputes |
| Resend organization and billing | DFT business owner | Transactional email and delivery diagnostics |
| doneforteachers.com registrar / DNS | DFT business owner | Domain, HTTPS, sender verification |
| orders@doneforteachers.com | DFT business owner | Order notifications and customer replies |
| Source repository / deployment connection | DFT business owner or business organization | Source, releases, rollback |
| Backup destination | DFT business owner | Encrypted database and storage recovery copies |

Owner creates accounts, accepts provider terms, enables MFA, supplies billing and
bank details directly to providers, and invites temporary collaborators. The
owner's Supabase sign-in email may differ from the fixed notification destination.
No developer email, bank account, server, or personal subscription is needed.

## Local installation

Use Node 22 and `npm ci`. Copy `.env.example` to ignored `.env.local` and enter
**test** credentials using a password manager. All example entries are names only.
Do not paste secrets into source, issues, support tickets, or chat.

Use [ENVIRONMENT.md](ENVIRONMENT.md) for the complete production inventory, scopes,
providers and rotation instructions. Keep ORDERING_ENABLED=false,
SHOW_DEMO_BANNER=true and ALLOW_LIVE_PAYMENTS=false. No live keys are needed.

Environment validation is lazy so builds need no credentials. Runtime services
fail closed. An unconfigured homepage remains available with ordering paused.

## Supabase database and storage

1. Owner creates separate staging and production projects in an appropriate
   region. Use [BACKUP.md](BACKUP.md) for Supabase Free exports and restore drills;
   paid managed backups/PITR are optional future upgrades, not Free features.
2. Set `MIGRATION_DATABASE_URL` to the migration administrator connection. Run
   `npm run db:migrate`. The runner records applied files and applies each once
   inside a transaction with a migration lock. Never edit an applied migration;
   add a new numbered migration. In hosted setup use TLS and `NODE_ENV=production`.
3. Migrations create the order tables, constraints, RLS, private `templates` bucket,
   and `dft_app` NOLOGIN group with only application table access and read-only
   storage-object inspection. Public and ordinary authenticated users have no
   access to these records. No customer-facing database API is used.
4. Through the owner's database administration session, create a dedicated LOGIN
   role with a generated password and membership in `dft_app`. It must have no
   superuser, database creation, role creation, replication, or BYPASSRLS powers.
   Place its pooled connection URL in `DATABASE_URL`. Keep the administrator URL
   out of both hosting runtimes. Use the Supabase **transaction pooler** runtime
   endpoint for serverless connections (normally port 6543; confirm in Connect).
   No named prepared statements or session-level locks are used at runtime. The
   application pool is capped at two connections per instance, with verified TLS
   and timeouts; autoscaling still multiplies pools. Transaction limits use SET
   LOCAL, not session startup parameters that may be incompatible with pooling. Migrations use a direct or
   session connection. Verify the runtime login can read settings and write an order,
   but cannot read `auth.users` or alter tables. Supabase pooler username formatting
   varies; use the project's connection instructions for custom database roles.
5. Confirm Storage `templates` is private, maximum 3 MB, PDF MIME only. Do not add
   public read/write policies or make this bucket public. Service-key operations
   are confined to server modules. Downloads are signed for 60 seconds and forced
   as attachments. Never copy those links into notification emails.
6. All seven migrations are exercised by PGlite with a minimal Supabase fixture. The Supabase-specific
   bucket and role/policy migrations 002 and 004 also run against a minimal local
   Supabase-schema fixture. They still require staging execution and RLS checks
   before launch; local tests do not prove hosted Supabase configuration.

## Owner authentication

1. Disable public sign-ups in Supabase Auth. Invite/create only the business owner.
   Confirm their mailbox and record the exact user UUID in `OWNER_USER_ID`.
2. Configure the owner-controlled Auth SMTP sender (Resend can supply this too).
   Configure the **Magic Link** email template to display `{{ .Token }}` as a
   one-time code; the app uses email OTP, not a callback link. Configure the site
   URL, provider OTP expiration, send-rate limits, and authentication logs.
3. Open `/owner`, request a code, and verify it. Every protected read/write
   calls Supabase `getUser` and checks the confirmed UUID. Session cookies are
   HttpOnly, Secure in production, SameSite Strict, and last at most one hour.
   Sign-out removes the local cookie. Supabase account/session revocation is the
   emergency control for a stolen token. Secure the mailbox with MFA.
4. Test a different authenticated user, no cookie, expired cookie, and a cross-origin
   POST: all must be denied. No hidden URL or client role is trusted.

## Stripe (test first)

Use the owner's account in test mode. Install/login to Stripe CLI on a development
machine if needed. Forward webhook events to `/api/stripe/webhook` and set its
local signing secret. Deployed staging needs its own HTTPS destination and secret.

Subscribe to these snapshot events using the API version supported by the installed
Stripe SDK (currently SDK 22.6.2, API `2026-08-26.dahlia`; record the deployed version in the launch record):

- `checkout.session.completed`, `checkout.session.expired`,
  `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
- `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`
- `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`,
  `invoice.finalized`, `invoice.updated`, `invoice.voided`, `invoice.marked_uncollectible`
- `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`,
  `charge.dispute.closed`, `refund.created`, `refund.updated`, `refund.failed`

Only card payments are offered initially. Checkout collects the configured deposit,
without an application-invented minimum order, automatic tax, coupons, or shipping.
Stripe may impose currency/payment minimums; validate every approved price and
percentage against the actual account before enabling it. Owner must resolve tax
obligations and approve the price presentation before launch. This implementation
is not a tax calculation service.

Invoices use `send_invoice` collection and a Stripe-hosted payment page. Automatic
advance is disabled; DFT sends the balance request through Resend. Stripe is not
asked to send a second invoice email. Disable overlapping account automations if
they create unwanted reminders. Finalize only the specific invoice items; pending
customer items are excluded. Do not edit application invoice amounts, use customer
credit balances, attach a payment to multiple invoices, or mark invoices paid out
of band. Such cases need reconciliation rather than inferred cash credit.

## Resend and sender DNS (owner authorization required)

Owner verifies a sending domain/subdomain, such as `mail.doneforteachers.com`, in
Resend. Add only the exact DNS records provided by Resend after explicit permission
from the domain owner. Review SPF/DKIM/DMARC and test delivery to real owner-controlled
mailboxes. `EMAIL_FROM` is the verified domain identity; reply-to and owner
notifications use orders@doneforteachers.com. Sending as unverified Gmail is blocked.
The app stores provider acceptance IDs and failed attempts. It does not claim
inbox delivery or implement Resend bounce webhooks: owner monitors bounce and
suppression events in Resend and contacts customers when needed.

## Netlify Free production candidate (Next.js 16)

The repository keeps Next 16.3.5 / Node 22. `netlify.toml` sets `npm run build`
and `.next` as publish directory. Netlify automatically installs its current
OpenNext adapter for modern Next.js. Do not use the legacy v4 runtime, static
export, `out`, or an SPA catch-all redirect. There is no Vercel-specific database,
filesystem, or Edge dependency. Runtime routes remain Node handlers. Netlify
supports App Router routes, streaming and Next `after`:
[adapter documentation](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

Local code preparation does not create a provider deployment. The assisted setup
must stop at each provider action or secret entry and present exactly one action
at a time; this is the reference procedure, not a request to enter every secret now.

1. Owner uses their Netlify Free account and imports this repository, leaving the
   existing Vercel integration connected. Use a dedicated production branch/site
   configuration and a temporary `netlify.app` URL. No custom domain attachment.
2. Verify Node 22, the committed build settings and auto-detected Next.js adapter.
   Keep production application credentials out of preview/branch contexts. An
   initial build can succeed without credentials and shows paused ordering/banner.
3. Enter each required runtime variable directly in Netlify, following the inventory
   one at a time. Use a separate production-candidate Supabase project, test Stripe
   credentials and a separate webhook endpoint; never repoint Vercel staging.
4. Apply all seven migrations with the local administrator tool before runtime
   checks. Migration 007 adds a private maintenance lease/heartbeat table. Neither
   deployment runs migrations automatically. Then verify `/api/health` returns
   HTTP 200 and exactly `{"ok":true}`; unconfigured/failed DB returns 503 with false.
   It checks configuration, parsed application settings and the current schema,
   not all external providers or permission to open ordering.
5. Verify the native `maintenance` function has its Scheduled badge. It runs every
   ten minutes (UTC minutes 7,17,27,37,47,57) on the published Netlify deployment;
   previews do not schedule automatically. Run it once from Netlify and verify
   the completion timestamp in `/owner`. It POSTs to `/api/cron` using a bearer
   header, rejects redirects and times out at 25 seconds. No URL contains a secret.
6. Complete the hosted test-mode checks in HANDOFF.md. Keep the safety switch false,
   banner visible and live payments disabled until a *separate* acceptance/launch
   authorization. Controlled test ordering also needs explicit owner authorization
   to temporarily open the test environment; this task leaves it closed.

Netlify scheduled functions have a 30-second limit, ordinary functions 60 seconds,
and binary request payloads effectively 4.5 MB. The 3 MB PDF cap is retained.
Maintenance uses small batches, a 20-second soft work budget, five-second provider
requests and a two-minute durable lease. A slow database can still cause a timeout;
work remains retryable and stale heartbeat blocks new intake. `maxDuration` is not
a promise to extend the platform limit. Validate a maximum-size PDF, raw signed
webhook body and actual cron duration on Netlify before launch.
[function limits](https://docs.netlify.com/build/functions/configuration/),
[scheduling](https://docs.netlify.com/build/functions/scheduled-functions/).

Netlify/non-Vercel request throttling deliberately uses a shared database bucket,
ignoring spoofable forwarded headers. This conservatively permits 15 new request
attempts/hour, 30 checkout attempts/hour, 30 upload attempts/hour and 10 owner OTP
attempts/hour across the site. Existing Vercel trusted-header behavior is retained.
This is suitable only for low volume; shared-IP throttling is an availability
tradeoff and must be revisited before increasing traffic. Rate limiting cannot
prevent all hosting-credit exhaustion because rejected requests still invoke code.

## Preserve Vercel staging

Leave `vercel.json` unchanged: it schedules GET `/api/cron` **daily at 12:00 UTC**.
The previous guide's ten-minute description was incorrect. Retain the Vercel site,
its environment settings and staging Supabase/Stripe endpoint. Vercel supplies
`Authorization: Bearer CRON_SECRET`; do not reuse the production candidate secret.
Set/retain the default safety flags (paused, banner on, live payments off). The app
also rejects live Stripe keys whenever the Vercel platform marker is present.
The staging heartbeat permits 26 hours for this daily schedule; other hosts permit
two hours. Owner maintenance is available from `/owner` on either platform.

## Free-tier operational limits and release gates

Check the actual account's current allowance rather than assuming legacy quotas.
Netlify credit-based Free currently supplies 300 monthly credits; production builds,
requests, compute and bandwidth draw on the allowance. Exhaustion pauses all sites
on that team, including owner tools and webhooks. Free cannot buy extra credits;
wait for reset or obtain approval for a paid upgrade. Avoid repeated production
builds and minute-by-minute health polling. Use hourly health checks if configured,
provider quota emails and daily owner review. No guaranteed uptime is implied.
[credit policy](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/),
[paused-site recovery](https://docs.netlify.com/manage/accounts-and-billing/billing/resume-paused-projects/).

Review the owner's policies, notification mailbox, sender/OTP delivery, Stripe
verification, backup restore evidence and test-mode acceptance before any launch.
The contact address is `orders@doneforteachers.com`; verify owner control and
delivery before sending production messages. No production domain connection, live key,
live payment activation or production unpause is authorized by this preparation.
