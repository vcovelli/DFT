import "server-only";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { type QueryResultRow } from "pg";
import {
  orderSchema,
  quote,
  settingsSchema,
  type Snapshot,
  type Fulfillment,
  type PaymentStatus,
} from "../domain";
import { db, transaction, type DB } from "./db";
import { assert } from "./http";
import { requireOrderingAvailable } from "./availability";
export interface Order extends QueryResultRow {
  id: string;
  reference: string;
  request_key: string;
  request_hash: string;
  customer_name: string;
  customer_email: string;
  details: ReturnType<typeof orderSchema.parse>;
  pricing: Snapshot;
  total: number;
  deposit: number;
  currency: string;
  stripe_customer_id: string | null;
  checkout_id: string | null;
  checkout_status: string;
  invoice_id: string | null;
  invoice_status: string | null;
  payment_status: PaymentStatus;
  fulfillment: Fulfillment;
  template_key: string | null;
  template_name: string | null;
  template_size: number | null;
  upload_token_hash: string;
  upload_expires_at: Date;
  created_at: Date;
  delivery_deadline: Date | null;
}
export const digest = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
export async function settings(client: DB = db) {
  return settingsSchema.parse(
    (await client.query("SELECT config FROM business_settings WHERE id=true"))
      .rows[0]?.config,
  );
}
export async function getOrder(id: string, client: DB = db, lock = false) {
  const order = (
    await client.query<Order>(
      `SELECT * FROM orders WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [id],
    )
  ).rows[0];
  assert(order, "Order not found", 404);
  return order;
}
export async function activity(
  tx: DB,
  id: string | null,
  actor: string,
  action: string,
  detail: object = {},
) {
  await tx.query(
    "INSERT INTO activity(order_id,actor,action,detail) VALUES($1,$2,$3,$4)",
    [id, actor, action, JSON.stringify(detail)],
  );
}
export function checkUploadAccess(order: Order, token: string | null) {
  const supplied = Buffer.from(digest(token || ""), "hex"),
    expected = Buffer.from(order.upload_token_hash, "hex");
  assert(
    expected.length === supplied.length && timingSafeEqual(expected, supplied),
    "Upload authorization required",
    403,
  );
  assert(
    new Date(order.upload_expires_at).getTime() > Date.now() &&
      !order.checkout_id &&
      order.fulfillment === "AWAITING_DEPOSIT",
    "Upload authorization expired",
    403,
  );
}
export async function createOrder(
  raw: unknown,
  key: string,
  client?: DB,
  accessToken?: string,
) {
  const input = orderSchema.parse(raw),
    hash = digest(JSON.stringify(input));
  const run = async (tx: DB) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const existing = (
      await tx.query<Order>("SELECT * FROM orders WHERE request_key=$1", [key])
    ).rows[0];
    if (existing) {
      assert(
        existing.request_hash === hash,
        "This request has changed. Start a new request.",
      );
      return { order: existing, token: accessToken ?? null };
    }
    await requireOrderingAvailable(tx);
    const config = await settings(tx);
    assert(
      !config.paused && config.policyApproved,
      "New orders are currently paused.",
      503,
    );
    const pricing = quote(input, config);
    assert(
      pricing.deposit < pricing.total,
      "Deposit policy cannot split this price.",
    );
    const id = randomUUID(),
      token = accessToken ?? randomBytes(32).toString("hex"),
      reference = `DFT-${randomBytes(6).toString("hex").toUpperCase()}`;
    const { rows } = await tx.query<Order>(
      `INSERT INTO orders(id,reference,request_key,request_hash,customer_name,customer_email,details,pricing,total,deposit,currency,upload_token_hash,upload_expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'usd',$11,now()+interval '1 hour') RETURNING *`,
      [
        id,
        reference,
        key,
        hash,
        input.name,
        input.email,
        JSON.stringify(input),
        JSON.stringify(pricing),
        pricing.total,
        pricing.deposit,
        digest(token),
      ],
    );
    await activity(tx, id, "customer", "order_created");
    return { order: rows[0], token };
  };
  return client ? run(client) : transaction(run);
}
