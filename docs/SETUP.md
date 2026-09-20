# Deployment setup (business-owner accounts only)

**Ordering ships paused, policies unapproved, and live Stripe keys blocked. Nothing
has been deployed or connected to a production account by this implementation.**

## Account register

| Service | Required owner | Purpose / access |
| --- | --- | --- |
| Vercel team and billing | DFT business owner | Hosting, environment, logs, managed cron |
| Supabase organization and project | DFT business owner | Postgres, private files, owner Auth |
| Stripe account and bank account | DFT business owner | Deposits, invoices, refunds, disputes |
| Resend organization and billing | DFT business owner | Transactional email and delivery diagnostics |
| doneforteachers.com registrar / DNS | DFT business owner | Domain, HTTPS, sender verification |
| doneforteachers@gmail.com | DFT business owner | Order notifications and customer replies |
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

| Variable | Meaning |
| --- | --- |
| DATABASE_URL | Supabase pooled Postgres URL for the dedicated runtime login |
| MIGRATION_DATABASE_URL | Migration administrator URL; local setup only, omit from Vercel runtime |
| DATABASE_CA_CERT | Supabase CA certificate if required; literal `\n` is accepted |
| SUPABASE_URL | Owner's project URL |
| SUPABASE_SECRET_KEY | Server secret/service key for Storage; never public |
| SUPABASE_ANON_KEY | Auth publishable/anon key, used server-side |
| OWNER_USER_ID | Exact UUID of the invited, confirmed owner in Supabase Auth |
| OWNER_LOGIN_EMAIL | Owner's email for one-time sign-in codes |
| APP_URL | Exact canonical origin, HTTPS in production, no trailing slash |
| STRIPE_SECRET_KEY | `sk_test_…` during acceptance testing |
| STRIPE_WEBHOOK_SECRET | Secret for this environment's webhook destination |
| RESEND_API_KEY | Owner's restricted sending key |
| EMAIL_FROM | Verified domain email address (not a Gmail sender) |
| CRON_SECRET | Random secret, at least 32 characters, for managed maintenance |
| RATE_LIMIT_SECRET | Independent random secret, at least 32 characters; do not casually rotate during active checkouts |
| ALLOW_LIVE_PAYMENTS | `false` for staging; only `true` after explicit production approval |

Environment validation is lazy so builds need no credentials. Runtime services
fail closed. An unconfigured homepage remains available with ordering paused.

## Supabase database and storage

1. Owner creates separate staging and production projects in an appropriate
   region. Enable backups/PITR on a plan that meets the business recovery target.
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
   out of Vercel. Verify the runtime login can read settings and write an order,
   but cannot read `auth.users` or alter tables. Supabase pooler username formatting
   varies; use the project's connection instructions for custom database roles.
5. Confirm Storage `templates` is private, maximum 3 MB, PDF MIME only. Do not add
   public read/write policies or make this bucket public. Service-key operations
   are confined to server modules. Downloads are signed for 60 seconds and forced
   as attachments. Never copy those links into notification emails.
6. Core SQL migrations 001, 003, 005, and 006 are exercised by PGlite tests. The Supabase-specific
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
3. Open `/owner/login`, request a code, and verify it. Every protected read/write
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
notifications use doneforteachers@gmail.com. Sending as unverified Gmail is blocked.
The app stores provider acceptance IDs and failed attempts. It does not claim
inbox delivery or implement Resend bounce webhooks: owner monitors bounce and
suppression events in Resend and contacts customers when needed.

## Vercel and release gates

Import the business-owned repository into the business-owned team. Use Node 22,
`npm ci`, `npm run build`, and Next.js preset. Add server secrets for each environment
separately. Staging uses Stripe test mode and separate database/storage resources.
Never share production data with preview deployments. Connect the production domain
only with explicit owner authorization. Enforce one canonical `APP_URL` origin.

`vercel.json` schedules `/api/cron` every ten minutes. This needs a Vercel plan that
supports that frequency for commercial use; owner approves plan cost. Vercel sends
`Authorization: Bearer CRON_SECRET`. Confirm the schedule actually runs. Webhooks
also attempt email delivery using Next's managed `after` callback. Durable queue
retries and retention cleanup do not depend on a developer machine. The owner can
run maintenance from the dashboard if the schedule is interrupted.

Run all local checks and the acceptance checklist. Review terms, privacy, tax,
refunds, revisions, rush timing, founder claims, and retention. Approve the deposit
split (draft 50%, odd cent rounded up), backup recovery target, and manual delivery.
Then obtain explicit authorization to deploy production and enable live Stripe.
Only after that set production keys/secret, `ALLOW_LIVE_PAYMENTS=true`, approve
policies in owner settings, and unpause. The config checkbox is not a substitute
for completing account setup and staging verification.
