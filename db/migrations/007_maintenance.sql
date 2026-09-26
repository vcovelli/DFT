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
