import { type Locator, type Page } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";

/**
 * The zone shell (ADR 0059), built the way a Coach builds one: a defense put
 * on in alignment only, then a zone called on one defender at a time from the
 * Quick assignments grid. Every bubble is read off the field as drawn.
 */

/** Puts a call's defenders on the field, with nothing drawn on them. */
async function alignDefense(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Control+Shift+d");
  const browser = page.getByRole("dialog", { name: "Defenses" });
  await expect(browser).toBeVisible();
  await expect(
    browser.getByRole("button", { name: "With assignments" }),
  ).toHaveAttribute("aria-pressed", "false");
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

/** Selects a defender and gives that defender a call from Quick assignments. */
async function callZone(page: Page, man: Locator, call: string): Promise<void> {
  await man.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
  const button = page.getByRole("button", { name: call, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

/** Every bubble's centre across the field, left to right, in frame units. */
async function bubbleCenters(page: Page): Promise<number[]> {
  const centers = await page
    .locator("[data-scene-coverage] ellipse")
    .evaluateAll((ellipses) =>
      ellipses.map((ellipse) => Number(ellipse.getAttribute("cx"))),
    );
  // Each bubble is drawn as a fill and an outline at one centre.
  return [...new Set(centers.map((x) => Math.round(x * 100) / 100))].sort(
    (left, right) => left - right,
  );
}

test("divides the deep field between the defenders called into it, and gives it back on undo", async ({
  page,
}) => {
  await openSeededEditor(page);
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await alignDefense(page, "Nickel Cover 2");
  await expect(page.locator("[data-scene-coverage]")).toHaveCount(0);

  const [leftCorner, rightCorner] = await defendersLettered(page, "C");
  const [freeSafety] = await defendersLettered(page, "F");

  // Alone, the first deep defender owns the middle of the field.
  await callZone(page, leftCorner!, "Deep 1/3");
  await expect.poll(async () => (await bubbleCenters(page)).length).toBe(1);
  const [alone] = await bubbleCenters(page);

  // A second takes half of it, and the two split the field about its middle.
  await callZone(page, rightCorner!, "Deep 1/3");
  await expect.poll(async () => (await bubbleCenters(page)).length).toBe(2);
  const halves = await bubbleCenters(page);
  expect((halves[0]! + halves[1]!) / 2).toBeCloseTo(alone!, 1);
  const half = halves[1]! - halves[0]!;

  // The safety takes the middle third, and both corners give ground to it.
  await callZone(page, freeSafety!, "Middle 1/3");
  await expect.poll(async () => (await bubbleCenters(page)).length).toBe(3);
  const thirds = await bubbleCenters(page);
  expect(thirds[1]).toBeCloseTo(alone!, 1);
  expect(thirds[1]! - thirds[0]!).toBeCloseTo((half * 2) / 3, 1);
  expect(thirds[2]! - thirds[1]!).toBeCloseTo((half * 2) / 3, 1);

  // One undo takes the call and the room made for it back together.
  await page.keyboard.press("Control+z");
  await expect.poll(() => bubbleCenters(page)).toEqual(halves);
});
