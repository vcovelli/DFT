import "server-only";
import { timingSafeEqual } from "node:crypto";
import { transaction } from "./db";
import { getOrder, digest, activity } from "./orders";
import { guardOperation, prepareOperation } from "./operations";
import { assert } from "./http";
import { env } from "./env";
import { stripe } from "./providers";
export async function checkout(id: string, token: string) {
  // Authorization must precede operation creation, including on retries.
  const initial = await getOrder(id);
  assert(
    timingSafeEqual(
      Buffer.from(digest(token), "hex"),
      Buffer.from(initial.upload_token_hash, "hex"),
    ),
    "Order authorization required",
    403,
  );
  await prepareOperation(`checkout:${id}`, id);
  return transaction(async (tx) => {
    const order = await getOrder(id, tx, true),
      api = stripe();
    assert(
      order.fulfillment === "AWAITING_DEPOSIT",
      "This order is already paid or closed.",
    );
    if (order.checkout_id) {
      const session = await api.checkout.sessions.retrieve(order.checkout_id);
      assert(
        session.status === "open" && session.url,
        "Checkout closed. Please contact DFT before creating another order.",
      );
      return session.url;
    }
    await guardOperation(tx, `checkout:${id}`);
    assert(
      new Date(order.created_at).getTime() > Date.now() - 3600000,
      "This request has expired. Please start a new order.",
    );
    const customer = await api.customers.create(
      {
        email: order.customer_email,
        name: order.customer_name,
        metadata: { order_id: id },
      },
      { idempotencyKey: `customer:${id}` },
    );
    const session = await api.checkout.sessions.create(
      {
        mode: "payment",
        customer: customer.id,
        client_reference_id: id,
        metadata: { order_id: id, kind: "deposit" },
        payment_intent_data: { metadata: { order_id: id, kind: "deposit" } },
        payment_method_types: ["card"],
        expires_at:
          Math.floor(new Date(order.created_at).getTime() / 1000) + 7200,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: order.deposit,
              product_data: {
                name: `${order.reference} — ${order.pricing.depositPercent}% deposit`,
                description: order.pricing.service,
              },
            },
          },
        ],
        success_url: `${env().APP_URL}/order-result?result=returned`,
        cancel_url: `${env().APP_URL}/order-result?result=cancelled`,
      },
      { idempotencyKey: `checkout:${id}` },
    );
    assert(session.url, "Checkout unavailable", 503);
    await tx.query(
      "UPDATE orders SET stripe_customer_id=$2,checkout_id=$3,checkout_status='open' WHERE id=$1",
      [id, customer.id, session.id],
    );
    await activity(tx, id, "customer", "checkout_created");
    return session.url;
  });
}
