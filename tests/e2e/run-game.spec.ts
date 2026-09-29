import { type Page } from "@playwright/test";
import { expect, openBlankEditor, test } from "./fixtures";

/**
 * Issue #164: the run game. On an I-Form Right power a pull goes right, the
 * fullback's kick-out heads upfield to the edge, a jet motion leads into the
 * sweep as one path, and a break aimed at a gap in the box lands in it
 * rather than behind a lineman. Each test ends with a screenshot of the
 * field, drawn from fixed data at a fixed viewport.
 */

test.use({ viewport: { width: 1440, height: 960 } });

/** Where the formation puts each man, in the frame the field is drawn in. */
const SPOT = {
  lg: { x: 464, y: 448 },
  c: { x: 500, y: 448 },
  rg: { x: 536, y: 448 },
  rt: { x: 572, y: 448 },
  f: { x: 500, y: 526 },
  y: { x: 618, y: 450 },
  z: { x: 870, y: 452 },
} as const;
const LOS_Y = 430;

type Point = { readonly x: number; readonly y: number };

const field = (page: Page) => page.locator("svg.field-diagram").first();
const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });

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

async function clickField(page: Page, point: Point): Promise<void> {
  const at = await onScreen(page, point);
  await page.mouse.click(at.x, at.y);
}

/** Picks the man standing on this spot. */
async function pick(page: Page, spot: Point): Promise<void> {
  await page.keyboard.press("Escape");
  await clickField(page, spot);
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

async function iFormRight(page: Page): Promise<void> {
  await openBlankEditor(page);
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  await page
    .getByRole("dialog", { name: "Formations" })
    .getByText("I-Form Right", { exact: true })
    .click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

test("pulls on a power right go right, and the fullback kicks out upfield", async ({
  page,
}, testInfo) => {
  await iFormRight(page);

  // The play side blocks down: centre, right guard, right tackle.
  for (const spot of [SPOT.c, SPOT.rg, SPOT.rt]) {
    await pick(page, spot);
    await inspector(page)
      .getByRole("button", { name: "Down", exact: true })
      .click();
  }

  // The backside guard pulls and wraps. He used to go left, away from the
  // play, and wrap outside his own tackle.
  await pick(page, SPOT.lg);
  await inspector(page)
    .getByRole("button", { name: "Pull — wrap", exact: true })
    .click();
  const wrap = await lineFrom(page, SPOT.lg);
  expect(wrap.at(-1)!.x).toBeGreaterThan(SPOT.rg.x);
  expect(wrap.at(-1)!.y).toBeLessThan(SPOT.lg.y);

  // The fullback's blocks are folded, and the summary says the pulls are
  // there before he is opened.
  await pick(page, SPOT.f);
  const summary = inspector(page).locator(
    '[data-disclosure="player-quick-blocks"] .disclosure-summary',
  );
  await expect(summary).toContainText("Pull — kick");
  await expect(summary).toContainText("Trap");
  await inspector(page)
    .getByRole("button", { name: /^Quick blocks/ })
    .click();
  await inspector(page)
    .getByRole("button", { name: "Pull — kick", exact: true })
    .click();

  // Upfield all the way — never back into the backfield — to just past the
  // ball, outside the tight end on the play side.
  const kick = await lineFrom(page, SPOT.f);
  for (let index = 1; index < kick.length; index += 1) {
    expect(kick[index]!.y).toBeLessThanOrEqual(kick[index - 1]!.y + 0.5);
  }
  expect(kick.at(-1)!.x).toBeGreaterThan(SPOT.y.x);
  expect(kick.at(-1)!.y).toBeLessThan(LOS_Y);

  await page.keyboard.press("Escape");
  await field(page).screenshot({
    path: testInfo.outputPath("power-right.png"),
  });
});

test("a jet motion leads into the sweep as one path", async ({
  page,
}, testInfo) => {
  await iFormRight(page);
  const motionEnd = { x: 560, y: 470 };
  const zId = await page
    .locator(`[data-scene-player][data-base-x="${SPOT.z.x}"]`)
    .getAttribute("data-scene-player");

  // Z comes in motion across the formation, behind the tight end.
  await pick(page, SPOT.z);
  await inspector(page)
    .getByRole("button", { name: /^Motion/ })
    .click();
  await clickField(page, { x: 700, y: 470 });
  await clickField(page, motionEnd);
  await page.keyboard.press("Enter");

  // The clock stays at rest: nobody greyed out, Z still at his stance.
  const slider = page
    .getByLabel("Playback controls")
    .getByRole("slider", { name: "Scrub the play" });
  const start = await slider.getAttribute("aria-valuemin");
  expect(Number(start)).toBeLessThan(0);
  await expect(slider).toHaveAttribute("aria-valuenow", start!);
  const faded = await page
    .locator("[data-scene-player]")
    .evaluateAll(
      (men) => men.filter((man) => man.getAttribute("opacity") !== "1").length,
    );
  expect(faded).toBe(0);

  // Then takes the handoff and sweeps left: the route sets out from where
  // the motion left him, not from his stance.
  await pick(page, SPOT.z);
  await inspector(page)
    .getByRole("button", { name: /^Route/ })
    .click();
  await clickField(page, { x: 400, y: 470 });
  await clickField(page, { x: 300, y: 380 });
  await page.keyboard.press("Enter");

  const sweep = (await lines(page)).filter(
    (points) => !near(points[0]!, SPOT.z),
  );
  expect(sweep).toHaveLength(1);
  expect(near(sweep[0]![0]!, motionEnd, 8)).toBe(true);
  expect(sweep[0]!.at(-1)!.x).toBeLessThan(320);

  // It is his route, not an alternate to his motion.
  await pick(page, SPOT.z);
  await expect(inspector(page).getByText(/^Motion ·/)).toBeVisible();
  await expect(inspector(page).getByText(/^Base stem ·/)).toBeVisible();
  await expect(inspector(page).getByText(/^Alternate/)).toHaveCount(0);

  // Played, he runs on from the end of his motion rather than going back to
  // where he lined up.
  await page.keyboard.press("Escape");
  await slider.focus();
  await page.keyboard.press("Home");
  const toSnap = -Number(start) / 100;
  for (let step = 0; step < toSnap + 3; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  const z = page.locator(`[data-scene-player="${zId}"]`);
  const moved = await z.getAttribute("transform");
  const [, x] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(moved ?? "") ?? [];
  expect(Number(x)).toBeLessThan(motionEnd.x + 1);
  expect(Number(x)).toBeGreaterThan(400);

  await page.keyboard.press("Home");
  await page.keyboard.press("Escape");
  await field(page).screenshot({ path: testInfo.outputPath("jet-sweep.png") });
});

test("a break in the box lands in the gap it is aimed at", async ({
  page,
}, testInfo) => {
  await iFormRight(page);

  // The backside guard's pull, drawn by hand with snap on: back off the
  // line, along behind it, and up through the B gap on the right.
  await pick(page, SPOT.lg);
  await inspector(page)
    .getByRole("button", { name: /^Block/ })
    .click();
  await clickField(page, { x: 470, y: 468 });
  await clickField(page, { x: 549, y: 468 });
  await clickField(page, { x: 551, y: 412 });
  await page.keyboard.press("Enter");

  // Midway between the right guard and the right tackle, not held to 45°
  // off the last break and not on either of them.
  const bGap = (SPOT.rg.x + SPOT.rt.x) / 2;
  const pull = await lineFrom(page, SPOT.lg);
  expect(pull).toHaveLength(4);
  expect(Math.abs(pull[2]!.x - bGap)).toBeLessThan(0.5);
  expect(Math.abs(pull[3]!.x - bGap)).toBeLessThan(0.5);
  expect(pull[2]!.y).toBeGreaterThan(SPOT.rg.y + 10);

  await page.keyboard.press("Escape");
  await field(page).screenshot({ path: testInfo.outputPath("box-gaps.png") });
});
