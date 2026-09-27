import { createRoot } from "react-dom/client";
import Home from "../../../app/components/home";
import Login from "../../../app/owner/login/page";
import Owner from "../../../app/owner/page";
import Order from "../../../app/owner/orders/[id]/page";
import { defaultSettings } from "../../../lib/domain";
import "../../../app/globals.css";
async function render() {
  const screen = new URLSearchParams(location.search).get("screen");
  const component =
    screen === "login" ? (
      <Login />
    ) : screen === "owner" ? (
      await Owner({ searchParams: Promise.resolve({}) })
    ) : screen === "order" ? (
      await Order({
        params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
      })
    ) : (
      <Home
        config={{ ...defaultSettings, paused: false, policyApproved: true }}
      />
    );
  createRoot(document.getElementById("root")!).render(component);
}
void render();
