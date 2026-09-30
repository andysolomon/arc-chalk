import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * On a phone, a quick route off the tray renames the route it reshapes
 * (issue #160): Mesh gives Z a corner, and Curl from the tray leaves Z
 * running a curl called CURL on the field, in its accessible name and in the
 * roster. The field after the rename is the run's artifact.
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

test.use({ viewport: { width: 390, height: 664 } });

test("renames a concept's route when a quick route from the tray replaces it", async ({
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

  await openSheet();
  await sheet.getByRole("button", { name: /Concept ›/ }).tap();
  await page
    .getByRole("dialog", { name: "Concepts and line calls" })
    .getByRole("button", { name: /^Mesh/ })
    .first()
    .tap();
  await expect(page.getByRole("img", { name: "Z route: CORNER" })).toHaveCount(
    1,
  );

  const z = await onGlass(page, "z");
  await page.touchscreen.tap(z.x, z.y);
  await page
    .getByRole("navigation", { name: "Quick calls" })
    .getByRole("button", { name: "Curl" })
    .tap();

  await expect(page.getByRole("img", { name: "Z route: CURL" })).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Z route: CORNER" })).toHaveCount(
    0,
  );

  // The toast times out, so the artifact is the same on every run.
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("phone-curl-renamed.png"),
  });

  await openSheet();
  await sheet.getByRole("button", { name: /back to the roster/ }).tap();
  await expect(
    sheet.getByRole("button", { name: "Z: CURL — Receiver" }),
  ).toBeVisible();
});
