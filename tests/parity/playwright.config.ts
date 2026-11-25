import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

import { checkoutPort } from "../checkout-port";

const prototypeServer = resolve(
  import.meta.dirname,
  "../../scripts/serve-prototype.ts",
);

const productionPort = checkoutPort(4173, 5200);
const productionURL = `http://127.0.0.1:${productionPort}`;

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: /(original-prototype|production-shell)\.spec\.ts/,
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
  projects: [
    {
      name: "original",
      testMatch: "original-prototype.spec.ts",
      use: { baseURL: "http://127.0.0.1:4174" },
    },
    {
      // The production shell is compared against the original's own goldens,
      // so the recorded difference is the parity gap itself.
      name: "production",
      testMatch: "production-shell.spec.ts",
      use: { baseURL: productionURL },
    },
  ],
  // CHALK_PROTOTYPE_SERVER=external says the *prototype* is already running —
  // the merge gate starts it itself. Production is never external, so it is
  // started either way; suppressing both left the production project pointing
  // at nothing.
  webServer: [
    ...(process.env.CHALK_PROTOTYPE_SERVER === "external"
      ? []
      : [
          {
            command: `bun "${prototypeServer}"`,
            url: "http://127.0.0.1:4174",
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
          },
        ]),
    {
      command: `bun run dev --port ${productionPort} --strictPort`,
      url: productionURL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
