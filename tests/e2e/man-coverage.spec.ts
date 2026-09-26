import { type Locator, type Page, type TestInfo } from "@playwright/test";
import { expect, openSeededEditor, test } from "./fixtures";

/**
 * Man coverage (ADR 0060, 0061), the way a Coach meets it: a man call put
 * on against the seeded Stick — Thunder offense gives each defender the
 * receiver it makes sense for him to take, and a new set re-sorts them. In
 * Cover 0 the men in man line up on their receivers; with a safety deep
 * behind them they stay where the call put them. The Coach picks a man of
 * his own on the field or from the list, and playback shows each defender
 * staying with his man. The field is saved at each stage as the run's
 * artifact.
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

/** Where every defender stands, by letter, left to right within a letter. */
async function defenseSpots(page: Page): Promise<string[]> {
  const spots: string[] = [];
  for (const defender of await page
    .locator('[aria-label$=" defense player"]')
    .all()) {
    const { x, y } = await spotOf(defender);
    spots.push(
      `${await defender.getAttribute("aria-label")}@${x.toFixed(1)},${y.toFixed(1)}`,
    );
  }
  return spots.sort();
}

/**
 * How far inside his man each defender on `receivers` stands, toward the
 * ball, in frame units: positive and alike when they have lined up.
 */
async function leverageOn(
  page: Page,
  receivers: readonly string[],
): Promise<number[]> {
  const centre = await spotOf(man(page, "Q", "offense"));
  const leverage: number[] = [];
  for (const receiver of receivers) {
    const defender = await spotOf(await defenderOn(page, receiver));
    const his = await spotOf(man(page, receiver, "offense"));
    leverage.push((defender.x - his.x) * Math.sign(centre.x - his.x));
  }
  return leverage;
}

function expectLinedUp(leverage: readonly number[]): void {
  for (const inside of leverage) {
    expect(inside).toBeGreaterThan(0);
    expect(inside).toBeCloseTo(leverage[0]!, 0);
  }
}

/** What the Covers row says about the scheme, for the selected defender. */
const schemeNote = (page: Page) => page.locator("[data-coverage-scheme]");

/** Selects a defender and presses a call in Quick assignments. */
async function quickCall(page: Page, defender: Locator, name: string) {
  await select(page, defender);
  const button = page
    .locator(".section-heading", { hasText: "Quick assignments" })
    .locator("xpath=following-sibling::div[1]")
    .getByRole("button", { name, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

test("lines each man in man up on his receiver in Cover 0, and meets a new set", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await putOnDefense(page, "Bear Front Cover 0", true);

  // Nobody is deep behind them, so the corners, the nickel and the safety
  // each take the receiver that suits him and line up on him.
  await expect
    .poll(() => manCalls(page))
    .toEqual(["$ man on Y", "C man on F", "C man on Z", "N man on X"]);
  await select(page, man(page, "$", "defense"));
  await expect(schemeNote(page)).toHaveAttribute(
    "data-coverage-scheme",
    "Cover 0",
  );
  await expect(schemeNote(page)).toContainText("lines up a yard inside");
  expectLinedUp(await leverageOn(page, ["F", "X", "Y", "Z"]));
  await saveField(page, testInfo, "1-bear-cover-0-against-stick");

  // A new set, and the defense re-sorts and lines up again against it.
  await page.keyboard.press("Control+Shift+f");
  const formations = page.getByRole("dialog", { name: "Formations" });
  await expect(formations).toBeVisible();
  await formations.getByText("Gun Trips Right").click();
  await expect(formations).toBeHidden();
  await expect
    .poll(() => manCalls(page))
    .toEqual(["$ man on Y", "C man on X", "C man on Z", "N man on H"]);
  expectLinedUp(await leverageOn(page, ["H", "X", "Y", "Z"]));
  // The nickel — not the nose, who wears an N too — follows the slot to the
  // trips side.
  const centre = await spotOf(man(page, "Q", "offense"));
  expect((await spotOf(await defenderOn(page, "H"))).x).toBeGreaterThan(
    centre.x,
  );
  await saveField(page, testInfo, "2-meets-gun-trips-right");

  // The set and the defense's answer to it are one step back.
  await page.keyboard.press("Control+z");
  await expect.poll(() => manCalls(page)).toContain("N man on X");
});

test("gives each man his receiver in Cover 1 without moving him, until the call becomes Cover 0", async ({
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
  // The call is still read as the call it is.
  await expect(
    page
      .getByRole("navigation", { name: "Sidebar" })
      .getByRole("button", { name: /^Shadow defense/ }),
  ).toContainText("Nickel Cover 1");

  // With the free safety deep behind them, nobody in man has moved off the
  // call: each stands where it put him, and his arrow says whom he has.
  const asCalled = await defenseSpots(page);
  await select(page, man(page, "N", "defense"));
  await expect(schemeNote(page)).toHaveAttribute(
    "data-coverage-scheme",
    "Cover 1",
  );
  await expect(schemeNote(page)).toContainText("stays where he is put");
  await saveField(page, testInfo, "1-nickel-cover-1-stays-on-the-call");

  // A new set re-sorts who has whom, and still moves nobody.
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
  expect(await defenseSpots(page)).toEqual(asCalled);
  await saveField(page, testInfo, "2-meets-gun-trips-right-in-place");

  // Take the free safety out of the deep middle and put him in man too:
  // the call is Cover 0 now, and everyone in man lines up on his man.
  await quickCall(page, man(page, "F", "defense"), "Man");
  await expect(schemeNote(page)).toHaveAttribute(
    "data-coverage-scheme",
    "Cover 0",
  );
  await expect.poll(() => manCalls(page)).toContain("C man on Z");
  expectLinedUp(await leverageOn(page, ["H", "X", "Z"]));
  await saveField(page, testInfo, "3-free-safety-in-man-is-cover-0");

  // One undo puts the safety back deep and everyone back on the call.
  await page.keyboard.press("Control+z");
  await expect.poll(() => defenseSpots(page)).toEqual(asCalled);
});

test("gives a defender the man the Coach picks, on the field or from the list, and hands him back", async ({
  page,
}, testInfo) => {
  await openSeededEditor(page);
  await putOnDefense(page, "Nickel Cover 1", true);
  await expect.poll(() => manCalls(page)).toContain("$ man on Y");

  const safety = man(page, "$", "defense");
  const safetyWas = await spotOf(safety);
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
  // In Cover 1 he is not moved onto Z: he stays where the call put him and
  // his arrow goes across to his new man.
  expect(await spotOf(safety)).toEqual(safetyWas);
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
