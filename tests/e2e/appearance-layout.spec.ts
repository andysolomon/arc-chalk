import { type Locator } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";

/**
 * A man's Appearance section stacks its controls: shapes, the Fill label and
 * its segments, then the Color label and its swatches. The section's body
 * used to lay out as plain flow, so the Fill label ran inline and the
 * swatches sat flush against the segments with no label of their own. The
 * open panel is saved as the run's artifact.
 */

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("not laid out");
  return rect;
}

test.use({ deviceScaleFactor: 2 });

test("stacks a man's Fill and Color under their own labels", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await page
    .locator('[data-scene-player][aria-label$=" offense player"]')
    .first()
    .click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  await page.getByRole("button", { name: /^Appearance/ }).click();

  const section = page.locator('[data-disclosure="player-appearance"]');
  const fillLabel = section.getByText("Fill", { exact: true });
  const fill = section.locator(".segments");
  const colorLabel = section.getByText("Color", { exact: true });
  const swatches = section.locator(".color-row");
  await expect(colorLabel).toBeVisible();

  const fillLabelBox = await box(fillLabel);
  const fillBox = await box(fill);
  const colorLabelBox = await box(colorLabel);
  const swatchBox = await box(swatches);
  // Each label sits on its own line, flush with the row beneath it.
  expect(fillLabelBox.x).toBeCloseTo(fillBox.x, 0);
  expect(colorLabelBox.x).toBeCloseTo(swatchBox.x, 0);
  // And each row clears the one above it.
  expect(fillBox.y).toBeGreaterThanOrEqual(
    fillLabelBox.y + fillLabelBox.height,
  );
  expect(colorLabelBox.y).toBeGreaterThan(fillBox.y + fillBox.height);
  expect(swatchBox.y).toBeGreaterThanOrEqual(
    colorLabelBox.y + colorLabelBox.height,
  );

  await page
    .locator(".player-inspector")
    .screenshot({ path: testInfo.outputPath("player-appearance.png") });
});
