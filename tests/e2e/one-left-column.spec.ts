import { type Locator, type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * A desktop has one left column. The drawing tools head the sidebar, rather
 * than standing in a rail beside it; folding the sidebar (its ‹, or ⌥3)
 * leaves the tools as a narrow rail whose › opens the sidebar again. Neither
 * state shows a second column or a stub beside the first. The open column
 * and the folded rail are the artifacts.
 */

const tools = (page: Page) =>
  page.getByRole("navigation", { name: "Drawing tools" });
const sidebar = (page: Page) =>
  page.getByRole("navigation", { name: "Sidebar" });

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

  // Folded: the sidebar goes, the tools stay as the one narrow rail.
  await sidebar(page).getByRole("button", { name: "Hide the sidebar" }).click();
  await expect(sidebar(page)).toBeHidden();
  await expect(tools(page)).toBeVisible();
  await expect(page.locator(".sidebar-stub, .rail-stub")).toHaveCount(0);
  const rail = await box(tools(page));
  expect(rail.width).toBeLessThan(80);
  expect((await box(page.locator(".editor-stage"))).x).toBeCloseTo(
    rail.x + rail.width,
    0,
  );
  await tools(page).screenshot({
    path: testInfo.outputPath("folded-rail.png"),
  });

  // Its › opens the sidebar again, with the tools back at its head.
  await tools(page).getByRole("button", { name: "Show the sidebar" }).click();
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
