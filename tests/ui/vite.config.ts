import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
export default defineConfig({
  root: fixture(""),
  envDir: fixture(""),
  esbuild: { jsx: "automatic" },
  define: {
    "process.env.STRIPE_SECRET_KEY": JSON.stringify("sk_test_fixture"),
  },
  resolve: {
    alias: [
      ...["auth", "http", "orders", "db", "payments", "availability"].map(
        (name) => ({
          find: `@/lib/server/${name}`,
          replacement: fixture("server.ts"),
        }),
      ),
      { find: "next/navigation", replacement: fixture("router.tsx") },
      { find: "next/link", replacement: fixture("router.tsx") },
      { find: "@", replacement: root },
    ],
  },
  server: { host: "127.0.0.1", port: 3101, strictPort: true },
});
