import type { Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Light and dark (ADR 0061): Settings → Appearance picks the theme, the
 * choice is this device's and outlives the tab, and System follows the
 * device as it changes. The field stays on white paper either way. Each test
 * ends with a screenshot of the shell it left dark.
 */

const theme = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme);

const background = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundColor);

const fieldPaper = (page: Page) =>
  page
    .locator(".field-paper")
    .first()
    .evaluate((node) => getComputedStyle(node).fill);

const openAppearance = async (page: Page) => {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "More actions" })
    .click();
  await page.getByRole("button", { name: "Settings…" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("tab", { name: "Appearance" }).click();
  return settings;
};

test("Dark turns the shell dark, keeps the field on paper, and is remembered", async ({
  context,
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openSeededEditor(page);
  expect(await theme(page)).toBe("light");
  expect(await background(page, ".chalk-shell")).toBe("rgb(250, 250, 250)");

  const settings = await openAppearance(page);
  const choices = settings.getByRole("group", { name: "Theme" });
  await expect(choices.getByRole("button", { name: "System" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await choices.getByRole("button", { name: "Dark" }).click();
  await expect(choices.getByRole("button", { name: "Dark" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await theme(page)).toBe("dark");
  expect(await background(page, ".chalk-shell")).toBe("rgb(17, 17, 17)");
  await expect(settings.getByRole("tab", { name: "Appearance" })).toContainText(
    "Dark",
  );
  await settings.getByRole("button", { name: "Close" }).click();

  // The field is what prints: white paper under a dark shell.
  expect(await fieldPaper(page)).toBe("rgb(255, 255, 255)");

  // Another tab on this device opens dark, before the Coach touches anything.
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: "light" });
  await other.goto("/");
  await expect(
    other.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible({ timeout: 30_000 });
  expect(await theme(other)).toBe("dark");

  // Light picked there reaches the first tab too.
  const there = await openAppearance(other);
  await there
    .getByRole("group", { name: "Theme" })
    .getByRole("button", { name: "Light" })
    .click();
  await expect.poll(() => theme(page)).toBe("light");
  await there
    .getByRole("group", { name: "Theme" })
    .getByRole("button", { name: "Dark" })
    .click();
  await expect.poll(() => theme(page)).toBe("dark");
  await other.close();

  await page.screenshot({ path: testInfo.outputPath("editor-dark.png") });
});

test("System follows the device from light to dark and back", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openSeededEditor(page);
  expect(await theme(page)).toBe("dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => theme(page)).toBe("light");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => theme(page)).toBe("dark");

  // A pick overrides the device until System is picked again.
  const settings = await openAppearance(page);
  const choices = settings.getByRole("group", { name: "Theme" });
  await choices.getByRole("button", { name: "Light" }).click();
  expect(await theme(page)).toBe("light");
  await choices.getByRole("button", { name: "System" }).click();
  expect(await theme(page)).toBe("dark");

  await settings.screenshot({
    path: testInfo.outputPath("appearance-settings-dark.png"),
  });
});

test("the Playbooks page reads in the dark", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openSeededEditor(page);
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: "Playbooks", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Playbooks pages" }),
  ).toBeVisible();
  expect(await background(page, ".chalk-shell")).toBe("rgb(17, 17, 17)");

  // A formation's picture is a sketch on the dark card, not paper.
  await page
    .getByRole("navigation", { name: "Playbooks pages" })
    .getByRole("button", { name: "Formations", exact: true })
    .click();
  const shape = page.locator(".browser-shape").first();
  await expect(shape).toBeVisible();
  expect(await background(page, ".browser-shape")).toBe("rgb(17, 17, 17)");

  await page.screenshot({ path: testInfo.outputPath("formations-dark.png") });
});
