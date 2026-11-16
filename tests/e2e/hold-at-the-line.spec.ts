import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Nobody on offense crosses the ball. A man dragged toward the defense stops
 * at the line of scrimmage while the pointer is still going, and he stays
 * where the drag held him when it lets go. He does not run past the line and
 * jump back to it on release.
 */

const field = (page: Page) => page.locator("svg.field-diagram").first();

async function openEditor(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

/** Where a man is drawn, in the field's own frame. */
async function playerAt(
  page: Page,
  id: string,
): Promise<{ x: number; y: number }> {
  const transform = await page
    .locator(`[data-scene-player="${id}"]`)
    .getAttribute("transform");
  const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform ?? "");
  if (!match) throw new Error(`Player ${id} has no position.`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

/** A point in the field's frame, on screen. */
async function toClient(
  page: Page,
  point: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  const element = field(page);
  const box = await element.boundingBox();
  if (!box) throw new Error("The field is not on screen.");
  const [viewX, viewY, viewWidth, viewHeight] = (
    (await element.getAttribute("viewBox")) ?? "0 0 1000 620"
  )
    .split(" ")
    .map(Number) as [number, number, number, number];
  return {
    x: box.x + ((point.x - viewX) / viewWidth) * box.width,
    y: box.y + ((point.y - viewY) / viewHeight) * box.height,
  };
}

/**
 * The part of the field's frame on screen. Drags are measured in it, not in
 * client pixels, because each device draws the frame at its own scale.
 */
async function visibleFrame(
  page: Page,
): Promise<{ top: number; bottom: number }> {
  const [, viewY, , viewHeight] = (
    (await field(page).getAttribute("viewBox")) ?? "0 0 1000 620"
  )
    .split(" ")
    .map(Number) as [number, number, number, number];
  return { top: viewY, bottom: viewY + viewHeight };
}

async function lineOfScrimmageY(page: Page): Promise<number> {
  return Number(
    await page.locator("line.line-of-scrimmage").first().getAttribute("y1"),
  );
}

test("a man dragged at the defense stops at the line while the drag is still going", async ({
  page,
}, testInfo) => {
  await openEditor(page);
  const line = await lineOfScrimmageY(page);
  const frame = await visibleFrame(page);
  const before = await playerAt(page, "x");
  const start = await toClient(page, before);
  // Well past the line, and still on screen.
  const deep = Math.max(frame.top + 20, line - 150);
  const halfway = await toClient(page, {
    x: before.x + 30,
    y: (before.y + deep) / 2,
  });
  const end = await toClient(page, { x: before.x + 60, y: deep });

  // Drag X a long way downfield and a little to the right, holding the press.
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(halfway.x, halfway.y, { steps: 6 });
  await page.mouse.move(end.x, end.y, { steps: 6 });

  const held = await playerAt(page, "x");
  // Mid-drag he is still on his side of the ball. The field draws downfield
  // as a smaller y.
  expect(held.y).toBeGreaterThanOrEqual(line);
  // The hold only stops him going forward. He still slides along the line
  // with the pointer.
  expect(held.x).toBeGreaterThan(before.x + 20);
  // The status bar names no man over the line mid-drag.
  await expect(page.getByText(/over the line of scrimmage/)).toHaveCount(0);

  await field(page).screenshot({
    path: testInfo.outputPath("held-at-the-line.png"),
  });

  await page.mouse.up();

  // Letting go leaves him where the drag held him, with no jump back.
  const after = await playerAt(page, "x");
  expect(after.x).toBeCloseTo(held.x, 3);
  expect(after.y).toBeCloseTo(held.y, 3);
  await expect(page.getByRole("button", { name: "Undo" })).toHaveAttribute(
    "title",
    "Undo Move Player",
  );
});

test("a man already behind the line still comes back freely", async ({
  page,
}) => {
  await openEditor(page);
  const frame = await visibleFrame(page);
  const before = await playerAt(page, "x");
  const start = await toClient(page, before);
  const end = await toClient(page, {
    x: before.x,
    y: Math.min(frame.bottom - 20, before.y + 60),
  });

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  const mid = await playerAt(page, "x");
  await page.mouse.up();

  expect(mid.y).toBeGreaterThan(before.y + 20);
  const after = await playerAt(page, "x");
  expect(after.y).toBeCloseTo(mid.y, 3);
});
