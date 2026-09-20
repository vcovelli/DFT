import { beforeAll, afterAll, it, expect } from "vitest";
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
  await pg.exec(readFileSync("db/migrations/001_orders.sql", "utf8"));
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
