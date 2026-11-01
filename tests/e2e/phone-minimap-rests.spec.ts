import { type Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * The field's map on a phone. Zoomed in, it sits over the field's lower
 * right, where the men it maps are drawn; left up it hides the field it is
 * there to find. So it comes up while the view moves, fades once the view
 * has been still a moment, and stays up for as long as a finger holds it.
 * The zoomed field with the map rested away is the run's artifact.
 */

const map = (page: Page) => page.locator(".minimap");
const field = (page: Page) => page.locator("svg.field-diagram").first();

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});

test("the map comes up as the view moves and rests away when it stops", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible();

  // Fitted, there is nothing off screen to find, so no map.
  await expect(map(page)).toHaveAttribute("data-shown", "false");

  // Zoomed in, it comes up — and goes once the view is still.
  await page.getByRole("button", { name: "Zoom in" }).tap();
  await page.getByRole("button", { name: "Zoom in" }).tap();
  await expect(map(page)).toHaveAttribute("data-shown", "true");
  await expect(map(page)).toHaveAttribute("data-shown", "false", {
    timeout: 5_000,
  });
  await expect(map(page).locator("svg")).toHaveCSS("pointer-events", "none");

  // Moving the view again brings it back, and it rests again after.
  const before = await field(page).getAttribute("viewBox");
  await page.getByRole("button", { name: "Zoom out" }).tap();
  await expect(field(page)).not.toHaveAttribute("viewBox", before!);
  await expect(map(page)).toHaveAttribute("data-shown", "true");

  // A finger held on the map keeps it up, however long it rests there.
  const box = (await map(page).locator("svg").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2_500);
  await expect(map(page)).toHaveAttribute("data-shown", "true");
  await page.mouse.up();
  await expect(map(page)).toHaveAttribute("data-shown", "false", {
    timeout: 5_000,
  });

  // The artifact: the zoomed field, clear in its lower right.
  await expect(page.locator(".toast")).toBeHidden({ timeout: 10_000 });
  await page.screenshot({
    path: testInfo.outputPath("phone-minimap-rests.png"),
  });
});
