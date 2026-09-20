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
