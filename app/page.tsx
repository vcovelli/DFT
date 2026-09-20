import Home from "./components/home";
import { defaultSettings } from "@/lib/domain";
import { settings } from "@/lib/server/orders";
export const dynamic = "force-dynamic";
export default async function Page() {
  let config = defaultSettings;
  try {
    config = await settings();
  } catch {
    console.error(
      JSON.stringify({ level: "warn", code: "ordering_unavailable" }),
    );
  }
  return <Home config={config} />;
}
