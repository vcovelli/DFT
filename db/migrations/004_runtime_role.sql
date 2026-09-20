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
