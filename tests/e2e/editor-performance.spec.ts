import { expect, test, type Page } from "@playwright/test";

/**
 * Plan item 4.6: editor interaction sustains 60 FPS and p95 input-to-paint
 * below 50 ms on target devices. Chromium at 1440×960 stands in for a
 * five-year-old laptop; WebKit at the iPad project stands in for a
 * ninth-generation iPad. Shared CI runners are several times slower, so
 * there they guard against gross regressions the way the 50 ms local-save
 * budget already does.
 */

const INPUT_TO_PAINT_BUDGET_MS = 50;
const FRAME_BUDGET_MS = 1000 / 60 + 1;
const MOVE_STEPS = 24;

const inputToPaintCeilingMs = process.env.CI ? 400 : INPUT_TO_PAINT_BUDGET_MS;
const frameCeilingMs = process.env.CI ? 133 : FRAME_BUDGET_MS;

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 620;

const field = (page: Page) => page.locator("svg.field-diagram").first();

async function fieldPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const element = field(page);
  const box = await element.boundingBox();
  if (!box) throw new Error("The field is not on screen.");
  const [viewX, viewY, viewWidth, viewHeight] = (
    (await element.getAttribute("viewBox")) ??
    `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`
  )
    .split(" ")
    .map(Number) as [number, number, number, number];
  return {
    x: box.x + ((x - viewX) / viewWidth) * box.width,
    y: box.y + ((y - viewY) / viewHeight) * box.height,
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

async function openEditor(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

test("dragging a Player holds frame-rate and input-to-paint budgets", async ({
  page,
}) => {
  await openEditor(page);

  const diagram = field(page);
  const start = await playerCenter(page, "x");
  const before = await page
    .locator('[data-scene-player="x"]')
    .getAttribute("transform");
  const commitsBefore = Number(
    await diagram.getAttribute("data-react-commits"),
  );

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= MOVE_STEPS; step += 1) {
    await page.mouse.move(start.x + step * 4, start.y - step * 2);
  }
  await page.mouse.up();

  await expect(page.locator('[data-scene-player="x"]')).not.toHaveAttribute(
    "transform",
    before!,
  );
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();

  const commitsAfter = Number(await diagram.getAttribute("data-react-commits"));
  const commitDelta = commitsAfter - commitsBefore;
  // A React commit per pointermove would grow with MOVE_STEPS. The live
  // paint path holds the committed scene still and patches SVG instead.
  expect(commitDelta).toBeGreaterThan(0);
  expect(commitDelta).toBeLessThan(10);
  expect(commitDelta).toBeLessThan(MOVE_STEPS);

  const frames = Number(await diagram.getAttribute("data-paint-frames"));
  const fps = Number(await diagram.getAttribute("data-fps"));
  const frameP95 = Number(await diagram.getAttribute("data-frame-p95-ms"));
  const inputP95 = Number(
    await diagram.getAttribute("data-input-to-paint-p95-ms"),
  );
  expect(frames).toBeGreaterThan(0);
  expect(fps).toBeGreaterThan(0);
  expect(frameP95).toBeGreaterThan(0);
  expect(inputP95).toBeGreaterThan(0);

  // Classification is always against the Coach-device budget, the way local
  // save reports data-save-within-budget against 50 ms even on CI.
  await expect(diagram).toHaveAttribute(
    "data-input-to-paint-within-budget",
    String(inputP95 <= INPUT_TO_PAINT_BUDGET_MS),
  );
  await expect(diagram).toHaveAttribute(
    "data-frame-within-budget",
    String(frameP95 <= FRAME_BUDGET_MS),
  );

  expect(inputP95).toBeLessThan(inputToPaintCeilingMs);
  expect(frameP95).toBeLessThan(frameCeilingMs);
});
