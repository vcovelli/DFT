// A small scheduled caller keeps all business logic in the authenticated Node route.
export default async function handler() {
  try {
    const origin = new URL(process.env.APP_URL);
    const secret = process.env.CRON_SECRET;
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      !secret ||
      secret.length < 32
    )
      throw new Error();
    const response = await fetch(new URL("/api/cron", origin), {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok || (await response.json()).ok !== true) throw new Error();
    return new Response(null, { status: 204 });
  } catch {
    // Never surface fetch errors, request headers, response bodies, or URLs.
    throw new Error("scheduled_maintenance_failed");
  }
}

export const config = { schedule: "7,17,27,37,47,57 * * * *" };
