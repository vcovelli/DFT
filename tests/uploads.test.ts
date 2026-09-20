import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { DB } from "../lib/server/db";
const state = vi.hoisted(() => ({
  db: null as unknown as DB,
  upload: vi.fn(),
  remove: vi.fn(),
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
  stripe: () => ({}),
  storage: () => ({
    storage: {
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
import { defaultSettings } from "../lib/domain";
const pg = new PGlite();
let id: string, token: string;
const pdf = Buffer.from("%PDF-1.4\nexample\n%%EOF");
beforeAll(async () => {
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
  await state.db.query("UPDATE business_settings SET config=$1", [
    JSON.stringify({ ...defaultSettings, paused: false, policyApproved: true }),
  ]);
});
beforeEach(async () => {
  await state.db.query("TRUNCATE orders CASCADE");
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
it("cleans confirmed abandoned unpaid templates and anonymizes their instructions", async () => {
  await uploadTemplate(id, token, "lesson.pdf", "application/pdf", pdf);
  await state.db.query(
    "UPDATE orders SET created_at=now()-interval '8 days' WHERE id=$1",
    [id],
  );
  await maintenance();
  const order = await getOrder(id);
  expect(order.fulfillment).toBe("CANCELLED");
  expect(order.template_key).toBeNull();
  expect(order.details).toEqual({});
  expect(order.customer_email).toBe("deleted@example.invalid");
  expect(state.remove).toHaveBeenCalledTimes(1);
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
