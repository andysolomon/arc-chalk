import {
  addCalls,
  assignCallCode,
  createGamePlan,
  gamePlanRevisionSchema,
  prepareGamePlan,
  starterExamplePlays,
  type PlayDocument,
} from "@chalk/domain";
import {
  binderHtml,
  bookEntriesOf,
  defaultBinderConfig,
  defaultHandoutConfig,
  handoutSheetHtml,
  pageCount,
  pagesFromLayout,
  previewCss,
  withPreviewCss,
  type BookBlockLayout,
  type DiagramRenderer,
  type HandoutConfig,
} from "@chalk/exports";
import { expect, test } from "@playwright/test";

/**
 * Issue #72, as printed rather than as strung together: the handout's cards
 * never clip — the last line of a long card is inside the card and on the
 * sheet, and a card that outgrows its share pushes the rest onto more
 * sheets — and the binder's page numbers, measured off the preview at the
 * gutter's width with the printer's keep-together rules, match the pages
 * Chromium actually prints.
 */
test.describe("book outputs as printed (issue #72)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "PDF rendering is Chromium's",
  );

  test("a handout card is never clipped: full assignments and long notes grow the card and flow to more sheets", async ({
    page,
  }) => {
    const entries = bookEntriesOf({ plays: longPlays() });
    for (const config of [
      { ...defaultHandoutConfig, assignments: "full" as const },
      {
        ...defaultHandoutConfig,
        up: 4 as const,
        orientation: "landscape" as const,
        assignments: "full" as const,
      },
      { ...defaultHandoutConfig, up: 4 as const },
    ] satisfies HandoutConfig[]) {
      const html = handoutSheetHtml(entries, config, bookOptions);
      await page.setContent(
        withPreviewCss(
          html,
          previewCss(
            {
              size: config.paper,
              orientation: config.orientation,
              marginIn: 0.5,
            },
            false,
          ),
        ),
      );
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".hc")].map((card) => {
          let last: Element = card;
          while (last.lastElementChild) last = last.lastElementChild;
          const own = card.getBoundingClientRect();
          const tail = last.getBoundingClientRect();
          return {
            height: own.height,
            minHeight: parseFloat(getComputedStyle(card).minHeight) || 0,
            clipped: card.scrollHeight > card.clientHeight + 1,
            tailInside:
              tail.height > 0 &&
              tail.bottom <= own.bottom + 1 &&
              tail.right <= own.right + 1,
            tailText: last.textContent?.trim().slice(-40) ?? "",
          };
        }),
      );
      expect(cards).toHaveLength(entries.length);
      for (const card of cards) {
        expect(card.clipped, `clipped: ${card.tailText}`).toBe(false);
        expect(card.tailInside, `outside: ${card.tailText}`).toBe(true);
      }
      // The last thing on every card is the end of its notes.
      expect(cards.every((card) => card.tailText.endsWith("late."))).toBe(true);
      const grew = cards.filter((card) => card.height > card.minHeight + 1);
      const floor = Math.ceil(entries.length / config.up);
      const pdf = await page.pdf({ preferCSSPageSize: true });
      if (grew.length > 0) {
        expect(pdfPages(pdf)).toBeGreaterThan(floor);
      } else {
        expect(pdfPages(pdf)).toBe(floor);
      }
      // Full assignments and long notes outgrow a card's share of the sheet.
      if (config.assignments === "full") expect(grew.length).toBeGreaterThan(0);
    }
  });

  test("a binder's measured page numbers match the pages Chromium prints, gutter and keep-together rules included", async ({
    page,
  }) => {
    const packet = hundredCallPlan();
    const entries = bookEntriesOf({ revision: packet.revision, plays: [] });
    const config = { ...defaultBinderConfig, gutterIn: 1, notesArea: true };
    const paper = {
      size: "letter" as const,
      orientation: "portrait" as const,
      marginIn: 0.5,
      gutterIn: config.gutterIn,
    };
    // First pass: lay the book out as the preview does, at the printed width.
    await page.setContent(
      withPreviewCss(
        binderHtml(entries, config, bookOptions),
        previewCss(paper, false),
      ),
    );
    const layout = await page.evaluate((): BookBlockLayout[] =>
      [...document.querySelectorAll<HTMLElement>("[data-book-page]")].map(
        (node) => {
          const rect = node.getBoundingClientRect();
          return {
            id: node.getAttribute("data-book-page")!,
            height: rect.height,
            keeps: [...node.querySelectorAll<HTMLElement>("[data-keep]")]
              .filter(
                (keep) => keep.parentElement?.closest("[data-keep]") === null,
              )
              .map((keep) => {
                const own = keep.getBoundingClientRect();
                return { top: own.top - rect.top, height: own.height };
              }),
          };
        },
      ),
    );
    const contentWidth = await page.evaluate(
      () => document.body.getBoundingClientRect().width,
    );
    // Letter less half-inch margins and the inch of gutter: 6.5 in.
    expect(contentWidth).toBeCloseTo(6.5 * 96 + 2 * 0.5 * 96 + 1 * 96, 0);
    const map = pagesFromLayout(layout, 10 * 96);
    expect(map.cover).toEqual({ start: 1, sheets: 1 });
    expect(map.contents!.sheets).toBeGreaterThan(1);

    // Second pass: the numbers written in, then printed.
    const numbered = binderHtml(entries, config, bookOptions, map);
    expect(numbered).not.toMatch(/<span class="tp">—<\/span>/);
    await page.setContent(numbered);
    const pdf = await page.pdf({ preferCSSPageSize: true });
    expect(pdfPages(pdf)).toBe(pageCount(map));
  });
});

/** Pages in a PDF, by its page objects. */
function pdfPages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? [])
    .length;
}

const render: DiagramRenderer = (play) =>
  `<svg viewBox="0 0 1600 1000" xmlns="http://www.w3.org/2000/svg" data-play="${play.id}"><rect width="1600" height="1000" fill="#eef4ea"/><text x="40" y="80" font-size="60">${play.name}</text></svg>`;
const bookOptions = {
  render,
  year: 2026,
  title: "Week 5",
  subtitle: "Offense",
};

/** Starter plays given long wording, conversions and notes. */
function longPlays(): readonly PlayDocument[] {
  const notes = Array.from(
    { length: 7 },
    (_, line) =>
      `Line ${line + 1}: against a two-high shell the read stays on the flat defender; if he widens throw the stick now, if he sits work the flat, and if the corner squats climb the ladder late.`,
  ).join("\n");
  return starterExamplePlays()
    .slice(0, 5)
    .map((play) => ({
      ...play,
      notes,
      assignments: play.assignments.map((assignment) => ({
        ...assignment,
        text: `${assignment.text || "Block"} — then work back across the formation, settle in the first open window past the linebacker, and expect the ball late on the scramble drill`,
      })),
      paths: play.paths.map((path) => ({
        ...path,
        conversion:
          "vs cover 2 convert to a corner route and hold the sideline until the throw",
      })),
    }));
}

/** A hundred numbered calls over three sections, one Play each. */
function hundredCallPlan() {
  const plays = starterExamplePlays();
  let ids = 0;
  const createId = (prefix: string) => `${prefix}_${(ids += 1)}`;
  const members = Array.from({ length: 100 }, (_, index) => ({
    ...plays[index % plays.length]!,
    id: `play_call_${index + 1}`,
    name: `${plays[index % plays.length]!.name} ${index + 1}`,
  }));
  let plan = createGamePlan({
    playbookId: plays[0]!.playbookId,
    name: "Week 5",
    unit: "offense",
    nowMs: 1,
    sections: ["Openers", "3rd down", "Red zone"],
    createId,
  });
  members.forEach((play, index) => {
    const added = addCalls(plan, [play.id], {
      nowMs: index + 2,
      sectionId: plan.sections[index % 3]!.id,
      createId,
    });
    const coded = assignCallCode(
      added.plan,
      added.callIds[0]!,
      String(index + 1),
      index + 3,
    );
    plan = coded.ok ? coded.plan : added.plan;
  });
  const sources = new Map(
    members.map((play) => [
      play.id,
      { document: play, documentHash: `h_${play.id}` },
    ]),
  );
  const prepared = prepareGamePlan(plan, sources, { nowMs: 1000, createId });
  return { revision: gamePlanRevisionSchema.parse(prepared.revision) };
}
