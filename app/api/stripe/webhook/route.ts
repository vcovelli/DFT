import { after } from "next/server";
import { flushEmails } from "@/lib/server/emails";
import { stripe } from "@/lib/server/providers";
import { env } from "@/lib/server/env";
import { endpoint, HttpError, readBody } from "@/lib/server/http";
import { processEvent } from "@/lib/server/payments";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = endpoint(async (request) => {
  const raw = await readBody(request, 1024 * 1024),
    api = stripe();
  let event;
  try {
    event = api.webhooks.constructEvent(
      raw,
      request.headers.get("stripe-signature") || "",
      env().STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    throw new HttpError(400, "Invalid webhook signature");
  }
  if (event.livemode !== env().STRIPE_SECRET_KEY.startsWith("sk_live_"))
    throw new HttpError(400, "Payment mode mismatch");
  await processEvent(event, api);
  after(async () => {
    try {
      await flushEmails(5);
    } catch {
      console.error(
        JSON.stringify({ level: "error", code: "email_flush_failed" }),
      );
    }
  });
  return Response.json({ received: true });
});
