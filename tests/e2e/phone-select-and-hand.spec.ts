import { type Page } from "@playwright/test";

import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Select and Hand on a phone (ADR 0079). The tool row under the field is
 * full, so the pair floats over the field's lower left, clear of the sheet's
 * peek and the map. The field opens on Select, and one finger dragged across
 * open grass draws a box that picks up every man in it — the only way a
 * phone has to pick several at once. Hand turns the same finger into the
 * field's: it moves the view from anywhere, a man included, and leaves the
 * selection and the Play as they were. Both buttons are a finger's 44 px and
 * on the glass at every width the phone specs walk. The field with the line
 * picked out, moved under the Hand, is the run's artifact.
 */

const VIEWPORTS = [
  { name: "360", width: 360, height: 780 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
] as const;

const field = (page: Page) => page.locator("svg.field-diagram").first();
const picked = (page: Page) => page.locator("[data-scene-player].selected");
const LINE = ["ol0", "ol1", "ol2", "ol3", "ol4"] as const;

const cameraOf = async (page: Page) => {
  const [x, y, width, height] = (
    (await field(page).getAttribute("viewBox")) ?? ""
  )
    .split(" ")
    .map(Number);
  return { x: x!, y: y!, width: width!, height: height! };
};

/** Where a man is drawn, in client pixels, through the camera as it is now. */
async function manOnGlass(page: Page, id: string) {
  const box = await page
    .locator(`[data-scene-player="${id}"]`)
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
  return box;
}

/** Where every man stands in the frame, which a pan never changes. */
const stances = (page: Page) =>
  page
    .locator("[data-scene-player]")
    .evaluateAll((men) => men.map((man) => man.getAttribute("transform")));

/** Where a man stands in the frame, which a pan never changes. */
async function manInFrame(page: Page, id: string) {
  const transform = await page
    .locator(`[data-scene-player="${id}"]`)
    .getAttribute("transform");
  const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform ?? "");
  if (!match) throw new Error(`${id} has no position.`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

/**
 * One finger pressed, dragged and lifted. The press goes to whatever is under
 * it — a handle's target included — and the rest to the field, which holds
 * the gesture once it starts.
 */
async function fingerDrag(
  page: Page,
  pointerId: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const send = (type: string, at: { x: number; y: number }, under: boolean) =>
    page.evaluate(
      ({ type, at, under, pointerId }) => {
        const target = under
          ? document.elementFromPoint(at.x, at.y)
          : document.querySelector("svg.field-diagram");
        if (!target) throw new Error("Nothing under the finger.");
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId,
            pointerType: "touch",
            isPrimary: true,
            button: type === "pointermove" ? -1 : 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: at.x,
            clientY: at.y,
          }),
        );
      },
      { type, at, under, pointerId },
    );
  await send("pointerdown", from, true);
  for (let step = 1; step <= 6; step += 1) {
    await send(
      "pointermove",
      {
        x: from.x + ((to.x - from.x) * step) / 6,
        y: from.y + ((to.y - from.y) * step) / 6,
      },
      false,
    );
  }
  await send("pointerup", to, false);
}

for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });

    test("Select boxes in the line under one finger, and Hand moves the field from anywhere", async ({
      page,
    }, testInfo) => {
      await openSeededEditor(page);
      await expect(page.locator(".chalk-shell.phone-workspace")).toBeVisible();
      const tools = page.getByRole("navigation", { name: "Drawing tools" });
      const pointer = page.getByRole("group", { name: "Pointer" });
      const select = pointer.getByRole("button", {
        name: "Select — V",
        exact: true,
      });
      const hand = pointer.getByRole("button", { name: "Hand", exact: true });

      // The pair is the field's, not the tool row's: the row keeps its six
      // and the trash at its far end stays on the glass.
      await expect(pointer).toHaveCount(1);
      await expect(tools.getByRole("group", { name: "Pointer" })).toHaveCount(
        0,
      );
      const trash = (await tools
        .getByRole("button", { name: "Delete selection — ⌫" })
        .boundingBox())!;
      expect(trash.x + trash.width).toBeLessThanOrEqual(viewport.width);
      // Each is a finger's 44 px, on the glass, above the sheet's peek and
      // clear of the map in the other corner.
      const peek = (await page.locator('[data-sheet="peek"]').boundingBox())!;
      for (const button of [select, hand]) {
        const box = (await button.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(peek.y);
      }
      const pill = (await pointer.boundingBox())!;
      const map = (await page.locator(".minimap").boundingBox())!;
      expect(pill.x + pill.width).toBeLessThan(map.x);
      await expect(select).toHaveAttribute("aria-pressed", "true");
      await expect(hand).toHaveAttribute("aria-pressed", "false");

      // Under Select a finger on the grass draws a box. It starts a finger's
      // reach clear of the line, above its left end, and stops just under
      // the linemen, short of the quarterback a step behind the snap: it
      // takes in the five men on the line and nobody else.
      const line = await Promise.all(LINE.map((id) => manOnGlass(page, id)));
      const left = Math.min(...line.map(({ x }) => x));
      const right = Math.max(...line.map(({ x }) => x));
      const level = line[0]!.y;
      const looking = await cameraOf(page);
      await fingerDrag(
        page,
        1,
        { x: left - 12, y: level - 26 },
        { x: right + 12, y: level + 4 },
      );
      await expect(picked(page)).toHaveCount(5);
      for (const id of LINE) {
        await expect(page.locator(`[data-scene-player="${id}"]`)).toHaveClass(
          /selected/,
        );
      }
      // The view stayed where it was: the box is not a pan.
      expect(await cameraOf(page)).toEqual(looking);
      await expect(
        page.getByRole("toolbar", { name: "Selected player actions" }),
      ).toContainText("5 players selected");

      // Zoomed in, so there is somewhere for the field to go.
      await page.getByRole("button", { name: "Zoom in" }).tap();
      await page.getByRole("button", { name: "Zoom in" }).tap();
      await expect
        .poll(async () => (await cameraOf(page)).width)
        .toBeLessThan(looking.width);
      const zoomed = await cameraOf(page);

      // Hand: the same finger, pressed on a man, moves the field and not
      // him, and the five stay picked.
      await hand.tap();
      await expect(hand).toHaveAttribute("aria-pressed", "true");
      await expect(select).toHaveAttribute("aria-pressed", "false");
      const qBefore = await manInFrame(page, "q");
      const standing = await stances(page);
      const q = await manOnGlass(page, "q");
      await fingerDrag(page, 2, q, { x: q.x + 70, y: q.y - 50 });
      await expect
        .poll(async () => (await cameraOf(page)).x)
        .toBeLessThan(zoomed.x);
      const moved = await cameraOf(page);
      expect(moved.y).toBeGreaterThan(zoomed.y);
      expect(await stances(page)).toEqual(standing);
      await expect(picked(page)).toHaveCount(5);

      // A tap under the Hand is nothing: it neither picks the man under it
      // nor puts the five down.
      const under = await manOnGlass(page, "q");
      await fingerDrag(page, 3, under, under);
      await expect(picked(page)).toHaveCount(5);
      await expect(page.locator('[data-scene-player="q"]')).not.toHaveClass(
        /selected/,
      );

      // The artifact: the line picked out, the field moved under the Hand.
      await expect(page.locator(".toast")).toBeHidden({ timeout: 10_000 });
      await page.screenshot({
        path: testInfo.outputPath(`phone-select-and-hand-${viewport.name}.png`),
      });

      // Back on Select, a finger on a man picks him up again, and a tap on
      // the grass puts everything down.
      await select.tap();
      await expect(select).toHaveAttribute("aria-pressed", "true");
      const qNow = await manOnGlass(page, "q");
      await fingerDrag(page, 4, qNow, { x: qNow.x + 30, y: qNow.y });
      await expect
        .poll(async () => (await manInFrame(page, "q")).x)
        .toBeGreaterThan(qBefore.x);
      expect(await cameraOf(page)).toEqual(moved);
      const end = await manOnGlass(page, "ol0");
      const grass = { x: end.x - 12, y: end.y - 40 };
      await fingerDrag(page, 5, grass, grass);
      await expect(picked(page)).toHaveCount(0);
    });
  });
}
