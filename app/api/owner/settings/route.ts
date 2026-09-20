import { settingsSchema } from "@/lib/domain";
import { requireOwner } from "@/lib/server/auth";
import { transaction } from "@/lib/server/db";
import { activity } from "@/lib/server/orders";
import { endpoint, jsonBody, sameOrigin } from "@/lib/server/http";
export const POST = endpoint(async (request) => {
  sameOrigin(request);
  const owner = await requireOwner();
  const config = settingsSchema.parse(await jsonBody(request));
  await transaction(async (tx) => {
    await tx.query(
      "UPDATE business_settings SET config=$1,updated_at=now() WHERE id=true",
      [JSON.stringify(config)],
    );
    await activity(tx, null, owner.id, "settings_changed", config);
  });
  return Response.json({ ok: true });
});
