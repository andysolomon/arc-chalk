import {
  addCalls,
  assignCallCode,
  createGamePlan,
  gamePlanRevisionSchema,
  placeCallInSection,
  prepareGamePlan,
  starterExamplePlays,
  type PlayDocument,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

import {
  callSheetFit,
  configuredCallSheetHtml,
  defaultCallSheetConfig,
  readCallSheetConfigs,
  reconcileCallSheetConfig,
  type CallSheetConfig,
} from "@chalk/exports";

const plays = starterExamplePlays();
const offense = plays.filter((play) => play.unit === "offense");
const defense = plays.filter((play) => play.unit === "defense");
const T0 = Date.UTC(2026, 8, 13, 12);
let counter = 0;
const createId = (prefix: string) => `${prefix}_${(counter += 1)}`;
const sourcesOf = (docs: readonly PlayDocument[]) =>
  new Map(
    docs.map((play) => [
      play.id,
      { document: play, documentHash: `h_${play.id}` },
    ]),
  );

/** A plan of one unit drawn from the mixed master library. */
function planFor(
  unit: "offense" | "defense",
  members: readonly PlayDocument[],
  sections: readonly string[],
  codes: readonly string[],
) {
  let plan = createGamePlan({
    playbookId: plays[0]!.playbookId,
    name: unit === "offense" ? "Week 3" : "Week 3 — D",
    unit,
    opponent: "Central",
    gameLabel: "Homecoming",
    nowMs: T0,
    sections,
    createId,
  });
  const added = addCalls(
    plan,
    members.map(({ id }) => id),
    {
      nowMs: T0 + 1,
      sectionId: plan.sections[0]!.id,
      createId,
    },
  );
  plan = added.plan;
  added.callIds.forEach((callId, index) => {
    const result = assignCallCode(plan, callId, codes[index] ?? "", T0 + 2);
    if (result.ok) plan = result.plan;
  });
  // The first call answers in the second situation too.
  plan = placeCallInSection(
    plan,
    added.callIds[0]!,
    plan.sections[1]!.id,
    undefined,
    T0 + 3,
  );
  const prepared = prepareGamePlan(plan, sourcesOf(members), {
    nowMs: T0 + 10,
    label: "v2",
    createId,
  });
  return {
    plan: prepared.plan,
    revision: gamePlanRevisionSchema.parse(prepared.revision),
    callIds: added.callIds,
  };
}

describe("configured coordinator call sheets (issue #70)", () => {
  it("builds an OC sheet from the offense alone, with plan, opponent, unit and version in the header", () => {
    const { plan, revision } = planFor(
      "offense",
      offense,
      ["Openers", "3rd down", "Red zone"],
      ["12", "7", "31", "99"],
    );
    const config = defaultCallSheetConfig(plan);
    expect(config.template).toBe("oc");
    expect(config.columns).toEqual(["personnel", "formation", "alert"]);
    const html = configuredCallSheetHtml(revision, config, { formations: [] });
    expect(html).toContain("Week 3 — Offensive coordinator");
    expect(html).toContain(
      'vs Central · Homecoming · <span class="ub" data-unit="offense">Offense</span> · Prepared 13 Sep 2026 · v2',
    );
    expect(html).not.toContain("Cover 3");
    // Every offensive call is on it with its code.
    for (const code of ["12", "7", "31", "99"]) {
      expect(html).toContain(`<td class="cc">${code}</td>`);
    }
    // Columns read off the play, and a ruled blank for the pen.
    expect(html).toContain(
      "<th>Personnel</th><th>Formation</th><th>Alert</th>",
    );
    expect(html).toContain('<td class="bl"></td>');
    expect(html).toContain("@page{size:letter landscape;margin:0.4in}");
  });

  it("builds a DC sheet from the defense, and shares a call's code across situations without renumbering", () => {
    const { plan, revision } = planFor(
      "defense",
      defense,
      ["Base", "3rd & long", "Red zone"],
      ["D1"],
    );
    const config = defaultCallSheetConfig(plan);
    expect(config.template).toBe("dc");
    const html = configuredCallSheetHtml(revision, config);
    expect(html).toContain("Defensive coordinator");
    expect(html).not.toContain("Stick — Thunder");
    // Listed under Base and under 3rd & long with one code.
    expect(html.match(/<td class="cc">D1<\/td>/g)).toHaveLength(2);
    const reordered: CallSheetConfig = {
      ...config,
      sections: [...config.sections].reverse().map((section, index) => ({
        ...section,
        title: index === 0 ? "Money down" : section.title,
        accent: "a",
      })),
    };
    const again = configuredCallSheetHtml(revision, reordered);
    expect(again.indexOf("Money down")).toBeLessThan(again.indexOf("Base"));
    expect(again.match(/<td class="cc">D1<\/td>/g)).toHaveLength(2);
    // An accent is a colour, a letter and a rule — readable in grayscale.
    expect(again).toContain('<span class="tag">A</span>');
    expect(again).toContain("border-top:3px solid var(--accent");
  });

  it("wraps long names rather than cutting them, and lays two sides out as two sheets", () => {
    const long = {
      ...offense[0]!,
      id: "play_long",
      name: "Trips Right Slot Motion — Stick Thunder Alert Smash vs Two-High Shell (Red Zone Only)",
    };
    const { plan, revision } = planFor(
      "offense",
      [long, ...offense.slice(1)],
      ["Openers", "3rd down", "Red zone", "Two minute"],
      ["1", "2", "3", "4"],
    );
    const config: CallSheetConfig = {
      ...defaultCallSheetConfig(plan),
      sides: 2,
      density: "compact",
    };
    const html = configuredCallSheetHtml(revision, config);
    expect(html).toContain(long.name);
    expect(html).not.toContain("text-overflow:ellipsis");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html.match(/class="side compact"/g)).toHaveLength(2);
    expect(html).toContain("Side 1 of 2");
    expect(html).toContain("Side 2 of 2");
    // The two-minute section went to side two by default.
    const sideTwo = html.slice(html.indexOf("Side 2 of 2"));
    expect(sideTwo).toContain("Two minute");
    // The footer counts a call once however many sections list it.
    const total = revision.plan.calls.length;
    expect(html).toContain(`${total} calls · codes as on the wristband`);

    // A section left off the sheet is said so, not counted as printed.
    const without = configuredCallSheetHtml(revision, {
      ...config,
      sections: config.sections.slice(1),
    });
    const openersOnly = revision.plan.sections[0]!.callIds.filter(
      (id) => !revision.plan.sections[1]!.callIds.includes(id),
    ).length;
    expect(without).toContain(
      `${total - openersOnly} of ${total} calls — ${openersOnly} left off this sheet`,
    );
    expect(without).not.toContain("Openers");
  });

  it("warns about a section that flows, a missing play and a duplicate code before printing", () => {
    const many = Array.from({ length: 22 }, (_, i) => ({
      ...offense[0]!,
      id: `play_many_${i}`,
      name: `Play ${i}`,
    }));
    const { plan, revision } = planFor(
      "offense",
      many,
      ["Openers", "3rd down"],
      many.map((_, i) => String(i + 1)),
    );
    const fit = callSheetFit(revision, defaultCallSheetConfig(plan));
    expect(fit.rowsPerColumn).toBe(18);
    expect(fit.warnings.some((w) => w.includes("Openers lists 22 calls"))).toBe(
      true,
    );
    const compact = callSheetFit(revision, {
      ...defaultCallSheetConfig(plan),
      density: "compact",
    });
    expect(compact.warnings.some((w) => w.includes("Openers lists"))).toBe(
      false,
    );

    const missing = {
      ...revision,
      plays: revision.plays.slice(1),
      missingPlayIds: [revision.plays[0]!.playId],
    };
    const gone = callSheetFit(
      gamePlanRevisionSchema.parse(missing),
      defaultCallSheetConfig(plan),
    );
    expect(gone.warnings.some((w) => w.includes("print as missing"))).toBe(
      true,
    );
  });

  it("keeps a stored layout in step with the plan and reads back only what it wrote", () => {
    const { plan } = planFor(
      "offense",
      offense,
      ["Openers", "3rd down"],
      ["12", "7", "31", "99"],
    );
    const stored = readCallSheetConfigs({
      [plan.id]: {
        template: "oc",
        sections: [
          { sectionId: "gone", accent: "b", side: 1 },
          {
            sectionId: plan.sections[1]!.id,
            accent: "c",
            side: 2,
            title: "Third",
          },
        ],
        columns: ["formation", "bogus", "alert"],
        density: "compact",
        sides: 2,
        thumbnails: true,
      },
      junk: 4,
    });
    expect(Object.keys(stored)).toEqual([plan.id]);
    const config = reconcileCallSheetConfig(stored[plan.id]!, plan);
    expect(config.sections.map(({ sectionId }) => sectionId)).toEqual([
      plan.sections[1]!.id,
      plan.sections[0]!.id,
    ]);
    expect(config.sections[0]).toMatchObject({
      title: "Third",
      accent: "c",
      side: 2,
    });
    expect(config.columns).toEqual(["formation", "alert"]);

    // A section left off on purpose stays off; one the plan has lost is forgotten.
    const off = reconcileCallSheetConfig(
      { ...config, sections: [], omitted: [plan.sections[0]!.id, "gone"] },
      plan,
    );
    expect(off.sections.map(({ sectionId }) => sectionId)).toEqual([
      plan.sections[1]!.id,
    ]);
    expect(off.omitted).toEqual([plan.sections[0]!.id]);
    expect(config.density).toBe("compact");
    expect(config.notesColumn).toBe(true);
    expect(readCallSheetConfigs("x")).toEqual({});
  });
});
