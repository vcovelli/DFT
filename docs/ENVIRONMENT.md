# Production environment inventory

No secret values belong in this document, source control, browser variables, build
logs, screenshots, tickets, or chat. Enter them directly from the business password
manager into the provider's environment UI. Never prefix any of these with
`NEXT_PUBLIC_` or put them in `next.config.ts`'s `env` field.

Netlify application variables need **Functions** scope. If the account UI does not
provide scope controls, use its available runtime scope and keep builds credential
free where possible. Set production-context values only; do not give production
credentials to Deploy Previews or branch builds. Native scheduled Functions must
receive APP_URL and CRON_SECRET too. Redeploy after configuration changes. Keep
Vercel staging values separate. Builds do not need application credentials.

| Name | Purpose / source | Rotation or change procedure |
| --- | --- | --- |
| DATABASE_URL | Supabase transaction pooler connection for a LOGIN member of dft_app; server secret | Pause; create replacement least-privilege login/password; update runtime and redeploy; verify health and owner access; revoke old login. Never use the administrator. |
| DATABASE_CA_CERT | Supabase trusted root certificate, when needed for TLS | Obtain replacement from Supabase; update and verify TLS before old trust expires. Never disable certificate verification. |
| SUPABASE_URL | Supabase project endpoint | Change only during coordinated restore/migration; update Auth and Storage together. |
| SUPABASE_SECRET_KEY | Supabase server Storage key | Create replacement, update Functions, verify private upload/download/cleanup, revoke old key. Never share with browser. |
| SUPABASE_ANON_KEY | Supabase publishable/anon Auth key, used only on server | Replace through Supabase, update runtime, test owner OTP, revoke predecessor where supported. |
| OWNER_USER_ID | Confirmed Supabase Auth owner UUID | Verify replacement owner identity; update, redeploy, test sign-in, revoke former user's sessions/access. |
| OWNER_LOGIN_EMAIL | Owner-controlled mailbox for Supabase OTP | Secure replacement mailbox with MFA, update Auth identity and runtime together, test recovery. |
| APP_URL | Canonical HTTPS origin supplied by Netlify site configuration (temporary netlify.app address initially) | Update only with authorized origin change; verify same-origin requests, scheduled caller and Stripe return/webhook URLs. No credentials/query/path. |
| STRIPE_SECRET_KEY | Stripe test-mode secret key during this task | Roll key in Stripe test dashboard; update, redeploy, verify signed event processing, revoke old key. No live key entry during implementation. |
| STRIPE_WEBHOOK_SECRET | Stripe signing secret specific to this environment's endpoint | Coordinate rollover with endpoint; this app accepts one active secret. Update/redeploy then replay failed events. Staging and Netlify use different endpoints/secrets. |
| RESEND_API_KEY | Resend restricted sending key | Create replacement for verified sender domain, update runtime, test queued delivery, revoke old key. SMTP credentials for Supabase Auth are configured separately in Supabase. |
| EMAIL_FROM | Verified Resend domain sender | Verify replacement sender, update, test owner/customer delivery. Do not use unverified Gmail. |
| CRON_SECRET | Independently generated password-manager random secret, minimum 32 characters | Update endpoint and scheduler runtime together, redeploy, run maintenance, verify heartbeat; revoke old value. Never put it in URLs. Vercel gets a separate staging value. |
| RATE_LIMIT_SECRET | Independent password-manager random secret, minimum 32 characters; also derives order access tokens | Pause intake; preserve old value securely until pending request retry windows are resolved. Rotation changes retry tokens; existing saved orders must be recovered through /owner. Rotate immediately on compromise and review pending requests. |
| ORDERING_ENABLED | Deployment safety switch, owner/support supplied | Default/missing is false. Keep false throughout deployment preparation. Later change requires explicit launch approval, provider acceptance, and owner settings approval. |
| SHOW_DEMO_BANNER | Server-rendered DEMO / STAGING notice | Default/missing is true. Keep true on both staging and Netlify acceptance site. Only hide after launch approval. No arbitrary environment text is rendered. |
| ALLOW_LIVE_PAYMENTS | Extra live-key guard | Default false; keep false. Vercel always rejects live keys even if this flag changes. Enabling production payments is a separate authorized task. |
| MIGRATION_DATABASE_URL | Supabase administrator/session connection, local migration tool only | Never put in hosting runtime. Rotate admin credential through Supabase and update the owner's local secret store. Tool refuses to fall back to runtime credentials. |
| NODE_VERSION | Netlify build configuration, Node 22 | Upgrade with dependency/adapter validation; no credential. |
| NODE_ENV | Framework-managed execution mode | Hosting sets production, including staging builds. Do not use it to distinguish business production from staging. |
| NETLIFY / VERCEL | Hosting-managed platform markers | Do not set manually or copy between hosts. Used for conservative rate-limit buckets and maintenance freshness. |

Backup tooling uses a private local PostgreSQL service/password file (PGSERVICEFILE
and PGPASSFILE can locate them) and encrypted backup destination. These are not
application runtime variables. Provider MFA recovery codes, registrar keys, Stripe
bank details and mailbox passwords stay in the business password manager, not this
repository. Record *who owns each credential and when it was rotated*, never its value.
