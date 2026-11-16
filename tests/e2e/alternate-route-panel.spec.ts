import { type Locator, type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * An alternate route opens on the same choices as the route it is an
 * alternate to. Z in Gun Doubles Right runs a slant; + Alternate route lands
 * on Alternate 1, whose panel offers the Quick routes there and then. Curl
 * redraws the alternate, not the slant, and the panel stays on it. The
 * panel and the field, with both of Z's routes, are the run's artifacts.
 */

test.use({ viewport: { width: 1440, height: 960 } });

const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });

const field = (page: Page) => page.locator("svg.field-diagram").first();

const zRoutes = (page: Page) => page.getByRole("img", { name: /^Z route/ });

/** Where a man is drawn on the glass. */
const onGlass = (man: Locator) =>
  man.evaluate((node) => {
    const matrix = (node as SVGGElement).getScreenCTM()!;
    const centre = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: centre.x, y: centre.y };
  });

async function pickZ(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  const at = await onGlass(page.locator('[aria-label="Z offense player"]'));
  await page.mouse.click(at.x, at.y);
  await expect(inspector(page).locator(".player-heading")).toBeVisible();
}

/** The drawn line's path data, which changes when the line is redrawn. */
const shapeOf = (line: Locator) =>
  line.locator("path[data-scene-path]").first().getAttribute("d");

test("a new alternate route offers the quick routes in its own panel", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  await page.keyboard.press("Control+Shift+f");
  const browser = page.getByRole("dialog", { name: "Formations" });
  await expect(browser).toBeVisible();
  await browser.getByText("Gun Doubles Right", { exact: true }).click();
  await expect(browser).toBeHidden();

  const panel = inspector(page);
  await pickZ(page);
  await panel.getByRole("button", { name: "Slant", exact: true }).click();
  await expect(zRoutes(page)).toHaveCount(1);
  const slant = await shapeOf(zRoutes(page).first());

  await panel.getByRole("button", { name: "+ Alternate route" }).click();
  await expect(zRoutes(page)).toHaveCount(2);
  await expect(
    panel.getByRole("group", { name: "Z — Alternate 1" }),
  ).toBeVisible();

  // The quick routes are right there on the new alternate, as in his panel.
  await expect(panel.getByText("Quick routes", { exact: true })).toBeVisible();
  const curl = panel.getByRole("button", { name: "Curl", exact: true });
  const before = await shapeOf(zRoutes(page).nth(1));
  await curl.click();

  // The alternate is redrawn and named the curl; the panel stays on it.
  await expect(curl).toHaveAttribute("aria-pressed", "true");
  await expect(
    panel.getByRole("group", { name: "Z — Alternate 1" }),
  ).toBeVisible();
  await expect.poll(() => shapeOf(zRoutes(page).nth(1))).not.toBe(before);
  // His slant is left as it was.
  expect(await shapeOf(zRoutes(page).first())).toBe(slant);
  await panel.screenshot({
    path: testInfo.outputPath("alternate-quick-routes.png"),
  });

  // His own panel lists both: the slant and the curl he could run instead.
  await pickZ(page);
  await expect(
    panel.getByRole("combobox", { name: "Quick call for Route" }),
  ).toHaveValue("slant");
  await expect(
    panel.getByRole("combobox", { name: "Quick call for Alternate 1" }),
  ).toHaveValue("curl");
  await field(page).screenshot({
    path: testInfo.outputPath("slant-and-curl-alternate.png"),
  });
});
