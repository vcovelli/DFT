import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import type { DB } from "../lib/server/db";
const state = vi.hoisted(() => ({
  db: null as unknown as DB,
  api: null as unknown as Stripe,
}));
vi.mock("../lib/server/db", () => ({
  db: { query: (s: string, v?: unknown[]) => state.db.query(s, v) },
  transaction: async (fn: (tx: DB) => Promise<unknown>) => {
    await state.db.query("BEGIN");
    try {
      const result = await fn(state.db);
      await state.db.query("COMMIT");
      return result;
    } catch (e) {
      await state.db.query("ROLLBACK");
      throw e;
    }
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("../lib/server/env", () => ({
  env: () => ({ APP_URL: "https://example.test" }),
}));
vi.mock("../lib/server/providers", () => ({
  stripe: () => state.api,
  storage: () => ({
    storage: {
      getBucket: async () => ({ data: { public: false }, error: null }),
    },
  }),
}));
import { createOrder, getOrder, checkUploadAccess } from "../lib/server/orders";
import { processEvent, summary } from "../lib/server/payments";
import { checkout } from "../lib/server/checkout";
import { requestBalance } from "../lib/server/invoices";
import { attemptEmail } from "../lib/server/emails";
import { defaultSettings } from "../lib/domain";
import { authorizeOwner } from "../lib/server/auth";
import {
  GET as templateDownload,
  POST as adminAction,
} from "../app/api/owner/orders/[id]/route";
import { readBody } from "../lib/server/http";
const pg = new PGlite();
const input = {
  name: "Test Teacher",
  email: "teacher@example.com",
  subject: "Math",
  grade: "Grade 3–5",
  state: "Ohio",
  service: "lessonPlans",
  duration: "weekly",
  topic: "Fractions",
  instructions: "Visual examples please",
  rush: false,
  termsAccepted: true,
};
let id: string,
  token: string,
  received = false,
  refunded = 0,
  disputed = 0,
  invoicePaid = false,
  expired = false;
const iterable = (values: unknown[]) => ({
  async *[Symbol.asyncIterator]() {
    yield* values;
  },
});
function fakeApi() {
  const intent = (which: string) => ({
    id: which,
    customer: "cus_test",
    currency: "usd",
    amount: 500,
    amount_received: 500,
    status:
      which === "pi_deposit"
        ? received
          ? "succeeded"
          : "requires_payment_method"
        : invoicePaid
          ? "succeeded"
          : "requires_payment_method",
    metadata: which === "pi_deposit" ? { order_id: id, kind: "deposit" } : {},
  });
  const invoice = () => ({
    id: "in_test",
    metadata: { order_id: id },
    customer: "cus_test",
    currency: "usd",
    total: 500,
    status: invoicePaid ? "paid" : "open",
    hosted_invoice_url: "https://invoice.stripe.com/i/test",
  });
  return {
    customers: { create: vi.fn(async () => ({ id: "cus_test" })) },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({
          id: "cs_test",
          url: "https://checkout.stripe.com/test",
        })),
        retrieve: vi.fn(async () => ({
          id: "cs_test",
          url: "https://checkout.stripe.com/test",
          metadata: { order_id: id },
          client_reference_id: id,
          customer: "cus_test",
          amount_total: 500,
          currency: "usd",
          status: expired ? "expired" : received ? "complete" : "open",
          payment_intent: "pi_deposit",
        })),
      },
    },
    paymentIntents: { retrieve: vi.fn(async (which: string) => intent(which)) },
    charges: {
      list: vi.fn(({ payment_intent }: { payment_intent: string }) =>
        iterable([
          {
            id: payment_intent === "pi_deposit" ? "ch_deposit" : "ch_balance",
            paid: true,
            captured: true,
            customer: "cus_test",
            payment_intent,
            currency: "usd",
            amount_captured: 500,
            amount_refunded: payment_intent === "pi_deposit" ? refunded : 0,
            disputed: payment_intent === "pi_deposit" && disputed > 0,
          },
        ]),
      ),
      retrieve: vi.fn(async () => ({ payment_intent: "pi_deposit" })),
    },
    disputes: {
      list: vi.fn(() =>
        iterable([{ amount: disputed, status: "needs_response" }]),
      ),
    },
    invoices: {
      retrieve: vi.fn(async () => invoice()),
      create: vi.fn(async () => ({ id: "in_test" })),
      finalizeInvoice: vi.fn(async () => invoice()),
    },
    invoiceItems: { create: vi.fn(async () => ({ id: "ii_test" })) },
    invoicePayments: {
      list: vi.fn(() =>
        iterable(
          invoicePaid
            ? [
                {
                  invoice: "in_test",
                  currency: "usd",
                  amount_paid: 500,
                  payment: { payment_intent: "pi_balance" },
                },
              ]
            : [],
        ),
      ),
    },
  } as unknown as Stripe;
}
function event(
  type = "checkout.session.completed",
  eventId = `evt_${randomUUID()}`,
) {
  return {
    id: eventId,
    type,
    livemode: false,
    data: {
      object: {
        id: "cs_test",
        object: "checkout.session",
        metadata: { order_id: id },
      },
    },
  } as unknown as Stripe.Event;
}
beforeAll(async () => {
  process.env.ORDERING_ENABLED = "true";
  state.db = {
    query: async (s, v) => {
      const r = await pg.query(s, v);
      return { rows: r.rows as never[], rowCount: r.affectedRows ?? null };
    },
  };
  await pg.exec(readFileSync("db/migrations/001_orders.sql", "utf8"));
  await pg.exec(
    "CREATE TABLE maintenance_state(id boolean PRIMARY KEY, last_success_at timestamptz, last_failure_at timestamptz); INSERT INTO maintenance_state VALUES(true, now(), null)",
  );
  await pg.exec(readFileSync("db/migrations/003_adjustments.sql", "utf8"));
  await pg.exec(
    readFileSync("db/migrations/005_email_supersession.sql", "utf8"),
  );
  await state.db.query("UPDATE business_settings SET config=$1", [
    JSON.stringify({ ...defaultSettings, paused: false, policyApproved: true }),
  ]);
});
beforeEach(async () => {
  await state.db.query("TRUNCATE orders CASCADE");
  received = false;
  refunded = 0;
  disputed = 0;
  invoicePaid = false;
  expired = false;
  const created = await createOrder(input, randomUUID());
  id = created.order.id;
  token = created.token!;
  await state.db.query(
    "UPDATE orders SET stripe_customer_id='cus_test',checkout_id='cs_test' WHERE id=$1",
    [id],
  );
  state.api = fakeApi();
});
afterAll(() => pg.close());
it("deduplicates Stripe events and confirmation emails durably", async () => {
  received = true;
  const e = event();
  await processEvent(e);
  await processEvent(e);
  expect(
    (await state.db.query("SELECT * FROM stripe_events WHERE id=$1", [e.id]))
      .rows,
  ).toHaveLength(1);
  expect(
    (await state.db.query("SELECT * FROM payments WHERE order_id=$1", [id]))
      .rows,
  ).toHaveLength(1);
  expect(
    (await state.db.query("SELECT * FROM email_outbox WHERE order_id=$1", [id]))
      .rows,
  ).toHaveLength(2);
  expect((await getOrder(id)).fulfillment).toBe("NEW");
});
it("does not downgrade payment for late failures or expired payloads", async () => {
  received = true;
  await processEvent(event());
  await processEvent(event("payment_intent.payment_failed"));
  await processEvent(event("checkout.session.expired"));
  expect((await getOrder(id)).payment_status).toBe("DEPOSIT_PAID");
  expect(
    (
      await state.db.query(
        "SELECT * FROM email_outbox WHERE order_id=$1 AND kind='failed'",
        [id],
      )
    ).rows,
  ).toHaveLength(0);
});
it("does not credit failed or expired payments", async () => {
  expired = true;
  await processEvent(event("checkout.session.expired"));
  expect((await getOrder(id)).payment_status).toBe("UNPAID");
  expect((await getOrder(id)).fulfillment).toBe("AWAITING_DEPOSIT");
});
it("records refunds and dispute holds from current Stripe state", async () => {
  received = true;
  await processEvent(event());
  refunded = 100;
  await processEvent(event("charge.refunded"));
  expect((await summary(state.db, await getOrder(id))).outstanding).toBe(600);
  refunded = 0;
  disputed = 500;
  await processEvent(event("charge.dispute.created"));
  expect((await getOrder(id)).payment_status).toBe("DISPUTED");
  disputed = 0;
  await processEvent(event("charge.dispute.closed"));
  expect((await getOrder(id)).payment_status).toBe("DEPOSIT_PAID");
});
it("never credits a Stripe session from a different customer", async () => {
  received = true;
  vi.mocked(state.api.checkout.sessions.retrieve).mockResolvedValueOnce({
    metadata: { order_id: id },
    client_reference_id: id,
    customer: "cus_wrong",
    amount_total: 500,
    currency: "usd",
  } as never);
  const e = event();
  await expect(processEvent(e)).rejects.toThrow("relationship");
  expect(
    (await state.db.query("SELECT * FROM stripe_events WHERE id=$1", [e.id]))
      .rows,
  ).toHaveLength(0);
  expect((await getOrder(id)).payment_status).toBe("UNPAID");
});
it("reuses one balance invoice and verifies actual final charges", async () => {
  received = true;
  await processEvent(event());
  await state.db.query(
    "UPDATE orders SET fulfillment='READY_FOR_BALANCE' WHERE id=$1",
    [id],
  );
  await requestBalance(id, "owner");
  await requestBalance(id, "owner");
  expect(state.api.invoices.create).toHaveBeenCalledTimes(1);
  expect(state.api.invoiceItems.create).toHaveBeenCalledTimes(1);
  invoicePaid = true;
  await processEvent(event("invoice.paid"));
  expect((await getOrder(id)).payment_status).toBe("PAID_IN_FULL");
  expect((await summary(state.db, await getOrder(id))).outstanding).toBe(0);
});
it("a manually marked paid invoice without a charge never grants full payment", async () => {
  received = true;
  await processEvent(event());
  await state.db.query("UPDATE orders SET invoice_id='in_test' WHERE id=$1", [
    id,
  ]);
  await processEvent(event("invoice.paid"));
  expect((await getOrder(id)).payment_status).toBe("DEPOSIT_PAID");
});
it("blocks stale ambiguous invoice retries instead of recreating a charge", async () => {
  received = true;
  await processEvent(event());
  await state.db.query(
    "UPDATE orders SET fulfillment='READY_FOR_BALANCE' WHERE id=$1",
    [id],
  );
  await state.db.query(
    "INSERT INTO operations(key,order_id,created_at) VALUES($1,$2,now()-interval '2 days')",
    [`invoice:${id}`, id],
  );
  await expect(requestBalance(id, "owner")).rejects.toThrow("owner review");
  expect(state.api.invoices.create).not.toHaveBeenCalled();
});
it("email failure does not roll back payment and retries do not duplicate accepted mail", async () => {
  received = true;
  await processEvent(event());
  const mailId = `${id}:deposit`;
  await state.db.query(
    "UPDATE email_outbox SET first_attempt_at=now() WHERE id=$1",
    [mailId],
  );
  await attemptEmail(state.db, mailId, async () => {
    throw new Error("timeout");
  });
  expect((await getOrder(id)).payment_status).toBe("DEPOSIT_PAID");
  const sender = vi.fn(async () => "email_test");
  await attemptEmail(state.db, mailId, sender);
  await attemptEmail(state.db, mailId, sender);
  expect(sender).toHaveBeenCalledTimes(1);
  expect(
    (
      await state.db.query("SELECT attempts FROM email_outbox WHERE id=$1", [
        mailId,
      ])
    ).rows[0].attempts,
  ).toBe(2);
});
it("quarantines ambiguous mail past the provider idempotency window", async () => {
  received = true;
  await processEvent(event());
  const mailId = `${id}:deposit`;
  await state.db.query(
    "UPDATE email_outbox SET first_attempt_at=now()-interval '2 days' WHERE id=$1",
    [mailId],
  );
  const sender = vi.fn(async () => "email_test");
  await attemptEmail(state.db, mailId, sender);
  expect(sender).not.toHaveBeenCalled();
  expect(
    (
      await state.db.query(
        "SELECT review_required FROM email_outbox WHERE id=$1",
        [mailId],
      )
    ).rows[0].review_required,
  ).toBe(true);
});
it("requires the verified owner identity", () => {
  expect(() => authorizeOwner(null, "owner")).toThrow();
  expect(() =>
    authorizeOwner({ id: "other", email_confirmed_at: "now" }, "owner"),
  ).toThrow();
  expect(() => authorizeOwner({ id: "owner" }, "owner")).toThrow();
  expect(
    authorizeOwner({ id: "owner", email_confirmed_at: "now" }, "owner").id,
  ).toBe("owner");
});
it("rejects unauthorized file access and uploads after checkout", async () => {
  const order = await getOrder(id);
  expect(() => checkUploadAccess(order, "wrong")).toThrow("authorization");
  expect(() => checkUploadAccess(order, token)).toThrow("expired");
  order.checkout_id = null;
  expect(() => checkUploadAccess(order, token)).not.toThrow();
  order.upload_expires_at = new Date(0);
  expect(() => checkUploadAccess(order, token)).toThrow("expired");
});
it("enforces body size while streaming even without content-length", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: "x".repeat(100),
  });
  await expect(readBody(request, 10)).rejects.toThrow("too large");
});
it("verifies Stripe signatures against exact raw bytes and rejects tampering", () => {
  const api = new Stripe("sk_test_fixture");
  const payload = JSON.stringify(event());
  const secret = "whsec_fixture";
  const signature = api.webhooks.generateTestHeaderString({ payload, secret });
  expect(api.webhooks.constructEvent(payload, signature, secret).id).toBe(
    JSON.parse(payload).id,
  );
  expect(() =>
    api.webhooks.constructEvent(payload + " ", signature, secret),
  ).toThrow();
  expect(() =>
    api.webhooks.constructEvent(payload, signature, "whsec_wrong"),
  ).toThrow();
});

it("denies unauthorized owner API actions and private downloads", async () => {
  const ctx = { params: Promise.resolve({ id }) };
  const download = await templateDownload(
    new Request("https://example.test/api/owner/orders/" + id),
    ctx,
  );
  expect(download.status).toBe(401);
  const action = await adminAction(
    new Request("https://example.test/api/owner/orders/" + id, {
      method: "POST",
      headers: { origin: "https://example.test" },
      body: JSON.stringify({ action: "invoice", confirmed: true }),
    }),
    ctx,
  );
  expect(action.status).toBe(401);
  expect(state.api.invoices.create).not.toHaveBeenCalled();
});
it("calculates outstanding balances using audited credits without changing the snapshot", async () => {
  received = true;
  await processEvent(event());
  await state.db.query(
    "INSERT INTO order_adjustments(id,order_id,credit_cents,reason,actor) VALUES($1,$2,100,$3,$4)",
    [randomUUID(), id, "Owner approved discount", "owner"],
  );
  const order = await getOrder(id);
  expect(order.total).toBe(1000);
  expect((await summary(state.db, order)).outstanding).toBe(400);
});
it("does not send an obsolete queued deposit failure after payment succeeds", async () => {
  await processEvent(event("payment_intent.payment_failed"));
  received = true;
  await processEvent(event());
  const sender = vi.fn(async () => "email_test");
  await attemptEmail(state.db, `${id}:failed:deposit`, sender);
  expect(sender).not.toHaveBeenCalled();
});

it("retries Checkout with one customer and one deposit session", async () => {
  await state.db.query(
    "UPDATE orders SET checkout_id=null,stripe_customer_id=null WHERE id=$1",
    [id],
  );
  const first = await checkout(id, token);
  const second = await checkout(id, token);
  expect(first).toBe(second);
  expect(state.api.customers.create).toHaveBeenCalledTimes(1);
  expect(state.api.checkout.sessions.create).toHaveBeenCalledTimes(1);
  const request = vi.mocked(state.api.checkout.sessions.create).mock
    .calls[0][0];
  expect(request?.line_items?.[0].price_data?.unit_amount).toBe(500);
});
it("rejects an unauthorized Checkout request before creating provider objects", async () => {
  await state.db.query(
    "UPDATE orders SET checkout_id=null,stripe_customer_id=null WHERE id=$1",
    [id],
  );
  await expect(checkout(id, "wrong")).rejects.toThrow("authorization");
  expect(state.api.customers.create).not.toHaveBeenCalled();
});

it("a later owner pause blocks checkout while retaining the submitted order", async () => {
  await state.db.query(
    "UPDATE business_settings SET config=jsonb_set(config,'{paused}','true'::jsonb)",
  );
  try {
    await expect(checkout(id, token)).rejects.toThrow("paused");
    expect(state.api.checkout.sessions.create).not.toHaveBeenCalled();
    expect((await getOrder(id)).customer_email).toBe(input.email);
  } finally {
    await state.db.query(
      "UPDATE business_settings SET config=jsonb_set(config,'{paused}','false'::jsonb)",
    );
  }
});
it("failed notification blocks another checkout without changing payments or orders", async () => {
  await state.db.query(
    "INSERT INTO email_outbox(id,order_id,kind,recipient,subject,body,last_error) VALUES($1,$2,'deposit','teacher@example.com','test','test','provider_error')",
    [randomUUID(), id],
  );
  await expect(checkout(id, token)).rejects.toThrow("temporarily unavailable");
  expect(state.api.checkout.sessions.create).not.toHaveBeenCalled();
  expect((await getOrder(id)).customer_email).toBe(input.email);
});
