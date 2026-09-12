import { test as base, expect, type Page } from "@playwright/test";

/**
 * Interaction and parity shells still exercise the Stick family. Product boot
 * is blank; these fixtures opt into the starter seed before the runtime opens.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("chalk.seedStarter", "1");
      } catch {
        // Without session storage the seeded URL below still works.
      }
    });
    await use(page);
  },
});

export { expect };

/** Opens the editor with the Stick starter Playbook on a clean device. */
export async function openSeededEditor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.clear();
    indexedDB.deleteDatabase("chalk-production-beta");
    try {
      sessionStorage.setItem("chalk.seedStarter", "1");
    } catch {
      // Fall through to the query string.
    }
  });
  await page.goto("/?seed=starter");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible({ timeout: 30_000 });
}

/** Opens the editor with a blank canvas and an empty library. */
export async function openBlankEditor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.clear();
    indexedDB.deleteDatabase("chalk-production-beta");
    try {
      sessionStorage.removeItem("chalk.seedStarter");
    } catch {
      // Ignore.
    }
  });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Play name" })).toHaveValue(
    "Untitled play",
    { timeout: 30_000 },
  );
}
