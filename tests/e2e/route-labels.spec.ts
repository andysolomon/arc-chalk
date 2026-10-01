import { writeFile } from "node:fs/promises";

import { type FrameLocator, type Locator, type Page } from "@playwright/test";

import { expect, openSeededEditor, openViewAndLibrary, test } from "./fixtures";

/**
 * A route's words on the field (issue #158). X runs a Go named COMET
 * FADE-OUT, read 1, with a conversion and a coaching note; H runs a Curl
 * named COMET RETURN, read 3, with a choice and a note. The editor is
 * measured in light and dark, then the install page it prints. Then the
 * words come off: Show on field → Notes takes the conversion and the note
 * off the field, and the Print & export workflow's own Detail (ADR 0047)
 * takes them off the sheet, while the table keeps every word either way.
 * The field in both appearances, the sheet as printed and its HTML are the
 * run's artifacts.
 */
test.use({ viewport: { width: 1440, height: 960 } });

const CONVERSION = "Fade vs press; out vs cushion.";
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
  await panel.getByRole("button", { name: "Edit" }).first().click();
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

test("a route's words stack beside it, stay on the paper, print the same, and leave with Notes", async ({
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

  const field = page.locator("svg.field-diagram").first();
  const x = await readRoute(field, "COMET FADE-OUT");
  expect(x.words.map(({ id }) => id.replace(/^.*-/, ""))).toEqual([
    "assignment",
    "conversion",
    "note",
  ]);
  expect(x.words.map(({ text }) => text)).toEqual([
    "COMET FADE-OUT",
    CONVERSION,
    // A note longer than a line on the field is cut between words.
    expect.stringMatching(/^Win the release; stack him by 12 and\S*…$/),
  ]);
  expectWellPlaced(x, "editor, light");
  expectBesideTheLine(x, "editor, light");
  expectWellPlaced(await readRoute(field, "COMET RETURN"), "editor, light");
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("route-words-light.png") });

  // The same field under a dark shell: the paper stays white and the words
  // stay where they were.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => theme(page)).toBe("dark");
  const dark = await readRoute(field, "COMET FADE-OUT");
  expect(dark.words).toEqual(x.words);
  expectWellPlaced(dark, "editor, dark");
  expectBesideTheLine(dark, "editor, dark");
  await page.screenshot({ path: testInfo.outputPath("route-words-dark.png") });
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => theme(page)).toBe("light");

  // The install page prints through the same renderer: the same placement,
  // and the table under it carries every word.
  const preview = await installPreview(page);
  const sheet = preview.locator("svg").first();
  const printed = await readRoute(sheet, "COMET FADE-OUT");
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
  await expect(table).toContainText(NOTE);
  await expect(table).toContainText(H_NOTE);

  const html = await preview
    .locator("html")
    .evaluate((root) => `<!doctype html>${root.outerHTML}`);
  await writeFile(testInfo.outputPath("install-page.html"), html);
  await page.keyboard.press("Escape");

  // Notes off takes the conversion and the note off the field; the
  // Assignment and the read stay. Show on field folds under View & library
  // (ADR 0074).
  const sidebar = await openViewAndLibrary(page);
  await sidebar.getByRole("button", { name: /^Show on field/ }).click();
  await sidebar.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.locator('[data-scene-coaching$="-conversion"]'),
  ).toHaveCount(0);
  await expect(page.locator('[data-scene-coaching$="-note"]')).toHaveCount(0);
  await expect(
    page
      .locator(
        '[data-scene-coaching="rx-assignment"], [data-scene-coaching$="-assignment"]',
      )
      .filter({ hasText: "COMET FADE-OUT" }),
  ).toHaveCount(1);
  await expect(page.locator("[data-scene-read]")).toHaveCount(2);

  // The sheet has its own detail: Coaching prints the reads, the
  // assignments and the text without the notes, and the table under it
  // still carries every word.
  const quiet = await installPreview(page);
  await page
    .getByRole("region", { name: "Print & export" })
    .getByRole("button", { name: "Coaching", exact: true })
    .click();
  const quietSheet = quiet.locator("svg").first();
  await expect(
    quietSheet.locator('[data-scene-coaching$="-conversion"]'),
  ).toHaveCount(0);
  await expect(
    quietSheet.locator('[data-scene-coaching$="-note"]'),
  ).toHaveCount(0);
  await expect(
    quietSheet.locator('[data-scene-coaching$="-assignment"]'),
  ).toHaveCount(2);
  const quietTable = quiet.locator("table tbody");
  await expect(quietTable).toContainText(CONVERSION);
  await expect(quietTable).toContainText(NOTE);
  await expect(quietTable).toContainText(H_NOTE);

  // The sheet as it prints with Notes off, on a page of its own at Letter
  // width — and as a PDF where the engine can print one.
  const quietHtml = await quiet
    .locator("html")
    .evaluate((root) => `<!doctype html>${root.outerHTML}`);
  await writeFile(
    testInfo.outputPath("install-page-notes-off.html"),
    quietHtml,
  );
  const paper = await page.context().newPage();
  await paper.setViewportSize({ width: 816, height: 1056 });
  await paper.setContent(quietHtml);
  await paper.screenshot({
    path: testInfo.outputPath("install-page-notes-off.png"),
    fullPage: true,
  });
  if (browserName === "chromium") {
    await paper.pdf({
      path: testInfo.outputPath("install-page-notes-off.pdf"),
      preferCSSPageSize: true,
    });
  }
  await paper.close();
});
