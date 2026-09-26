import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { DB } from "../lib/server/db";
const state = vi.hoisted(() => ({
  db: null as unknown as DB,
  upload: vi.fn(),
  remove: vi.fn(),
  bucket: vi.fn(),
  balance: vi.fn(),
}));
vi.mock("../lib/server/db", () => ({
  db: { query: (s: string, v?: unknown[]) => state.db.query(s, v) },
  transaction: async (fn: (tx: DB) => Promise<unknown>) => {
    await state.db.query("BEGIN");
    try {
      const r = await fn(state.db);
      await state.db.query("COMMIT");
      return r;
    } catch (e) {
      await state.db.query("ROLLBACK");
      throw e;
    }
  },
}));
vi.mock("../lib/server/providers", () => ({
  stripe: () => ({ balance: { retrieve: state.balance } }),
  storage: () => ({
    storage: {
      getBucket: state.bucket,
      from: (bucket: string) => {
        expect(bucket).toBe("templates");
        return { upload: state.upload, remove: state.remove };
      },
    },
  }),
}));
import { createOrder, getOrder } from "../lib/server/orders";
import { uploadTemplate } from "../lib/server/files";
import { maintenance } from "../lib/server/maintenance";
import { requireOrderingAvailable } from "../lib/server/availability";
import { defaultSettings } from "../lib/domain";
const pg = new PGlite();
let id: string, token: string;
const pdf = Buffer.from("%PDF-1.4\nexample\n%%EOF");
beforeAll(async () => {
  process.env.ORDERING_ENABLED = "true";
  state.db = {
    query: async (s, v) => {
      const r = await pg.query(s, v);
      return { rows: r.rows as never[], rowCount: r.affectedRows ?? null };
    },
  };
  for (const name of [
    "001_orders",
    "003_adjustments",
    "005_email_supersession",
    "006_template_hash",
  ])
    await pg.exec(readFileSync(`db/migrations/${name}.sql`, "utf8"));
  await pg.exec(
    "CREATE SCHEMA storage;CREATE TABLE storage.objects(name text,bucket_id text,created_at timestamptz)",
  );
  await pg.exec("CREATE ROLE dft_app NOLOGIN");
  await pg.exec(readFileSync("db/migrations/007_maintenance.sql", "utf8"));
  await state.db.query("UPDATE business_settings SET config=$1", [
    JSON.stringify({ ...defaultSettings, paused: false, policyApproved: true }),
  ]);
});
beforeEach(async () => {
  await state.db.query("TRUNCATE orders CASCADE");
  await state.db.query(
    "UPDATE maintenance_state SET lease_until=null,lease_token=null,last_failure_at=null,last_success_at=now()",
  );
  state.bucket
    .mockReset()
    .mockResolvedValue({ data: { public: false }, error: null });
  state.balance.mockReset().mockResolvedValue({});
  state.upload.mockReset().mockResolvedValue({ error: null });
  state.remove.mockReset().mockResolvedValue({ error: null });
  const created = await createOrder(
    {
      name: "Test Teacher",
      email: "teacher@example.com",
      subject: "Math",
      grade: "Grade 3–5",
      state: "Ohio",
      service: "lessonPlans",
      duration: "weekly",
      topic: "Fractions",
      instructions: "Use visual examples",
      rush: false,
      termsAccepted: true,
    },
    randomUUID(),
  );
  id = created.order.id;
  token = created.token!;
});
afterAll(() => pg.close());
it("stores one private template with an unpredictable scoped name and safe retries", async () => {
  await uploadTemplate(id, token, "lesson.pdf", "application/pdf", pdf);
  await uploadTemplate(id, token, "lesson.pdf", "application/pdf", pdf);
  expect(state.upload).toHaveBeenCalledTimes(1);
  const order = await getOrder(id);
  expect(order.template_key).toMatch(new RegExp(`^${id}/[0-9a-f-]{36}\\.pdf$`));
  expect(order.template_sha256).toHaveLength(64);
  expect(state.upload.mock.calls[0][2]).toEqual({
    contentType: "application/pdf",
    upsert: false,
  });
  await expect(
    uploadTemplate(
      id,
      token,
      "other.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.4\ndifferent\n%%EOF"),
    ),
  ).rejects.toThrow("only one");
});
it("rejects unauthorized and invalid uploads without touching storage", async () => {
  await expect(
    uploadTemplate(id, "wrong", "lesson.pdf", "application/pdf", pdf),
  ).rejects.toThrow("authorization");
  await expect(
    uploadTemplate(id, token, "../lesson.pdf", "application/pdf", pdf),
  ).rejects.toThrow("valid PDF");
  expect(state.upload).not.toHaveBeenCalled();
});
it("storage failures leave the order retryable", async () => {
  state.upload.mockResolvedValueOnce({ error: { message: "unavailable" } });
  await expect(
    uploadTemplate(id, token, "lesson.pdf", "application/pdf", pdf),
  ).rejects.toThrow("Storage upload failed");
  expect((await getOrder(id)).template_key).toBeNull();
  await uploadTemplate(id, token, "lesson.pdf", "application/pdf", pdf);
  expect((await getOrder(id)).template_key).not.toBeNull();
});
it("preserves submitted unpaid orders and files across prolonged outages", async () => {
  await uploadTemplate(id, token, "lesson.pdf", "application/pdf", pdf);
  await state.db.query(
    "UPDATE orders SET created_at=now()-interval '8 days' WHERE id=$1",
    [id],
  );
  await maintenance();
  const order = await getOrder(id);
  expect(order.fulfillment).toBe("AWAITING_DEPOSIT");
  expect(order.template_key).not.toBeNull();
  expect(order.details.instructions).toBe("Use visual examples");
  expect(order.customer_email).toBe("teacher@example.com");
  expect(state.remove).not.toHaveBeenCalled();
});
it("retains ambiguous interrupted checkouts during cleanup", async () => {
  await uploadTemplate(id, token, "lesson.pdf", "application/pdf", pdf);
  await state.db.query(
    "UPDATE orders SET created_at=now()-interval '8 days' WHERE id=$1",
    [id],
  );
  await state.db.query("INSERT INTO operations(key,order_id) VALUES($1,$2)", [
    `checkout:${id}`,
    id,
  ]);
  await maintenance();
  expect((await getOrder(id)).template_key).not.toBeNull();
  expect(state.remove).not.toHaveBeenCalled();
});

it("skips overlapping maintenance and does not falsely renew its heartbeat", async () => {
  await state.db.query(
    "UPDATE maintenance_state SET lease_until=now()+interval '1 minute',last_success_at=null",
  );
  await maintenance();
  expect(state.balance).not.toHaveBeenCalled();
  expect(
    (await state.db.query("SELECT last_success_at FROM maintenance_state"))
      .rows[0].last_success_at,
  ).toBeNull();
});
it("provider failure releases the lease without renewing maintenance freshness", async () => {
  const previous = (
    await state.db.query("SELECT last_success_at FROM maintenance_state")
  ).rows[0].last_success_at;
  state.balance.mockRejectedValueOnce(new Error("provider failure"));
  await expect(maintenance()).rejects.toThrow();
  const row = (await state.db.query("SELECT * FROM maintenance_state")).rows[0];
  expect(row.last_success_at).toEqual(previous);
  await expect(requireOrderingAvailable()).rejects.toThrow(
    "temporarily unavailable",
  );
  expect(row.lease_until).toBeNull();
  expect(row.last_failure_at).not.toBeNull();
  expect((await getOrder(id)).customer_email).toBe("teacher@example.com");
});
it("retention deletes only terminal-order files and retains the order", async () => {
  await uploadTemplate(id, token, "lesson.pdf", "application/pdf", pdf);
  await state.db.query(
    "UPDATE orders SET fulfillment='DELIVERED',delivered_at=now()-interval '91 days' WHERE id=$1",
    [id],
  );
  await maintenance();
  expect((await getOrder(id)).template_key).toBeNull();
  expect((await getOrder(id)).fulfillment).toBe("DELIVERED");
  expect(state.remove).toHaveBeenCalledTimes(1);
});
