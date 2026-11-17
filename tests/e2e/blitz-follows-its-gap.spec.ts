import type { Locator, Page } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";
import { assignmentButton, selectPlayers } from "./defense-helpers";

/**
 * A blitz names its gap, so it keeps going there wherever the man is moved.
 * On the seeded Stick — Thunder, the 4-3 is put on without its lines and the
 * Mike is sent through the A gap. Dragged out and back off the ball, his line
 * is redrawn from where he now stands to the same A gap; undo puts him and
 * his line back. And when the guard beside the gap is moved instead, the gap
 * moves with him, and so does the line sent through it. The field after each
 * drag is the run's artifact.
 */
test.use({ viewport: { width: 1440, height: 960 } });

async function spotOf(man: Locator): Promise<{ x: number; y: number }> {
  const [, x, y] =
    /translate\(([-\d.]+)[ ,]+([-\d.]+)/.exec(
      (await man.getAttribute("transform")) ?? "",
    ) ?? [];
  return { x: Number(x), y: Number(y) };
}

/** Where the Mike's blitz ends, in frame units: the last point of its stroke. */
async function blitzEnd(page: Page) {
  const d =
    (await page
      .locator('[aria-label^="M blitz"] path[d]')
      .first()
      .getAttribute("d")) ?? "";
  const numbers = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(([n]) => Number(n));
  return {
    x: Math.round(numbers.at(-2)! * 10) / 10,
    y: Math.round(numbers.at(-1)! * 10) / 10,
  };
}

/** A frame position carried to page pixels through the field's viewBox. */
async function onScreen(page: Page, at: { x: number; y: number }) {
  const field = page.locator("svg.field-diagram").first();
  const box = await field.boundingBox();
  if (!box) throw new Error("The field is not on screen.");
  const [viewX, viewY, viewWidth, viewHeight] = (
    (await field.getAttribute("viewBox")) ?? "0 0 1000 620"
  )
    .split(" ")
    .map(Number) as [number, number, number, number];
  return {
    x: box.x + ((at.x - viewX) / viewWidth) * box.width,
    y: box.y + ((at.y - viewY) / viewHeight) * box.height,
  };
}

/** Presses on a man and lets go of him `by` frame units away. */
async function dragBy(page: Page, man: Locator, by: { x: number; y: number }) {
  const from = await spotOf(man);
  const start = await onScreen(page, from);
  const end = await onScreen(page, { x: from.x + by.x, y: from.y + by.y });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, {
    steps: 4,
  });
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
}

/** The seeded play with the 4-3 on it, the Mike sent through the A gap. */
async function mikeThroughTheAGap(page: Page) {
  await openSeededEditor(page);
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  const toggle = browser.getByRole("button", { name: "With assignments" });
  if ((await toggle.getAttribute("aria-pressed")) !== "false") {
    await toggle.click();
  }
  await browser
    .getByRole("textbox", { name: "Search defenses" })
    .fill("4-3 Cover 3");
  await browser.getByText("4-3 Cover 3", { exact: true }).click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);

  const mike = page.locator('[aria-label="M defense player"]');
  await mike.click({ force: true });
  const aGap = await assignmentButton(page, "A gap");
  await aGap.click();
  await expect(aGap).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  return { mike, gap: await blitzEnd(page), stood: await spotOf(mike) };
}

test("a man sent through the A gap still goes through it after he is moved", async ({
  page,
}, testInfo) => {
  const { mike, gap, stood } = await mikeThroughTheAGap(page);

  // Out toward the sideline and back off the ball, on the same side of it:
  // he has moved, and his line still ends in the same A gap.
  const side = gap.x >= stood.x ? 1 : -1;
  await dragBy(page, mike, { x: side * 60, y: -40 });
  await expect.poll(async () => (await spotOf(mike)).x).not.toBe(stood.x);
  await expect.poll(() => blitzEnd(page)).toEqual(gap);
  // And it is still the A gap he is running.
  await mike.click({ force: true });
  await expect(await assignmentButton(page, "A gap")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: testInfo.outputPath("mike-moved-still-a-gap.png") });

  // Undo is one step: he and his line go back together.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => spotOf(mike)).toEqual(stood);
  await expect.poll(() => blitzEnd(page)).toEqual(gap);
});

test("the A gap moves with the guard beside it, and so does the blitz through it", async ({
  page,
}, testInfo) => {
  const { mike, gap, stood } = await mikeThroughTheAGap(page);
  const center = await spotOf(page.locator('[data-scene-player="ol2"]'));
  const side = gap.x >= center.x ? 1 : -1;
  const guard = side > 0 ? "ol3" : "ol1";
  const tackle = side > 0 ? "ol4" : "ol0";

  // The guard and the tackle outside him step out together, so nobody lands
  // on anybody: the A gap, half way from the ball to the guard, goes half as
  // far.
  await selectPlayers(page, [guard, tackle]);
  await dragBy(page, page.locator(`[data-scene-player="${guard}"]`), {
    x: side * 20,
    y: 0,
  });
  await expect
    .poll(async () => (await blitzEnd(page)).x)
    .toBeCloseTo(gap.x + side * 10, 0);
  expect((await blitzEnd(page)).y).toBe(gap.y);
  // The Mike himself stayed where he was.
  expect(await spotOf(mike)).toEqual(stood);
  await page.keyboard.press("Escape");
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: testInfo.outputPath("guard-moved-a-gap-follows.png") });

  // One undo puts the line and its gap back.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => blitzEnd(page)).toEqual(gap);
});
