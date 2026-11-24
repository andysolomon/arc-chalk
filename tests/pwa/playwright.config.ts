import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

import { checkoutPort } from "../checkout-port";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = checkoutPort(4175, 6200);

/**
 * The installed shell can only be proven against the production build: the
 * dev server injects neither the service worker nor the manifest.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
  ],
  webServer: {
    cwd: root,
    command: `bun run --cwd apps/web build && bun run --cwd apps/web preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
