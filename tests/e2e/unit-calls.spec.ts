import { type Page, type TestInfo } from "@playwright/test";
import { expect, openSeededEditor, startNewPlay, test } from "./fixtures";

/**
 * The coverage (ADR 0075, issue #188), called the way a defensive coordinator
 * calls it: a defense lined up over a set, then one call for everyone who
 * drops, from the defensive play's own Play call. Each man's job is read off
 * the roster as the Coach reads it, and the field is saved at every stage as
 * the run's artifact. 4-3 Cover 3's men are lined up over Gun Doubles Right
 * throughout, so the jobs and the field are the same on every run.
 */

async function newDefensivePlay(page: Page): Promise<void> {
  await startNewPlay(page, "defensive");
  await expect(page.locator("[data-scene-player]")).toHaveCount(0);
}

/** Puts a call's defenders on the field, with or without its own lines. */
async function putOnDefense(
  page: Page,
  name: string,
  withAssignments: boolean,
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
}

/** Puts the shadow offense on: the set the defense lines up over. */
async function putOnOffense(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Control+Shift+f");
  const browser = page.getByRole("dialog", { name: "Formations" });
  await expect(browser).toBeVisible();
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);
}

/** A defense over a set, with nothing drawn yet: the coverage is the Coach's. */
async function openDefense(page: Page): Promise<void> {
  await openSeededEditor(page);
  await newDefensivePlay(page);
  await putOnDefense(page, "4-3 Cover 3", false);
  await putOnOffense(page, "Gun Doubles Right");
}

const coverageRow = (page: Page) =>
  page
    .getByRole("complementary", { name: "Play inspector" })
    .locator('.play-call [data-unit-call="coverage"]');

/** Opens the Coverage row's catalogue and presses one coverage in it. */
async function callCoverage(page: Page, name: string): Promise<void> {
  await coverageRow(page).click();
  const picker = page.getByRole("dialog", { name: "Unit calls" });
  await expect(picker).toBeVisible();
  await picker
    .locator(".preset-choice")
    .filter({
      has: page.locator(".preset-name", { hasText: new RegExp(`^${name}$`) }),
    })
    .first()
    .click();
  await expect(picker).toBeHidden();
}

/**
 * Each defender's job as the roster says it, keyed by his letter — and, for
 * a letter two men share, by the letter and his place counting from the left
 * of the field (C1 the left corner, C2 the right).
 */
async function jobs(page: Page): Promise<Record<string, string>> {
  const rows = await page
    .locator(".roster-row[data-roster-player]")
    .evaluateAll((elements) =>
      elements.map((row) => {
        const id = row.getAttribute("data-roster-player") ?? "";
        const man = document.querySelector(`[data-scene-player="${id}"]`);
        const x = Number(
          /translate\(([-\d.]+)/.exec(
            man?.getAttribute("transform") ?? "",
          )?.[1],
        );
        return {
          mark: row.querySelector(".roster-symbol")?.textContent?.trim() ?? "",
          job: row.querySelector(".roster-summary")?.textContent?.trim() ?? "",
          x,
        };
      }),
    );
  const counts = new Map<string, number>();
  for (const { mark } of rows) counts.set(mark, (counts.get(mark) ?? 0) + 1);
  const seen = new Map<string, number>();
  const entries = [...rows]
    .sort((left, right) => left.x - right.x)
    .map(({ mark, job }) => {
      const nth = (seen.get(mark) ?? 0) + 1;
      seen.set(mark, nth);
      return [counts.get(mark)! > 1 ? `${mark}${nth}` : mark, job] as const;
    });
  return Object.fromEntries(entries);
}

/** The jobs of the men who drop: the corners, the safeties and the backers. */
async function droppers(page: Page): Promise<Record<string, string>> {
  const all = await jobs(page);
  return Object.fromEntries(
    ["C1", "C2", "F", "$", "W", "M", "S"].map((mark) => [mark, all[mark]!]),
  );
}

const openZones = (page: Page) =>
  page
    .locator(".roster-open")
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("aria-label") ?? ""),
    );

async function saveField(page: Page, info: TestInfo, name: string) {
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: info.outputPath(`${name}.png`) });
}

/** How many men have each job, a man call counted as Man whoever he is on. */
const tally = (words: Record<string, string>) =>
  Object.values(words)
    .map((job) => (job.startsWith("Man on ") ? "Man" : job))
    .reduce<Record<string, number>>(
      (counts, job) => ({ ...counts, [job]: (counts[job] ?? 0) + 1 }),
      {},
    );

test("gives every man who drops the job each coverage asks of him", async ({
  page,
}, testInfo) => {
  await openDefense(page);
  await expect(coverageRow(page)).toContainText("No coverage yet");

  // The catalogue offers the eight coverages and nothing else.
  await coverageRow(page).click();
  const picker = page.getByRole("dialog", { name: "Unit calls" });
  await expect(picker.locator(".preset-name")).toHaveText([
    "Cover 0",
    "Cover 1",
    "Cover 2",
    "Tampa 2",
    "Cover 2 Man",
    "Cover 3",
    "Cover 4",
    "Cover 6",
  ]);
  await page.keyboard.press("Escape");

  await callCoverage(page, "Cover 3");
  await expect(coverageRow(page)).toContainText("Cover 3");
  expect(await droppers(page)).toEqual({
    C1: "Deep 1/3",
    C2: "Deep 1/3",
    F: "Middle 1/3",
    $: "Curl / flat",
    W: "Curl / flat",
    M: "Hook",
    S: "Hook",
  });
  // The front is not the coverage's to call.
  const front = await jobs(page);
  for (const mark of ["E1", "E2", "T1", "T2"]) {
    expect(front[mark]).toBe("No assignment yet");
  }
  expect(await openZones(page)).toEqual([]);
  await saveField(page, testInfo, "coverage-cover-3");

  await callCoverage(page, "Cover 4");
  expect(await droppers(page)).toEqual({
    C1: "Deep 1/4",
    C2: "Deep 1/4",
    F: "Deep 1/4",
    $: "Deep 1/4",
    W: "Curl / flat",
    M: "Hook",
    S: "Curl / flat",
  });
  expect(await openZones(page)).toEqual([]);
  await saveField(page, testInfo, "coverage-cover-4");

  // Quarters to the strong safety's side, a half to the other.
  await callCoverage(page, "Cover 6");
  expect(await droppers(page)).toEqual({
    C1: "Curl / flat",
    C2: "Deep 1/4",
    F: "Deep 1/2",
    $: "Deep 1/4",
    W: "Hook",
    M: "Hook",
    S: "Curl / flat",
  });
  await saveField(page, testInfo, "coverage-cover-6");

  await callCoverage(page, "Cover 2");
  expect(await droppers(page)).toEqual({
    C1: "Curl / flat",
    C2: "Curl / flat",
    F: "Deep 1/2",
    $: "Deep 1/2",
    W: "Hook",
    M: "Hook",
    S: "Hook",
  });
  await saveField(page, testInfo, "coverage-cover-2");

  await callCoverage(page, "Tampa 2");
  expect(await droppers(page)).toEqual({
    C1: "Curl / flat",
    C2: "Curl / flat",
    F: "Deep 1/2",
    $: "Deep 1/2",
    W: "Hook",
    M: "Middle 1/3",
    S: "Hook",
  });
  await saveField(page, testInfo, "coverage-tampa-2");

  // Five receivers to cover: with the safeties deep, five men in man is all.
  await callCoverage(page, "Cover 2 Man");
  expect(await droppers(page)).toEqual({
    C1: "Man on X",
    C2: "Man on Z",
    F: "Deep 1/2",
    $: "Deep 1/2",
    W: "Man on H",
    M: "Man on F",
    S: "Man on Y",
  });
  await saveField(page, testInfo, "coverage-cover-2-man");

  // Six men for five receivers: the one man match leaves free is the hole.
  await callCoverage(page, "Cover 1");
  const cover1 = await droppers(page);
  expect(cover1.F).toBe("Middle 1/3");
  expect(tally(cover1)).toEqual({ "Middle 1/3": 1, Man: 5, Hook: 1 });
  await saveField(page, testInfo, "coverage-cover-1");

  // Seven for five, nobody deep: two in the hole.
  await callCoverage(page, "Cover 0");
  expect(tally(await droppers(page))).toEqual({ Man: 5, Hook: 2 });
  await saveField(page, testInfo, "coverage-cover-0");
});

test("keeps a man's own call through a change of coverage, names the zone it leaves open, and hands him back", async ({
  page,
}, testInfo) => {
  await openDefense(page);
  await callCoverage(page, "Cover 3");
  const cover3 = await droppers(page);

  // One undo takes the whole coverage back.
  await page.keyboard.press("Control+z");
  await expect(coverageRow(page)).toContainText("No coverage yet");
  expect(Object.values(await droppers(page))).toEqual(
    Array(7).fill("No assignment yet"),
  );
  await callCoverage(page, "Cover 3");
  expect(await droppers(page)).toEqual(cover3);

  // The strong safety's own call: the middle third with the free safety.
  // The curl/flat the coverage gave him is open until someone fills it.
  const strongSafety = page.locator('[aria-label="$ defense player"]');
  await strongSafety.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  const quick = page
    .locator(".section-heading", { hasText: "Quick assignments" })
    .locator("xpath=following-sibling::div[1]");
  await quick.getByRole("button", { name: "Middle 1/3", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await droppers(page)).$).toBe("Middle 1/3");
  expect(await openZones(page)).toEqual(["Open: Curl / flat right"]);
  await saveField(page, testInfo, "own-call-middle-third");

  // A new coverage works around him: everyone else is redrawn, he is not,
  // and the quarter the coverage would have given him is open.
  await callCoverage(page, "Cover 4");
  const cover4 = await droppers(page);
  expect(cover4.$).toBe("Middle 1/3");
  expect(cover4.C1).toBe("Deep 1/4");
  expect(cover4.F).toBe("Deep 1/4");
  expect(await openZones(page)).toEqual(["Open: Deep 1/4 inside right"]);
  await saveField(page, testInfo, "own-call-through-cover-4");

  // Pressing his own call again hands him back to the coverage.
  await strongSafety.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  const own = quick.getByRole("button", { name: "Middle 1/3", exact: true });
  await expect(own).toHaveAttribute("aria-pressed", "true");
  await own.click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await droppers(page)).$).toBe("Deep 1/4");
  expect(await openZones(page)).toEqual([]);

  // Pressing the coverage that is on takes it off: everything it drew goes.
  await callCoverage(page, "Cover 4");
  await expect(coverageRow(page)).toContainText("No coverage yet");
  expect(Object.values(await droppers(page))).toEqual(
    Array(7).fill("No assignment yet"),
  );
  await saveField(page, testInfo, "coverage-off");
});

test("puts a defensive call's coverage on with it, and none without its lines", async ({
  page,
}) => {
  await openSeededEditor(page);
  await newDefensivePlay(page);

  await putOnDefense(page, "4-3 Cover 3", true);
  await expect(coverageRow(page)).toContainText("Cover 3");
  expect(await openZones(page)).toEqual([]);

  await putOnDefense(page, "Nickel Cover 2", true);
  await expect(coverageRow(page)).toContainText("Cover 2");

  await putOnDefense(page, "4-3 Cover 3", false);
  await expect(coverageRow(page)).toContainText("No coverage yet");
});
