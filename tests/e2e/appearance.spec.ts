import type { Page } from "@playwright/test";

import { expect, openSeededEditor, openSettings, test } from "./fixtures";

/**
 * Light and dark (ADR 0061): Settings → Appearance picks the theme, the
 * choice is this device's and outlives the tab, and System follows the
 * device as it changes. The field goes dark with the shell unless the Coach
 * keeps it on paper (ADR 0083); the print preview stays on paper. Each test
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

/** The stroke of the first ink route on the seeded Play. */
const lineColor = (page: Page) =>
  page
    .locator('.field-diagram [data-scene-path][stroke="#171717"]')
    .first()
    .evaluate((node) => getComputedStyle(node).stroke);

const openAppearance = async (page: Page) => {
  const settings = await openSettings(page);
  await settings.getByRole("tab", { name: "Appearance" }).click();
  return settings;
};

test("Dark turns the shell and the field dark, and is remembered", async ({
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
  await settings.getByRole("button", { name: "Close" }).click();

  // The field goes dark with the shell: paper and ink trade places.
  expect(await fieldPaper(page)).toBe("rgb(24, 24, 24)");
  expect(await lineColor(page)).toBe("rgb(237, 237, 237)");

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

test("Paper keeps the field white under a dark shell, on every tab", async ({
  context,
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openSeededEditor(page);
  expect(await theme(page)).toBe("dark");
  expect(await fieldPaper(page)).toBe("rgb(24, 24, 24)");

  const settings = await openAppearance(page);
  const field = settings.getByRole("group", { name: "Field" });
  await expect(
    field.getByRole("button", { name: "Match theme" }),
  ).toHaveAttribute("aria-pressed", "true");
  await field.getByRole("button", { name: "Paper" }).click();
  await expect(field.getByRole("button", { name: "Paper" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await settings.getByRole("button", { name: "Close" }).click();
  expect(await fieldPaper(page)).toBe("rgb(255, 255, 255)");
  expect(await lineColor(page)).toBe("rgb(23, 23, 23)");
  expect(await background(page, ".chalk-shell")).toBe("rgb(17, 17, 17)");

  // Another tab opens with the field on paper before the first paint.
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: "dark" });
  await other.goto("/");
  expect(
    await other.evaluate(() => document.documentElement.dataset.field),
  ).toBe("paper");
  await expect(
    other.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible({ timeout: 30_000 });
  expect(await fieldPaper(other)).toBe("rgb(255, 255, 255)");

  // Match theme picked there darkens the first tab's field too.
  const there = await openAppearance(other);
  await there
    .getByRole("group", { name: "Field" })
    .getByRole("button", { name: "Match theme" })
    .click();
  await expect.poll(() => fieldPaper(page)).toBe("rgb(24, 24, 24)");
  await other.close();

  await page.evaluate(async () => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath("editor-dark-field.png") });
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
