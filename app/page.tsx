import Home from "./components/home";
import { defaultSettings } from "@/lib/domain";
import { settings } from "@/lib/server/orders";
import { requireOrderingAvailable } from "@/lib/server/availability";
export const dynamic = "force-dynamic";
export default async function Page() {
  // An unconfigured local preview intentionally keeps ordering paused.
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        JSON.stringify({ level: "warn", code: "ordering_not_configured" }),
      );
    }
    return <Home config={defaultSettings} />;
  }

  let config = defaultSettings;
  try {
    await requireOrderingAvailable();
    config = await settings();
  } catch {
    console.warn(
      JSON.stringify({ level: "warn", code: "ordering_unavailable" }),
    );
  }
  return <Home config={config} />;
}
