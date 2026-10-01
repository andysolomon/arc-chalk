import type { Locator, Page } from "@playwright/test";

import { expect, openSettings, test } from "./fixtures";

/**
 * ADR 0074: every control has one home. The header's tabs are the only
 * navigation, Settings and Help are icons at the sidebar's foot, the Play
 * type is the header pill's, Show on field and the Library fold under View &
 * library, Backup is under Settings → Account, and More holds only what is
 * done to the field in front of the Coach. Each test ends on a screenshot of
 * the seeded starter book at the desktop project's fixed 1440×960 viewport,
 * so a rerun on the same commit redraws the same picture.
 */
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "Desktop chrome; the phone has phone-one-home-per-control.spec.ts.",
);

const names = async (buttons: Locator): Promise<string[]> =>
  await buttons.evaluateAll((nodes) =>
    nodes.map(
      (node) =>
        node.getAttribute("aria-label") ??
        node.querySelector(".menu-item-name")?.textContent ??
        node.textContent ??
        "",
    ),
  );

/**
 * The fold's state as this device stored it. The write does not block the
 * Coach, so a test that reloads waits for the record rather than a moment.
 */
const storedFold = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<boolean | undefined>((resolve) => {
        const open = indexedDB.open("chalk-production-beta");
        open.onerror = () => resolve(undefined);
        open.onsuccess = () => {
          const database = open.result;
          const request = database
            .transaction("preferences", "readonly")
            .objectStore("preferences")
            .get("chrome.v1");
          request.onerror = () => {
            database.close();
            resolve(undefined);
          };
          request.onsuccess = () => {
            database.close();
            const record = request.result as
              { value?: { open?: Record<string, boolean> } } | undefined;
            resolve(record?.value?.open?.["sidebar:view-library"]);
          };
        };
      }),
  );

/** The seeded starter book, kept across a reload (the fixture seeds once). */
const openStarter = async (page: Page) => {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible({ timeout: 30_000 });
};

const banner = (page: Page) => page.getByRole("banner");
const sidebar = (page: Page) =>
  page.getByRole("navigation", { name: "Sidebar" });

test("the editor puts each control in one place", async ({
  page,
}, testInfo) => {
  await openStarter(page);

  // The header: the destinations, the play, its history and what is done to
  // it — with Help gone to the sidebar, and four words drawn as icons.
  await expect(
    banner(page).getByRole("button", { name: "Help", exact: true }),
  ).toHaveCount(0);
  for (const name of ["Undo", "Redo", "Reset positions", "Present"]) {
    const button = banner(page).getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button.locator("svg")).toHaveCount(1);
    await expect(button).toHaveText("");
  }
  for (const name of ["New play", "Print & export", "Save"]) {
    await expect(
      banner(page).getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }

  // The sidebar is this play's: no destinations, no Play type, no outputs.
  for (const name of [/^Plays/, /^Game plans/, /^Game Day/, /^Type of play/]) {
    await expect(sidebar(page).getByRole("button", { name })).toHaveCount(0);
  }
  await expect(
    sidebar(page).getByRole("button", { name: "Print & export" }),
  ).toHaveCount(0);
  for (const name of [/^Formation/, /^Ball on/, /^Shadow defense/]) {
    await expect(sidebar(page).getByRole("button", { name })).toBeVisible();
  }
  await expect(
    banner(page).getByRole("button", { name: "Play type" }),
  ).toBeVisible();

  // View & library starts folded, opens, and the device remembers it.
  const fold = sidebar(page).getByRole("button", { name: "View & library" });
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(
    sidebar(page).getByRole("button", { name: /^Show on field/ }),
  ).toHaveCount(0);
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(
    sidebar(page).getByRole("button", { name: /^Show on field/ }),
  ).toBeVisible();
  await expect(
    sidebar(page).getByRole("button", { name: /^Library/ }),
  ).toBeVisible();
  await expect.poll(() => storedFold(page)).toBe(true);
  await page.reload();
  await expect(fold).toHaveAttribute("aria-expanded", "true", {
    timeout: 30_000,
  });

  // The foot is two icons and the fold control.
  expect(await names(sidebar(page).locator(".sidebar-foot > button"))).toEqual([
    "Settings",
    "Help",
    "Hide the sidebar",
  ]);

  // More: the field and the play in front of the Coach, nothing else.
  await banner(page).getByRole("button", { name: "More actions" }).click();
  const more = page.locator(".more-panel");
  await expect(more).toBeVisible();
  expect(
    (await names(more.locator(":scope > .menu-item, .menu-entry"))).map(
      (name) => name.trim(),
    ),
  ).toEqual([
    "Focus mode",
    "Hide zone areas",
    "Mirror",
    "Flip strength",
    "Clear a layer",
    "Share & assets",
  ]);
  await banner(page).getByRole("button", { name: "More actions" }).click();

  // Help is the sidebar's: the tour, the tutorials and the references.
  await sidebar(page)
    .getByRole("button", { name: "Help", exact: true })
    .click();
  const help = sidebar(page).getByRole("group", { name: "Help" });
  for (const name of [
    "Demo — guided tour",
    "Keyboard shortcuts ?",
    "Command palette ⌘K",
  ]) {
    await expect(help.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath("editor-one-home.png") });
  await help
    .getByRole("button", { name: "Keyboard shortcuts ?", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // Backup is this device's data, under Settings → Account.
  const settings = await openSettings(page);
  await settings.getByRole("tab", { name: "Account" }).click();
  const backup = settings.getByRole("group", { name: "Backup" });
  await expect(backup.getByLabel("Backup passphrase")).toBeVisible();
  await expect(
    backup.getByRole("button", { name: "Back up my Playbooks" }),
  ).toBeDisabled();
  await backup.getByLabel("Backup passphrase").fill("practice squad");
  await expect(
    backup.getByRole("button", { name: "Back up my Playbooks" }),
  ).toBeEnabled();
  await settings.screenshot({
    path: testInfo.outputPath("settings-account-backup.png"),
  });
});

test("the Playbooks and Game Day pages carry Help and Settings at the header's end", async ({
  page,
}, testInfo) => {
  await openStarter(page);
  const views = page.getByRole("navigation", { name: "Workspace views" });

  for (const view of ["Playbooks", "Game Day"]) {
    await views.getByRole("button", { name: view, exact: true }).click();
    await expect(
      banner(page).getByRole("button", { name: "More actions" }),
    ).toHaveCount(0);
    await expect(
      banner(page).getByRole("button", { name: "Help", exact: true }),
    ).toBeVisible();

    // Settings opens over the page, and Escape puts it away without
    // leaving the page for the editor.
    await banner(page)
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await expect(
      views.getByRole("button", { name: view, exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }

  await views.getByRole("button", { name: "Playbooks", exact: true }).click();
  await banner(page).getByRole("button", { name: "Help", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Demo — guided tour", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("playbooks-header-help.png"),
  });
});
