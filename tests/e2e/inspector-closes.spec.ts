import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * An option picked in the inspector is the answer (product request
 * 2026-09-29): as soon as the Coach taps a call, a shape or a colour, the
 * tablet's drawer closes, so the field shows what he chose. The phone's sheet
 * is phone-inspector-closes.spec. The field with every pick made is the run's
 * artifact.
 */

/** Where a man stands on the glass: his own origin through the field's transform. */
const onGlass = (page: Page, id: string) =>
  page.evaluate((id) => {
    const man = document.querySelector<SVGGElement>(
      `[data-scene-player='${id}']`,
    );
    const matrix = man?.getScreenCTM();
    if (!matrix) throw new Error(`${id} is not on the field.`);
    const centre = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: centre.x, y: centre.y };
  }, id);

test.describe("tablet", () => {
  test.use({
    viewport: { width: 834, height: 1194 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });

  test("closes the drawer as soon as an option is picked", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await expect(page.locator("[data-scene-player]")).toHaveCount(11, {
      timeout: 30_000,
    });
    const inspector = page.getByRole("complementary", {
      name: "Play inspector",
    });
    const stub = page.getByRole("button", { name: "Inspector" });
    await expect(inspector).toHaveCount(0);

    const routes = await page.locator("[data-scene-path]").count();
    const q = await onGlass(page, "q");
    await page.touchscreen.tap(q.x, q.y);
    await expect(page.locator("[data-scene-player].selected")).toHaveAttribute(
      "data-scene-player",
      "q",
    );

    // A quick route closes the drawer.
    await stub.tap();
    await expect(inspector).toBeVisible();
    await inspector.getByRole("button", { name: "Slant" }).tap();
    await expect(inspector).toHaveCount(0);
    await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 1);

    // So does a colour under Appearance.
    await stub.tap();
    await expect(inspector).toBeVisible();
    const appearance = inspector.getByRole("button", { name: "Appearance" });
    if ((await appearance.getAttribute("aria-expanded")) !== "true") {
      await appearance.tap();
    }
    await inspector.getByRole("button", { name: "red", exact: true }).tap();
    await expect(inspector).toHaveCount(0);

    await page
      .locator("svg.field-diagram")
      .first()
      .screenshot({ path: testInfo.outputPath("tablet-picks-made.png") });
  });
});
