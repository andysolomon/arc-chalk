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
  configuredWristbandHtml,
  defaultWristbandConfig,
  readWristbandConfigs,
  reconcileWristbandConfig,
  wristbandFit,
  wristbandInserts,
  wristbandSizePresets,
  type DiagramRenderer,
  type WristbandConfig,
} from "@chalk/exports";

const plays = starterExamplePlays();
const T0 = Date.UTC(2026, 8, 13, 12);
let counter = 0;
const createId = (prefix: string) => `${prefix}_${(counter += 1)}`;
const render: DiagramRenderer = (play) => `<svg data-play="${play.id}"></svg>`;

function packetOf(count: number) {
  const members: PlayDocument[] = Array.from({ length: count }, (_, i) => ({
    ...plays[i % plays.length]!,
    id: `play_band_${i + 1}`,
    name:
      i === 2
        ? "Trips Right Slot Motion — Stick Thunder Alert Smash vs Two-High Shell"
        : `Call ${i + 1}`,
  }));
  let plan = createGamePlan({
    playbookId: plays[0]!.playbookId,
    name: "Week 4",
    unit: "offense",
    nowMs: T0,
    sections: ["Openers", "3rd down"],
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
    const result = assignCallCode(plan, callId, String(index + 1), T0 + 2);
    if (result.ok) plan = result.plan;
  });
  // The first call answers on third down too; it stays one cell.
  plan = placeCallInSection(
    plan,
    added.callIds[0]!,
    plan.sections[1]!.id,
    undefined,
    T0 + 3,
  );
  const sources = new Map(
    members.map((play) => [
      play.id,
      { document: play, documentHash: `h_${play.id}` },
    ]),
  );
  const prepared = prepareGamePlan(plan, sources, { nowMs: T0 + 10, createId });
  return {
    revision: gamePlanRevisionSchema.parse(prepared.revision),
    callIds: added.callIds,
  };
}

describe("configurable wristband inserts (issue #71)", () => {
  it("starts from the plan's own calls in plan order, never from the library, and paginates past eight", () => {
    const { revision } = packetOf(11);
    const config = defaultWristbandConfig(revision);
    expect(config.presetId).toBe("2.1x1.4-2x4");
    expect(config.calls).toHaveLength(11);
    const inserts = wristbandInserts(revision, config);
    expect(inserts.map((insert) => insert.cells.length)).toEqual([8, 3]);
    expect(
      inserts.flatMap((insert) => insert.cells.map((cell) => cell.code)),
    ).toEqual(Array.from({ length: 11 }, (_, i) => String(i + 1)));
    const html = configuredWristbandHtml(revision, config, { render });
    expect(html).toContain("Insert 1 of 2");
    expect(html).toContain("Insert 2 of 2");
    expect(html.match(/class="wc /g)).toHaveLength(11);
    expect(html).toContain("grid-template-columns:repeat(2,2.1in)");
    expect(html).toContain("width:2.1in;height:1.4in");
    // Cut guides, corner ticks, a one-inch bar and the 100 % instruction.
    expect(html).toContain("border:0.5px dashed");
    expect(html).toContain('<i class="tl"></i>');
    expect(html).toContain("width:1in;height:6px");
    expect(html).toContain("print at 100 % (Actual size), not Fit to page");
  });

  it("keeps the Coach's order and short names, and describes presets by their dimensions", () => {
    const { revision, callIds } = packetOf(4);
    const config: WristbandConfig = {
      ...defaultWristbandConfig(revision),
      layout: "code-name",
      calls: [
        { callId: callIds[3]!, shortName: "Z Flat" },
        { callId: callIds[0]! },
        { callId: callIds[2]!, shortName: "Trips Stick" },
      ],
    };
    const html = configuredWristbandHtml(revision, config, { render });
    expect(html.indexOf('<b class="cc">4</b>')).toBeLessThan(
      html.indexOf('<b class="cc">1</b>'),
    );
    expect(html).toContain(
      "Z FLAT".toLowerCase() === "z flat" ? "Z Flat" : "Z Flat",
    );
    expect(html).toContain("Trips Stick");
    expect(html).not.toContain("Call 2");
    expect(html).not.toContain("<svg");
    for (const preset of wristbandSizePresets) {
      expect(preset.name).toMatch(/^\d+(\.\d+)? × \d+(\.\d+)? in cells/);
      expect(preset.name).not.toMatch(/compatible|fits every/i);
    }
  });

  it("detects duplicate codes, missing plays and names that will not fit before printing", () => {
    const { revision, callIds } = packetOf(4);
    const base = defaultWristbandConfig(revision);
    const fit = wristbandFit(revision, base);
    expect(fit.inserts).toBe(1);
    expect(
      fit.warnings.some(
        (w) =>
          w.includes("Two-High Shell") && w.includes("give it a short name"),
      ),
    ).toBe(true);
    const shortened = wristbandFit(revision, {
      ...base,
      calls: base.calls.map((call) =>
        call.callId === callIds[2]
          ? { ...call, shortName: "Trips Stick" }
          : call,
      ),
    });
    expect(shortened.warnings.some((w) => w.includes("Two-High"))).toBe(false);

    const twins = {
      ...revision,
      plan: {
        ...revision.plan,
        calls: revision.plan.calls.map((call, i) =>
          i < 2 ? { ...call, code: "9" } : call,
        ),
      },
    };
    const dup = wristbandFit(twins, base);
    expect(dup.warnings).toContain("Code 9 is on 2 cells.");

    const gone = gamePlanRevisionSchema.parse({
      ...revision,
      plays: revision.plays.slice(1),
      missingPlayIds: [revision.plays[0]!.playId],
    });
    expect(
      wristbandFit(gone, base).warnings.some((w) =>
        w.includes("prints as missing"),
      ),
    ).toBe(true);
    expect(configuredWristbandHtml(gone, base, { render })).toContain(
      "missing",
    );
    expect(
      wristbandFit(revision, { ...base, cellHeightIn: 0.8 }).warnings.some(
        (w) => w.includes("too short for a diagram"),
      ),
    ).toBe(true);
  });

  it("stores dimensions, layout and selection as a preset and follows the packet", () => {
    const { revision, callIds } = packetOf(3);
    const stored = readWristbandConfigs({
      p1: {
        cellWidthIn: 3,
        cellHeightIn: 1.5,
        columns: 1,
        rows: 3,
        layout: "mixed",
        calls: [
          { callId: "gone" },
          { callId: callIds[1], shortName: "Two" },
          { callId: 4 },
        ],
        presetId: "3x1.5-1x3",
      },
      junk: null,
    });
    expect(Object.keys(stored)).toEqual(["p1"]);
    const config = reconcileWristbandConfig(stored.p1!, revision);
    expect(config).toMatchObject({
      cellWidthIn: 3,
      cellHeightIn: 1.5,
      columns: 1,
      rows: 3,
      layout: "mixed",
      presetId: "3x1.5-1x3",
    });
    expect(config.calls).toEqual([{ callId: callIds[1], shortName: "Two" }]);
    expect(
      readWristbandConfigs({ p2: { cellWidthIn: 99, rows: -1 } }).p2,
    ).toMatchObject({ cellWidthIn: 7.5, rows: 1 });
  });
});
