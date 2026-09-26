import { type Page, type TestInfo } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Defenders are drawn as triangles with their letter inside (#131): a shape,
 * like every man on offense, but one no offensive position uses. Every stock
 * call is put on the field against the Stick starter and each man is read
 * off the field as drawn. A Play saved before #131, with letter-only
 * defenders, is upgraded once on launch (ADR 0061). The field is saved at
 * each stage as the run's artifact.
 */

/** The renderer's triangle, in the man's own frame: apex up, base below. */
const TRIANGLE = "M0 -14 L14 11 L-14 11 Z";

const STOCK_CALLS = [
  "4-3 Cover 3",
  "Nickel Cover 2",
  "Fire Zone Blitz",
  "4-3 Cover 2",
  "4-3 Tampa 2",
  "4-3 Quarters",
  "Nickel Cover 1",
  "Nickel Cover 6",
  "Dime Cover 3",
  "3-4 Cover 3",
  "Bear Front Cover 0",
] as const;

// Twice the pixels, so a letter inside its triangle can be read in the PNGs.
test.use({ deviceScaleFactor: 2 });

/** Puts a call's front and secondary on the field, without its own lines. */
async function putOnDefense(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();
  const toggle = browser.getByRole("button", { name: "With assignments" });
  if ((await toggle.getAttribute("aria-pressed")) === "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await browser.getByRole("textbox").fill(name);
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);
}

/**
 * Every man of `unit` as drawn: his letter, whether his shape is the
 * triangle, whether the letter's centre sits inside that triangle, and
 * whether he is a bare letter with no shape at all.
 */
async function drawnMen(page: Page, unit: "offense" | "defense") {
  return page
    .locator(`[data-scene-player][aria-label$=" ${unit} player"]`)
    .evaluateAll(
      (men, triangle) =>
        men.map((man) => {
          const text = man.querySelector("text");
          const box = text?.getBBox();
          const cx = box ? box.x + box.width / 2 : Number.NaN;
          const cy = box ? box.y + box.height / 2 : Number.NaN;
          // Inside the apex-up triangle: below the apex, above the base, and
          // within the sides, which widen from 0 at y -14 to 14 at y 11.
          const inside =
            cy > -14 && cy < 11 && Math.abs(cx) < (14 * (cy + 14)) / 25;
          // The selection halo and route dot are chrome, not his symbol.
          const shapes = man.querySelectorAll(
            ":scope > :is(path, rect, circle, ellipse):not([data-print-chrome])",
          );
          return {
            letter: text?.textContent ?? "",
            triangle: man.querySelector(`path[d="${triangle}"]`) !== null,
            letterInside: inside,
            bare: shapes.length === 0,
          };
        }),
      TRIANGLE,
    );
}

/** Where the app keeps a Coach's Plays on this device. */
const DATABASE = "chalk-production-beta";
/** The mark a device keeps once it has upgraded its letter-only defenders. */
const UPGRADE_MARK = "upgrade.defendersAsTriangles";

interface StoredPlay {
  readonly document: {
    readonly name: string;
    readonly players: readonly {
      readonly label: string;
      readonly unit: string;
      readonly symbol: string;
    }[];
  };
}

/** The men of the named Play as stored on this device, not as drawn. */
async function storedMen(page: Page, playName: string) {
  return page.evaluate(
    async ({ database, playName }) => {
      const settle = <Result>(request: IDBRequest<Result>) =>
        new Promise<Result>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () =>
            reject(request.error ?? new Error("IndexedDB request failed."));
        });
      const db = await settle(indexedDB.open(database));
      try {
        const plays = (await settle(
          db.transaction("plays").objectStore("plays").getAll(),
        )) as StoredPlay[];
        const play = plays.find(({ document }) => document.name === playName);
        return (play?.document.players ?? []).map(
          ({ label, unit, symbol }) => ({ label, unit, symbol }),
        );
      } finally {
        db.close();
      }
    },
    { database: DATABASE, playName },
  );
}

/**
 * Takes the upgrade mark off this device, leaving it as a release before
 * #131 left it. Reports whether the mark was there to take.
 */
async function forgetUpgrade(page: Page): Promise<boolean> {
  return page.evaluate(
    async ({ database, mark }) => {
      const settle = <Result>(request: IDBRequest<Result>) =>
        new Promise<Result>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () =>
            reject(request.error ?? new Error("IndexedDB request failed."));
        });
      const db = await settle(indexedDB.open(database));
      try {
        const store = db
          .transaction("preferences", "readwrite")
          .objectStore("preferences");
        const found: unknown = await settle(store.get(mark));
        await settle(store.delete(mark));
        return found !== undefined;
      } finally {
        db.close();
      }
    },
    { database: DATABASE, mark: UPGRADE_MARK },
  );
}

/** A defender's group on the field, by his letter (the first if several). */
const defender = (page: Page, letter: string) =>
  page.locator(`[aria-label="${letter} defense player"]`).first();

/** The field as drawn, saved beside the run's results. */
async function saveField(page: Page, info: TestInfo, name: string) {
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: info.outputPath(`${name}.png`) });
}

test("draws every defender in every stock call as a triangle with his letter inside", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);

  for (const [index, call] of STOCK_CALLS.entries()) {
    await putOnDefense(page, call);

    const defense = await drawnMen(page, "defense");
    expect(defense, call).toHaveLength(11);
    for (const man of defense) {
      expect(man.letter, `${call}: a defender with no letter`).not.toBe("");
      expect(man.triangle, `${call}: ${man.letter} is not a triangle`).toBe(
        true,
      );
      expect(
        man.letterInside,
        `${call}: ${man.letter} sits outside his triangle`,
      ).toBe(true);
    }

    // The offense keeps its own shapes: the triangle belongs to the defense.
    const offense = await drawnMen(page, "offense");
    expect(offense).toHaveLength(11);
    expect(
      offense.filter((man) => man.triangle).map((man) => man.letter),
      `${call}: offense drawn as triangles`,
    ).toEqual([]);

    const slug = call.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
    await saveField(
      page,
      testInfo,
      `${String(index + 1).padStart(2, "0")}-${slug}`,
    );
  }
});

test("turns a defender to letter-only and back, from the inspector or by calling the defense again", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await putOnDefense(page, "4-3 Cover 3");
  const mike = defender(page, "M");
  await expect(mike.locator(`path[d="${TRIANGLE}"]`)).toHaveCount(1);

  // Picked, he reads as a triangle defender under Appearance.
  await mike.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  await page.getByRole("button", { name: /^Appearance/ }).click();
  const triangle = page.getByRole("button", { name: "Triangle — defender" });
  const letterOnly = page.getByRole("button", { name: "Letter only" });
  await expect(triangle).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: testInfo.outputPath("1-mike-picked-as-a-triangle.png"),
  });

  // Letter only is how a Play saved before #131 still draws him: no shape.
  await letterOnly.click();
  await expect(letterOnly).toHaveAttribute("aria-pressed", "true");
  await expect(
    mike.locator("path, rect, circle:not(.selection-halo)"),
  ).toHaveCount(0);
  await expect(mike.locator("text")).toHaveText("M");
  await page.screenshot({
    path: testInfo.outputPath("2-mike-letter-only.png"),
  });

  // Picking Triangle again puts the shape back around the same letter.
  await triangle.click();
  await expect(triangle).toHaveAttribute("aria-pressed", "true");
  await expect(mike.locator(`path[d="${TRIANGLE}"]`)).toHaveCount(1);
  await expect(mike.locator("text")).toHaveText("M");

  // Calling the defense again redraws a letter-only man as a triangle too.
  await letterOnly.click();
  await expect(mike.locator(`path[d="${TRIANGLE}"]`)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await putOnDefense(page, "4-3 Cover 3");
  const defense = await drawnMen(page, "defense");
  expect(defense.every((man) => man.triangle && man.letterInside)).toBe(true);
  await saveField(page, testInfo, "3-called-again-all-triangles");
});

test("draws the letter-only defenders a Play saved before #131 as triangles, once", async ({
  page,
}, testInfo) => {
  // The starter Play, kept on this device across reloads.
  const play = "Stick — Thunder";
  const opened = page.getByRole("img", { name: `${play} football play` });
  await page.goto("/");
  await expect(opened).toBeVisible({ timeout: 30_000 });
  await putOnDefense(page, "4-3 Tampa 2");

  // Every defender set to Letter only, the way a release before #131 saved
  // them, and one receiver too, whose letter-only is the Coach's own.
  const defenders = page.locator(
    '[data-scene-player][aria-label$=" defense player"]',
  );
  const letterOnly = page.getByRole("button", { name: "Letter only" });
  await defenders.first().click({ force: true });
  await page.getByRole("button", { name: /^Appearance/ }).click();
  for (let index = 0; index < 11; index += 1) {
    await defenders.nth(index).click({ force: true });
    await letterOnly.click();
    await expect(letterOnly).toHaveAttribute("aria-pressed", "true");
  }
  await page.locator('[aria-label="X offense player"]').click({ force: true });
  await letterOnly.click();
  await expect(letterOnly).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  const storedSymbols = async (unit: string) =>
    (await storedMen(page, play))
      .filter((man) => man.unit === unit)
      .map(({ label, symbol }) => `${label}:${symbol}`);
  await expect
    .poll(async () =>
      (await storedSymbols("defense")).every((man) => man.endsWith(":none")),
    )
    .toBe(true);
  await expect.poll(() => storedSymbols("offense")).toContain("X:none");
  await saveField(page, testInfo, "1-saved-letter-only-before-131");

  // This device already ran the upgrade on its first launch; taking the mark
  // off leaves it as a device that last ran a release before #131.
  expect(await forgetUpgrade(page)).toBe(true);
  await page.reload();
  await expect(opened).toBeVisible({ timeout: 30_000 });

  // Launching upgrades the defense, and only the defense.
  const upgraded = await drawnMen(page, "defense");
  expect(upgraded).toHaveLength(11);
  expect(upgraded.filter((man) => !man.triangle || !man.letterInside)).toEqual(
    [],
  );
  expect(
    (await drawnMen(page, "offense")).find((man) => man.letter === "X")?.bare,
  ).toBe(true);
  expect(
    (await storedSymbols("defense")).every((man) => man.endsWith(":triangle")),
  ).toBe(true);
  await saveField(page, testInfo, "2-upgraded-on-launch");

  // Upgraded once, a defender the Coach now sets to Letter only stays that
  // way through the next launch.
  const mike = defender(page, "M");
  await mike.click({ force: true });
  const appearance = page.getByRole("button", { name: /^Appearance/ });
  if ((await appearance.getAttribute("aria-expanded")) !== "true") {
    await appearance.click();
  }
  await letterOnly.click();
  await expect(letterOnly).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect.poll(() => storedSymbols("defense")).toContain("M:none");
  await page.reload();
  await expect(opened).toBeVisible({ timeout: 30_000 });

  const kept = await drawnMen(page, "defense");
  expect(kept.filter((man) => man.bare).map((man) => man.letter)).toEqual([
    "M",
  ]);
  expect(kept.filter((man) => man.triangle)).toHaveLength(10);
  await saveField(page, testInfo, "3-letter-only-kept-after-relaunch");
});
