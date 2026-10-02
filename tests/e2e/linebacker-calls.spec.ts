import { type Page, type TestInfo } from "@playwright/test";
import { expect, openSeededEditor, startNewPlay, test } from "./fixtures";

/**
 * The linebackers' call and the refills it sets off (ADR 0075, issue #190),
 * called the way a defensive coordinator calls pressure: 4-3 Cover 3 put on
 * with its lines over Gun Doubles Right, then the backers sent — or one man
 * given his own call — and the coverage dropping the nearest man into each
 * zone left open. Every man's job is read off the roster, and the field is
 * saved at each stage as the run's artifact.
 */

async function newDefensivePlay(page: Page): Promise<void> {
  await startNewPlay(page, "defensive");
  await expect(page.locator("[data-scene-player]")).toHaveCount(0);
}

async function putOnDefense(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();
  const toggle = browser.getByRole("button", { name: "With assignments" });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await browser.getByRole("textbox", { name: "Search defenses" }).fill(name);
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
}

async function putOnOffense(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Control+Shift+f");
  const browser = page.getByRole("dialog", { name: "Formations" });
  await expect(browser).toBeVisible();
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);
}

/** 4-3 Cover 3 with its own lines, over Gun Doubles Right. */
async function openCover3(page: Page): Promise<void> {
  await openSeededEditor(page);
  await newDefensivePlay(page);
  await putOnDefense(page, "4-3 Cover 3");
  await putOnOffense(page, "Gun Doubles Right");
  await expect(unitRow(page, "coverage")).toContainText("Cover 3");
}

const unitRow = (page: Page, group: string) =>
  page
    .getByRole("complementary", { name: "Play inspector" })
    .locator(`.play-call [data-unit-call="${group}"]`);

/** Opens a unit call's row and presses one call in its catalogue. */
async function callUnit(page: Page, group: string, name: string) {
  await unitRow(page, group).click();
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

/** Gives one man his own call from Quick assignments, and goes back to the roster. */
async function ownCall(page: Page, label: string, nth: number, call: string) {
  const men = page.locator(`[aria-label="${label} defense player"]`);
  const placed = await Promise.all(
    (await men.all()).map(async (man) => ({
      man,
      x: Number(
        /translate\(([-\d.]+)/.exec(
          (await man.getAttribute("transform")) ?? "",
        )?.[1],
      ),
    })),
  );
  const man = placed.sort((left, right) => left.x - right.x)[nth]!.man;
  await man.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  await page
    .locator(".section-heading", { hasText: "Quick assignments" })
    .locator("xpath=following-sibling::div[1]")
    .getByRole("button", { name: call, exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".roster")).toBeVisible();
}

/**
 * Each defender's job as the roster says it, keyed by his letter — and, for
 * a letter two men share, by the letter and his place counting from the left
 * of the field (E1 the left end, E2 the right).
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
  return Object.fromEntries(
    [...rows]
      .sort((left, right) => left.x - right.x)
      .map(({ mark, job }) => {
        const nth = (seen.get(mark) ?? 0) + 1;
        seen.set(mark, nth);
        return [counts.get(mark)! > 1 ? `${mark}${nth}` : mark, job] as const;
      }),
  );
}

const openZones = (page: Page) =>
  page
    .locator(".roster-open")
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("aria-label") ?? ""),
    );

/** The words a rusher's line is called: the front's calls and the gaps. */
const RUSHES: ReadonlySet<string> = new Set([
  "Rush",
  "Contain",
  "A gap",
  "B gap",
  "C gap",
  "D gap",
]);

/** How many of the eleven rush, and how many drop into coverage. */
function shares(words: Record<string, string>) {
  const all = Object.values(words);
  const rush = all.filter((job) => RUSHES.has(job)).length;
  return { rush, cover: all.length - rush };
}

/** Where the bubbles in `lines` are centred across the field, in frame units. */
async function centersOf(page: Page, lines: string): Promise<number[]> {
  const centers = await page
    .locator(`${lines} [data-scene-coverage] ellipse`)
    .evaluateAll((ellipses) =>
      ellipses.map((ellipse) => Number(ellipse.getAttribute("cx"))),
    );
  return [...new Set(centers.map((x) => Math.round(x * 100) / 100))];
}

async function saveField(page: Page, info: TestInfo, name: string) {
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: info.outputPath(`${name}.png`) });
}

/** 4-3 Cover 3 as it goes on: four rush, seven drop. */
const COVER_3 = {
  C1: "Deep 1/3",
  E1: "Contain",
  W: "Curl / flat",
  T1: "Rush",
  M: "Hook",
  F: "Middle 1/3",
  T2: "Rush",
  S: "Hook",
  E2: "Contain",
  $: "Curl / flat",
  C2: "Deep 1/3",
};

test("offers the linebacker calls and sends the backers each one names", async ({
  page,
}, testInfo) => {
  await openCover3(page);
  expect(await jobs(page)).toEqual(COVER_3);
  await expect(unitRow(page, "linebackers")).toContainText(
    "No linebacker call yet",
  );

  await unitRow(page, "linebackers").click();
  await expect(
    page.getByRole("dialog", { name: "Unit calls" }).locator(".preset-name"),
  ).toHaveText(["Base", "Mike", "Will", "Sam", "Fire", "Spy"]);
  await page.keyboard.press("Escape");

  // The Mike through the A gap he stands over; the left tackle, nearest his
  // hook, drops into it.
  await callUnit(page, "linebackers", "Mike");
  await expect(unitRow(page, "linebackers")).toContainText("Mike");
  expect(await jobs(page)).toEqual({ ...COVER_3, M: "A gap", T1: "Hook" });
  await saveField(page, testInfo, "mike");

  // The Will through his C gap; the left end drops into his curl/flat.
  await callUnit(page, "linebackers", "Will");
  expect(await jobs(page)).toEqual({
    ...COVER_3,
    W: "C gap",
    E1: "Curl / flat",
  });

  // The Sam through his C gap; the right end, nearest his hook, drops.
  await callUnit(page, "linebackers", "Sam");
  expect(await jobs(page)).toEqual({ ...COVER_3, S: "C gap", E2: "Hook" });

  // The Mike on the quarterback; his hook is the left tackle's.
  await callUnit(page, "linebackers", "Spy");
  expect(await jobs(page)).toEqual({ ...COVER_3, M: "QB spy", T1: "Hook" });
  await saveField(page, testInfo, "spy");

  // Base sends nobody, and everyone is back where the call put him.
  await callUnit(page, "linebackers", "Base");
  await expect(unitRow(page, "linebackers")).toContainText("Base");
  expect(await jobs(page)).toEqual(COVER_3);
  expect(await openZones(page)).toEqual([]);
});

test("Fire is a zone blitz: three backers sent, three men off the front, one undo", async ({
  page,
}, testInfo) => {
  await openCover3(page);
  expect(shares(await jobs(page))).toEqual({ rush: 4, cover: 7 });

  await callUnit(page, "linebackers", "Fire");
  const fire = await jobs(page);
  expect(fire).toEqual({
    ...COVER_3,
    W: "C gap",
    M: "A gap",
    S: "C gap",
    E1: "Curl / flat",
    T1: "Hook",
    E2: "Hook",
  });
  // Every man sent drops one off the front: still four rush and seven cover.
  expect(shares(fire)).toEqual({ rush: 4, cover: 7 });
  expect(await openZones(page)).toEqual([]);
  await saveField(page, testInfo, "fire-zone");

  // The send and the refills it set off are one step.
  await page.keyboard.press("Control+z");
  await expect.poll(() => jobs(page)).toEqual(COVER_3);
  await callUnit(page, "linebackers", "Fire");
  await expect.poll(() => jobs(page)).toEqual(fire);

  // Taking the pressure off puts the backers back in their zones and the men
  // who filled them back on the front.
  await callUnit(page, "linebackers", "Base");
  await expect.poll(() => jobs(page)).toEqual(COVER_3);
  await saveField(page, testInfo, "fire-taken-off");
});

test("drops the right end into the strong safety's curl/flat when he plays the middle third", async ({
  page,
}, testInfo) => {
  await openCover3(page);
  await ownCall(page, "$", 0, "Middle 1/3");
  expect(await jobs(page)).toEqual({
    ...COVER_3,
    $: "Middle 1/3",
    E2: "Curl / flat",
  });
  // He and the free safety share the middle third.
  const middle = await centersOf(page, '[aria-label="F deep zone"]');
  expect(middle).toHaveLength(1);
  expect(await centersOf(page, '[aria-label="$ deep zone"]')).toEqual(middle);
  expect(await openZones(page)).toEqual([]);
  await saveField(page, testInfo, "ss-middle-third");

  // Pressing his own call again hands him back, and the end goes back to
  // contain.
  await ownCall(page, "$", 0, "Middle 1/3");
  await expect.poll(() => jobs(page)).toEqual(COVER_3);
});

test("rotates the strong safety into the third a corner leaves on a blitz", async ({
  page,
}, testInfo) => {
  await openCover3(page);
  // The left third of the field, read off the sidelines it is drawn between.
  const sidelines = await page
    .locator("svg.field-diagram")
    .first()
    .locator("[data-field-sideline]")
    .evaluateAll((lines) =>
      lines.map((line) => Number(line.getAttribute("x1"))),
    );
  const left = Math.min(...sidelines);
  const leftThird = left + (Math.max(...sidelines) - left) / 6;

  await ownCall(page, "C", 0, "D gap");
  expect(await jobs(page)).toEqual({
    ...COVER_3,
    C1: "D gap",
    $: "Deep 1/3",
    E2: "Curl / flat",
  });
  // The safety plays the third the corner left, across the field from him.
  const rotated = await centersOf(page, '[aria-label="$ deep zone"]');
  expect(rotated).toHaveLength(1);
  expect(rotated[0]).toBeCloseTo(leftThird, 0);
  expect(await openZones(page)).toEqual([]);
  await saveField(page, testInfo, "corner-fire");
});

test("never moves a man with his own call to fill, and names the zones nobody can take", async ({
  page,
}, testInfo) => {
  await openCover3(page);
  await ownCall(page, "E", 0, "Rush");
  await ownCall(page, "E", 1, "Rush");
  await callUnit(page, "linebackers", "Fire");
  // The ends keep their own rush; the tackles take the hooks, and nobody is
  // left for the Will's curl/flat.
  expect(await jobs(page)).toEqual({
    ...COVER_3,
    W: "C gap",
    M: "A gap",
    S: "C gap",
    E1: "Rush",
    E2: "Rush",
    T1: "Hook",
    T2: "Hook",
  });
  expect(await openZones(page)).toEqual(["Open: Curl / flat left"]);

  // With the tackles on their own rush too, all three zones stay open.
  await ownCall(page, "T", 0, "Rush");
  await ownCall(page, "T", 1, "Rush");
  expect(await openZones(page)).toEqual([
    "Open: Curl / flat left",
    "Open: Hook middle",
    "Open: Hook right",
  ]);
  expect(shares(await jobs(page))).toEqual({ rush: 7, cover: 4 });
  await saveField(page, testInfo, "nobody-left-to-fill");
});
