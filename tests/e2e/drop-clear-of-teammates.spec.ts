import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Nobody is dropped on a teammate. On the seeded Stick — Thunder, H is
 * dragged straight onto the left tackle and let go: while he is held over the
 * tackle he is already drawn beside him, and when he is let go he settles
 * there, every man's mark clear of every other's. A second drop wedges him
 * between the centre and the quarterback, and he comes out clear of both.
 * The field after the first drop is the run's artifact.
 */
test.use({ viewport: { width: 1440, height: 960 } });

/** Player symbols are 13 frame units in radius: two touch at 26. */
const TOUCHING = 26;

type Mark = { readonly id: string; readonly x: number; readonly y: number };

/** Every man on the field and where he is drawn, in frame units. */
async function everyone(page: Page): Promise<Mark[]> {
  return page.locator("[data-scene-player]").evaluateAll((men) =>
    men.map((man) => {
      const [, x, y] =
        /translate\(([-\d.]+)[ ,]+([-\d.]+)/.exec(
          man.getAttribute("transform") ?? "",
        ) ?? [];
      return {
        id: man.getAttribute("data-scene-player") ?? "",
        x: Number(x),
        y: Number(y),
      };
    }),
  );
}

/** Every pair of men drawn on top of each other. */
function overlapping(men: readonly Mark[]): string[] {
  const found: string[] = [];
  for (const [index, one] of men.entries()) {
    for (const other of men.slice(index + 1)) {
      const apart = Math.hypot(one.x - other.x, one.y - other.y);
      if (apart < TOUCHING - 0.01) {
        found.push(`${one.id} and ${other.id} ${apart.toFixed(1)} apart`);
      }
    }
  }
  return found;
}

const apart = (men: readonly Mark[], a: string, b: string) => {
  const one = men.find(({ id }) => id === a)!;
  const other = men.find(({ id }) => id === b)!;
  return Math.hypot(one.x - other.x, one.y - other.y);
};

/** Marks to a hundredth of a frame unit, past floating-point noise. */
const rounded = (men: readonly Mark[]) =>
  men.map(({ id, x, y }) => ({
    id,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
  }));

/**
 * Where a man is on screen, in page pixels: his frame position carried
 * through the field's viewBox to its box on the page, the way the other
 * field specs aim, since mobile WebKit's screen matrix cannot be trusted.
 */
async function onScreen(page: Page, id: string) {
  const field = page.locator("svg.field-diagram").first();
  const box = await field.boundingBox();
  if (!box) throw new Error("The field is not on screen.");
  const [viewX, viewY, viewWidth, viewHeight] = (
    (await field.getAttribute("viewBox")) ?? "0 0 1000 620"
  )
    .split(" ")
    .map(Number) as [number, number, number, number];
  const man = (await everyone(page)).find((mark) => mark.id === id);
  if (!man) throw new Error(`${id} is not on the field.`);
  return {
    x: box.x + ((man.x - viewX) / viewWidth) * box.width,
    y: box.y + ((man.y - viewY) / viewHeight) * box.height,
  };
}

/** Presses on one man and carries him onto another, still held. */
async function holdOver(page: Page, id: string, onto: string) {
  const from = await onScreen(page, id);
  const to = await onScreen(page, onto);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, {
    steps: 4,
  });
  await page.mouse.move(to.x, to.y, { steps: 4 });
}

test("a man dropped on a teammate settles beside him", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Stick — Thunder football play" }),
  ).toBeVisible();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  expect(overlapping(await everyone(page))).toEqual([]);

  // Held over the left tackle, H is already drawn beside him.
  // The drag is painted on the next frame, which WebKit can take a moment
  // to reach, so the held field is read once it has caught up.
  await holdOver(page, "h", "ol0");
  await expect
    .poll(async () => apart(await everyone(page), "h", "ol0"))
    .toBeLessThan(TOUCHING + 2);
  const held = await everyone(page);
  expect(overlapping(held)).toEqual([]);
  expect(apart(held, "h", "ol0")).toBeLessThan(TOUCHING + 2);

  // Let go, he stays where the drag showed him.
  await page.mouse.up();
  await expect
    .poll(async () => rounded(await everyone(page)))
    .toEqual(rounded(held));
  const dropped = await everyone(page);
  expect(overlapping(dropped)).toEqual([]);
  await expect(page.locator('[data-scene-player="h"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: testInfo.outputPath("h-beside-the-tackle.png") });

  // Undo puts him back where he lined up.
  const lined = await everyone(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(async () => apart(await everyone(page), "h", "ol0"))
    .toBeGreaterThan(apart(lined, "h", "ol0") + 1);

  // Wedged between the centre and the quarterback, he comes out clear of
  // both.
  await holdOver(page, "h", "q");
  const between = await onScreen(page, "ol2");
  const quarterback = await onScreen(page, "q");
  await page.mouse.move(
    (between.x + quarterback.x) / 2,
    (between.y + quarterback.y) / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => apart(await everyone(page), "h", "q"))
    .toBeLessThan(TOUCHING * 2);
  expect(overlapping(await everyone(page))).toEqual([]);
});
