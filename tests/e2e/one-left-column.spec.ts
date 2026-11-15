import { type Locator, type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * A desktop has one left column. The drawing tools head the sidebar, rather
 * than standing in a rail beside it; folding the sidebar (its ‹, or ⌥3)
 * leaves one narrow rail: the tools, then the sidebar's rows and foot as
 * icons that still open their controls, then a › that opens the sidebar
 * again. Neither state shows a second column or a stub beside the first. The
 * open column and the folded rail, with a control open, are the artifacts.
 */

const tools = (page: Page) =>
  page.getByRole("navigation", { name: "Drawing tools" });
const sidebar = (page: Page) =>
  page.getByRole("navigation", { name: "Sidebar", exact: true });
const folded = (page: Page) =>
  page.getByRole("navigation", { name: "Folded sidebar" });

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("no box");
  return rect;
}

test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 1180,
  "a docked sidebar needs a desktop's width",
);

test("the tools head the sidebar, and folding it leaves them as a rail", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openBlankEditor(page);

  // Open: the tools sit above This play, inside the sidebar's width, and
  // the field starts where the sidebar ends.
  await expect(tools(page)).toBeVisible();
  await expect(sidebar(page)).toBeVisible();
  const column = page.locator(".sidebar-column");
  await expect(column).toHaveCount(1);
  const columnBox = await box(column);
  const toolsBox = await box(tools(page));
  const sidebarBox = await box(sidebar(page));
  expect(toolsBox.x).toBeGreaterThanOrEqual(columnBox.x);
  expect(toolsBox.x + toolsBox.width).toBeLessThanOrEqual(
    columnBox.x + columnBox.width + 0.5,
  );
  expect(toolsBox.y + toolsBox.height).toBeLessThanOrEqual(sidebarBox.y + 0.5);
  const stage = await box(page.locator(".editor-stage"));
  expect(stage.x).toBeCloseTo(columnBox.x + columnBox.width, 0);
  await expect(page.locator(".sidebar-stub, .rail-stub")).toHaveCount(0);

  // The tools still work from there: Hand, then Select back.
  await tools(page).getByRole("button", { name: /^Hand/ }).click();
  await expect(
    tools(page).getByRole("button", { name: /^Hand/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await tools(page)
    .getByRole("button", { name: /^Select/ })
    .click();

  await column.screenshot({ path: testInfo.outputPath("left-column.png") });

  // Folded: the sidebar's rows go, and one narrow rail stays — the tools,
  // then every sidebar control as an icon under them.
  await sidebar(page).getByRole("button", { name: "Hide the sidebar" }).click();
  await expect(sidebar(page)).toBeHidden();
  await expect(tools(page)).toBeVisible();
  await expect(folded(page)).toBeVisible();
  await expect(page.locator(".sidebar-stub, .rail-stub")).toHaveCount(0);
  const railColumn = page.locator(".sidebar-rail-column");
  const rail = await box(railColumn);
  expect(rail.width).toBeLessThan(80);
  expect((await box(page.locator(".editor-stage"))).x).toBeCloseTo(
    rail.x + rail.width,
    0,
  );
  const toolsInRail = await box(tools(page));
  const iconsInRail = await box(folded(page));
  expect(toolsInRail.y + toolsInRail.height).toBeLessThanOrEqual(
    iconsInRail.y + 0.5,
  );
  for (const name of [
    /^Formation/,
    /^Ball on/,
    /^Show on field/,
    /^Library/,
    "Settings",
    "Help",
  ]) {
    await expect(folded(page).getByRole("button", { name })).toBeVisible();
  }

  // The icons still work: Show on field opens its control beside the rail,
  // and a layer hidden there shows in the icon's name.
  await folded(page)
    .getByRole("button", { name: "Show on field, All shown" })
    .click();
  const layers = folded(page).getByRole("group", { name: "Show on field" });
  await expect(layers).toBeVisible();
  expect((await box(layers)).x).toBeGreaterThanOrEqual(rail.x + rail.width);
  await layers.locator(".layer-toggles > button").first().click();
  await expect(
    folded(page).getByRole("button", { name: /^Show on field, \d+ of \d+$/ }),
  ).toBeVisible();
  await page.screenshot({
    clip: { x: 0, y: rail.y, width: 400, height: rail.height },
    path: testInfo.outputPath("folded-rail.png"),
  });

  // A tap on the field puts the control away; Help opens from the foot.
  await page.locator(".editor-stage").click({ position: { x: 600, y: 300 } });
  await expect(layers).toBeHidden();
  await folded(page).getByRole("button", { name: "Help" }).click();
  await expect(folded(page).getByRole("group", { name: "Help" })).toBeVisible();
  await folded(page).getByRole("button", { name: "Help" }).click();

  // Its › opens the sidebar again, with the tools back at its head.
  await folded(page).getByRole("button", { name: "Show the sidebar" }).click();
  await expect(folded(page)).toBeHidden();
  await expect(sidebar(page)).toBeVisible();
  await expect(page.locator(".sidebar-column")).toHaveCount(1);

  // ⌥2 hides the tools in either state; with both away one stub remains.
  await page.keyboard.press("Alt+Digit3");
  await expect(sidebar(page)).toBeHidden();
  await page.keyboard.press("Alt+Digit2");
  await expect(tools(page)).toBeHidden();
  await expect(page.locator(".sidebar-stub")).toHaveCount(1);
  await expect(page.locator(".rail-stub")).toHaveCount(0);
  await page.keyboard.press("Alt+Digit2");
  await page.keyboard.press("Alt+Digit3");
  await expect(tools(page)).toBeVisible();
  await expect(sidebar(page)).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("editor.png") });
});
