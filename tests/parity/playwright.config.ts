import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const prototypeRoot = resolve(
  import.meta.dirname,
  "../../Chalk Football Play Editor-2",
);

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "original-prototype.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  outputDir: resolve(import.meta.dirname, "../../test-results/parity"),
  snapshotPathTemplate: resolve(
    import.meta.dirname,
    "../../docs/parity/screenshots/{arg}{ext}",
  ),
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1440, height: 960 },
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "America/New_York",
    trace: "on-first-retry",
  },
  webServer: {
    command: `bunx vite "${prototypeRoot}" --host 127.0.0.1 --port 4174 --strictPort`,
    url: "http://127.0.0.1:4174/Chalk%20Play%20Editor.dc.html",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
