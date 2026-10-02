import { type Locator, type Page, type TestInfo } from "@playwright/test";
import { expect, openSeededEditor, startNewPlay, test } from "./fixtures";

/**
 * The front's call (ADR 0075, issue #189), called the way a defensive line
 * coach calls it: a front lined up over a set, then one call for the whole
 * line from the defensive play's own Play call. Each man's job is read off
 * the roster as the Coach reads it, each line off the field as drawn, and
 * the field is saved at every stage as the run's artifact. The men are 4-3
 * Cover 3's (or 3-4 Cover 3's) over Gun Doubles Right throughout, at
 * 1440 × 960, so the jobs and the field are the same on every run.
 */

test.use({ viewport: { width: 1440, height: 960 } });

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

/** A defense over a set, with nothing drawn yet: the front is the Coach's. */
async function openDefense(page: Page, call = "4-3 Cover 3"): Promise<void> {
  await openSeededEditor(page);
  await newDefensivePlay(page);
  await putOnDefense(page, call, false);
  await putOnOffense(page, "Gun Doubles Right");
}

const frontRow = (page: Page) =>
  page
    .getByRole("complementary", { name: "Play inspector" })
    .locator('.play-call [data-unit-call="front"]');

/** Opens the Front row's catalogue and presses one call in it. */
async function callFront(page: Page, name: string): Promise<void> {
  await frontRow(page).click();
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
  const entries = [...rows]
    .sort((left, right) => left.x - right.x)
    .map(({ mark, job }) => {
      const nth = (seen.get(mark) ?? 0) + 1;
      seen.set(mark, nth);
      return [counts.get(mark)! > 1 ? `${mark}${nth}` : mark, job] as const;
    });
  return Object.fromEntries(entries);
}

/** The jobs of the men on a four-man front, left to right. */
async function fourMan(page: Page): Promise<Record<string, string>> {
  const all = await jobs(page);
  return Object.fromEntries(
    ["E1", "T1", "T2", "E2"].map((mark) => [mark, all[mark]!]),
  );
}

interface Line {
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
}

/**
 * Every line drawn by a man on the front — lettered E, T or N — left to
 * right by where it starts, as the field draws it: from his stance to where
 * it ends.
 */
async function frontLines(page: Page): Promise<Line[]> {
  const ds = await page
    .locator("[data-scene-path-group]")
    .evaluateAll((groups) =>
      groups
        .filter((group) =>
          /^(E|T|N) (blitz|stunt)$/.test(
            group.getAttribute("aria-label") ?? "",
          ),
        )
        .map(
          (group) => group.querySelector("path[d]")?.getAttribute("d") ?? "",
        ),
    );
  return ds
    .map((d) => {
      const numbers = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(([n]) =>
        Number(n),
      );
      return {
        start: { x: numbers[0]!, y: numbers[1]! },
        end: { x: numbers.at(-2)!, y: numbers.at(-1)! },
      };
    })
    .sort((left, right) => left.start.x - right.start.x);
}

/** Where the line of scrimmage is drawn, down the frame. */
const scrimmageY = async (page: Page) =>
  Number(
    await page.locator("line.line-of-scrimmage").first().getAttribute("y1"),
  );

/** Where the offense's centre stands across the frame: the ball. */
async function centreX(page: Page): Promise<number> {
  const transform = await page
    .locator('[data-scene-player][aria-label$="offense player"]')
    .filter({ has: page.locator("rect") })
    .first()
    .getAttribute("transform");
  return Number(/translate\(([-\d.]+)/.exec(transform ?? "")?.[1]);
}

/** One yard across the field, in frame units, off the two sidelines. */
async function yardAcross(page: Page): Promise<number> {
  const xs = await page
    .locator("svg.field-diagram")
    .first()
    .locator("[data-field-sideline]")
    .evaluateAll((lines) =>
      lines.map((line) => Number(line.getAttribute("x1"))),
    );
  return (Math.max(...xs) - Math.min(...xs)) / (160 / 3);
}

const quickAssignments = (page: Page) =>
  page
    .locator(".section-heading", { hasText: "Quick assignments" })
    .locator("xpath=following-sibling::div[1]");

/** Picks a man and presses one of his Quick assignments. */
async function callOn(page: Page, man: Locator, name: string): Promise<void> {
  await man.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  await quickAssignments(page)
    .getByRole("button", { name, exact: true })
    .click();
  await page.keyboard.press("Escape");
}

/** The defenders lettered `label`, left to right as they stand. */
async function lettered(page: Page, label: string): Promise<Locator[]> {
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
  return placed.sort((left, right) => left.x - right.x).map(({ man }) => man);
}

async function saveField(page: Page, info: TestInfo, name: string) {
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: info.outputPath(`${name}.png`) });
}

test("gives the whole front Rush or Contain, each man past the line of scrimmage, in one undo step", async ({
  page,
}, testInfo) => {
  await openDefense(page);
  await expect(frontRow(page)).toContainText("No front call yet");

  // The catalogue offers the front's six calls and nothing else.
  await frontRow(page).click();
  const picker = page.getByRole("dialog", { name: "Unit calls" });
  await expect(picker.locator(".preset-name")).toHaveText([
    "Rush",
    "Contain",
    "Pinch",
    "Slant left",
    "Slant right",
    "Twist",
  ]);
  await page.keyboard.press("Escape");

  await callFront(page, "Rush");
  await expect(frontRow(page)).toContainText("Rush");
  expect(await fourMan(page)).toEqual({
    E1: "Rush",
    T1: "Rush",
    T2: "Rush",
    E2: "Rush",
  });
  const los = await scrimmageY(page);
  const rush = await frontLines(page);
  expect(rush).toHaveLength(4);
  for (const { end } of rush) expect(end.y).toBeGreaterThan(los);
  // The coverage is not the front's to call.
  const all = await jobs(page);
  for (const mark of ["C1", "C2", "F", "$", "W", "M", "S"]) {
    expect(all[mark]).toBe("No assignment yet");
  }
  await saveField(page, testInfo, "front-rush");

  // One undo takes the whole call back.
  await page.keyboard.press("Control+z");
  await expect(frontRow(page)).toContainText("No front call yet");
  expect(Object.values(await fourMan(page))).toEqual(
    Array(4).fill("No assignment yet"),
  );

  await callFront(page, "Contain");
  expect(await fourMan(page)).toEqual({
    E1: "Contain",
    T1: "Rush",
    T2: "Rush",
    E2: "Contain",
  });
  for (const { end } of await frontLines(page)) {
    expect(end.y).toBeGreaterThan(los);
  }
  await saveField(page, testInfo, "front-contain");
});

test("pinches the line and slants it to either side, every man one gap that way", async ({
  page,
}, testInfo) => {
  await openDefense(page);
  const ball = await centreX(page);

  await callFront(page, "Pinch");
  expect(Object.values(await fourMan(page))).toEqual(Array(4).fill("Slant in"));
  for (const { start, end } of await frontLines(page)) {
    expect(Math.abs(end.x - ball)).toBeLessThan(Math.abs(start.x - ball));
  }
  await saveField(page, testInfo, "front-pinch");

  await callFront(page, "Slant left");
  expect(await fourMan(page)).toEqual({
    E1: "Slant out",
    T1: "Slant out",
    T2: "Slant in",
    E2: "Slant in",
  });
  for (const { start, end } of await frontLines(page)) {
    expect(end.x).toBeLessThan(start.x);
  }
  await saveField(page, testInfo, "front-slant-left");

  await callFront(page, "Slant right");
  expect(await fourMan(page)).toEqual({
    E1: "Slant in",
    T1: "Slant in",
    T2: "Slant out",
    E2: "Slant out",
  });
  for (const { start, end } of await frontLines(page)) {
    expect(end.x).toBeGreaterThan(start.x);
  }
  await saveField(page, testInfo, "front-slant-right");
});

test("twists each end with the tackle beside him, and rushes a three-man front", async ({
  page,
}, testInfo) => {
  await openDefense(page);
  await callFront(page, "Twist");
  expect(Object.values(await fourMan(page))).toEqual(
    Array(4).fill("T-E twist"),
  );
  // On each side the tackle crashes out first and the end loops inside him.
  const [leftEnd, leftTackle, rightTackle, rightEnd] = await frontLines(page);
  expect(leftTackle!.end.x).toBeLessThan(leftTackle!.start.x);
  expect(leftEnd!.end.x).toBeGreaterThan(leftEnd!.start.x);
  expect(rightTackle!.end.x).toBeGreaterThan(rightTackle!.start.x);
  expect(rightEnd!.end.x).toBeLessThan(rightEnd!.start.x);
  await saveField(page, testInfo, "front-twist-4-3");

  // A 3-4 has no tackle beside either end, and its nose is nobody's
  // partner: all three rush.
  await putOnDefense(page, "3-4 Cover 3", false);
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);
  await callFront(page, "Twist");
  const threeMan = await jobs(page);
  expect(threeMan.N).toBe("Rush");
  expect(threeMan.E1).toBe("Rush");
  expect(threeMan.E2).toBe("Rush");
  const los = await scrimmageY(page);
  const lines = await frontLines(page);
  expect(lines).toHaveLength(3);
  for (const { end } of lines) expect(end.y).toBeGreaterThan(los);
  await saveField(page, testInfo, "front-twist-3-4");
});

test("aims the front at the offense's gaps with the ball on the right hash", async ({
  page,
}, testInfo) => {
  await openDefense(page);
  const sidebar = page.getByRole("navigation", { name: "Sidebar" });
  const rightHash = sidebar.getByRole("button", {
    name: "R hash",
    exact: true,
  });
  if (!(await rightHash.isVisible())) {
    await sidebar.getByRole("button", { name: /^Ball on/ }).click();
  }
  await rightHash.click();
  await expect(
    sidebar.getByRole("button", { name: /^Ball on/ }),
  ).toHaveAccessibleName("Ball on, R hash");

  // Pinched, the tackles come through the A gaps, either side of the centre.
  await callFront(page, "Pinch");
  const ball = await centreX(page);
  const yard = await yardAcross(page);
  const [, leftTackle, rightTackle] = await frontLines(page);
  expect(leftTackle!.end.x).toBeLessThan(ball);
  expect(rightTackle!.end.x).toBeGreaterThan(ball);
  expect(ball - leftTackle!.end.x).toBeLessThan(2 * yard);
  expect(rightTackle!.end.x - ball).toBeLessThan(2 * yard);
  await saveField(page, testInfo, "front-pinch-right-hash");
});

test("keeps an end's own call through a change of front call, and hands him back", async ({
  page,
}, testInfo) => {
  await openDefense(page);
  await callFront(page, "Rush");
  const [, rightEnd] = await lettered(page, "E");

  // The right end's own call: the curl/flat, as in a zone blitz.
  await callOn(page, rightEnd!, "Curl / flat");
  await expect.poll(async () => (await fourMan(page)).E2).toBe("Curl / flat");

  // A new front call redraws everyone but him.
  await callFront(page, "Pinch");
  expect(await fourMan(page)).toEqual({
    E1: "Slant in",
    T1: "Slant in",
    T2: "Slant in",
    E2: "Curl / flat",
  });
  await saveField(page, testInfo, "front-own-call-kept");

  // One undo puts the front back on Rush and leaves his own call.
  await page.keyboard.press("Control+z");
  expect(await fourMan(page)).toEqual({
    E1: "Rush",
    T1: "Rush",
    T2: "Rush",
    E2: "Curl / flat",
  });
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await fourMan(page)).E1).toBe("Slant in");

  // Pressing his own call again hands him back to the front's call.
  await callOn(page, rightEnd!, "Curl / flat");
  await expect.poll(async () => (await fourMan(page)).E2).toBe("Slant in");

  // Pressing the call that is on takes it off.
  await callFront(page, "Pinch");
  await expect(frontRow(page)).toContainText("No front call yet");
  expect(Object.values(await fourMan(page))).toEqual(
    Array(4).fill("No assignment yet"),
  );
  await saveField(page, testInfo, "front-call-off");
});

test("leaves a defensive call's front as drawn, and has no front call to give an empty field", async ({
  page,
}) => {
  await openSeededEditor(page);
  await newDefensivePlay(page);
  await expect(frontRow(page)).toBeDisabled();

  await putOnDefense(page, "4-3 Cover 3", true);
  await expect(frontRow(page)).toBeEnabled();
  await expect(frontRow(page)).toContainText("No front call yet");
});
