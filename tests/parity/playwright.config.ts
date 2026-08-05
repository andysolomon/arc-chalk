import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const prototypeServer = resolve(
  import.meta.dirname,
  "../../scripts/serve-prototype.ts",
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
    command: `bun "${prototypeServer}"`,
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
