import { execSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

import { checkoutPort } from "./tests/checkout-port";

/** The source under test, so a failed phone run names the build (issue #96). */
const buildSha = (() => {
  try {
    return execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
})();

/**
 * Phone workflows live in their own specs and run on phone-shaped projects
 * only: an Android-like Chromium and an iPhone-like WebKit. Each spec walks
 * the widths that matter (360, 390, 430 portrait and 844×390 sideways) so
 * one project covers the set; the desktop and iPad projects skip them.
 */
const phoneSpecs = /phone-.*\.spec\.ts$/;

const port = Number(process.env.CHALK_E2E_PORT ?? checkoutPort(4173, 4200));
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  metadata: { buildSha },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: phoneSpecs,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      // The editor's tablet gate runs the iPad in landscape, where the
      // inspector docks; portrait and Split View — where it is a drawer or
      // the reading shell (ADR 0045) — are covered by tablet-layout.spec.
      name: "webkit-ipad",
      testIgnore: phoneSpecs,
      use: {
        ...devices["iPad Pro 11 landscape"],
      },
    },
    {
      // Android-like: Chromium with a coarse pointer and touch. A failed
      // phone test keeps its screenshot and trace, and the run names the
      // build in the report's metadata.
      name: "phone-chromium",
      testMatch: phoneSpecs,
      use: {
        ...devices["Pixel 7"],
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
      },
    },
    {
      // iPhone-like: WebKit, the engine every browser on an iPhone uses.
      name: "phone-webkit",
      testMatch: phoneSpecs,
      use: {
        ...devices["iPhone 14"],
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
      },
    },
  ],
  webServer: {
    command: `bun run dev --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
