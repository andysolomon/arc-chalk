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
    // A clean device is cleared once, by the page itself: the script runs
    // again in every frame the page opens, and the Print preview is one,
    // so without the guard opening a preview would delete the library
    // under the app (issue #156).
    if (window !== window.top) return;
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
    // Top frame only, for the reason openSeededEditor gives.
    if (window !== window.top) return;
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

/**
 * Game plans have one way in (ADR 0074): the header's Playbooks tab, then the
 * open book's Game plans page.
 */
export async function openGamePlans(page: Page) {
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Book pages" })
    .getByRole("button", { name: "Game plans", exact: true })
    .click();
  const workspace = page.getByRole("region", { name: "Game plans" });
  await expect(workspace).toBeVisible();
  return workspace;
}

/**
 * Show on field and the Library fold away under the sidebar's View & library
 * heading (ADR 0074); this opens it if it is closed.
 */
export async function openViewAndLibrary(page: Page) {
  const sidebar = page.getByRole("navigation", { name: "Sidebar" });
  const fold = sidebar.getByRole("button", { name: "View & library" });
  if ((await fold.getAttribute("aria-expanded")) !== "true") {
    await fold.click();
  }
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  return sidebar;
}

/** Settings is the gear at the sidebar's foot (ADR 0074). */
export async function openSettings(page: Page) {
  await page
    .getByRole("navigation", { name: "Sidebar" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  return settings;
}

/**
 * A blank play from the header's New play menu — its one home on a desktop;
 * More carries it only on a phone, whose header has no room (ADR 0074). A
 * new play opens on the browser for its unit (ADR 0077); this closes it
 * unpicked, leaving the blank field these specs start from.
 */
export async function startNewPlay(
  page: Page,
  unit: "offensive" | "defensive",
): Promise<void> {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "New play", exact: true })
    .click();
  await page
    .getByRole("group", { name: "New play" })
    .getByRole("button", { name: new RegExp(`^New ${unit} play`) })
    .click();
  await closeNewPlayBrowser(page, unit);
}

/** Closes the browser a new play opens on, with nothing picked (ADR 0077). */
export async function closeNewPlayBrowser(
  page: Page,
  unit: "offensive" | "defensive",
): Promise<void> {
  const browser = page.getByRole("dialog", {
    name: unit === "offensive" ? "Formations" : "Defenses",
  });
  await expect(browser).toBeVisible();
  await browser.getByTitle("Close — esc").click();
  await expect(browser).toBeHidden();
}

/** Switch destinations through tabs or the narrow header's view picker. */
export async function chooseWorkspaceView(
  page: Page,
  label: "Editor" | "Playbooks" | "Game Day",
) {
  const nav = page.getByRole("navigation", { name: "Workspace views" });
  const picker = nav.getByRole("combobox", { name: "Workspace view" });
  await expect(nav).toBeVisible();
  if (await picker.isVisible()) {
    await picker.selectOption({ label });
  } else {
    await nav.getByRole("button", { name: label, exact: true }).click();
  }
}

/** The command's single visible home is either the row or More. */
export async function headerCommand(
  page: Page,
  name: "Undo" | "Redo" | "Play type",
) {
  const header = page.getByRole("banner");
  const command = header.getByRole("button", { name, exact: true });
  if (!(await command.isVisible())) {
    await header
      .getByRole("button", { name: "More actions", exact: true })
      .click();
  }
  return command;
}
