import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Picking a defender's man on a phone (ADR 0060): the man, Pick on field in
 * his inspector sheet, and a tap on the receiver. The sheet has to get out
 * of the way for the field to be tapped, and a finger has to reach the man
 * it lands near. The field with the pick made is the run's artifact.
 */

/** Where a man stands on the glass: his own origin through the field's transform. */
const onGlass = (page: Page, ariaLabel: string) =>
  page.evaluate((ariaLabel) => {
    const man = document.querySelector<SVGGElement>(
      `[data-scene-player][aria-label='${ariaLabel}']`,
    );
    const matrix = man?.getScreenCTM();
    if (!matrix) throw new Error(`${ariaLabel} is not on the field.`);
    const centre = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: centre.x, y: centre.y };
  }, ariaLabel);

const manCalls = (page: Page) =>
  page
    .locator('[data-scene-path-group][aria-label*=" man"]')
    .evaluateAll((groups) =>
      groups.map((group) => group.getAttribute("aria-label") ?? "").sort(),
    );

test.use({ viewport: { width: 390, height: 844 } });

test("picks a defender's man with a tap on the field", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);

  // Nickel Cover 1 with its lines, over the seeded offense.
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();
  const toggle = browser.getByRole("button", { name: "With assignments" });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") {
    await toggle.tap();
  }
  await browser.getByRole("textbox").fill("Nickel Cover 1");
  await browser.getByText("Nickel Cover 1", { exact: true }).tap();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);
  await expect.poll(() => manCalls(page)).toContain("$ man on Y");

  // The safety, and his sheet.
  const safety = await onGlass(page, "$ defense player");
  await page.touchscreen.tap(safety.x, safety.y);
  await page.getByRole("button", { name: "Show all assignments" }).tap();
  const sheet = page.getByRole("complementary", { name: "Play inspector" });
  await expect(sheet).toHaveAttribute("data-sheet", "full");
  const pick = sheet.getByRole("button", { name: "Pick on field" });
  const pickBox = await pick.boundingBox();
  expect(pickBox?.height).toBeGreaterThanOrEqual(44);
  await pick.tap();

  // The sheet drops to its peek so the field is there to tap.
  await expect(sheet).toHaveAttribute("data-sheet", "peek");
  const bar = page.getByRole("group", { name: "Picking his man" });
  await expect(bar).toContainText("Cover who?");
  const z = await onGlass(page, "Z offense player");
  // A finger lands a little off the man and still means him.
  await page.touchscreen.tap(z.x + 6, z.y - 6);
  await expect(bar).toBeHidden();
  await expect.poll(() => manCalls(page)).toContain("$ man on Z");

  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: testInfo.outputPath("safety-picked-onto-z.png") });
});
