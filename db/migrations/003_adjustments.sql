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
