import { type Page } from "@playwright/test";
import { expect, openBlankEditor, test } from "./fixtures";

/**
 * Every concept on every stock set (issue #162). A concept hands out its jobs
 * by alignment — #1, #2 and #3 from the sideline, strong side and weak — so
 * the same call has to draw real football from a 2×2, a 3×1, a bunch and two
 * tight ends. Each set is its own test: the Coach puts it on, draws each of
 * the ten concepts in turn, and the field is measured in the frame it is
 * drawn in. The field under every concept is the run's artifact.
 */

const FORMATIONS = [
  "Gun Doubles",
  "Gun Trips",
  "Gun Bunch",
  "Empty",
  "I-Form",
  "Gun Spread",
  "Gun Ace",
  "Strong",
  "Pistol Trips",
].flatMap((set) => [`${set} Right`, `${set} Left`]);

const CONCEPTS = [
  "Mesh",
  "Stick",
  "Smash",
  "Flood",
  "Dagger",
  "Drive",
  "Y-Cross",
  "Levels",
  "Spacing",
  "4 Verts",
];

/** The frame's scale and the line of scrimmage, as the editor draws them. */
const DEPTH_PX_PER_YARD = 12;
const LINE_OF_SCRIMMAGE_Y = 430;
const BALL_X = 500;

interface Point {
  readonly x: number;
  readonly y: number;
}
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
interface DrawnRoute {
  readonly id: string;
  readonly assignment: string;
  /** Points along the line every few frame pixels, stance to tip. */
  readonly line: readonly Point[];
  readonly label: Box;
}

/** Each route on the field, sampled along its length, with its words. */
async function readRoutes(page: Page): Promise<DrawnRoute[]> {
  return page.evaluate(() => {
    const groups = [
      ...document.querySelectorAll<SVGGElement>(
        "svg.field-diagram [data-scene-path-group]",
      ),
    ];
    return groups.flatMap((group) => {
      const id = group.getAttribute("data-scene-path-group")!;
      const text = group.querySelector<SVGTextElement>(
        `[data-scene-coaching="${id}-assignment"] text`,
      );
      if (!text) return [];
      const line: { x: number; y: number }[] = [];
      for (const stroke of group.querySelectorAll<SVGPathElement>(
        "[data-scene-path]",
      )) {
        const length = stroke.getTotalLength();
        const steps = Math.max(1, Math.ceil(length / 3));
        for (let step = 0; step <= steps; step += 1) {
          const { x, y } = stroke.getPointAtLength((length * step) / steps);
          line.push({ x, y });
        }
      }
      const { x, y, width, height } = text.getBBox();
      return [
        {
          id,
          assignment: text.textContent ?? "",
          line,
          label: { x, y, width, height },
        },
      ];
    });
  });
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const nearest = (point: Point, line: readonly Point[]) =>
  Math.min(...line.map((other) => distance(point, other)));
const tip = (route: DrawnRoute) => route.line.at(-1)!;
const stance = (route: DrawnRoute) => route.line[0]!;
const yardsDeep = (point: Point) =>
  (LINE_OF_SCRIMMAGE_Y - point.y) / DEPTH_PX_PER_YARD;
const sideOf = (route: DrawnRoute) => Math.sign(stance(route).x - BALL_X);

/** The heading of a line at one of its samples. */
function heading(line: readonly Point[], index: number): Point {
  const from = line[Math.max(0, index - 1)]!;
  const to = line[Math.min(line.length - 1, index + 1)]!;
  const length = distance(from, to) || 1;
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

/**
 * The longest run, in frame pixels, over which `route` sits within `gap` of
 * `other`, counting only where the two point `same` way if asked. Two lines
 * that cross share a few pixels; two drawn on top of each other, or side by
 * side a yard apart, share a long stretch.
 */
function sharedRun(
  route: DrawnRoute,
  other: DrawnRoute,
  gap: number,
  same: boolean,
): number {
  let run = 0;
  let longest = 0;
  for (const [index, point] of route.line.entries()) {
    // Men stand close in a bunch; their first steps are allowed to be too.
    if (distance(point, stance(route)) < 20) {
      run = 0;
      continue;
    }
    const closest = other.line.reduce(
      (best, candidate, at) =>
        distance(point, candidate) < best.distance
          ? { distance: distance(point, candidate), at }
          : best,
      { distance: Infinity, at: 0 },
    );
    const mine = heading(route.line, index);
    const theirs = heading(other.line, closest.at);
    const aligned = mine.x * theirs.x + mine.y * theirs.y > 0.97;
    run = closest.distance < gap && (!same || aligned) ? run + 3 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/** Whether two sampled lines cross anywhere. */
function cross(a: DrawnRoute, b: DrawnRoute): boolean {
  const turn = (p: Point, q: Point, r: Point) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  for (let i = 1; i < a.line.length; i += 1) {
    for (let j = 1; j < b.line.length; j += 1) {
      const [p, q, r, s] = [
        a.line[i - 1]!,
        a.line[i]!,
        b.line[j - 1]!,
        b.line[j]!,
      ];
      if (
        turn(p, q, r) * turn(p, q, s) < 0 &&
        turn(r, s, p) * turn(r, s, q) < 0
      )
        return true;
    }
  }
  return false;
}

/** What is wrong with the concept on the field, in words, or nothing. */
function problemsWith(
  concept: string,
  routes: readonly DrawnRoute[],
): string[] {
  const problems: string[] = [];
  const named = (a: DrawnRoute, b: DrawnRoute) =>
    `${a.assignment} and ${b.assignment}`;
  for (const [index, a] of routes.entries()) {
    for (const b of routes.slice(index + 1)) {
      if (distance(tip(a), tip(b)) < 40) {
        problems.push(`${named(a, b)} end on top of each other`);
      }
      if (overlaps(a.label, b.label)) {
        problems.push(`the ${named(a, b)} labels overlap`);
      }
    }
    for (const b of routes) {
      if (a === b) continue;
      if (nearest(tip(a), b.line) < 12) {
        problems.push(`${a.assignment} ends on the ${b.assignment} line`);
      }
      if (sharedRun(a, b, 6, false) >= 30) {
        problems.push(`${named(a, b)} run on top of each other`);
      }
      if (sharedRun(a, b, 14, true) >= 30) {
        problems.push(`${named(a, b)} run side by side, stacked`);
      }
    }
    if (
      ["GO", "SEAM", "FADE"].includes(a.assignment) &&
      yardsDeep(tip(a)) < 20
    ) {
      problems.push(
        `${a.assignment} stops ${yardsDeep(tip(a)).toFixed(0)} deep`,
      );
    }
  }

  const all = (assignment: string) =>
    routes.filter((route) => route.assignment === assignment);
  if (concept === "Mesh") {
    const [one, two] = all("SHALLOW");
    if (!one || !two) problems.push("mesh has no pair of shallows");
    else {
      if (sideOf(one) === sideOf(two)) {
        problems.push("the shallows come from the same side");
      }
      if (!cross(one, two)) problems.push("the shallows never cross");
      if (Math.abs(yardsDeep(tip(one)) - yardsDeep(tip(two))) < 1) {
        problems.push(
          "the shallows cross at one depth, not one over the other",
        );
      }
      for (const shallow of [one, two]) {
        const depth = yardsDeep(tip(shallow));
        if (depth < 4.5 || depth > 7)
          problems.push(`a shallow at ${depth} yards`);
      }
    }
  }
  if (concept === "Drive") {
    const [drive] = all("DRIVE");
    const [dig] = all("DIG");
    if (!drive || !dig) problems.push("drive has no shallow and dig");
    else {
      if (sideOf(drive) !== sideOf(dig)) {
        problems.push("the drive and the dig come from different sides");
      }
      if (yardsDeep(tip(dig)) - yardsDeep(tip(drive)) < 5) {
        problems.push("the dig is not over the drive");
      }
      if (
        Math.sign(tip(drive).x - stance(drive).x) !==
        Math.sign(tip(dig).x - stance(dig).x)
      ) {
        problems.push("the drive and the dig run at each other");
      }
    }
  }
  if (concept === "Levels") {
    const [dig] = all("DIG");
    const [inside] = all("IN");
    if (!dig || !inside) problems.push("levels has no dig and in");
    else {
      if (sideOf(dig) !== sideOf(inside)) {
        problems.push("the two ins come from different sides");
      }
      if (yardsDeep(tip(dig)) - yardsDeep(tip(inside)) < 5) {
        problems.push("the two ins are not at different levels");
      }
    }
  }
  return [...new Set(problems)];
}

async function putOnFormation(page: Page, name: string): Promise<void> {
  await page.getByTitle("Browse formations — ⇧⌘F").click();
  const browser = page.getByRole("dialog", { name: "Formations" });
  await browser.getByRole("textbox", { name: "Search formations" }).fill(name);
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
}

async function drawConcept(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /Concept ›/ }).click();
  const picker = page.getByRole("dialog", { name: "Concepts and line calls" });
  await picker
    .getByRole("button", {
      name: new RegExp(`^${name.replace(/[-]/g, "\\$&")} Concept`),
    })
    .first()
    .click();
  await expect(picker).toBeHidden();
  await expect(page.getByRole("status")).toContainText(name);
  await expect(page.getByRole("status")).toContainText("routes drawn");
  await expect(page.getByRole("button", { name: /Concept ›/ })).toContainText(
    name,
  );
}

test.describe("concepts drawn by alignment (issue #162)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The frame is measured the same everywhere; one engine draws the artifact.",
  );

  for (const formation of FORMATIONS) {
    test(`every concept draws clean football from ${formation}`, async ({
      page,
    }, testInfo) => {
      await openBlankEditor(page);
      await putOnFormation(page, formation);

      const found: Record<string, string[]> = {};
      for (const [index, concept] of CONCEPTS.entries()) {
        await drawConcept(page, concept);
        const routes = await readRoutes(page);
        // Everyone but the quarterback and the line is given a job.
        expect(routes, `${concept} from ${formation}`).toHaveLength(5);
        const problems = problemsWith(concept, routes);
        if (problems.length > 0) found[concept] = problems;

        await page
          .locator("svg.field-diagram")
          .first()
          .screenshot({
            path: testInfo.outputPath(
              `${String(index + 1).padStart(2, "0")}-${concept
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")}.png`,
            ),
          });
      }
      expect(found).toEqual({});
    });
  }
});
