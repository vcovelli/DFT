# Supabase Free backup and restore

Free projects need their own off-site exports. Supabase recommends regular CLI
exports for Free; database backups do not contain Storage file bytes. See the
[Supabase backup guide](https://supabase.com/docs/guides/platform/backups).
This procedure requires an owner-controlled encrypted computer/destination and a
technical operator. It is not an automatic backup guarantee or PITR.

## Recovery target and schedule

For low volume, propose a daily export on every day with order/payment changes,
and one before every migration/release. Target at most 24 hours of database loss
and one business day to recover; the owner must accept these limits before launch.
Copy new active templates after receipt. Keep seven daily and four weekly encrypted
sets, unless the approved retention policy requires another schedule. Track last
successful export and restore drill in the private business operations register.
If nobody can perform this schedule, keep ordering paused or fund managed backup.

## Export (no secrets in shell commands)

1. Pause new orders in `/owner`. Choose a quiet window; export is a consistent
   database snapshot, but payment webhooks and storage are separate systems. Record
   UTC start/end times for later Stripe reconciliation. Avoid migrations during it.
2. A technical operator installs a PostgreSQL client matching or newer than the
   hosted server's major version. Configure a **local** `dft_backup` PostgreSQL
   service in a permission-0600 service/password file, using the Supabase direct
   connection or session pooler, TLS `verify-full`, and the provider CA. Use the
   owner's administrator/backup access; never put a password in command arguments,
   history, source, or the service name. Do not use a transaction pooler for dump.
3. On an encrypted volume outside the repository, create a new dated private
   directory, enter it, and run:

   ```sh
   umask 077
   pg_dump --dbname=service=dft_backup --schema=public --exclude-table=public.schema_migrations --format=custom --no-owner --no-acl --file=application.dump
   psql service=dft_backup -X --csv --command='SELECT id,template_key,template_name,template_size,template_sha256 FROM public.orders WHERE template_key IS NOT NULL ORDER BY id' > templates.csv
   pg_restore --list application.dump > contents.txt
   sha256sum application.dump templates.csv > SHA256SUMS
   ```

   Check exit status of **each** command; a failed or partial dump is not a backup.
   The SQL output is private order metadata, saved directly to the encrypted file.
   Avoid verbose provider logs. This exports all public application schema/data,
   including orders, payments, outbox, operation guards and audit history, but not
   Supabase Auth identities, service keys or role passwords. Protect the order
   token hashes in the dump as private recovery data. Record the source commit,
   migration filenames, project label, UTC snapshot window and counts privately.
4. Use the owner's Supabase Storage dashboard to download each linked `templates`
   object listed in `templates.csv`. Preserve the exact `template_key` directory
   path, size and SHA-256 in the encrypted set. For low volume this is a manual
   per-file operation. Never make the bucket public. Also keep delivered materials
   from the business mailbox; they are not stored in this application.
5. Re-run the template manifest query into a second private file. If linked keys
   changed, export a fresh set or reconcile additions/removals and document the
   window. Do not call a set complete with missing active templates. Expired
   terminal templates intentionally removed by retention need not be recreated.
6. Copy the complete set to a second owner-controlled encrypted destination. Verify
   checksums there and a sample PDF. Store encryption recovery keys separately in
   the owner password manager. Confirm success before deleting any partial export.
   Never upload plaintext dumps or templates to Git, tickets, or chat.

## Isolated restore drill

Perform quarterly and before handoff; never practice on production or overwrite
Vercel staging. Use a fresh Supabase project under the owner's control with no
webhooks, scheduler or application traffic. No live keys; ordering stays disabled.

1. Apply the source commit's migrations to the fresh project with the local
   migration administrator. They recreate tables, private bucket, RLS and dft_app.
   Configure a separate local `dft_restore` PostgreSQL service for this project.
2. Verify the destination is empty apart from seeded settings and maintenance.
   On **that disposable destination only**, delete those two seed rows:

   ```sh
   psql service=dft_restore -X --set=ON_ERROR_STOP=1 --command='DELETE FROM public.business_settings; DELETE FROM public.maintenance_state;'
   pg_restore --dbname=service=dft_restore --data-only --no-owner --no-acl --exit-on-error application.dump
   psql service=dft_restore -X --set=ON_ERROR_STOP=1 --command="UPDATE public.business_settings SET config=jsonb_set(config,'{paused}','true'::jsonb); UPDATE public.maintenance_state SET last_success_at=null,last_failure_at=null,lease_until=null,lease_token=null;"
   ```

   Stop on any error; do not retry into a partially restored database. Start with
   another clean disposable destination. Do not restore provider-owned auth or
   storage metadata using SQL; migrations own schema, Storage API owns objects.
3. Upload the saved bytes to the private `templates` bucket at exactly the manifest
   paths, through Supabase Storage. Compare file sizes/hashes, order counts,
   integer totals, payments, outbox statuses, operation guards and audit records.
   Check runtime role grants and denial for anon/ordinary authenticated users.
4. Recreate/invite the verified owner in Supabase Auth; the UUID may change. Configure
   the new OWNER_USER_ID, SMTP and keys directly in isolated provider settings.
   Verify `/owner` sign-in and a private download. Keep maintenance disabled by
   leaving the isolated host unpublished; do not send restored outbox messages.
5. Record achieved recovery point, elapsed restoration time, missing files, sample
   checks and operator in the private register. A dump without a tested restore is
   incomplete readiness evidence.

For actual disaster recovery, use OPERATIONS.md: reconcile Stripe activity since
snapshot start, compare Resend acceptance before retrying old mail, and retain
original idempotency guards. Orders submitted after a lost database snapshot may
require reconstruction from Stripe/customer evidence; Free exports cannot promise
zero loss after database destruction. Ordinary hosting/provider outages preserve
committed database records and do not trigger database restoration.
