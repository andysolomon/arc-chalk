import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Lining a formation up on a phone (ADR 0073). Zoomed out to fit a phone,
 * eight pixels is nearly two yards of depth, so a line that pulled from that
 * far would drag every receiver back onto it: a finger has to be able to put
 * Z a step off the line and have him stay there. Taking X off too leaves five
 * backs, and the call that the formation is illegal has to be on the glass,
 * clear of the assignments sheet, until X goes back on. The phone with the
 * call showing is the run's artifact.
 */

const VIEWPORTS = [
  { name: "390×844", width: 390, height: 844 },
  { name: "844×390", width: 844, height: 390 },
];

/** 448 is the line the starter's linemen stand on, 460 a yard under it. */
const LINE_Y = 448;
const OFF_THE_LINE_Y = 460;

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

/** A point in the frame the field is drawn in, on the glass. */
const onGlass = (page: Page, at: { x: number; y: number }) =>
  page.evaluate((at) => {
    const svg = document.querySelector<SVGSVGElement>("svg.field-diagram");
    const matrix = svg?.getScreenCTM();
    if (!matrix) throw new Error("The field is not on screen.");
    const point = new DOMPoint(at.x, at.y).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }, at);

/** Where the field is on the glass, once it has stopped moving. */
async function settledField(page: Page): Promise<void> {
  let last = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const box = JSON.stringify(
      await page.locator("svg.field-diagram").boundingBox(),
    );
    if (box === last) return;
    last = box;
    await page.waitForTimeout(50);
  }
}

/**
 * One finger on a man, carried well clear of the tap slop and then to where
 * it is lifted — a drag the field holds from the first move. Picking a man
 * opens his tray under the field, which moves the field on the glass, so
 * where the finger goes is read after the press, from the field as it then
 * stands.
 */
async function fingerCarry(
  page: Page,
  id: string,
  to: { x: number; y: number },
): Promise<void> {
  const from = await onGlass(page, await manAt(page, id));
  const send = (type: string, at: { x: number; y: number }, under: boolean) =>
    page.evaluate(
      ({ type, at, under }) => {
        const target = under
          ? document.elementFromPoint(at.x, at.y)
          : document.querySelector("svg.field-diagram");
        if (!target) throw new Error("Nothing under the finger.");
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 7,
            pointerType: "touch",
            isPrimary: true,
            button: type === "pointermove" ? -1 : 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: at.x,
            clientY: at.y,
          }),
        );
      },
      { type, at, under },
    );
  await send("pointerdown", from, true);
  await settledField(page);
  const end = await onGlass(page, to);
  const clear = { x: from.x, y: from.y + 40 };
  for (let step = 1; step <= 4; step += 1) {
    await send(
      "pointermove",
      { x: from.x, y: from.y + (clear.y - from.y) * (step / 4) },
      false,
    );
  }
  for (let step = 1; step <= 4; step += 1) {
    await send(
      "pointermove",
      {
        x: clear.x + (end.x - clear.x) * (step / 4),
        y: clear.y + (end.y - clear.y) * (step / 4),
      },
      false,
    );
  }
  await send("pointerup", end, false);
}

for (const viewport of VIEWPORTS) {
  test.describe(`lining up on a phone at ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("puts a receiver a step off the line and calls a fifth back illegal", async ({
      page,
    }, testInfo) => {
      await page.goto("/");
      await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator("[data-scene-player]")).toHaveCount(11);
      const chip = page.locator("[data-line-count]");
      await expect(chip).toHaveCount(0);

      const z = await manAt(page, "z");
      await fingerCarry(page, "z", { x: z.x, y: OFF_THE_LINE_Y + 3 });
      expect((await manAt(page, "z")).y).toBe(OFF_THE_LINE_Y);
      await expect(chip).toHaveCount(0);

      const x = await manAt(page, "x");
      await fingerCarry(page, "x", { x: x.x, y: OFF_THE_LINE_Y + 3 });
      expect((await manAt(page, "x")).y).toBe(OFF_THE_LINE_Y);
      await expect(chip).toHaveAttribute("data-line-count", "illegal");
      await expect(chip).toContainText("6 on the line · 5 backs");

      // On the glass, inside the stage, and clear of the sheet's peek.
      const box = await chip.boundingBox();
      const stage = await page.locator(".field-wrap").boundingBox();
      expect(box).not.toBeNull();
      expect(stage).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(stage!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
      expect(box!.y).toBeGreaterThanOrEqual(stage!.y);
      const sheet = await page
        .getByRole("complementary", { name: "Play inspector" })
        .boundingBox();
      if (sheet && sheet.x < box!.x + box!.width) {
        expect(box!.y + box!.height).toBeLessThanOrEqual(sheet.y);
      }
      await page.screenshot({
        path: testInfo.outputPath(`illegal-formation-${viewport.name}.png`),
      });

      const offX = await manAt(page, "x");
      await fingerCarry(page, "x", { x: offX.x, y: LINE_Y + 2 });
      expect((await manAt(page, "x")).y).toBe(LINE_Y);
      await expect(chip).toHaveCount(0);
    });
  });
}
