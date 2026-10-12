import { type Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Select and Hand at the head of the rail (ADR 0078). Select is the standing
 * mode: a drag on the grass draws a box. Hand moves the field under the
 * pointer from anywhere — a man, a route, a picked route's handle — and edits
 * nothing, so the selection and the inspector it opened stay as they were.
 * V puts Select back. The field moved under the Hand, the route still picked,
 * and the rail beside it are the artifacts.
 */

const rail = (page: Page) =>
  page.getByRole("navigation", { name: "Drawing tools" });
const field = (page: Page) => page.locator("svg.field-diagram").first();

const cameraOf = async (page: Page) => {
  const [x, y, width, height] = (
    (await field(page).getAttribute("viewBox")) ?? ""
  )
    .split(" ")
    .map(Number);
  return { x: x!, y: y!, width: width!, height: height! };
};

async function onGlass(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
}

/** Half way along a route, in client pixels, through the camera as it is now. */
async function alongRoute(page: Page, id: string) {
  return page.locator(`[data-scene-path="${id}"]`).evaluate((element) => {
    const path = element as unknown as SVGPathElement;
    const point = path.getPointAtLength(path.getTotalLength() / 2);
    const matrix = path.getScreenCTM()!;
    const glass = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: glass.x, y: glass.y };
  });
}

async function pathD(page: Page, id: string) {
  return page.locator(`[data-scene-path="${id}"]`).getAttribute("d");
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, {
    steps: 4,
  });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

test("Hand moves the field from a man or a handle and leaves the route picked; V puts Select back", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  const select = rail(page).getByRole("button", {
    name: "Select — V",
    exact: true,
  });
  const hand = rail(page).getByRole("button", { name: "Hand", exact: true });
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await expect(hand).toHaveAttribute("aria-pressed", "false");

  // The X's route, picked, with its handles out and its panel open.
  const route = await alongRoute(page, "rx");
  await page.mouse.click(route.x, route.y);
  await expect(page.locator(".label-heading").getByText("Route")).toBeVisible();
  const handles = page.locator("circle.handle-target");
  await expect(handles.first()).toBeVisible();
  const before = await pathD(page, "rx");

  await page.keyboard.press("Control+Equal");
  await page.keyboard.press("Control+Equal");
  const zoomed = await cameraOf(page);
  expect(zoomed.width).toBeLessThan(1000);

  // Hand: a drag that starts on the route's own handle moves the field and
  // not the break.
  await hand.click();
  await expect(hand).toHaveAttribute("aria-pressed", "true");
  await expect(select).toHaveAttribute("aria-pressed", "false");
  const grip = await onGlass(page, "circle.handle-target");
  await drag(page, grip, { x: grip.x + 120, y: grip.y + 80 });
  await expect
    .poll(async () => (await cameraOf(page)).x)
    .toBeLessThan(zoomed.x);
  const moved = await cameraOf(page);
  expect(moved.y).toBeLessThan(zoomed.y);
  expect(await pathD(page, "rx")).toBe(before);

  // And from a man, who stays where he stands.
  const qTransform = await page
    .locator('[data-scene-player="q"]')
    .getAttribute("transform");
  const q = await onGlass(page, '[data-scene-player="q"]');
  await drag(page, q, { x: q.x - 60, y: q.y });
  await expect
    .poll(async () => (await cameraOf(page)).x)
    .toBeGreaterThan(moved.x);
  await expect(page.locator('[data-scene-player="q"]')).toHaveAttribute(
    "transform",
    qTransform!,
  );

  // A double-click under the Hand adds no break to the picked route.
  const along = await alongRoute(page, "rx");
  await page.mouse.dblclick(along.x, along.y);
  expect(await pathD(page, "rx")).toBe(before);

  // Nothing was edited, and the route is still the one picked, its panel
  // still open.
  await expect(undo).toBeDisabled();
  await expect(page.locator(".label-heading").getByText("Route")).toBeVisible();

  await page.mouse.move(0, 0);
  await expect(page.locator(".toast")).toBeHidden({ timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath("hand-field.png") });
  await rail(page).screenshot({ path: testInfo.outputPath("hand-rail.png") });

  // V is Select again, and the grass draws a box once more.
  await page.keyboard.press("v");
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await expect(hand).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Control+0");
  const ends = await Promise.all(
    ["ol0", "ol4"].map((id) => onGlass(page, `[data-scene-player="${id}"]`)),
  );
  await drag(
    page,
    { x: ends[0]!.x - 20, y: ends[0]!.y - 24 },
    { x: ends[1]!.x + 20, y: ends[1]!.y + 24 },
  );
  await expect(page.locator("[data-scene-player].selected")).toHaveCount(5);
});
