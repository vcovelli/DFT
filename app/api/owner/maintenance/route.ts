import { requireOwner } from "@/lib/server/auth";
import { endpoint, sameOrigin } from "@/lib/server/http";
import { maintenance } from "@/lib/server/maintenance";
export const maxDuration = 60;
export const POST = endpoint(async (request) => {
  sameOrigin(request);
  await requireOwner();
  await maintenance();
  return Response.json({ ok: true });
});
