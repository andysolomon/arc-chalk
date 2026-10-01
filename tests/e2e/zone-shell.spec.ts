import { type Locator, type Page, type TestInfo } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";

/**
 * The zone shell (ADR 0059, ADR 0073), built the way a Coach builds one: a
 * defense put on the field, then a zone called on one defender at a time from
 * the Quick assignments grid. A deep call is the ground its name says, and two
 * men called to one zone share it. Every bubble is read off the field as
 * drawn, against the sidelines it is drawn between, and the field is saved at
 * each stage as the run's artifact.
 */

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
  await expect(page.locator("[data-scene-player]")).toHaveCount(22);
}

/** The defenders lettered `label`, left to right as they stand. */
async function defendersLettered(page: Page, label: string) {
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

/**
 * Selects a defender and presses a call in Quick assignments. Pressing the
 * call the defender already has takes it off, so the button reads unpressed.
 */
async function call(
  page: Page,
  man: Locator,
  name: string,
  pressed = true,
): Promise<void> {
  await man.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  // The Draw row names a Blitz too; the call is the one in Quick assignments.
  const button = page
    .locator(".section-heading", { hasText: "Quick assignments" })
    .locator("xpath=following-sibling::div[1]")
    .getByRole("button", { name, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", String(pressed));
}

/**
 * The centre of every bubble in `lines`, left to right across the field, in
 * frame units. Each bubble is drawn as a fill and an outline at one centre,
 * and men sharing a zone draw theirs at one centre too, so each centre is
 * listed once.
 */
async function centersOf(page: Page, lines: string): Promise<number[]> {
  const centers = await page
    .locator(`${lines} [data-scene-coverage] ellipse`)
    .evaluateAll((ellipses) =>
      ellipses.map((ellipse) => Number(ellipse.getAttribute("cx"))),
    );
  return [...new Set(centers.map((x) => Math.round(x * 100) / 100))].sort(
    (left, right) => left - right,
  );
}
const deepCenters = (page: Page) =>
  centersOf(page, '[aria-label$="deep zone"]');

/**
 * Where the nth of `count` equal shares of the field is centred, in frame
 * units, read off the two sidelines the field is drawn between.
 */
async function shareCentre(
  page: Page,
  index: number,
  count: number,
): Promise<number> {
  const xs = await page
    .locator("svg.field-diagram")
    .first()
    .locator("[data-field-sideline]")
    .evaluateAll((lines) =>
      lines.map((line) => Number(line.getAttribute("x1"))),
    );
  expect(xs).toHaveLength(2);
  const left = Math.min(...xs);
  const width = Math.max(...xs) - left;
  return left + ((index + 0.5) * width) / count;
}

/** Expects the deep bubbles' centres to be these shares of the field. */
async function expectDeepShares(
  page: Page,
  shares: readonly (readonly [index: number, count: number])[],
): Promise<void> {
  const expected = await Promise.all(
    shares.map(([index, count]) => shareCentre(page, index, count)),
  );
  await expect
    .poll(async () => (await deepCenters(page)).length)
    .toBe(expected.length);
  const centers = await deepCenters(page);
  expected.forEach((x, index) => expect(centers[index]).toBeCloseTo(x, 0));
}

/** The field as drawn, saved beside the run's results. */
async function saveField(page: Page, info: TestInfo, name: string) {
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: info.outputPath(`${name}.png`) });
}

test("lays each deep call on the ground its name says, and lets two men share a zone", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await putOnDefense(page, "Nickel Cover 2", false);
  await expect(page.locator("[data-scene-coverage]")).toHaveCount(0);

  const [leftCorner, rightCorner] = await defendersLettered(page, "C");
  const [freeSafety] = await defendersLettered(page, "F");
  const [safety] = await defendersLettered(page, "S");
  const [mike] = await defendersLettered(page, "M");

  // Alone, a Deep 1/3 is still his own outside third, not the middle.
  await call(page, leftCorner!, "Deep 1/3");
  await expectDeepShares(page, [[0, 3]]);
  await saveField(page, testInfo, "1-lone-deep-third");

  // The other corner takes the other outside third; the middle stays open.
  await call(page, rightCorner!, "Deep 1/3");
  await expectDeepShares(page, [
    [0, 3],
    [2, 3],
  ]);
  const outsideThirds = await deepCenters(page);
  await saveField(page, testInfo, "2-two-outside-thirds");

  // The free safety fills the middle third, and nobody else moves.
  await call(page, freeSafety!, "Middle 1/3");
  await expectDeepShares(page, [
    [0, 3],
    [1, 3],
    [2, 3],
  ]);
  const thirds = await deepCenters(page);
  await saveField(page, testInfo, "3-cover-3");

  // One undo takes the call back.
  await page.keyboard.press("Control+z");
  await expect.poll(() => deepCenters(page)).toEqual(outsideThirds);
  await call(page, freeSafety!, "Middle 1/3");
  await expect.poll(() => deepCenters(page)).toEqual(thirds);

  // The other safety called into the middle third shares it: both men keep
  // their line, to one bubble, and the corners keep their thirds.
  await call(page, safety!, "Middle 1/3");
  await expect.poll(() => deepCenters(page)).toEqual(thirds);
  expect(await centersOf(page, '[aria-label="F deep zone"]')).toEqual([
    thirds[1],
  ]);
  expect(await centersOf(page, '[aria-label="S deep zone"]')).toEqual([
    thirds[1],
  ]);
  await saveField(page, testInfo, "4-two-in-the-middle-third");

  // A hook underneath adds its own bubble and leaves the deep shell alone.
  await call(page, mike!, "Hook");
  await expect
    .poll(async () => (await centersOf(page, "")).length)
    .toBe(thirds.length + 1);
  expect(await deepCenters(page)).toEqual(thirds);

  // A corner sent on a blitz leaves his third open; nobody re-splits the field.
  await call(page, rightCorner!, "D gap");
  await expect.poll(() => deepCenters(page)).toEqual(thirds.slice(0, 2));

  // Clearing the free safety's lines leaves the middle to the man sharing it.
  await freeSafety!.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  await page.keyboard.press("Delete");
  await expect.poll(() => deepCenters(page)).toEqual(thirds.slice(0, 2));
  expect(await centersOf(page, '[aria-label="F deep zone"]')).toEqual([]);

  // And taking the corner's own call off leaves the safety in the middle.
  await call(page, leftCorner!, "Deep 1/3", false);
  await expect.poll(() => deepCenters(page)).toEqual([thirds[1]]);
  await saveField(page, testInfo, "5-safety-alone-in-the-middle");
});

test("draws Cover 4 and Cover 6 from quick assignments, and lets two men share a landmark underneath", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await putOnDefense(page, "Nickel Cover 2", false);

  const [leftCorner, rightCorner] = await defendersLettered(page, "C");
  const [freeSafety] = await defendersLettered(page, "F");
  const [safety] = await defendersLettered(page, "S");
  const [will] = await defendersLettered(page, "W");
  const [mike] = await defendersLettered(page, "M");

  // Deep 1/4 is the quarter nearest each man: the corners on the numbers take
  // the outside quarters, the safeties on the hashes the inside ones.
  for (const man of [leftCorner, freeSafety, safety, rightCorner]) {
    await call(page, man!, "Deep 1/4");
  }
  await expectDeepShares(page, [
    [0, 4],
    [1, 4],
    [2, 4],
    [3, 4],
  ]);
  expect(await centersOf(page, '[aria-label="F deep zone"]')).toEqual([
    (await deepCenters(page))[1],
  ]);
  await saveField(page, testInfo, "1-cover-4");

  // Quarters to one side and a half to the other: the safety plays his half,
  // and the corner on that side sinks to the flat.
  await call(page, safety!, "Deep 1/2");
  await call(page, rightCorner!, "Curl / flat");
  await expectDeepShares(page, [
    [0, 4],
    [1, 4],
    [1, 2],
  ]);
  await saveField(page, testInfo, "2-cover-6");

  // Two backers called Robber share its one bubble over the ball.
  await call(page, will!, "Robber");
  await call(page, mike!, "Robber");
  const robber = await centersOf(page, '[aria-label="W curl zone"]');
  expect(robber).toHaveLength(1);
  expect(await centersOf(page, '[aria-label="M curl zone"]')).toEqual(robber);
  await saveField(page, testInfo, "3-two-robbers");
});

test("keeps a defensive call's halves and lays a Middle 1/3 over the middle, as Tampa 2 does", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await putOnDefense(page, "Nickel Cover 2", true);
  // The call goes on as the original draws it: two deep halves.
  await expect.poll(async () => (await deepCenters(page)).length).toBe(2);
  await saveField(page, testInfo, "1-nickel-cover-2");

  // The mike runs the deep middle. The safeties keep their halves, laid on
  // the halves their call names, and the mike's bubble sits over the middle.
  const [mike] = await defendersLettered(page, "M");
  await call(page, mike!, "Middle 1/3");
  await expectDeepShares(page, [
    [0, 2],
    [1, 3],
    [1, 2],
  ]);
  expect(await centersOf(page, '[aria-label="M deep zone"]')).toEqual([
    (await deepCenters(page))[1],
  ]);
  await saveField(page, testInfo, "2-tampa-2");
});
