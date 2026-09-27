-- DFT Supabase SQL Editor setup. Run only in the new dft-production project.
-- Generated from db/migrations; no passwords or provider keys belong in this file.
-- Applies missing migrations atomically and records them for npm run db:migrate.
-- Safe to rerun after a successful setup; existing order settings are not reset.
BEGIN;
SET LOCAL search_path = public;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(723984);
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schema_migrations FROM PUBLIC, anon, authenticated;

-- 001_orders.sql
DO $dft_apply_001$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '001_orders.sql') THEN
    EXECUTE $dft_migration_001$
CREATE TABLE business_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), config jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO business_settings(config) VALUES ('{"paused":true,"policyApproved":false,"depositPercent":50,"turnaroundHours":48,"rushHours":24,"turnaroundMessage":"Materials are prepared within 24–48 hours after deposit and details are approved. Delivery follows final payment.","available":["lessonPlans","doNows","exitTickets","doNowExitTicket","completeUnit","assessment"],"rushAvailable":true,"prices":{"lessonPlans":{"daily":250,"weekly":1000,"monthly":3500},"doNows":{"daily":200,"weekly":500,"monthly":2000},"exitTickets":{"daily":200,"weekly":500,"monthly":2000},"doNowExitTicket":{"daily":300,"weekly":700,"monthly":3500},"completeUnit":7500,"assessment":700,"rush":1000}}');
CREATE TABLE orders (
  id uuid PRIMARY KEY, reference text NOT NULL UNIQUE,
  request_key uuid NOT NULL UNIQUE, request_hash text NOT NULL,
  customer_name text NOT NULL, customer_email text NOT NULL, details jsonb NOT NULL,
  pricing jsonb NOT NULL, total integer NOT NULL CHECK(total>0),
  deposit integer NOT NULL CHECK(deposit>0 AND deposit<total), currency text NOT NULL CHECK(currency='usd'),
  stripe_customer_id text UNIQUE, checkout_id text UNIQUE, checkout_status text NOT NULL DEFAULT 'pending',
  invoice_id text UNIQUE, invoice_status text,
  payment_status text NOT NULL DEFAULT 'UNPAID' CHECK(payment_status IN ('UNPAID','DEPOSIT_PAID','PAID_IN_FULL','PARTIALLY_REFUNDED','REFUNDED','DISPUTED')),
  fulfillment text NOT NULL DEFAULT 'AWAITING_DEPOSIT' CHECK(fulfillment IN ('AWAITING_DEPOSIT','NEW','IN_PROGRESS','READY_FOR_BALANCE','DELIVERED','CANCELLED')),
  template_key text UNIQUE, template_name text, template_size integer CHECK(template_size BETWEEN 12 AND 3145728),
  upload_token_hash text NOT NULL, upload_expires_at timestamptz NOT NULL,
  delivery_deadline timestamptz, delivered_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payments (
  stripe_charge_id text PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id),
  stripe_payment_intent_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('deposit','balance')),
  received integer NOT NULL CHECK(received>=0), refunded integer NOT NULL CHECK(refunded BETWEEN 0 AND received),
  disputed integer NOT NULL CHECK(disputed>=0 AND disputed+refunded<=received),
  currency text NOT NULL CHECK(currency='usd'), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments(order_id);
CREATE TABLE stripe_events (id text PRIMARY KEY, type text NOT NULL, processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE operations (
  key text PRIMARY KEY, order_id uuid REFERENCES orders(id), created_at timestamptz NOT NULL DEFAULT now(),
  result jsonb, review_required boolean NOT NULL DEFAULT false
);
CREATE TABLE activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_id uuid REFERENCES orders(id),
  actor text NOT NULL, action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE email_outbox (
  id text PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), kind text NOT NULL, recipient text NOT NULL,
  subject text NOT NULL, body text NOT NULL, attempts integer NOT NULL DEFAULT 0,
  provider_id text, first_attempt_at timestamptz, sent_at timestamptz, review_required boolean NOT NULL DEFAULT false,
  last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rate_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE FUNCTION protect_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.pricing IS DISTINCT FROM OLD.pricing OR NEW.total<>OLD.total OR NEW.deposit<>OLD.deposit OR NEW.currency<>OLD.currency OR NEW.request_hash<>OLD.request_hash THEN
    RAISE EXCEPTION 'Order pricing and request snapshot is immutable';
  END IF;
  NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER immutable_order BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION protect_order_snapshot();
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No public/authenticated policies: only the trusted server DB role may access these tables.
$dft_migration_001$;
    INSERT INTO public.schema_migrations(name) VALUES ('001_orders.sql');
  END IF;
END
$dft_apply_001$;

-- 002_private_storage.sql
DO $dft_apply_002$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '002_private_storage.sql') THEN
    EXECUTE $dft_migration_002$
-- Supabase only. Core schema can also be tested in standalone PostgreSQL.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('templates','templates',false,3145728,ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=3145728,allowed_mime_types=ARRAY['application/pdf'];
REVOKE ALL ON business_settings,orders,payments,stripe_events,operations,activity,email_outbox,rate_limits FROM anon,authenticated;
$dft_migration_002$;
    INSERT INTO public.schema_migrations(name) VALUES ('002_private_storage.sql');
  END IF;
END
$dft_apply_002$;

-- 003_adjustments.sql
DO $dft_apply_003$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '003_adjustments.sql') THEN
    EXECUTE $dft_migration_003$
CREATE TABLE order_adjustments (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), credit_cents integer NOT NULL CHECK(credit_cents>0),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 300), actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE order_adjustments ENABLE ROW LEVEL SECURITY;
-- Revoke public roles when they exist (also allows isolated PostgreSQL-engine tests).
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON order_adjustments FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON order_adjustments FROM authenticated; END IF;
END $$;
$dft_migration_003$;
    INSERT INTO public.schema_migrations(name) VALUES ('003_adjustments.sql');
  END IF;
END
$dft_apply_003$;

-- 004_runtime_role.sql
DO $dft_apply_004$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '004_runtime_role.sql') THEN
    EXECUTE $dft_migration_004$
-- Dedicated application group. Create a login member using the owner's secret manager
-- during deployment. Never use the database owner as the application connection.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='dft_app') THEN CREATE ROLE dft_app NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public,storage TO dft_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON business_settings,orders,payments,stripe_events,operations,activity,email_outbox,rate_limits,order_adjustments TO dft_app;
GRANT USAGE,SELECT ON SEQUENCE activity_id_seq TO dft_app;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['business_settings','orders','payments','stripe_events','operations','activity','email_outbox','rate_limits','order_adjustments'] LOOP
  EXECUTE format('CREATE POLICY server_access ON %I TO dft_app USING (true) WITH CHECK (true)',tab);
 END LOOP;
END $$;
GRANT SELECT ON storage.objects TO dft_app;
CREATE POLICY dft_app_storage_inspect ON storage.objects FOR SELECT TO dft_app USING(bucket_id='templates');
$dft_migration_004$;
    INSERT INTO public.schema_migrations(name) VALUES ('004_runtime_role.sql');
  END IF;
END
$dft_apply_004$;

-- 005_email_supersession.sql
DO $dft_apply_005$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '005_email_supersession.sql') THEN
    EXECUTE $dft_migration_005$
ALTER TABLE email_outbox ADD COLUMN suppressed_at timestamptz;
$dft_migration_005$;
    INSERT INTO public.schema_migrations(name) VALUES ('005_email_supersession.sql');
  END IF;
END
$dft_apply_005$;

-- 006_template_hash.sql
DO $dft_apply_006$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '006_template_hash.sql') THEN
    EXECUTE $dft_migration_006$
ALTER TABLE orders ADD COLUMN template_sha256 text;
$dft_migration_006$;
    INSERT INTO public.schema_migrations(name) VALUES ('006_template_hash.sql');
  END IF;
END
$dft_apply_006$;

-- 007_maintenance.sql
DO $dft_apply_007$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '007_maintenance.sql') THEN
    EXECUTE $dft_migration_007$
CREATE TABLE maintenance_state (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 lease_until timestamptz,
 lease_token uuid,
 last_failure_at timestamptz,
 last_success_at timestamptz
);
INSERT INTO maintenance_state(id) VALUES(true);
ALTER TABLE maintenance_state ENABLE ROW LEVEL SECURITY;
GRANT SELECT,UPDATE ON maintenance_state TO dft_app;
CREATE POLICY server_access ON maintenance_state TO dft_app USING(true) WITH CHECK(true);
$dft_migration_007$;
    INSERT INTO public.schema_migrations(name) VALUES ('007_maintenance.sql');
  END IF;
END
$dft_apply_007$;

COMMIT;

-- Expected for a fresh project: migrations_applied=7, ordering_paused=true,
-- policies_approved=false, templates_private=true.
SELECT
  (SELECT count(*) FROM public.schema_migrations) AS migrations_applied,
  (SELECT (config->>'paused')::boolean FROM public.business_settings WHERE id=true) AS ordering_paused,
  (SELECT (config->>'policyApproved')::boolean FROM public.business_settings WHERE id=true) AS policies_approved,
  (SELECT NOT public FROM storage.buckets WHERE id='templates') AS templates_private;
