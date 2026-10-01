import { type Page, type TestInfo } from "@playwright/test";
import { expect, openBlankEditor, startNewPlay, test } from "./fixtures";

/**
 * Football metadata read off the field (issue #154, ADR 0066), the way a
 * Coach meets it: an I-Form play is 21 personnel in the status bar and on
 * the printed page, and its roster calls the H the tailback and the F the
 * fullback; a nickel call files the nickel and the deep safety in the
 * secondary rather than on the front and among the linebackers; a man call
 * reads Man wherever it is named; and the Bear front letters every man once.
 * The inspector and the printed sheet are saved as the run's artifacts.
 */
test.use({ viewport: { width: 1440, height: 960 } });

/** The roster as the inspector shows it: each group's name and its rows. */
async function rosterGroups(
  page: Page,
): Promise<{ name: string; rows: string[] }[]> {
  return page.locator(".roster-group").evaluateAll((sections) =>
    sections.map((section) => ({
      name: section.querySelector(".roster-heading")?.textContent ?? "",
      rows: [...section.querySelectorAll("button.roster-row")].map(
        (row) => row.getAttribute("aria-label") ?? "",
      ),
    })),
  );
}

/** The rows of one roster group, in the order they are listed. */
async function groupRows(page: Page, name: string): Promise<string[]> {
  const groups = await rosterGroups(page);
  return groups.find((group) => group.name === name)?.rows ?? [];
}

/** Puts a set on the field from the Formations browser. */
async function putOnFormation(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Control+Shift+f");
  const browser = page.getByRole("dialog", { name: "Formations" });
  await expect(browser).toBeVisible();
  await browser.getByText(name, { exact: true }).click();
  await expect(browser).toBeHidden();
}

/** A new defensive play, its roster in the inspector. */
async function newDefensivePlay(page: Page): Promise<void> {
  await startNewPlay(page, "defensive");
  await expect(page.locator("[data-scene-player]")).toHaveCount(0);
}

/** Puts a call on, with its own lines. */
async function putOnDefense(
  page: Page,
  name: string,
  players: number,
): Promise<void> {
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
  await expect(page.locator("[data-scene-player]")).toHaveCount(players);
}

/** Opens the current Play in the print preview, in the format named. */
async function printPreview(page: Page, format: RegExp) {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Print & export", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Print preview", exact: true })
    .click();
  const output = page.getByRole("region", { name: "Print & export" });
  await output.getByRole("button", { name: format }).click();
  return page.frameLocator('iframe[title="Preview"]');
}

/** The sheet as printed, saved beside the run's results. */
async function saveSheet(
  page: Page,
  preview: ReturnType<Page["frameLocator"]>,
  info: TestInfo,
  name: string,
) {
  const html = await preview
    .locator("html")
    .evaluate((root) => `<!doctype html>${root.outerHTML}`);
  const sheet = await page.context().newPage();
  await sheet.setViewportSize({ width: 816, height: 1056 });
  await sheet.setContent(html);
  await sheet.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
  });
  await sheet.close();
}

/** Clicks the middle of a line on the field, by its accessible name. */
async function clickLine(page: Page, label: string): Promise<void> {
  const at = await page.evaluate((label) => {
    const group = document.querySelector<SVGGElement>(
      `[data-scene-path-group][aria-label="${label}"]`,
    );
    const path = group?.querySelector<SVGPathElement>("path");
    const matrix = path?.getScreenCTM();
    if (!path || !matrix) throw new Error(`${label} is not on the field.`);
    const point = path.getPointAtLength(path.getTotalLength() * 0.5);
    const onGlass = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: onGlass.x, y: onGlass.y };
  }, label);
  await page.mouse.click(at.x, at.y);
}

const status = (page: Page) => page.locator("[data-formation-status]");

test("an I-Form play is 21 personnel in the editor and on the printed page, with a tailback and a fullback", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  await putOnFormation(page, "I-Form Right");
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  const name = page.getByRole("textbox", { name: "Play name" });
  await name.fill("I Right 24 Lead");
  await name.press("Enter");
  await page.keyboard.press("Escape");

  // The status bar names the set and its personnel, as the browser does.
  await expect(status(page)).toHaveText("I-FORM RIGHT · 21");

  // The H behind the fullback is the tailback, not a slot; both are backs.
  await expect
    .poll(() => groupRows(page, "Backs"))
    .toEqual([
      "Q: No assignment yet — Quarterback",
      "F: No route yet — Fullback",
      "H: No route yet — Tailback",
    ]);
  await expect
    .poll(() => groupRows(page, "Skill"))
    .toEqual([
      "X: No route yet — Receiver",
      "Y: No route yet — Tight end",
      "Z: No route yet — Receiver",
    ]);
  await page.screenshot({
    path: testInfo.outputPath("1-i-form-roster.png"),
  });

  // The printed page says the same personnel, on the install page and the
  // handout alike.
  const install = await printPreview(page, /^Install page/);
  await expect(install.locator("h1")).toHaveText("I Right 24 Lead");
  await expect(install.locator(".mt span")).toHaveText([
    "21P",
    "I-Form Right",
    "strength right",
    "middle hash",
  ]);
  await saveSheet(page, install, testInfo, "2-i-form-install-page");
  const output = page.getByRole("region", { name: "Print & export" });
  await output.getByRole("button", { name: /^Handout/ }).click();
  const handout = page.frameLocator('iframe[title="Preview"]');
  await expect(handout.locator(".hm").first()).toContainText("21P");
  await page.getByRole("button", { name: "Back to the editor" }).click();

  // The Strong set stands the F deep and the H offset: what each plays is
  // read off where he stands, not off his letter.
  await putOnFormation(page, "Strong Right");
  await page.keyboard.press("Escape");
  await expect(status(page)).toHaveText("STRONG RIGHT · 21");
  await expect
    .poll(() => groupRows(page, "Backs"))
    .toEqual([
      "Q: No assignment yet — Quarterback",
      "F: No route yet — Tailback",
      "H: No route yet — Fullback",
    ]);
  await page.screenshot({
    path: testInfo.outputPath("3-strong-roster.png"),
  });
});

test("a nickel call files the nickel and the deep safety in the secondary, and tells the two S apart", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  await newDefensivePlay(page);
  await putOnDefense(page, "Nickel Cover 2", 11);

  // The nickel is not the nose, and the deep S is not the Sam.
  await expect
    .poll(() => groupRows(page, "Front"))
    .toEqual([
      "E: Contain — End",
      "T: Rush — Tackle",
      "T: Rush — Tackle",
      "E: Contain — End",
    ]);
  await expect
    .poll(() => groupRows(page, "Linebackers"))
    .toEqual(["W: Hook — Will", "M: Hook — Mike"]);
  await expect
    .poll(() => groupRows(page, "Secondary"))
    .toEqual([
      "C: Curl / flat — Corner",
      "F: Deep 1/2 — Free safety",
      "S: Deep 1/2 — Strong safety",
      "N: Curl / flat — Nickel",
      "C: Curl / flat — Corner",
    ]);
  await page.screenshot({
    path: testInfo.outputPath("1-nickel-cover-2-roster.png"),
  });

  // 4-3 Cover 2 letters its Sam and its strong safety alike; the box and
  // the deep field tell them apart.
  await putOnDefense(page, "4-3 Cover 2", 11);
  await expect
    .poll(() => groupRows(page, "Linebackers"))
    .toContain("S: Hook — Sam");
  await expect
    .poll(() => groupRows(page, "Secondary"))
    .toContain("S: Deep 1/2 — Strong safety");

  // In a base front the $ is the strong safety, not a nickel.
  await putOnDefense(page, "4-3 Cover 3", 11);
  await expect
    .poll(() => groupRows(page, "Secondary"))
    .toContain("$: Curl / flat — Strong safety");
  await page.screenshot({
    path: testInfo.outputPath("2-cover-3-roster.png"),
  });
});

test("a man call reads Man in the inspector and names its man in the roster", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  await newDefensivePlay(page);
  // A shadow offense to cover, then the call over it.
  await putOnFormation(page, "Gun Doubles Right");
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await putOnDefense(page, "Nickel Cover 1", 22);

  // Each man defender's row names his man, as the field does.
  await expect
    .poll(() => groupRows(page, "Secondary"))
    .toEqual([
      "C: Man on X — Corner",
      "F: Middle 1/3 — Free safety",
      "$: Man on Y — Strong safety",
      "N: Man on H — Nickel",
      "C: Man on Z — Corner",
    ]);
  await expect
    .poll(() => groupRows(page, "Linebackers"))
    .toEqual(["W: Man — Will", "M: Man on F — Mike"]);

  // The picked line is a man call, and the inspector says so.
  await clickLine(page, "N man on H");
  const inspector = page.getByRole("complementary", {
    name: "Play inspector",
  });
  await expect(inspector.locator(".route-heading > span").first()).toHaveText(
    "Man",
  );
  await expect(
    inspector.getByRole("group", { name: "Kind of line" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("1-nickel-cover-1-man-line.png"),
  });
});

test("the Bear front letters every man once, and reads its four defensive backs as corners and safeties", async ({
  page,
}, testInfo) => {
  await openBlankEditor(page);
  await newDefensivePlay(page);
  await putOnDefense(page, "Bear Front Cover 0", 11);

  const letters = await page
    .locator('[data-scene-player][aria-label$=" defense player"]')
    .evaluateAll((men) =>
      men.map((man) => (man.getAttribute("aria-label") ?? "").split(" ")[0]),
    );
  const counts = new Map<string, number>();
  for (const letter of letters) {
    counts.set(letter!, (counts.get(letter!) ?? 0) + 1);
  }
  // Only the mirrored pairs share a letter: two corners, two ends, two
  // tackles. The nose is the one N.
  expect([...counts.entries()].sort()).toEqual([
    ["$", 1],
    ["C", 2],
    ["E", 2],
    ["F", 1],
    ["M", 1],
    ["N", 1],
    ["T", 2],
    ["W", 1],
  ]);
  await expect
    .poll(() => groupRows(page, "Front"))
    .toEqual([
      "E: Contain — End",
      "T: Rush — Tackle",
      "N: Rush — Nose",
      "T: Rush — Tackle",
      "E: Contain — End",
    ]);
  await expect
    .poll(() => groupRows(page, "Secondary"))
    .toEqual([
      "C: Man — Corner",
      "$: Man — Strong safety",
      "F: Man — Free safety",
      "C: Man — Corner",
    ]);
  await page.screenshot({
    path: testInfo.outputPath("1-bear-cover-0-roster.png"),
  });
});
