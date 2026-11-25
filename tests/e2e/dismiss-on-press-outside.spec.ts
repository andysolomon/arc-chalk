import { type Locator, type Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * A panel that goes away on a press past it goes away on a press on a field
 * handle too. A handle keeps its press from the field, and a listener that
 * waited for the press to bubble up never heard it, so the panel stayed open
 * (#240). Each case picks a route to raise its handles, opens the panel,
 * presses the route's end handle, and saves the workspace as its artifact.
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

type Point = { x: number; y: number };
const length = ([from, to]: readonly [Point, Point]) =>
  Math.hypot(to.x - from.x, to.y - from.y);

/**
 * Picks a route with a press on the middle of its longest leg, which raises
 * its handles, and returns its end handle.
 */
async function selectRoute(page: Page, id: string): Promise<Locator> {
  const d = await page.locator(`[data-scene-path="${id}"]`).getAttribute("d");
  const numbers = (d?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const points: Point[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push({ x: numbers[index]!, y: numbers[index + 1]! });
  }
  const legs = points
    .slice(1)
    .map((end, index) => [points[index]!, end] as const);
  const [from, to] = legs.reduce((longest, leg) =>
    length(leg) > length(longest) ? leg : longest,
  );
  const middle = await fieldPoint(
    page,
    (from.x + to.x) / 2,
    (from.y + to.y) / 2,
  );
  await page.mouse.click(middle.x, middle.y);
  const handles = page.locator("[data-node-handle]");
  await expect(handles).toHaveCount(points.length);
  return handles.last();
}

/**
 * A locator click lands only where the handle is the topmost thing under
 * the pointer, so the press reaches the handle and not the panel over it.
 */
async function expectClosedByHandle(handle: Locator, panel: Locator) {
  await expect(panel).toBeVisible();
  await handle.click();
  await expect(panel).toBeHidden();
  await expect(handle).toBeVisible();
}

async function saveWorkspace(page: Page, path: string) {
  await page.locator(".workspace").screenshot({ path });
}

test.describe("a desktop", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("the header's More menu closes on a press on a field handle", async ({
    page,
  }, testInfo) => {
    await openSeededEditor(page);
    const handle = await selectRoute(page, "rx");
    await page
      .getByRole("banner")
      .getByRole("button", { name: "More actions", exact: true })
      .click();
    await expectClosedByHandle(handle, page.locator(".more-panel"));
    await saveWorkspace(page, testInfo.outputPath("more-closed.png"));
  });

  test("a sidebar popover closes on a press on a field handle", async ({
    page,
  }, testInfo) => {
    await openSeededEditor(page);
    const handle = await selectRoute(page, "rz");
    await page
      .getByRole("navigation", { name: "Sidebar" })
      .locator('.sidebar-row-wrap[data-row="ball"] > .sidebar-row')
      .click();
    await expectClosedByHandle(handle, page.locator(".sidebar-popover"));
    await saveWorkspace(page, testInfo.outputPath("popover-closed.png"));
  });
});

test.describe("a tablet", () => {
  test.use({
    viewport: { width: 834, height: 1194 },
    hasTouch: true,
    isMobile: true,
  });

  test("the inspector's drawer closes on a press on a field handle", async ({
    page,
  }, testInfo) => {
    await openSeededEditor(page);
    const handle = await selectRoute(page, "rx");
    await page.getByRole("button", { name: "Inspector", exact: true }).click();
    await expectClosedByHandle(
      handle,
      page.getByRole("complementary", { name: "Play inspector" }),
    );
    await saveWorkspace(page, testInfo.outputPath("drawer-closed.png"));
  });
});
