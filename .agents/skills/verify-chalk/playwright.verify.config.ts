import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import base from "../../../playwright.config";

/**
 * The repo's Playwright projects, pointed at the instance `chalk-verify
 * launch` started and set to keep everything a reviewer can inspect: a video,
 * a trace and a final screenshot for every test, next to whatever the spec
 * writes with `testInfo.outputPath`.
 *
 * `chalk-verify drive` sets the two variables. Running this config by hand
 * without them is a mistake, so it stops.
 */
const url = process.env.CHALK_VERIFY_URL;
const runDir = process.env.CHALK_VERIFY_RUN_DIR;
if (!url || !runDir) {
  throw new Error(
    "Run specs through `bun .agents/skills/verify-chalk/scripts/chalk-verify.ts drive <spec>`.",
  );
}

const root = path.resolve(import.meta.dirname, "../../..");

/** The Chromium build a person runs, in place of the headless shell. */
const realChromium = (name: string | undefined) =>
  name !== undefined && name.includes("chromium")
    ? { channel: "chromium" }
    : {};

export default defineConfig({
  ...base,
  testDir: root,
  outputDir: path.join(runDir, "artifacts"),
  retries: 0,
  forbidOnly: false,
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(runDir, "report.json") }],
  ],
  use: {
    ...base.use,
    baseURL: url,
    video: "on",
    trace: "on",
    screenshot: "on",
  },
  projects: [
    ...(base.projects ?? []).map((project) => ({
      ...project,
      use: {
        ...project.use,
        ...realChromium(project.name),
        // Film at the size of the screen, not Playwright's 800px default.
        ...(project.use?.viewport
          ? { video: { mode: "on" as const, size: project.use.viewport } }
          : {}),
      },
    })),
    {
      // A walkthrough recorded for people to watch (the demo-kit skill).
      // One fixed frame, so a rerun on the same commit films the same thing.
      name: "demo",
      testMatch: /\.demo\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        video: { mode: "on", size: { width: 1280, height: 800 } },
      },
    },
  ],
  webServer: undefined,
});
