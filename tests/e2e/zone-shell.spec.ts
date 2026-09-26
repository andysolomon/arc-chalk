import { type Locator, type Page, type TestInfo } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";

/**
 * The zone shell (ADR 0059), built the way a Coach builds one: a defense put
 * on the field, then a zone called on one defender at a time from the Quick
 * assignments grid. Every bubble is read off the field as drawn, and the field
 * is saved at each stage as the run's artifact.
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
  await browser.getByRole("textbox").fill(name);
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
 * frame units. Each bubble is drawn as a fill and an outline at one centre.
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
const allCenters = (page: Page) => centersOf(page, "");

/** The field as drawn, saved beside the run's results. */
async function saveField(page: Page, info: TestInfo, name: string) {
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: info.outputPath(`${name}.png`) });
}

test("divides the deep field between the defenders called into it, and closes over one who leaves", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await putOnDefense(page, "Nickel Cover 2", false);
  await expect(page.locator("[data-scene-coverage]")).toHaveCount(0);

  const [leftCorner, rightCorner] = await defendersLettered(page, "C");
  const [freeSafety] = await defendersLettered(page, "F");
  const [mike] = await defendersLettered(page, "M");

  // Alone, the first deep defender owns the middle of the field.
  await call(page, leftCorner!, "Deep 1/3");
  await expect.poll(async () => (await deepCenters(page)).length).toBe(1);
  const [middle] = await deepCenters(page);
  await saveField(page, testInfo, "1-cover-1");

  // A second takes half of it, and the two split the field about its middle.
  await call(page, rightCorner!, "Deep 1/3");
  await expect.poll(async () => (await deepCenters(page)).length).toBe(2);
  const halves = await deepCenters(page);
  expect((halves[0]! + halves[1]!) / 2).toBeCloseTo(middle!, 1);
  const half = halves[1]! - halves[0]!;
  await saveField(page, testInfo, "2-cover-2");

  // The safety takes the middle third, and both corners give ground to it.
  await call(page, freeSafety!, "Middle 1/3");
  await expect.poll(async () => (await deepCenters(page)).length).toBe(3);
  const thirds = await deepCenters(page);
  expect(thirds[1]).toBeCloseTo(middle!, 1);
  expect(thirds[1]! - thirds[0]!).toBeCloseTo((half * 2) / 3, 1);
  expect(thirds[2]! - thirds[1]!).toBeCloseTo((half * 2) / 3, 1);
  await saveField(page, testInfo, "3-cover-3");

  // One undo takes the call and the room made for it back together.
  await page.keyboard.press("Control+z");
  await expect.poll(() => deepCenters(page)).toEqual(halves);
  await call(page, freeSafety!, "Middle 1/3");
  await expect.poll(() => deepCenters(page)).toEqual(thirds);

  // A hook underneath adds its own bubble and leaves the deep shell alone.
  await call(page, mike!, "Hook");
  await expect.poll(async () => (await allCenters(page)).length).toBe(4);
  expect(await deepCenters(page)).toEqual(thirds);
  await saveField(page, testInfo, "4-cover-3-with-a-hook");

  // A corner sent on a blitz leaves the deep field to the two still in it.
  await call(page, rightCorner!, "Blitz");
  await expect.poll(() => deepCenters(page)).toEqual(halves);

  // Clearing the safety's lines hands the whole middle back to the corner.
  await freeSafety!.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  await page.keyboard.press("Delete");
  await expect.poll(() => deepCenters(page)).toEqual([middle]);

  // And taking the corner's own call off leaves no deep shell at all.
  await call(page, leftCorner!, "Deep 1/3", false);
  await expect.poll(() => deepCenters(page)).toEqual([]);
  await saveField(page, testInfo, "5-no-deep-shell");
});

test("lays a defensive call's own deep drops out with a zone called on top of it", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await putOnDefense(page, "Nickel Cover 2", true);
  // The call goes on as the original draws it: two deep halves.
  await expect.poll(async () => (await deepCenters(page)).length).toBe(2);
  await saveField(page, testInfo, "1-nickel-cover-2");

  // The mike leaves the hole underneath for the deep middle: two-deep
  // rotates to three, and the call's safeties make room for him.
  const [mike] = await defendersLettered(page, "M");
  await call(page, mike!, "Middle 1/3");
  await expect.poll(async () => (await deepCenters(page)).length).toBe(3);
  const thirds = await deepCenters(page);
  expect(thirds[1]! - thirds[0]!).toBeCloseTo(thirds[2]! - thirds[1]!, 1);
  expect(await centersOf(page, '[aria-label="M deep zone"]')).toEqual([
    thirds[1],
  ]);
  await saveField(page, testInfo, "2-rotated-to-three-deep");
});
