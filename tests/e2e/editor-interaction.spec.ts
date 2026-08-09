import { expect, test, type Page } from "@playwright/test";

/**
 * Drives real pointer gestures through the production field: the unified
 * input machine behind them must select like the original, commit exactly one
 * undoable transaction per completed gesture, and abandon a cancelled one.
 */

const VIEWBOX_WIDTH = 1068;
const VIEWBOX_HEIGHT = 525;

const field = (page: Page) => page.locator("svg.field-diagram").first();

/** Converts editor viewBox coordinates to client coordinates. */
async function fieldPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const box = await field(page).boundingBox();
  if (!box) throw new Error("The field is not on screen.");
  return {
    x: box.x + (x / VIEWBOX_WIDTH) * box.width,
    y: box.y + (y / VIEWBOX_HEIGHT) * box.height,
  };
}

async function playerCenter(
  page: Page,
  id: string,
): Promise<{ x: number; y: number }> {
  const transform = await page
    .locator(`[data-scene-player="${id}"]`)
    .getAttribute("transform");
  const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform ?? "");
  if (!match) throw new Error(`Player ${id} has no position.`);
  return fieldPoint(page, Number(match[1]), Number(match[2]));
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

async function openEditor(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

test("drags a Player and his route as one undoable step", async ({ page }) => {
  await openEditor(page);

  const before = await page
    .locator('[data-scene-player="x"]')
    .getAttribute("transform");
  const routeBefore = await page
    .locator('[data-scene-path="rx"]')
    .getAttribute("d");

  const start = await playerCenter(page, "x");
  await drag(page, start, { x: start.x + 50, y: start.y + 30 });

  await expect(page.locator('[data-scene-player="x"]')).not.toHaveAttribute(
    "transform",
    before!,
  );
  // The route came along with the man running it.
  await expect(page.locator('[data-scene-path="rx"]')).not.toHaveAttribute(
    "d",
    routeBefore!,
  );
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Move Player");
  await undo.click();
  await expect(page.locator('[data-scene-player="x"]')).toHaveAttribute(
    "transform",
    before!,
  );
  await expect(page.locator('[data-scene-path="rx"]')).toHaveAttribute(
    "d",
    routeBefore!,
  );
});

test("marquee selects the line and deletes it as one step", async ({
  page,
}) => {
  await openEditor(page);

  // A rectangle of empty grass around the five offensive linemen.
  await drag(
    page,
    await fieldPoint(page, 440, 400),
    await fieldPoint(page, 630, 432),
  );
  await expect(page.locator("[data-scene-player].selected")).toHaveCount(5);

  await page.keyboard.press("Backspace");
  await expect(page.locator("[data-scene-player]")).toHaveCount(6);

  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Delete Players");
  await undo.click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
});

test("Escape abandons a drag; arrows nudge as their keyboard alternative", async ({
  page,
}) => {
  await openEditor(page);

  const before = await page
    .locator('[data-scene-player="q"]')
    .getAttribute("transform");
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeDisabled();

  const start = await playerCenter(page, "q");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y - 40, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(page.locator('[data-scene-player="q"]')).toHaveAttribute(
    "transform",
    before!,
  );
  await expect(undo).toBeDisabled();

  // The keyboard route to the same move: select, then nudge.
  await page.mouse.click(start.x, start.y);
  await expect(page.locator('[data-scene-player="q"]')).toHaveClass("selected");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-scene-player="q"]')).not.toHaveAttribute(
    "transform",
    before!,
  );
  await expect(undo).toHaveAttribute("title", "Undo Move Player");
});

test("draws a route with the route tool and commits it once", async ({
  page,
}) => {
  await openEditor(page);
  await expect(page.locator("[data-scene-path]")).toHaveCount(6);

  await page.getByRole("button", { name: "Route — R" }).click();
  const start = await playerCenter(page, "q");

  // Start on the Quarterback, break downfield, then out. The preview is
  // measured by its path data: a straight vertical line has no bounding box,
  // so visibility would say "hidden" about a preview that is drawing fine.
  await page.mouse.click(start.x, start.y);
  const preview = page.locator("[data-drawing-preview]");
  await expect(preview).toHaveAttribute("d", "M 534 446 L 534 446");

  await page.mouse.move(start.x, start.y - 60);
  // Snap constrains the break to a 45 degree family member — here straight
  // downfield, so the preview keeps the Quarterback's lateral position.
  await expect(preview).toHaveAttribute("d", /^M 534 446 L 534 3\d\d/);
  await page.mouse.click(start.x, start.y - 60);
  await page.mouse.click(start.x + 70, start.y - 60);
  await page.keyboard.press("Enter");

  await expect(page.locator("[data-drawing-preview]")).toHaveCount(0);
  await expect(page.locator("[data-scene-path]")).toHaveCount(7);
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  // Finishing hands the select tool back, the way the original does.
  await expect(page.getByRole("button", { name: "Select — V" })).toHaveClass(
    /active/,
  );

  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Undo Draw route");
  await undo.click();
  await expect(page.locator("[data-scene-path]")).toHaveCount(6);
});

test("draws from the blue dot and abandons a route on Escape", async ({
  page,
}) => {
  await openEditor(page);

  // Selecting a Player offers his draw-a-route dot.
  const start = await playerCenter(page, "q");
  await page.mouse.click(start.x, start.y);
  const dot = page.locator('[data-route-dot="q"]');
  await expect(dot).toBeVisible();

  await dot.click();
  await expect(page.locator("[data-drawing-preview]")).toHaveCount(1);
  await page.mouse.move(start.x, start.y - 50);
  await page.mouse.click(start.x, start.y - 50);

  // Escape abandons it: no route, no transaction, nothing to undo.
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-drawing-preview]")).toHaveCount(0);
  await expect(page.locator("[data-scene-path]")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});
