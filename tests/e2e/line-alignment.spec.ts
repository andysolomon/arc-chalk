import { type Page } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Lining a formation up (ADR 0073), on the Stick — Thunder starter. A man
 * dragged near the line stays level with it; a tackle dragged back out lands
 * the split his guards keep, measured where the Coach can see it; a receiver
 * a step off the line is off it, and the count of men on the line says so as
 * he goes; a fifth back is called illegal until a man goes back on; and ⌘ or
 * Ctrl held through a drag puts a man exactly where the pointer does.
 *
 * Positions are read in the frame the field is drawn in — 448 is the line
 * the starter's linemen stand on, 460 a yard under it. Each test ends with a
 * screenshot of the field at a fixed viewport, so a rerun on the same commit
 * draws the same picture.
 */

const LINE_Y = 448;
const OFF_THE_LINE_Y = 460;

const field = (page: Page) => page.locator("svg.field-diagram").first();

/** Frame coordinates to client pixels, through the camera on screen. */
async function fieldPoint(
  page: Page,
  x: number,
  y: number,
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
    x: box.x + ((x - viewX) / viewWidth) * box.width,
    y: box.y + ((y - viewY) / viewHeight) * box.height,
  };
}

async function manAt(
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

/** Presses a man and carries him to a frame point, still held. */
async function pickUp(
  page: Page,
  id: string,
  to: { x: number; y: number },
  options: { free?: boolean } = {},
): Promise<void> {
  const from = await manAt(page, id);
  const start = await fieldPoint(page, from.x, from.y);
  const end = await fieldPoint(page, to.x, to.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  if (options.free) await page.keyboard.down("Control");
  await page.mouse.move(end.x, end.y, { steps: 8 });
}

async function putDown(page: Page, options: { free?: boolean } = {}) {
  await page.mouse.up();
  if (options.free) await page.keyboard.up("Control");
}

const guide = (page: Page, source: string) =>
  page.locator(`[data-snap-source="${source}"]`);
const chip = (page: Page) => page.locator("[data-line-count]");
const readout = (page: Page) => page.locator("[data-move-readout]");

test("keeps a lineman level with the line and puts him back at his split", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  const tackle = await manAt(page, "ol4");
  expect(tackle.y).toBe(LINE_Y);

  // Dragged out and a little low, he is held on the line — not on the
  // yard mark half a yard under it — and every lineman is marked with him.
  await pickUp(page, "ol4", { x: tackle.x + 10, y: LINE_Y + 3 });
  await expect(guide(page, "line")).toHaveAttribute(
    "data-snap-label",
    "On the line",
  );
  await expect(guide(page, "line").locator("[data-guide-member]")).toHaveCount(
    5,
  );
  await expect(readout(page)).toContainText("on the line");
  await putDown(page);
  expect((await manAt(page, "ol4")).y).toBe(LINE_Y);

  // Brought back in, he finds the split the rest of the line keeps: each
  // of the four splits is measured, and his own is numbered.
  await pickUp(page, "ol4", { x: tackle.x + 2, y: LINE_Y });
  await expect(guide(page, "equal-spacing")).toHaveAttribute(
    "data-snap-label",
    "Same split as C to RG",
  );
  await expect(
    guide(page, "equal-spacing").locator("[data-guide-span]"),
  ).toHaveCount(4);
  await expect(
    guide(page, "equal-spacing").locator("[data-guide-split]"),
  ).toHaveText("2 yd");
  await field(page).screenshot({
    path: testInfo.outputPath("even-splits.png"),
  });
  await putDown(page);
  const back = await manAt(page, "ol4");
  expect(back.x).toBeCloseTo(tackle.x, 3);
  expect(back.y).toBe(LINE_Y);
});

test("counts the line as receivers come off it and calls a fifth back illegal", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  const status = page.locator("[data-line-status]");
  // The starter has X, Y and Z on the line with the five linemen.
  await expect(status).toHaveText("LINE 8 · BACKS 3");
  await expect(chip(page)).toHaveCount(0);

  // Z a step off the line: the count rides beside the field while he moves.
  const z = await manAt(page, "z");
  await pickUp(page, "z", { x: z.x - 4, y: OFF_THE_LINE_Y + 3 });
  await expect(guide(page, "line")).toHaveAttribute(
    "data-snap-label",
    "Off the line",
  );
  await expect(readout(page)).toContainText("off the line");
  await expect(chip(page)).toHaveAttribute("data-line-count", "legal");
  await expect(chip(page)).toContainText("7 on the line · 4 backs");
  await putDown(page);
  expect((await manAt(page, "z")).y).toBe(OFF_THE_LINE_Y);
  await expect(status).toHaveText("LINE 7 · BACKS 4");
  // A legal set at rest says nothing over the field.
  await expect(chip(page)).toHaveCount(0);

  // X off too, level with Z: five backs is an illegal formation, and it
  // stays called until somebody goes back on.
  const x = await manAt(page, "x");
  await pickUp(page, "x", { x: x.x - 4, y: OFF_THE_LINE_Y + 3 });
  await expect(guide(page, "alignment")).toHaveAttribute(
    "data-snap-label",
    "Same depth as Z",
  );
  await putDown(page);
  expect((await manAt(page, "x")).y).toBe(OFF_THE_LINE_Y);
  await expect(chip(page)).toHaveAttribute("data-line-count", "illegal");
  await expect(chip(page)).toContainText("6 on the line · 5 backs");
  await expect(chip(page)).toContainText(
    "Illegal formation — needs 7 on the line",
  );
  await expect(status).toHaveText("LINE 6 · BACKS 5");
  await page
    .locator(".field-wrap")
    .screenshot({ path: testInfo.outputPath("illegal-formation.png") });

  const offX = await manAt(page, "x");
  await pickUp(page, "x", { x: offX.x, y: LINE_Y + 2 });
  await putDown(page);
  expect((await manAt(page, "x")).y).toBe(LINE_Y);
  await expect(chip(page)).toHaveCount(0);
  await expect(status).toHaveText("LINE 7 · BACKS 4");
  await page
    .locator(".field-wrap")
    .screenshot({ path: testInfo.outputPath("seven-on-the-line.png") });
});

test("places a man exactly where the pointer does with ⌘ or Ctrl held", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  const guard = await manAt(page, "ol3");

  // A guard in a two-point stance a hair deeper than the rest: held free,
  // nothing lines him up, and he stays where he was put.
  await pickUp(page, "ol3", { x: guard.x, y: LINE_Y + 4 }, { free: true });
  await expect(page.locator("[data-snap-source]")).toHaveCount(0);
  await putDown(page, { free: true });
  const placed = await manAt(page, "ol3");
  expect(placed.x).toBeCloseTo(guard.x, 0);
  expect(Math.abs(placed.y - (LINE_Y + 4))).toBeLessThan(1);
  await field(page).screenshot({
    path: testInfo.outputPath("guard-placed-freely.png"),
  });
});
