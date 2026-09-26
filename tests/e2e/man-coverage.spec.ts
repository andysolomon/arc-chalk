import { type Locator, type Page, type TestInfo } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Man coverage (ADR 0060), the way a Coach meets it: a man call put on
 * against the seeded Stick — Thunder offense lines each defender up on the
 * receiver it makes sense for him to take, a new set re-sorts them, the
 * Coach picks a man of his own on the field or from the list, and playback
 * shows each defender staying with his man. The field is saved at each stage
 * as the run's artifact.
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

/** Every man call on the field, as the field names it: "C man on Z". */
async function manCalls(page: Page): Promise<string[]> {
  const labels = await page
    .locator('[data-scene-path-group][aria-label*=" man"]')
    .evaluateAll((groups) =>
      groups.map((group) => group.getAttribute("aria-label") ?? ""),
    );
  return labels.sort();
}

/** The man lettered `label` on one side of the ball. */
const man = (page: Page, label: string, unit: "offense" | "defense") =>
  page.locator(`[aria-label="${label} ${unit} player"]`);

/** Where a man is drawn, in frame units. */
async function spotOf(locator: Locator): Promise<{ x: number; y: number }> {
  const transform = (await locator.getAttribute("transform")) ?? "";
  const [, x, y] = /translate\(([-\d.]+)[ ,]+([-\d.]+)/.exec(transform) ?? [];
  return { x: Number(x), y: Number(y) };
}

/**
 * The defender on the receiver lettered `receiver`: the man whose stance his
 * line is drawn from.
 */
async function defenderOn(page: Page, receiver: string): Promise<Locator> {
  const line = page.locator(
    `[data-scene-path-group][aria-label$=" man on ${receiver}"]`,
  );
  await expect(line).toHaveCount(1);
  const d = (await line.locator("path").first().getAttribute("d")) ?? "";
  const [, x, y] = /M\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(d) ?? [];
  const start = { x: Number(x), y: Number(y) };
  const defenders = await page.locator('[aria-label$=" defense player"]').all();
  let nearest: { man: Locator; gap: number } | undefined;
  for (const defender of defenders) {
    const at = await spotOf(defender);
    const gap = Math.hypot(at.x - start.x, at.y - start.y);
    if (!nearest || gap < nearest.gap) nearest = { man: defender, gap };
  }
  return nearest!.man;
}

/** The field as drawn, saved beside the run's results. */
async function saveField(page: Page, info: TestInfo, name: string) {
  await page
    .locator("svg.field-diagram")
    .first()
    .screenshot({ path: info.outputPath(`${name}.png`) });
}

/** Selects a defender and waits for his Player panel. */
async function select(page: Page, defender: Locator): Promise<void> {
  await defender.click({ force: true });
  await expect(page.locator(".player-heading")).toBeVisible();
}

test("matches a man call to the receivers it makes sense for, and meets a new set", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await putOnDefense(page, "Nickel Cover 1", true);

  // Corners on the widest man each side, the nickel on the slot, the
  // safety on the tight end, a linebacker on the back — and the other
  // linebacker, with nobody left, free.
  await expect
    .poll(() => manCalls(page))
    .toEqual([
      "$ man on Y",
      "C man on F",
      "C man on Z",
      "M man",
      "N man on X",
      "W man on H",
    ]);
  // The call is still read as the call it is, though its men have moved.
  await expect(
    page
      .getByRole("navigation", { name: "Sidebar" })
      .getByRole("button", { name: /^Shadow defense/ }),
  ).toContainText("Nickel Cover 1");

  // Each lines up on his man, and every one of them the same way: inside
  // him, toward the ball, by the same yard.
  const centre = await spotOf(man(page, "Q", "offense"));
  const leverage: number[] = [];
  for (const receiver of ["F", "X", "Y", "Z"]) {
    const defender = await spotOf(await defenderOn(page, receiver));
    const his = await spotOf(man(page, receiver, "offense"));
    leverage.push((defender.x - his.x) * Math.sign(centre.x - his.x));
  }
  for (const inside of leverage) {
    expect(inside).toBeGreaterThan(0);
    expect(inside).toBeCloseTo(leverage[0]!, 0);
  }
  await saveField(page, testInfo, "1-nickel-cover-1-against-stick");

  // A new set, and the defense re-sorts against it: the nickel follows the
  // slot to the trips side and a linebacker takes the back.
  await page.keyboard.press("Control+Shift+f");
  const formations = page.getByRole("dialog", { name: "Formations" });
  await expect(formations).toBeVisible();
  await formations.getByText("Gun Trips Right").click();
  await expect(formations).toBeHidden();
  await expect
    .poll(() => manCalls(page))
    .toEqual([
      "$ man on Y",
      "C man on X",
      "C man on Z",
      "M man",
      "N man on H",
      "W man on F",
    ]);
  const nickel = await spotOf(man(page, "N", "defense"));
  expect(nickel.x).toBeGreaterThan(centre.x);
  await saveField(page, testInfo, "2-meets-gun-trips-right");

  // The set and the defense's answer to it are one step back.
  await page.keyboard.press("Control+z");
  await expect.poll(() => manCalls(page)).toContain("N man on X");
});

test("gives a defender the man the Coach picks, on the field or from the list, and hands him back", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await putOnDefense(page, "Nickel Cover 1", true);
  await expect.poll(() => manCalls(page)).toContain("$ man on Y");

  const safety = man(page, "$", "defense");
  await select(page, safety);
  const covers = page.getByRole("combobox", { name: "Covers" });
  await expect(covers.locator("option:checked")).toHaveText(
    "Best match — Y — tight end right",
  );

  // Picked on the field, the way Arc Play Flag targets a man.
  await page.getByRole("button", { name: "Pick on field" }).click();
  const bar = page.getByRole("group", { name: "Picking his man" });
  await expect(bar).toContainText("Cover who?");
  await man(page, "Z", "offense").click({ force: true });
  await expect(bar).toBeHidden();
  await expect.poll(() => manCalls(page)).toContain("$ man on Z");
  await expect(covers.locator("option:checked")).toHaveText("Z — wide right");
  // Nobody doubles Z behind him: the corner who had him lets him go, and
  // the free linebacker takes the tight end the safety left.
  const calls = await manCalls(page);
  expect(calls).not.toContain("C man on Z");
  expect(calls).toContain("M man on Y");
  const safetyAt = await spotOf(safety);
  const zAt = await spotOf(man(page, "Z", "offense"));
  const yAt = await spotOf(man(page, "Y", "offense"));
  expect(Math.abs(safetyAt.x - zAt.x)).toBeLessThan(
    Math.abs(safetyAt.x - yAt.x),
  );
  await saveField(page, testInfo, "1-safety-picked-onto-z");

  // Picking and thinking better of it changes nothing.
  await page.getByRole("button", { name: "Pick on field" }).click();
  await expect(bar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(bar).toBeHidden();
  await expect(page.locator(".player-heading")).toBeVisible();
  await expect.poll(() => manCalls(page)).toContain("$ man on Z");

  // From the list, and back again in one undo.
  await covers.selectOption({ label: "X — slot left" });
  await expect.poll(() => manCalls(page)).toContain("$ man on X");
  await page.keyboard.press("Control+z");
  await expect.poll(() => manCalls(page)).toContain("$ man on Z");

  // Best match hands him back to the defense, which puts him on the tight
  // end again and the corner back on Z.
  await covers.selectOption({ index: 0 });
  await expect
    .poll(() => manCalls(page))
    .toEqual([
      "$ man on Y",
      "C man on F",
      "C man on Z",
      "M man",
      "N man on X",
      "W man on H",
    ]);
  await saveField(page, testInfo, "2-back-to-the-best-match");
});

test("keeps each defender with his man through the play", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await putOnDefense(page, "Nickel Cover 1", true);
  await expect.poll(() => manCalls(page)).toContain("C man on Z");

  const corner = await defenderOn(page, "Z");
  const receiver = man(page, "Z", "offense");
  const apart = async () => {
    const [a, b] = [await spotOf(corner), await spotOf(receiver)];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const atSnap = await apart();
  const zAtSnap = await spotOf(receiver);

  const bar = page.getByLabel("Playback controls");
  await bar.getByRole("button", { name: "Play", exact: true }).focus();
  await page.keyboard.press("Tab");
  const slider = bar.getByRole("slider", { name: "Scrub the play" });
  await expect(slider).toBeFocused();
  await page.keyboard.press("End");

  // Z has run his route downfield, and the corner is still on him — closer
  // than he stood at the snap, not left behind where Z began.
  await expect
    .poll(async () => (await spotOf(receiver)).y)
    .toBeLessThan(zAtSnap.y - 20);
  expect(await apart()).toBeLessThan(atSnap);
  await saveField(page, testInfo, "1-corner-on-z-at-the-whistle");
});
