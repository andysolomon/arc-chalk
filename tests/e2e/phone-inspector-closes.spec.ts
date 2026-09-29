import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * An option picked in the inspector is the answer (product request
 * 2026-09-29): as soon as the Coach taps a call, a shape or a colour, the
 * phone's sheet drops to its peek, so the field shows what he chose. The
 * tablet's drawer is inspector-closes.spec. The field with every pick made is
 * the run's artifact.
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

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("drops the sheet to its peek as soon as an option is picked", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("[data-scene-player]")).toHaveCount(11);
    const sheet = page.getByRole("complementary", { name: "Play inspector" });
    const openSheet = async () => {
      await page.getByRole("button", { name: "Show all assignments" }).tap();
      await expect(sheet).toHaveAttribute("data-sheet", "full");
    };

    // The quarterback, who carries no route in the seeded Play.
    const routes = await page.locator("[data-scene-path]").count();
    const q = await onGlass(page, "q");
    await page.touchscreen.tap(q.x, q.y);
    await openSheet();

    // A quick route: drawn, and the sheet is out of the way.
    await sheet.getByRole("button", { name: "Slant" }).tap();
    await expect(sheet).toHaveAttribute("data-sheet", "peek");
    await expect(page.locator("[data-scene-path]")).toHaveCount(routes + 1);

    // A shape under Appearance: the same.
    await openSheet();
    const appearance = sheet.getByRole("button", { name: "Appearance" });
    if ((await appearance.getAttribute("aria-expanded")) !== "true") {
      await appearance.tap();
    }
    await sheet.getByRole("button", { name: "Square — center" }).tap();
    await expect(sheet).toHaveAttribute("data-sheet", "peek");

    // His route's own panel: a line style is an option too.
    await openSheet();
    await sheet.getByRole("button", { name: "Edit" }).first().tap();
    await expect(sheet).toHaveAttribute("data-sheet", "full");
    const routeAppearance = sheet.getByRole("button", { name: "Appearance" });
    if ((await routeAppearance.getAttribute("aria-expanded")) !== "true") {
      await routeAppearance.tap();
    }
    await sheet.getByRole("button", { name: "Dashed" }).tap();
    await expect(sheet).toHaveAttribute("data-sheet", "peek");

    // Going somewhere in the sheet is not picking an option: the pager and
    // the way back keep it full.
    await openSheet();
    await sheet.getByRole("button", { name: /back to the roster/ }).tap();
    await expect(sheet).toHaveAttribute("data-sheet", "full");
    await page.getByRole("button", { name: "Show the field" }).tap();
    await expect(sheet).toHaveAttribute("data-sheet", "peek");

    await page
      .locator("svg.field-diagram")
      .first()
      .screenshot({ path: testInfo.outputPath("phone-picks-made.png") });
  });
});
