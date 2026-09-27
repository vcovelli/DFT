import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:3101", headless: true },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js --config tests/ui/vite.config.ts",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 30000,
  },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      use: { browserName: "chromium", viewport: { width: 390, height: 844 } },
    },
  ],
});
