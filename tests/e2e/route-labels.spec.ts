import { writeFile } from "node:fs/promises";

import { type FrameLocator, type Locator, type Page } from "@playwright/test";

import { expect, openSeededEditor, openViewAndLibrary, test } from "./fixtures";

/**
 * A route's words on the field (issue #158). X runs a Go named COMET
 * FADE-OUT, read 1, with a short conversion and a coaching note; H runs a
 * Curl named COMET RETURN, read 3, with a long conversion, a choice and a
 * note. A conversion short enough shares its Assignment's line; a long one
 * takes the line under it. Notes start off the field, so the coaching
 * notes show only once Show on field → Notes puts them there, and then
 * every block reads top to bottom: Assignment, conversion, note. The
 * editor is measured in light and dark, then the install page it prints,
 * whose Coaching detail (ADR 0047) keeps the conversions and drops the
 * notes, while the table keeps every word either way. The field in both
 * appearances, the sheet as printed and its HTML are the run's artifacts.
 */
test.use({ viewport: { width: 1440, height: 960 } });

const CONVERSION = "vs press: fade";
const H_CONVERSION = "Sit vs zone; break out vs man press.";
const NOTE = "Win the release; stack him by 12 and look early.";
const H_NOTE = "Sit down at 12 if the hook drops under.";

/** The paper's frame, as the field is drawn. */
const FRAME = { width: 1000, height: 620 };

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Words {
  readonly id: string;
  readonly text: string;
  /** The baseline the line is set on. */
  readonly y: number;
  readonly fontSize: number;
  readonly box: Box;
}

interface Route {
  readonly tip: { readonly x: number; readonly y: number };
  readonly read?: { readonly x: number; readonly y: number };
  readonly words: readonly Words[];
}

const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Play inspector" });

const theme = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme);

/** The route named `assignment`, measured in the frame it is drawn in. */
async function readRoute(svg: Locator, assignment: string): Promise<Route> {
  return svg.evaluate((root, name) => {
    const groups = [
      ...root.querySelectorAll<SVGGElement>("[data-scene-path-group]"),
    ];
    const group = groups.find(
      (candidate) =>
        candidate.querySelector('[data-scene-coaching$="-assignment"] text')
          ?.textContent === name,
    );
    if (!group) throw new Error(`No route on the field reads ${name}.`);
    const strokes = group.querySelectorAll<SVGPathElement>("[data-scene-path]");
    const last = strokes[strokes.length - 1]!;
    const tip = last.getPointAtLength(last.getTotalLength());
    const readCircle = group.querySelector<SVGCircleElement>(
      "[data-scene-read] circle",
    );
    const words = [
      ...group.querySelectorAll<SVGGElement>("[data-scene-coaching]"),
    ].map((holder) => {
      const text = holder.querySelector<SVGTextElement>("text")!;
      const { x, y, width, height } = text.getBBox();
      return {
        id: holder.getAttribute("data-scene-coaching")!,
        text: text.textContent ?? "",
        y: Number(text.getAttribute("y")),
        fontSize: Number(text.getAttribute("font-size")),
        box: { x, y, width, height },
      };
    });
    return {
      tip: { x: tip.x, y: tip.y },
      ...(readCircle
        ? {
            read: {
              x: Number(readCircle.getAttribute("cx")),
              y: Number(readCircle.getAttribute("cy")),
            },
          }
        : {}),
      words,
    };
  }, assignment);
}

/**
 * What the issue asks of every route with words on it: one line under
 * another, none past the paper's edge, none across its own line.
 */
function expectWellPlaced(route: Route, where: string) {
  const lines = [...route.words].sort((a, b) => a.y - b.y);
  for (let index = 1; index < lines.length; index += 1) {
    const above = lines[index - 1]!;
    const below = lines[index]!;
    // Words on one baseline are one line: the conversion follows its
    // Assignment along it, clear of it.
    if (below.y === above.y) {
      const [left, right] =
        above.box.x <= below.box.x ? [above, below] : [below, above];
      expect(
        left.box.x + left.box.width,
        `${where}: ${right.id} runs into ${left.id} on their shared line`,
      ).toBeLessThan(right.box.x);
      continue;
    }
    expect(
      below.y - above.y,
      `${where}: ${below.id} sits on the ${above.id} baseline`,
    ).toBeGreaterThanOrEqual(Math.max(above.fontSize, below.fontSize));
  }
  for (const line of route.words) {
    expect(
      line.box.x,
      `${where}: ${line.id} runs off the left edge`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      line.box.x + line.box.width,
      `${where}: ${line.id} runs off the right edge`,
    ).toBeLessThanOrEqual(FRAME.width);
    expect(
      line.box.y + line.box.height,
      `${where}: ${line.id} runs off the bottom`,
    ).toBeLessThanOrEqual(FRAME.height);
  }
}

/** A Go's words all sit on the far side of the line from its read. */
function expectBesideTheLine(route: Route, where: string) {
  const readSide = Math.sign(route.read!.x - route.tip.x);
  expect(readSide, `${where}: the read is not beside the line`).not.toBe(0);
  for (const line of route.words) {
    if (readSide > 0) {
      expect(
        line.box.x + line.box.width,
        `${where}: ${line.id} straddles the line`,
      ).toBeLessThan(route.tip.x);
    } else {
      expect(
        line.box.x,
        `${where}: ${line.id} straddles the line`,
      ).toBeGreaterThan(route.tip.x);
    }
  }
}

/** The kinds of words on a route, top of the page to the bottom. */
const readingOrder = (route: Route) =>
  [...route.words]
    .sort((a, b) => a.y - b.y || a.box.x - b.box.x)
    .map(({ id }) => id.replace(/^.*-/, ""));

/** Opens a man's route panel from the roster and writes his words. */
async function coach(
  page: Page,
  man: RegExp,
  quickRoute: string,
  words: {
    readonly assignment: string;
    readonly read: string;
    readonly conversion?: string;
    readonly note: string;
    readonly choice?: boolean;
  },
): Promise<void> {
  const panel = inspector(page);
  await panel.getByRole("button", { name: man }).click();
  await panel.getByRole("button", { name: quickRoute, exact: true }).click();
  await panel.getByRole("button", { name: /^Edit Route/ }).click();
  const assignment = panel.getByRole("textbox", { name: "Assignment" });
  await assignment.fill(words.assignment);
  await assignment.blur();
  const read = panel.getByLabel("Read", { exact: true });
  await read.fill(words.read);
  await read.blur();
  if (words.conversion !== undefined) {
    const conversion = panel.getByRole("textbox", { name: "Conversion" });
    await conversion.fill(words.conversion);
    await conversion.blur();
  }
  const note = panel.getByRole("textbox", { name: "Coaching note" });
  await note.fill(words.note);
  await note.blur();
  if (words.choice) {
    await panel.getByRole("button", { name: /^\+ Choice at/ }).click();
  }
  // Back through his panel, the way the Coach came, to the roster.
  await panel.getByRole("button", { name: /^Back to (?!the play)/ }).click();
  await panel.getByRole("button", { name: "Back to the play" }).click();
}

/** Opens the current Play's install page in the print preview. */
async function installPreview(page: Page): Promise<FrameLocator> {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Print & export", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Print preview", exact: true })
    .click();
  const output = page.getByRole("region", { name: "Print & export" });
  await output.getByRole("button", { name: /^Install page/ }).click();
  const preview = page.frameLocator('iframe[title="Preview"]');
  await expect(preview.locator("h1")).toHaveText("Stick — Thunder");
  return preview;
}

test("a route's conversion shares its Assignment's line, notes wait for the Notes layer, and the sheet prints the same", async ({
  page,
  browserName,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openSeededEditor(page);

  await coach(page, /^X: /, "Go", {
    assignment: "COMET FADE-OUT",
    read: "1",
    conversion: CONVERSION,
    note: NOTE,
  });
  await coach(page, /^H: /, "Curl", {
    assignment: "COMET RETURN",
    read: "3",
    conversion: H_CONVERSION,
    note: H_NOTE,
    choice: true,
  });
  // Nothing is selected, so the field is the Play alone.
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("img", { name: /^X route: COMET FADE-OUT/ }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("img", { name: /^H route: COMET RETURN/ }),
  ).toHaveCount(1);

  // Notes start off: the Assignment and its conversion are on the field,
  // the coaching notes are not.
  const field = page.locator("svg.field-diagram").first();
  await expect(field.locator('[data-scene-coaching$="-note"]')).toHaveCount(0);
  const quietX = await readRoute(field, "COMET FADE-OUT");
  expect(quietX.words.map(({ text }) => text)).toEqual([
    "COMET FADE-OUT",
    `— ${CONVERSION}`,
  ]);
  // The short conversion is set on the Assignment's own baseline, after it.
  const [name, conversion] = quietX.words;
  expect(conversion!.y).toBe(name!.y);
  expect(conversion!.box.x).toBeGreaterThan(name!.box.x + name!.box.width);
  expectWellPlaced(quietX, "editor, notes off");
  expectBesideTheLine(quietX, "editor, notes off");
  // The long one is too wide to share the line, so it takes the next.
  const quietH = await readRoute(field, "COMET RETURN");
  expect(readingOrder(quietH)).toEqual(["assignment", "conversion"]);
  expect(quietH.words.map(({ text }) => text)).toEqual([
    "COMET RETURN",
    H_CONVERSION,
  ]);
  expectWellPlaced(quietH, "editor, notes off");
  await expect(page.locator(".toast")).toHaveCount(0);
  await field.screenshot({
    path: testInfo.outputPath("route-words-notes-off.png"),
  });

  // Show on field → Notes puts the coaching notes on the diagram, and each
  // block reads top to bottom: Assignment, conversion, note. Show on field
  // folds under View & library (ADR 0074).
  const sidebar = await openViewAndLibrary(page);
  await sidebar.getByRole("button", { name: /^Show on field/ }).click();
  const notes = sidebar.getByRole("button", { name: "Notes", exact: true });
  await notes.click();
  await expect(field.locator('[data-scene-coaching$="-note"]')).toHaveCount(2);
  // Folded away again, so the field's pictures show the field.
  await sidebar.getByRole("button", { name: /^Show on field/ }).click();
  await expect(notes).toBeHidden();
  const x = await readRoute(field, "COMET FADE-OUT");
  expect(readingOrder(x)).toEqual(["assignment", "conversion", "note"]);
  expect(x.words.map(({ text }) => text)).toEqual([
    "COMET FADE-OUT",
    `— ${CONVERSION}`,
    // A note longer than a line on the field is cut between words.
    expect.stringMatching(/^Win the release; stack him by 12 and\S*…$/),
  ]);
  expectWellPlaced(x, "editor, light");
  expectBesideTheLine(x, "editor, light");
  const h = await readRoute(field, "COMET RETURN");
  expect(readingOrder(h)).toEqual(["assignment", "conversion", "note"]);
  expectWellPlaced(h, "editor, light");
  await field.screenshot({
    path: testInfo.outputPath("route-words-light.png"),
  });

  // The same field under a dark shell: the field goes dark and the words
  // stay where they were.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => theme(page)).toBe("dark");
  const dark = await readRoute(field, "COMET FADE-OUT");
  expect(dark.words).toEqual(x.words);
  expectWellPlaced(dark, "editor, dark");
  expectBesideTheLine(dark, "editor, dark");
  await field.screenshot({ path: testInfo.outputPath("route-words-dark.png") });
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => theme(page)).toBe("light");

  // The install page prints through the same renderer at its Full detail:
  // the same placement, and the table under it carries every word.
  const preview = await installPreview(page);
  const sheet = preview.locator("svg").first();
  const printed = await readRoute(sheet, "COMET FADE-OUT");
  expect(readingOrder(printed)).toEqual(["assignment", "conversion", "note"]);
  // Print type is a size larger, so the note is cut a word sooner there;
  // the name and the conversion are the same words.
  expect(printed.words.map(({ text }) => text).slice(0, 2)).toEqual(
    x.words.map(({ text }) => text).slice(0, 2),
  );
  const printedNote = printed.words[2]!.text;
  expect(printedNote.endsWith("…")).toBe(true);
  expect(NOTE.startsWith(printedNote.slice(0, -1))).toBe(true);
  expectWellPlaced(printed, "install page");
  expectBesideTheLine(printed, "install page");
  expectWellPlaced(await readRoute(sheet, "COMET RETURN"), "install page");
  const table = preview.locator("table tbody");
  await expect(table).toContainText("COMET FADE-OUT");
  await expect(table).toContainText(CONVERSION);
  await expect(table).toContainText(H_CONVERSION);
  await expect(table).toContainText(NOTE);
  await expect(table).toContainText(H_NOTE);

  const html = await preview
    .locator("html")
    .evaluate((root) => `<!doctype html>${root.outerHTML}`);
  await writeFile(testInfo.outputPath("install-page.html"), html);

  // The sheet's Coaching detail prints the reads, the assignments with
  // their conversions, and the text, without the notes; the table under it
  // still carries every word.
  await page
    .getByRole("region", { name: "Print & export" })
    .getByRole("button", { name: "Coaching", exact: true })
    .click();
  await expect(sheet.locator('[data-scene-coaching$="-note"]')).toHaveCount(0);
  await expect(
    sheet.locator('[data-scene-coaching$="-conversion"]'),
  ).toHaveCount(2);
  await expect(
    sheet.locator('[data-scene-coaching$="-assignment"]'),
  ).toHaveCount(2);
  await expect(table).toContainText(CONVERSION);
  await expect(table).toContainText(NOTE);
  await expect(table).toContainText(H_NOTE);

  // The sheet as it prints at Coaching detail, on a page of its own at
  // Letter width — and as a PDF where the engine can print one.
  const quietHtml = await preview
    .locator("html")
    .evaluate((root) => `<!doctype html>${root.outerHTML}`);
  await writeFile(testInfo.outputPath("install-page-coaching.html"), quietHtml);
  const paper = await page.context().newPage();
  await paper.setViewportSize({ width: 816, height: 1056 });
  await paper.setContent(quietHtml);
  await paper.screenshot({
    path: testInfo.outputPath("install-page-coaching.png"),
    fullPage: true,
  });
  if (browserName === "chromium") {
    await paper.pdf({
      path: testInfo.outputPath("install-page-coaching.pdf"),
      preferCSSPageSize: true,
    });
  }
  await paper.close();
});
