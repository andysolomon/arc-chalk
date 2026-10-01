import { type Locator, type Page } from "@playwright/test";
import { expect, openBlankEditor, test } from "./fixtures";

/**
 * A quarterback is offered a quarterback's calls. Picking him used to offer
 * the receivers' route tree — Go, Slant, Corner — and a back's blocks, none
 * of which is what a quarterback does. Now he gets drops, play action, the
 * boot and the sprint-out, the handoff, the zone read, the sneak and the
 * draw, each drawn from where he takes the snap. Each test ends with a
 * screenshot of the field, drawn from fixed data at a fixed viewport.
 */

test.use({ viewport: { width: 1440, height: 960 } });

/** Where the formations put each man, in the frame the field is drawn in. */
const SPOT = {
  qUnder: { x: 500, y: 478 },
  qGun: { x: 500, y: 504 },
  lt: { x: 428, y: 448 },
  y: { x: 618, y: 450 },
  xIForm: { x: 130, y: 452 },
} as const;
const LOS_Y = 430;
/** Twelve frame pixels to a yard of depth. */
const YARD_Y = 12;

const QUARTERBACK_CALLS = [
  "3-step drop",
  "5-step drop",
  "7-step drop",
  "Play action",
  "Boot left",
  "Boot right",
  "Sprint out left",
  "Sprint out right",
  "Handoff",
  "Zone read",
  "QB sneak",
  "QB draw",
] as const;
const ROUTE_TREE = ["Go", "Slant", "Hitch", "Curl", "Post", "Wheel"] as const;

type Point = { readonly x: number; readonly y: number };

const field = (page: Page) => page.locator("svg.field-diagram").first();
const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });
const callButton = (scope: Locator, name: string) =>
  scope.getByRole("button", { name, exact: true });

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

/** Mirror off the More menu: the man picked and his lines, or the whole Play. */
async function mirror(page: Page): Promise<void> {
  await page.getByTitle("More actions").click();
  await page.getByRole("button", { name: "Mirror", exact: true }).click();
}

async function formation(page: Page, name: string): Promise<void> {
  await openBlankEditor(page);
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  await page
    .getByRole("dialog", { name: "Formations" })
    .getByText(name, { exact: true })
    .click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

test("a quarterback under center is offered drops, fakes and runs, not routes", async ({
  page,
}, testInfo) => {
  await formation(page, "I-Form Right");
  await pick(page, SPOT.qUnder);
  const panel = inspector(page);

  // His own calls, and none of the receivers' tree or a back's blocks.
  await expect(panel.getByText("Assignments", { exact: true })).toBeVisible();
  for (const name of QUARTERBACK_CALLS) {
    await expect(callButton(panel, name)).toBeVisible();
  }
  for (const name of ROUTE_TREE) {
    await expect(callButton(panel, name)).toHaveCount(0);
  }
  await expect(
    panel.getByRole("button", { name: /^Quick blocks/ }),
  ).toHaveCount(0);

  // A five-step drop from under center goes straight back three and a half
  // yards.
  await callButton(panel, "5-step drop").click();
  const drop = await lineFrom(page, SPOT.qUnder);
  expect(drop).toHaveLength(2);
  expect(Math.abs(drop[1]!.x - SPOT.qUnder.x)).toBeLessThan(1);
  expect(Math.abs(drop[1]!.y - (SPOT.qUnder.y + 3.5 * YARD_Y))).toBeLessThan(1);
  await expect(
    page.getByRole("img", { name: "Q route: 5-step drop" }),
  ).toHaveCount(1);
  await expect(callButton(panel, "5-step drop")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // His line's quick call offers his calls too.
  const select = panel.getByRole("combobox", { name: /^Quick call for/ });
  await expect(select.locator("option", { hasText: "Boot right" })).toHaveCount(
    1,
  );
  await expect(select.locator("option", { hasText: "Slant" })).toHaveCount(0);

  // A boot right fakes left first, then gets outside the tight end, still
  // behind the line, so he can throw on the move.
  await callButton(panel, "Boot right").click();
  const boot = await lineFrom(page, SPOT.qUnder);
  expect(boot[1]!.x).toBeLessThan(SPOT.qUnder.x);
  expect(boot.at(-1)!.x).toBeGreaterThan(SPOT.y.x);
  expect(boot.at(-1)!.y).toBeGreaterThan(LOS_Y);
  await expect(
    page.getByRole("img", { name: "Q route: Boot right" }),
  ).toHaveCount(1);

  // Turned over, it is a boot left, named and lit as one; turned back, a
  // boot right again.
  const flip = panel.getByRole("button", { name: "Flip his assignments" });
  await flip.click();
  const flipped = await lineFrom(page, SPOT.qUnder);
  expect(flipped.at(-1)!.x).toBeLessThan(SPOT.lt.x);
  await expect(
    page.getByRole("img", { name: "Q route: Boot left" }),
  ).toHaveCount(1);
  await expect(callButton(panel, "Boot left")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await flip.click();
  await expect(
    page.getByRole("img", { name: "Q route: Boot right" }),
  ).toHaveCount(1);

  // The roster says what he is doing.
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Q: Boot right — Quarterback" }),
  ).toBeVisible();

  // Mirroring the whole Play turns it into a boot left too, and mirroring
  // it back makes it a boot right again.
  await mirror(page);
  await expect(
    page.getByRole("img", { name: "Q route: Boot left" }),
  ).toHaveCount(1);
  await mirror(page);
  await expect(
    page.getByRole("img", { name: "Q route: Boot right" }),
  ).toHaveCount(1);

  // A receiver still runs the route tree.
  await pick(page, SPOT.xIForm);
  await expect(callButton(panel, "Slant")).toBeVisible();
  await expect(callButton(panel, "5-step drop")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await field(page).screenshot({
    path: testInfo.outputPath("iform-boot-right.png"),
  });
});

test("a call's own name turns over with it, and the Coach's words stay his", async ({
  page,
}, testInfo) => {
  await formation(page, "I-Form Right");
  await pick(page, SPOT.qUnder);
  const panel = inspector(page);
  const named = (words: string) =>
    page.getByRole("img", { name: `Q route: ${words}` });
  const nameHisLine = async (words: string) => {
    await panel.getByRole("button", { name: "Edit" }).first().click();
    const assignment = panel.getByRole("textbox", { name: "Assignment" });
    await assignment.fill(words);
    await assignment.blur();
    await expect(named(words)).toHaveCount(1);
    await pick(page, SPOT.qUnder);
  };

  // His boot, named for its call the way a concept names its routes.
  await callButton(panel, "Boot right").click();
  await nameHisLine("BOOT RIGHT");

  // Flipped, the name goes over with it rather than reading right over a
  // boot going left …
  await panel.getByRole("button", { name: "Flip his assignments" }).click();
  await expect(named("BOOT LEFT")).toHaveCount(1);
  await expect(named("BOOT RIGHT")).toHaveCount(0);

  // … and it is still the call's own, so the next call renames it instead
  // of keeping it as though the Coach had written it.
  await callButton(panel, "5-step drop").click();
  await expect(named("5-STEP DROP")).toHaveCount(1);
  await expect(page.getByRole("img", { name: /^Q route: BOOT/ })).toHaveCount(
    0,
  );

  // Mirrored with him picked, then with the whole Play, the same.
  await callButton(panel, "Boot right").click();
  await expect(named("BOOT RIGHT")).toHaveCount(1);
  await mirror(page);
  await expect(named("BOOT LEFT")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await mirror(page);
  await expect(named("BOOT RIGHT")).toHaveCount(1);

  // The Coach's own words stand when the line is turned over; only the
  // call under them changes sides.
  await pick(page, SPOT.qUnder);
  await nameHisLine("Roll and throw");
  await panel.getByRole("button", { name: "Flip his assignments" }).click();
  await expect(named("Roll and throw")).toHaveCount(1);
  await expect(callButton(panel, "Boot left")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.keyboard.press("Escape");
  await field(page).screenshot({
    path: testInfo.outputPath("boot-named-and-turned.png"),
  });
});

test("from the gun a drop is shorter, and a read keeps away from the mesh", async ({
  page,
}, testInfo) => {
  await formation(page, "Gun Doubles Right");
  await pick(page, SPOT.qGun);
  const panel = inspector(page);

  // He is already deep, so a drop is shorter than the same call under
  // center: a five-step drop is two and a half yards, not three and a half.
  const dropYards = async (name: string) => {
    await callButton(panel, name).click();
    const line = await lineFrom(page, SPOT.qGun);
    expect(line).toHaveLength(2);
    expect(Math.abs(line[1]!.x - SPOT.qGun.x)).toBeLessThan(1);
    return (line[1]!.y - SPOT.qGun.y) / YARD_Y;
  };
  expect(Math.abs((await dropYards("3-step drop")) - 1.75)).toBeLessThan(0.1);
  expect(Math.abs((await dropYards("5-step drop")) - 2.5)).toBeLessThan(0.1);

  // The back is offset to his right, so he hands off to the right …
  await callButton(panel, "Handoff").click();
  const handoff = await lineFrom(page, SPOT.qGun);
  expect(handoff.at(-1)!.x).toBeGreaterThan(SPOT.qGun.x);

  // … and on a zone read keeps it the other way, outside the left tackle
  // and past the line.
  await callButton(panel, "Zone read").click();
  const read = await lineFrom(page, SPOT.qGun);
  for (const point of read.slice(1)) {
    expect(point.x).toBeLessThan(SPOT.qGun.x);
  }
  expect(read.at(-1)!.x).toBeLessThan(SPOT.lt.x);
  expect(read.at(-1)!.y).toBeLessThan(LOS_Y);
  await expect(
    page.getByRole("img", { name: "Q route: Zone read" }),
  ).toHaveCount(1);

  await page.keyboard.press("Escape");
  await field(page).screenshot({
    path: testInfo.outputPath("gun-zone-read.png"),
  });
});
