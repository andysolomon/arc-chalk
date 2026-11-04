import { type Page } from "@playwright/test";

import { expect, openBlankEditor, test } from "./fixtures";

/**
 * ADR 0081: a screen is a call. Screen is on the route tree a back, a
 * receiver and a tight end are offered, drawn back behind the line and out.
 * A lineman is offered Screen release among his blocks: he sets, then runs
 * out to the screen side. Screen is a line call too: the play-side men and
 * the centre release, the backside pair pass set, and the side follows the
 * screen route — a back's or a receiver's on the line — so moving the
 * screen moves the blocking. Each test ends with a screenshot of the field,
 * drawn from fixed data at a fixed viewport.
 */

test.use({ viewport: { width: 1440, height: 960 } });

/** Where Gun Doubles Right puts each man, in the frame the field is drawn in. */
const SPOT = {
  lt: { x: 428, y: 448 },
  lg: { x: 464, y: 448 },
  c: { x: 500, y: 448 },
  rg: { x: 536, y: 448 },
  rt: { x: 572, y: 448 },
  f: { x: 556, y: 504 },
  x: { x: 130, y: 452 },
} as const;
const LOS_Y = 430;
/** Four yards across, in the frame: a release has to get at least this far out. */
const WIDE = 70;

type Point = { readonly x: number; readonly y: number };

const field = (page: Page) => page.locator("svg.field-diagram").first();
const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });
const call = (page: Page, name: string) =>
  inspector(page).getByRole("button", { name, exact: true });

/** Frame coordinates to client coordinates, through the camera. */
async function onScreen(page: Page, point: Point): Promise<Point> {
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

/** Picks the man standing on this spot. */
async function pick(page: Page, spot: Point): Promise<void> {
  await page.keyboard.press("Escape");
  const at = await onScreen(page, spot);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator(".player-heading")).toBeVisible();
}

/** Every break of every line on the field, in the frame's coordinates. */
async function lines(page: Page): Promise<Point[][]> {
  return page.locator("[data-scene-path-group]").evaluateAll((groups) =>
    groups.map((group) => {
      const numbers = [...group.querySelectorAll("path[data-scene-path]")]
        .flatMap(
          (path) =>
            (path.getAttribute("d") ?? "").match(/-?\d+(?:\.\d+)?/g) ?? [],
        )
        .map(Number);
      const points: { x: number; y: number }[] = [];
      for (let index = 0; index + 1 < numbers.length; index += 2) {
        points.push({ x: numbers[index]!, y: numbers[index + 1]! });
      }
      return points;
    }),
  );
}

const near = (a: Point, b: Point, within = 1.5): boolean =>
  Math.abs(a.x - b.x) <= within && Math.abs(a.y - b.y) <= within;

/** The one line that sets out from this spot. */
async function lineFrom(page: Page, spot: Point): Promise<Point[]> {
  const found = (await lines(page)).filter((points) => near(points[0]!, spot));
  expect(found).toHaveLength(1);
  return found[0]!;
}

/** The whole-line call, picked from the catalogue off the play's own panel. */
async function lineCall(page: Page, name: RegExp): Promise<void> {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Line call ›/ }).click();
  const picker = page.getByRole("dialog", { name: "Concepts and line calls" });
  // A call just given is listed under Recent as well; either row will do.
  await picker.getByRole("button", { name }).first().click();
  await expect(picker).toBeHidden();
}

/** The linemen's blocks on the field; a block is told apart by its shape. */
const blocks = (page: Page) =>
  page.getByRole("img", { name: "offense player block" });

/** A release sets back off his stance first, then gets wide and past the line. */
function expectRelease(line: Point[], from: Point, side: 1 | -1): void {
  expect(line[1]!.y).toBeGreaterThan(from.y);
  expect((line.at(-1)!.x - from.x) * side).toBeGreaterThan(WIDE);
  expect(line.at(-1)!.y).toBeLessThan(LOS_Y);
}

/** A pass set goes straight back and nowhere across. */
function expectPassSet(line: Point[], from: Point): void {
  expect(Math.abs(line.at(-1)!.x - from.x)).toBeLessThan(2);
  expect(line.at(-1)!.y).toBeGreaterThan(from.y);
}

async function gunDoublesRight(page: Page): Promise<void> {
  await openBlankEditor(page);
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  await page
    .getByRole("dialog", { name: "Formations" })
    .getByText("Gun Doubles Right", { exact: true })
    .click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

test("a back's screen goes back and out, a lineman releases to it, and the line blocks it as a call", async ({
  page,
}, testInfo) => {
  await gunDoublesRight(page);

  // The back is offered Screen with the rest of the tree. It is drawn from
  // his spot, back behind where he stood and out to his side.
  await pick(page, SPOT.f);
  await call(page, "Screen").click();
  await expect(page.getByRole("img", { name: "F route: Screen" })).toHaveCount(
    1,
  );
  await expect(call(page, "Screen")).toHaveAttribute("aria-pressed", "true");
  const screen = await lineFrom(page, SPOT.f);
  expect(screen.at(-1)!.x).toBeGreaterThan(SPOT.f.x + WIDE);
  expect(screen.at(-1)!.y).toBeGreaterThan(SPOT.f.y);

  // The right tackle is offered Screen release among his blocks: he sets,
  // then runs out to the screen side and past the line.
  await pick(page, SPOT.rt);
  await call(page, "Screen release").click();
  await expect(blocks(page)).toHaveCount(1);
  expectRelease(await lineFrom(page, SPOT.rt), SPOT.rt, 1);

  // Screen as a line call: the centre and the play side release, the
  // backside pair pass set, and the summary names it.
  await lineCall(page, /^Screen/);
  await expect(blocks(page)).toHaveCount(5);
  expectRelease(await lineFrom(page, SPOT.c), SPOT.c, 1);
  expectRelease(await lineFrom(page, SPOT.rg), SPOT.rg, 1);
  expectRelease(await lineFrom(page, SPOT.rt), SPOT.rt, 1);
  expectPassSet(await lineFrom(page, SPOT.lg), SPOT.lg);
  expectPassSet(await lineFrom(page, SPOT.lt), SPOT.lt);
  await expect(page.getByRole("button", { name: /Line call ›/ })).toContainText(
    "Screen",
  );

  await page.keyboard.press("Escape");
  await expect(page.locator(".toast")).toHaveCount(0);
  await field(page).screenshot({
    path: testInfo.outputPath("screen-right.png"),
  });
});

test("the line's screen follows a receiver's screen, and comes off again", async ({
  page,
}, testInfo) => {
  await gunDoublesRight(page);

  // The split end on the left runs the screen. He stands on the line, where
  // a route says nothing about a run — but a screen is where the ball goes.
  await pick(page, SPOT.x);
  await call(page, "Screen").click();
  await expect(page.getByRole("img", { name: "X route: Screen" })).toHaveCount(
    1,
  );
  const screen = await lineFrom(page, SPOT.x);
  expect(screen.at(-1)!.x).toBeLessThan(SPOT.x.x - WIDE);

  await lineCall(page, /^Screen/);
  await expect(blocks(page)).toHaveCount(5);
  expectRelease(await lineFrom(page, SPOT.lt), SPOT.lt, -1);
  expectRelease(await lineFrom(page, SPOT.lg), SPOT.lg, -1);
  expectRelease(await lineFrom(page, SPOT.c), SPOT.c, -1);
  expectPassSet(await lineFrom(page, SPOT.rg), SPOT.rg);
  expectPassSet(await lineFrom(page, SPOT.rt), SPOT.rt);

  await page.keyboard.press("Escape");
  await expect(page.locator(".toast")).toHaveCount(0);
  await field(page).screenshot({
    path: testInfo.outputPath("screen-left.png"),
  });

  // Picked again, the call comes off the whole line.
  await lineCall(page, /^Screen/);
  await expect(blocks(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Line call ›/ })).toContainText(
    "No line call yet",
  );
});
