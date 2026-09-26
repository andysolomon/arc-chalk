import {
  addCalls,
  assignCallCode,
  createGamePlan,
  gamePlanRevisionSchema,
  prepareGamePlan,
  starterExamplePlays,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

import {
  playRows,
  binderHtml,
  binderPageCss,
  bookEntriesOf,
  defaultBinderConfig,
  defaultHandoutConfig,
  handoutFit,
  handoutSheetHtml,
  readBookConfigs,
  type BookEntry,
  type DiagramRenderer,
} from "@chalk/exports";

/** A hundred numbered calls over three sections, one Play each. */
function hundredCallPlan() {
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

const plays = starterExamplePlays();
const render: DiagramRenderer = (play) => `<svg data-play="${play.id}"></svg>`;
const options = { render, year: 2026, title: "Week 5", subtitle: "Offense" };

describe("binder (issue #72)", () => {
  it("builds from the explicit source in its order, with codes, dividers and the revision on the cover", () => {
    const packet = hundredCallPlan();
    const entries = bookEntriesOf({ revision: packet.revision, plays: [] });
    expect(entries).toHaveLength(100);
    expect(entries[0]).toMatchObject({
      code: "1",
      section: "Openers",
      missing: false,
    });
    // Section order, not numeric: 1, 4, 7… lead.
    expect(entries.slice(0, 3).map((e) => e.code)).toEqual(["1", "4", "7"]);
    const html = binderHtml(entries, defaultBinderConfig, {
      ...options,
      revisionLine: `Prepared 13 Sep 2026 · ${packet.revision.id}`,
    });
    expect(html).toContain("<h1>Week 5</h1>");
    expect(html).toContain(packet.revision.id);
    // What the printer keeps whole is marked, and the rule that keeps it.
    expect(html).toContain('<div class="tr" data-keep data-contents-for=');
    expect(html).toContain("<tr data-keep>");
    expect(html).toContain('<div class="hd" data-keep>');
    expect(html).toContain("<svg data-keep ");
    expect(html).toContain(
      "[data-keep]{break-inside:avoid;page-break-inside:avoid}",
    );
    expect(html.match(/data-book-page="divider:/g)).toHaveLength(3);
    expect(html.match(/data-book-page="plan_call_/g)).toHaveLength(100);
    expect(html).toContain('<span class="cc">1</span> · ');
    // Nothing is numbered until the layout has been measured.
    expect(html).not.toMatch(/<span class="tp">\d+<\/span>/);
    expect(html.match(/<div class="pno">—<\/div>/g)).toHaveLength(100);
  });

  it("writes the measured page numbers into the contents and the footers", () => {
    const entries: BookEntry[] = plays.slice(0, 3).map((play, i) => ({
      id: `e${i}`,
      play,
      name: play.name,
      code: String(i + 1),
      section: "Openers",
      missing: false,
    }));
    // A two-sheet contents and a dense first play move everything after them.
    const map = {
      cover: { start: 1, sheets: 1 },
      contents: { start: 2, sheets: 2 },
      "divider:Openers": { start: 4, sheets: 1 },
      e0: { start: 5, sheets: 2 },
      e1: { start: 7, sheets: 1 },
      e2: { start: 8, sheets: 1 },
    };
    const html = binderHtml(entries, defaultBinderConfig, options, map);
    expect(html).toContain('data-contents-for="e0"');
    expect(html).toMatch(
      /data-contents-for="e0"[^]*?<span class="tp">5<\/span>/,
    );
    expect(html).toMatch(
      /data-contents-for="e1"[^]*?<span class="tp">7<\/span>/,
    );
    expect(html).toMatch(
      /data-contents-for="e2"[^]*?<span class="tp">8<\/span>/,
    );
    expect(html).toContain('<div class="pno">7</div>');
  });

  it("keeps the gutter on the bound edge, mirrored for duplex", () => {
    expect(
      binderPageCss({ ...defaultBinderConfig, gutterIn: 0.75, duplex: false }),
    ).toBe("@page{size:letter portrait;margin:0.5in 0.5in 0.5in 1.25in}");
    const duplex = binderPageCss({
      ...defaultBinderConfig,
      gutterIn: 0.75,
      paper: "a4",
    });
    expect(duplex).toContain("@page{size:A4 portrait;margin:0.5in}");
    expect(duplex).toContain(
      "@page :left{margin-left:0.5in;margin-right:1.25in}",
    );
    expect(duplex).toContain(
      "@page :right{margin-left:1.25in;margin-right:0.5in}",
    );
    const html = binderHtml(
      [{ id: "x", play: plays[0]!, name: plays[0]!.name, missing: false }],
      {
        ...defaultBinderConfig,
        contents: false,
        dividers: false,
        pageNumbers: false,
        notesArea: true,
      },
      options,
    );
    expect(html).not.toContain("Contents");
    expect(html).toContain('<div class="na" data-keep>');
    expect(html).not.toContain('class="pno"');
  });
});

describe("handout (issue #72)", () => {
  it("lays cards out one, two or four to a sheet and counts what a compact card leaves off", () => {
    const entries = bookEntriesOf({ plays: plays.slice(0, 5) });
    const two = handoutSheetHtml(entries, defaultHandoutConfig, options);
    expect(two.match(/class="hs up2"/g)).toHaveLength(3);
    expect(two).toContain("@page{size:letter portrait;margin:0.5in}");
    const four = handoutSheetHtml(
      entries,
      { ...defaultHandoutConfig, up: 4, orientation: "landscape", paper: "a4" },
      options,
    );
    expect(four.match(/class="hs up4"/g)).toHaveLength(2);
    expect(four).toContain("@page{size:A4 landscape;margin:0.5in}");
    expect(four).toContain("grid-template-columns:repeat(2,1fr)");
    const dense = plays
      .slice(0, 5)
      .reduce((best, play) =>
        playRows(play).length > playRows(best).length ? play : best,
      );
    const over = playRows(dense).length - 6;
    const fit = handoutFit(
      bookEntriesOf({ plays: [dense] }),
      defaultHandoutConfig,
    );
    expect(fit.sheets).toBe(1);
    expect(
      fit.warnings.some((w) => w.includes("more than 6 assignments")),
    ).toBe(over > 0);
    if (over > 0) expect(two).toContain(`and ${over} more — see the binder`);
    else expect(two).not.toContain("see the binder");
    const full = handoutSheetHtml(
      entries,
      { ...defaultHandoutConfig, assignments: "full" },
      options,
    );
    expect(full).not.toContain("see the binder");
    const bare = handoutSheetHtml(
      entries,
      { ...defaultHandoutConfig, assignments: "none", notes: false },
      options,
    );
    expect(bare).not.toContain("<table>");
    const fullFit = handoutFit(entries, {
      ...defaultHandoutConfig,
      up: 4,
      assignments: "full",
    });
    expect(fullFit.grows).toBe(true);
    expect(fullFit.warnings.some((w) => w.includes("never cut"))).toBe(true);
    expect(
      handoutFit(entries, {
        ...defaultHandoutConfig,
        assignments: "none",
        notes: false,
      }).grows,
    ).toBe(false);
  });

  it("reads stored layouts back with sane bounds", () => {
    const configs = readBookConfigs({
      binder: { paper: "a4", gutterIn: 9, duplex: false, dividers: "no" },
      handout: { up: 3, orientation: "landscape", assignments: "full" },
    });
    expect(configs.binder).toMatchObject({
      paper: "a4",
      gutterIn: 2,
      duplex: false,
      dividers: true,
    });
    expect(configs.handout).toMatchObject({
      up: 2,
      orientation: "landscape",
      assignments: "full",
      paper: "letter",
    });
    expect(readBookConfigs(null).binder).toEqual(defaultBinderConfig);
  });
});
