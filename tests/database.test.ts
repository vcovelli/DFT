import { beforeAll, afterAll, it, expect, afterEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createOrder } from "../lib/server/orders";
import type { DB } from "../lib/server/db";
import { defaultSettings } from "../lib/domain";
const pg = new PGlite();
const db: DB = {
  query: async (text, values) => {
    const result = await pg.query(text, values);
    return {
      rows: result.rows as never[],
      rowCount: result.affectedRows ?? null,
    };
  },
};
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
beforeAll(async () => {
  process.env.ORDERING_ENABLED = "true";
  await pg.exec(readFileSync("db/migrations/001_orders.sql", "utf8"));
  await pg.exec(
    "CREATE TABLE maintenance_state(id boolean PRIMARY KEY, last_success_at timestamptz, last_failure_at timestamptz); INSERT INTO maintenance_state VALUES(true, now(), null)",
  );
  await pg.exec(readFileSync("db/migrations/003_adjustments.sql", "utf8"));
  await pg.exec(
    readFileSync("db/migrations/005_email_supersession.sql", "utf8"),
  );
  await db.query("UPDATE business_settings SET config=$1", [
    JSON.stringify({ ...defaultSettings, paused: false, policyApproved: true }),
  ]);
});
afterAll(() => pg.close());
it("creates a persistent pending order and returns the same order on retry", async () => {
  const key = randomUUID();
  const first = await createOrder(input, key, db);
  const second = await createOrder(input, key, db);
  expect(first.order.id).toBe(second.order.id);
  expect(first.order.fulfillment).toBe("AWAITING_DEPOSIT");
  expect(
    (await db.query("SELECT * FROM orders WHERE request_key=$1", [key])).rows,
  ).toHaveLength(1);
  await expect(
    createOrder({ ...input, topic: "Other topic" }, key, db),
  ).rejects.toThrow("changed");
});
it("enforces immutable price snapshots in the database", async () => {
  const { order } = await createOrder(input, randomUUID(), db);
  await expect(
    db.query("UPDATE orders SET total=1 WHERE id=$1", [order.id]),
  ).rejects.toThrow("immutable");
});
it("enables RLS on every business table without public policies", async () => {
  const { rows } = await db.query(
    "SELECT relname FROM pg_class WHERE relname IN ('orders','payments','email_outbox','business_settings') AND relrowsecurity=true",
  );
  expect(rows).toHaveLength(4);
  expect((await db.query("SELECT * FROM pg_policies")).rows).toHaveLength(0);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await db.query("UPDATE maintenance_state SET last_success_at=now()");
});
it("default deployment pause preserves an acknowledged request on retry", async () => {
  const key = randomUUID();
  const first = await createOrder(input, key, db);
  vi.stubEnv("ORDERING_ENABLED", "false");
  await expect(createOrder(input, randomUUID(), db)).rejects.toThrow("paused");
  expect((await createOrder(input, key, db)).order.id).toBe(first.order.id);
});
it("stale maintenance fails closed without deleting existing orders", async () => {
  await db.query(
    "UPDATE maintenance_state SET last_success_at=now()-interval '2 days'",
  );
  await expect(createOrder(input, randomUUID(), db)).rejects.toThrow(
    "temporarily unavailable",
  );
  expect((await db.query("SELECT id FROM orders")).rows.length).toBeGreaterThan(
    0,
  );
});
