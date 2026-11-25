import { type Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * A phone's More menu goes away on a press on a field handle, as it does on
 * a press on the open field. A handle keeps its press from the field, and the
 * menu's old listener waited for the press to bubble up and never heard it
 * (#240). The field after the press is the artifact.
 */

const field = (page: Page) => page.locator("svg.field-diagram").first();

/** A point in the field's frame, in client pixels. */
async function fieldPoint(page: Page, x: number, y: number) {
  const box = await field(page).boundingBox();
  if (!box) throw new Error("The field is not on screen.");
  const [viewX, viewY, viewWidth, viewHeight] = (
    (await field(page).getAttribute("viewBox")) ?? "0 0 1000 620"
  )
    .split(" ")
    .map(Number) as [number, number, number, number];
  return {
    x: box.x + ((x - viewX) / viewWidth) * box.width,
    y: box.y + ((y - viewY) / viewHeight) * box.height,
  };
}

test("a phone's More menu closes on a press on a field handle", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);

  // X's route ends at the field's left edge, clear of the menu that drops
  // from the header. A press on its long last leg picks it and raises its
  // handles.
  const d = await page.locator('[data-scene-path="rx"]').getAttribute("d");
  const numbers = (d?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const [x0, y0, x1, y1] = numbers.slice(-4);
  const leg = await fieldPoint(page, (x0! + x1!) / 2, (y0! + y1!) / 2);
  await page.mouse.click(leg.x, leg.y);
  const handle = page.locator("[data-node-handle]").last();
  await expect(handle).toBeVisible();

  await page
    .getByRole("banner")
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  const panel = page.locator(".more-panel");
  await expect(panel).toBeVisible();

  // A locator click lands only where the handle is the topmost thing under
  // the pointer, so the press reaches the handle and not the menu.
  await handle.click();
  await expect(panel).toBeHidden();
  await expect(handle).toBeVisible();

  await field(page).screenshot({
    path: testInfo.outputPath("phone-more-closed.png"),
  });
});
