import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The coverage on a phone (ADR 0075, issue #188): the assignments sheet's
 * peek names it, its full height reaches the Coverage row, and a coverage
 * picked there drops the sheet back to its peek so the field shows what was
 * called. The field with the new coverage drawn is the run's artifact.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function pickFrom(page: Page, dialog: string, name: string) {
  const browser = page.getByRole("dialog", { name: dialog });
  await expect(browser).toBeVisible();
  await browser.getByText(name, { exact: true }).tap();
  await expect(browser).toBeHidden();
}

test("names the coverage in the sheet's peek and changes it from the sheet", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "More actions", exact: true }).tap();
  await page
    .locator(".more-panel")
    .getByRole("button", { name: /^New defensive play/ })
    .tap();
  await expect(page.locator("[data-scene-player]")).toHaveCount(0);

  // 4-3 Cover 3 with its lines, over Gun Doubles Right.
  await page.keyboard.press("Control+Shift+d");
  const defenses = page.getByRole("dialog", { name: "Defenses" });
  const toggle = defenses.getByRole("button", { name: "With assignments" });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") {
    await toggle.tap();
  }
  await defenses
    .getByRole("textbox", { name: "Search defenses" })
    .fill("4-3 Cover 3");
  await pickFrom(page, "Defenses", "4-3 Cover 3");
  await page.keyboard.press("Control+Shift+f");
  await pickFrom(page, "Formations", "Gun Doubles Right");
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);

  // The peek says what the defense is in.
  const sheet = page.getByRole("complementary", { name: "Play inspector" });
  await expect(sheet).toHaveAttribute("data-sheet", "peek");
  await expect(sheet.locator(".sheet-calls")).toHaveText("Cover 3");

  // Full, the sheet reaches the Coverage row, a finger's height tall.
  await page.getByRole("button", { name: "Show all assignments" }).tap();
  await expect(sheet).toHaveAttribute("data-sheet", "full");
  const row = sheet.locator(".play-call .preset-summary");
  await expect(row).toContainText("Cover 3");
  expect((await row.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await row.tap();

  // A coverage picked drops the sheet to its peek, naming the new one.
  await pickFrom(page, "Unit calls", "Cover 4");
  await expect(sheet).toHaveAttribute("data-sheet", "peek");
  await expect(sheet.locator(".sheet-calls")).toHaveText("Cover 4");

  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: testInfo.outputPath("phone-cover-4.png") });
});
