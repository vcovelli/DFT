-- Supabase only. Core schema can also be tested in standalone PostgreSQL.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('templates','templates',false,3145728,ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=3145728,allowed_mime_types=ARRAY['application/pdf'];
REVOKE ALL ON business_settings,orders,payments,stripe_events,operations,activity,email_outbox,rate_limits FROM anon,authenticated;
