import { type Locator, type Page, type TestInfo } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Where a defense's calls land (issue #165, ADR 0064), checked the way a
 * defensive coordinator reads a sheet: a Cover 3 with the $ in the curl/flat
 * rather than a fourth deep zone, a front that rushes and contains, a safety
 * rolled down to curl/flat depth, a backer sent through a named gap past the
 * line, a twist that takes the tackle and the end together, and a spy over
 * the quarterback. Every depth is read off the field as drawn, and the field
 * is saved at each stage as the run's artifact.
 */

/** A new defensive play, its roster in the inspector. */
async function newDefensivePlay(page: Page): Promise<void> {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "More actions" })
    .click();
  await page.getByRole("button", { name: /^New defensive play/ }).click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(0);
}

/** Puts a call on, with or without its own lines. */
async function putOnDefense(
  page: Page,
  name: string,
  withAssignments: boolean,
  players: number,
): Promise<void> {
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();
  const toggle = browser.getByRole("button", { name: "With assignments" });
  if ((await toggle.getAttribute("aria-pressed")) !== String(withAssignments)) {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-pressed", String(withAssignments));
  await browser.getByRole("textbox", { name: "Search defenses" }).fill(name);
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(players);
}

/** The defenders lettered `label`, left to right as they stand. */
async function defendersLettered(page: Page, label: string) {
  const men = page.locator(`[aria-label="${label} defense player"]`);
  const placed = await Promise.all(
    (await men.all()).map(async (man) => ({ man, ...(await spotOf(man)) })),
  );
  return placed.sort((left, right) => left.x - right.x).map(({ man }) => man);
}

async function spotOf(man: Locator): Promise<{ x: number; y: number }> {
  const [, x, y] =
    /translate\(([-\d.]+)[ ,]+([-\d.]+)/.exec(
      (await man.getAttribute("transform")) ?? "",
    ) ?? [];
  return { x: Number(x), y: Number(y) };
}

/** Selects a defender, then presses a call among his Quick assignments. */
async function call(page: Page, man: Locator, name: string): Promise<void> {
  await man.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  const grid = quickAssignments(page);
  const button = grid.getByRole("button", { name, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

const quickAssignments = (page: Page) =>
  page
    .locator(".section-heading", { hasText: "Quick assignments" })
    .locator("xpath=following-sibling::div[1]");

/** Reads the field's frame in yards off the line of scrimmage. */
async function yardsOf(page: Page) {
  const los = Number(
    await page.locator("line.line-of-scrimmage").first().getAttribute("y1"),
  );
  // Every call stands its ends two and a sixth yards off the ball.
  const [end] = await defendersLettered(page, "E");
  const perYard = (los - (await spotOf(end!)).y) / (26 / 12);
  return (y: number) => (los - y) / perYard;
}

interface Bubble {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

/** Every bubble in the lines matching `lines`, in frame units. */
async function bubblesOf(page: Page, lines = ""): Promise<Bubble[]> {
  const all = await page
    .locator(`${lines} [data-scene-coverage] ellipse[fill="none"]`)
    .evaluateAll((ellipses) =>
      ellipses.map((ellipse) => ({
        x: Number(ellipse.getAttribute("cx")),
        y: Number(ellipse.getAttribute("cy")),
        rx: Number(ellipse.getAttribute("rx")),
        ry: Number(ellipse.getAttribute("ry")),
      })),
    );
  return all.sort((left, right) => left.x - right.x);
}

/** Whether any two bubbles at overlapping depths overlap across the field. */
function stacked(bubbles: readonly Bubble[]): boolean {
  return bubbles.some((left, index) =>
    bubbles
      .slice(index + 1)
      .some(
        (right) =>
          Math.abs(left.y - right.y) < left.ry + right.ry &&
          Math.abs(left.x - right.x) < left.rx + right.rx - 0.5,
      ),
  );
}

/** Where a man's line ends, in frame units: the last point of its stroke. */
async function lineEnd(page: Page, label: string, kind: string) {
  const d =
    (await page
      .locator(`[aria-label^="${label} ${kind}"] path[d]`)
      .first()
      .getAttribute("d")) ?? "";
  const numbers = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(([n]) => Number(n));
  return { x: numbers.at(-2)!, y: numbers.at(-1)! };
}

const rosterRow = (page: Page, player: Locator) =>
  player
    .evaluate((node) => node.getAttribute("data-scene-player"))
    .then((id) => page.locator(`[data-roster-player="${id}"] .roster-summary`));

async function saveField(page: Page, info: TestInfo, name: string) {
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: info.outputPath(`${name}.png`) });
}

test("draws Cover 3 with the $ in the curl/flat and every lineman given a rush or contain", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await newDefensivePlay(page);
  await putOnDefense(page, "4-3 Cover 3", true, 11);

  // Three deep, not four: the $ is the strong curl/flat.
  await expect(page.locator('[aria-label$="deep zone"]')).toHaveCount(3);
  await expect(page.locator('[aria-label="$ curl zone"]')).toHaveCount(1);
  const yards = await yardsOf(page);
  const [dollar] = await bubblesOf(page, '[aria-label="$ curl zone"]');
  expect(yards(dollar!.y)).toBeGreaterThanOrEqual(9);
  expect(yards(dollar!.y)).toBeLessThanOrEqual(12);
  // Nobody's zone sits on anybody else's underneath.
  expect(stacked(await bubblesOf(page, '[aria-label$=" curl zone"]'))).toBe(
    false,
  );

  // The roster names every man's call, the front's included.
  const [$] = await defendersLettered(page, "$");
  await expect(await rosterRow(page, $!)).toHaveText("Curl / flat");
  const ends = await defendersLettered(page, "E");
  const tackles = await defendersLettered(page, "T");
  for (const end of ends) {
    await expect(await rosterRow(page, end)).toHaveText("Contain");
  }
  for (const tackle of tackles) {
    await expect(await rosterRow(page, tackle)).toHaveText("Rush");
  }
  await expect(page.locator(".roster-summary.empty")).toHaveCount(0);

  // And the $'s button reads pressed, because that is what he is running.
  await $!.click({ force: true });
  await expect(
    quickAssignments(page).getByRole("button", {
      name: "Curl / flat",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await saveField(page, testInfo, "1-4-3-cover-3");
});

test("brings a deep safety down to curl/flat depth and hands the deep field to the other", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await newDefensivePlay(page);
  await putOnDefense(page, "Nickel Cover 2", true, 11);
  const yards = await yardsOf(page);
  await expect(page.locator('[aria-label$="deep zone"]')).toHaveCount(2);

  const [safety] = await defendersLettered(page, "S");
  expect(yards((await spotOf(safety!)).y)).toBeGreaterThan(15);
  await call(page, safety!, "Curl / flat");

  // Ten yards or so, not the eighteen he stood at.
  const [bubble] = await bubblesOf(page, '[aria-label="S curl zone"]');
  expect(yards(bubble!.y)).toBeGreaterThanOrEqual(9);
  expect(yards(bubble!.y)).toBeLessThanOrEqual(12);
  // The free safety alone owns the deep middle, and nothing underneath stacks.
  await expect(page.locator('[aria-label$="deep zone"]')).toHaveCount(1);
  expect(stacked(await bubblesOf(page))).toBe(false);
  await saveField(page, testInfo, "1-safety-rolled-to-curl-flat");
});

test("sends a backer through a named gap past the line, games the front in pairs, and spies over the quarterback", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  // The seeded play's offense is where the gaps are read from.
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await putOnDefense(page, "4-3 Cover 3", false, 22);
  const yards = await yardsOf(page);

  // A gap: through it and on past the line of scrimmage.
  const [mike] = await defendersLettered(page, "M");
  await call(page, mike!, "A gap");
  const blitz = await lineEnd(page, "M", "blitz");
  expect(yards(blitz.y)).toBeLessThan(0);

  // A lineman is offered the front's own calls first, then the gaps.
  const ends = await defendersLettered(page, "E");
  const rightEnd = ends.at(-1)!;
  await rightEnd.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  const names = await quickAssignments(page)
    .getByRole("button")
    .allTextContents();
  expect(names.slice(0, 8)).toEqual([
    "Rush",
    "Contain",
    "Slant in",
    "Slant out",
    "T-E twist",
    "E-T twist",
    "Spill",
    "Squeeze",
  ]);
  expect(names).toContain("C gap");
  expect(names).not.toContain("Blitz");

  // A twist is played by two: the tackle beside him is given it too.
  await quickAssignments(page)
    .getByRole("button", { name: "T-E twist", exact: true })
    .click();
  const tackles = await defendersLettered(page, "T");
  await expect(page.locator('[aria-label^="E stunt"]')).toHaveCount(1);
  await expect(page.locator('[aria-label^="T stunt"]')).toHaveCount(1);
  // The tackle goes outside the end, who loops in behind him.
  const tackleEnd = await lineEnd(page, "T", "stunt");
  const endEnd = await lineEnd(page, "E", "stunt");
  expect(tackleEnd.x).toBeGreaterThan(endEnd.x);
  expect((await spotOf(tackles.at(-1)!)).x).toBeLessThan(
    (await spotOf(rightEnd)).x,
  );

  // A backer is offered the gaps and the coverage, not the front's calls.
  await mike!.click({ force: true });
  await expect(
    quickAssignments(page).getByRole("button", { name: "Contain" }),
  ).toHaveCount(0);

  // A spy sits over the quarterback, six yards off the ball.
  const [free] = await defendersLettered(page, "F");
  await call(page, free!, "QB spy");
  const [spy] = await bubblesOf(page, '[aria-label="F spy zone"]');
  expect(yards(spy!.y)).toBeGreaterThanOrEqual(5);
  expect(yards(spy!.y)).toBeLessThanOrEqual(7);
  const quarterback = page.locator('[aria-label="Q offense player"]');
  expect(spy!.x).toBeCloseTo((await spotOf(quarterback)).x, 0);
  await saveField(page, testInfo, "1-gap-twist-and-spy");
});
