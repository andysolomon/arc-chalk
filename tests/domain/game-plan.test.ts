import {
  addCalls,
  addSection,
  assignCallCode,
  compareCallCodes,
  createGamePlan,
  defaultGamePlanSections,
  describeAddition,
  duplicateGamePlan,
  gamePlanRevisionSchema,
  gamePlanSchema,
  gamePlanSubtitle,
  moveCallInSection,
  moveCallToSection,
  moveSection,
  nextFreeCallCode,
  placeCallInSection,
  planPlayIds,
  prepareGamePlan,
  previewAddition,
  removeCall,
  removeSection,
  revisionRows,
  revisionStatus,
  sortSectionByCode,
  starterExamplePlays,
  unsectionedCallIds,
  type GamePlan,
  type PlayDocument,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

const plays = starterExamplePlays();
const stick = plays[0]!;
const doublesRight = plays[1]!;
const redZone = plays.find(({ id }) => id === "play_stick_thunder_red_zone")!;
const verts = plays.find(({ id }) => id === "play_four_verticals")!;
const coverThree = plays.find(({ id }) => id === "play_cover_3_fire_zone")!;

let counter = 0;
const createId = (prefix: string) => `${prefix}_${(counter += 1)}`;
const T0 = 1_700_000_000_000;

function freshPlan(unit: "offense" | "defense" = "offense"): GamePlan {
  return createGamePlan({
    playbookId: stick.playbookId,
    name: "Week 3",
    unit,
    opponent: "Central",
    nowMs: T0,
    sections: defaultGamePlanSections[unit],
    createId,
  });
}

const sourcesOf = (docs: readonly PlayDocument[]) =>
  new Map(
    docs.map((document) => [
      document.id,
      { document, documentHash: `hash_${document.id}_v1` },
    ]),
  );

describe("Game plans", () => {
  it("starts empty, named, for one coordinator, with the sections he calls from", () => {
    const plan = freshPlan("defense");
    expect(plan.unit).toBe("defense");
    expect(plan.calls).toEqual([]);
    expect(plan.sections.map(({ name }) => name)).toEqual([
      "Base",
      "3rd down",
      "Red zone",
      "Pressure",
      "Two minute",
    ]);
    expect(gamePlanSubtitle(plan)).toBe("vs Central");
    expect(() =>
      createGamePlan({
        playbookId: "p",
        name: "  ",
        unit: "offense",
        nowMs: T0,
      }),
    ).toThrow("Give the game plan a name first.");
  });

  it("previews a bulk addition — new calls and the ones already held — before doing it", () => {
    let plan = freshPlan();
    const first = addCalls(plan, [stick.id, doublesRight.id], {
      nowMs: T0 + 1,
      createId,
    });
    plan = first.plan;
    expect(first.preview).toEqual({ added: 2, already: 0, total: 2 });
    expect(describeAddition(first.preview)).toBe("2 new calls");

    const preview = previewAddition(plan, [stick.id, verts.id, verts.id]);
    expect(preview).toEqual({ added: 1, already: 1, total: 2 });
    expect(describeAddition(preview, "3rd down")).toBe(
      "1 new call · 1 already in the plan, placed in 3rd down",
    );
    expect(describeAddition({ added: 0, already: 0, total: 0 })).toBe(
      "Nothing selected.",
    );
  });

  it("keeps one call per Play however many sections it answers in", () => {
    let plan = freshPlan();
    const openers = plan.sections[0]!.id;
    const third = plan.sections[2]!.id;
    plan = addCalls(plan, [stick.id], {
      nowMs: T0 + 1,
      sectionId: openers,
      createId,
    }).plan;
    plan = addCalls(plan, [stick.id, verts.id], {
      nowMs: T0 + 2,
      sectionId: third,
      createId,
    }).plan;
    expect(plan.calls).toHaveLength(2);
    const stickCall = plan.calls.find(({ playId }) => playId === stick.id)!;
    expect(plan.sections[0]!.callIds).toEqual([stickCall.id]);
    expect(plan.sections[2]!.callIds).toEqual([
      stickCall.id,
      plan.calls[1]!.id,
    ]);
    // One code, wherever it is listed.
    const coded = assignCallCode(plan, stickCall.id, "12", T0 + 3);
    expect(coded.ok).toBe(true);
    if (!coded.ok) return;
    const rows = revisionRows(
      prepareGamePlan(coded.plan, sourcesOf(plays), {
        nowMs: T0 + 4,
        createId,
      }).revision,
    );
    expect(rows[0]!.calls.map(({ code }) => code)).toEqual(["12"]);
    expect(rows[2]!.calls.map(({ code }) => code)).toEqual(["12", ""]);
    expect(planPlayIds(coded.plan)).toEqual([stick.id, verts.id]);
  });

  it("refuses a colliding code, names its holder, and never renumbers on a sort", () => {
    let plan = freshPlan();
    const section = plan.sections[0]!.id;
    const added = addCalls(plan, [stick.id, doublesRight.id, redZone.id], {
      nowMs: T0 + 1,
      sectionId: section,
      createId,
    });
    plan = added.plan;
    const [a, b, c] = added.callIds as [string, string, string];
    plan = (assignCallCode(plan, a, "21", T0 + 2) as { plan: GamePlan }).plan;
    plan = (assignCallCode(plan, b, "3", T0 + 3) as { plan: GamePlan }).plan;
    const collision = assignCallCode(plan, c, " 21 ", T0 + 4);
    expect(collision).toEqual({
      ok: false,
      reason: "21 is already a call in this plan.",
      holderCallId: a,
    });
    expect(nextFreeCallCode(plan)).toBe("22");
    plan = (assignCallCode(plan, c, "Z-Left", T0 + 5) as { plan: GamePlan })
      .plan;

    const sorted = sortSectionByCode(plan, section, T0 + 6);
    expect(sorted.sections[0]!.callIds).toEqual([b, a, c]);
    expect(sorted.calls.map(({ code }) => code)).toEqual(["21", "3", "Z-Left"]);
    expect(
      () =>
        gamePlanSchema.parse({
          ...plan,
          calls: plan.calls.map((call) => ({ ...call, code: "7" })),
        }),
      "the schema itself refuses duplicate codes",
    ).toThrow();
    // Taking a code off is allowed and frees it.
    const cleared = assignCallCode(plan, a, "", T0 + 7);
    expect(cleared.ok && cleared.plan.calls[0]!.code).toBe("");
  });

  it("orders codes as numbers first, then words, blanks last", () => {
    expect(["10", "2", "", "B", "A", "1a"].sort(compareCallCodes)).toEqual([
      "2",
      "10",
      "1a",
      "A",
      "B",
      "",
    ]);
  });

  it("moves calls within and between sections, and sections among themselves", () => {
    let plan = freshPlan();
    const [openers, first, third] = plan.sections.map(({ id }) => id) as [
      string,
      string,
      string,
    ];
    const added = addCalls(plan, [stick.id, verts.id, redZone.id], {
      nowMs: T0 + 1,
      sectionId: openers,
      createId,
    });
    plan = added.plan;
    const [a, b, c] = added.callIds as [string, string, string];
    plan = moveCallInSection(plan, openers, c, "up", T0 + 2);
    expect(plan.sections[0]!.callIds).toEqual([a, c, b]);
    plan = moveCallInSection(plan, openers, a, 2, T0 + 3);
    expect(plan.sections[0]!.callIds).toEqual([c, b, a]);
    expect(moveCallInSection(plan, openers, c, "up", T0 + 4)).toBe(plan);

    plan = moveCallToSection(plan, b, openers, third, T0 + 5);
    expect(plan.sections[0]!.callIds).toEqual([c, a]);
    expect(plan.sections[2]!.callIds).toEqual([b]);
    plan = placeCallInSection(plan, a, third, 0, T0 + 6);
    expect(plan.sections[2]!.callIds).toEqual([a, b]);
    expect(plan.calls).toHaveLength(3);

    plan = moveSection(plan, third, "up", T0 + 7);
    expect(plan.sections.map(({ id }) => id).slice(0, 3)).toEqual([
      openers,
      third,
      first,
    ]);
    expect(moveSection(plan, openers, "up", T0 + 8)).toBe(plan);
  });

  it("keeps a call when its section goes, and drops it everywhere when it is removed", () => {
    let plan = freshPlan();
    const openers = plan.sections[0]!.id;
    const third = plan.sections[2]!.id;
    const added = addCalls(plan, [stick.id], {
      nowMs: T0 + 1,
      sectionId: openers,
      createId,
    });
    plan = placeCallInSection(added.plan, added.callIds[0]!, third, 0, T0 + 2);
    plan = removeSection(plan, openers, T0 + 3);
    expect(plan.calls).toHaveLength(1);
    plan = removeSection(plan, third, T0 + 4);
    expect(unsectionedCallIds(plan)).toEqual([added.callIds[0]]);
    const rows = revisionRows(
      prepareGamePlan(plan, sourcesOf(plays), { nowMs: T0 + 5, createId })
        .revision,
    );
    expect(rows.at(-1)).toMatchObject({
      name: "Unsectioned",
      calls: [{ playId: stick.id, name: "Stick — Thunder", missing: false }],
    });
    plan = removeCall(plan, added.callIds[0]!, T0 + 6);
    expect(plan.calls).toEqual([]);
    expect(
      addSection(plan, { name: "Goal line", nowMs: T0 + 7, createId }).sections
        .length,
    ).toBe(4);
  });

  it("duplicates last week's plan with new identities and no prepared revision", () => {
    let plan = freshPlan();
    const added = addCalls(plan, [stick.id, verts.id], {
      nowMs: T0 + 1,
      sectionId: plan.sections[0]!.id,
      createId,
    });
    plan = (
      assignCallCode(added.plan, added.callIds[0]!, "12", T0 + 2) as {
        plan: GamePlan;
      }
    ).plan;
    plan = prepareGamePlan(plan, sourcesOf(plays), {
      nowMs: T0 + 3,
      createId,
    }).plan;
    expect(plan.preparedRevisionId).toBeDefined();

    const copy = duplicateGamePlan(plan, {
      name: "Week 4",
      opponent: "Eastern",
      nowMs: T0 + 10,
      createId,
    });
    expect(copy.id).not.toBe(plan.id);
    expect(copy.name).toBe("Week 4");
    expect(copy.opponent).toBe("Eastern");
    expect(copy.preparedRevisionId).toBeUndefined();
    expect(copy.calls.map(({ playId, code }) => [playId, code])).toEqual([
      [stick.id, "12"],
      [verts.id, ""],
    ]);
    expect(copy.calls.map(({ id }) => id)).not.toEqual(
      plan.calls.map(({ id }) => id),
    );
    expect(copy.sections[0]!.callIds).toEqual(copy.calls.map(({ id }) => id));
    expect(copy.sections.map(({ id }) => id)).not.toContain(
      plan.sections[0]!.id,
    );
  });
});

describe("Prepare for game", () => {
  it("freezes every referenced diagram into one revision the packet reads", () => {
    let plan = freshPlan();
    plan = addCalls(plan, [stick.id, coverThree.id], {
      nowMs: T0 + 1,
      sectionId: plan.sections[0]!.id,
      createId,
    }).plan;
    const result = prepareGamePlan(plan, sourcesOf(plays), {
      nowMs: T0 + 2,
      label: "Thursday",
      createId,
    });
    expect(result.missingPlayIds).toEqual([]);
    expect(result.plan.preparedRevisionId).toBe(result.revision.id);
    expect(result.revision.label).toBe("Thursday");
    expect(result.revision.plays.map(({ playId }) => playId)).toEqual([
      stick.id,
      coverThree.id,
    ]);
    expect(result.revision.plays[0]!.document).toEqual(stick);
    expect(gamePlanRevisionSchema.safeParse(result.revision).success).toBe(
      true,
    );
    const rows = revisionRows(result.revision);
    expect(rows[0]!.calls.map(({ name }) => name)).toEqual([
      "Stick — Thunder",
      "Cover 3 — Fire Zone",
    ]);
    expect(rows[0]!.calls[1]!.play?.unit).toBe("defense");
  });

  it("flags a source that moved on, and never rewrites the prepared packet", () => {
    let plan = freshPlan();
    plan = addCalls(plan, [stick.id, verts.id], {
      nowMs: T0 + 1,
      sectionId: plan.sections[0]!.id,
      createId,
    }).plan;
    const { revision, plan: prepared } = prepareGamePlan(
      plan,
      sourcesOf(plays),
      { nowMs: T0 + 2, createId },
    );
    const now = new Map(
      plays.map((play) => [
        play.id,
        `hash_${play.id}_v1` as string | undefined,
      ]),
    );
    expect(revisionStatus(prepared, revision, now)).toEqual({
      prepared: true,
      stale: false,
      changedPlayIds: [],
      missingPlayIds: [],
      planChanged: false,
    });
    expect(revisionStatus(plan, undefined, now).prepared).toBe(false);

    now.set(stick.id, "hash_stick_v2");
    const edited = revisionStatus(prepared, revision, now);
    expect(edited.stale).toBe(true);
    expect(edited.changedPlayIds).toEqual([stick.id]);
    expect(revision.plays[0]!.document).toEqual(stick);

    now.set(verts.id, undefined);
    expect(revisionStatus(prepared, revision, now).missingPlayIds).toEqual([
      verts.id,
    ]);

    const renumbered = assignCallCode(
      prepared,
      prepared.calls[0]!.id,
      "9",
      T0 + 3,
    );
    expect(
      revisionStatus((renumbered as { plan: GamePlan }).plan, revision, now)
        .planChanged,
    ).toBe(true);
  });

  it("carries a deleted Play from the previous revision, and lists one it never had", () => {
    let plan = freshPlan();
    plan = addCalls(plan, [stick.id, verts.id], {
      nowMs: T0 + 1,
      sectionId: plan.sections[0]!.id,
      createId,
    }).plan;
    const first = prepareGamePlan(plan, sourcesOf(plays), {
      nowMs: T0 + 2,
      createId,
    });
    // The Coach deletes Four Verticals, adds Cover 3, then prepares again.
    const gone = sourcesOf(plays.filter(({ id }) => id !== verts.id));
    plan = addCalls(first.plan, [coverThree.id], {
      nowMs: T0 + 3,
      sectionId: plan.sections[0]!.id,
      createId,
    }).plan;
    const second = prepareGamePlan(
      plan,
      new Map([...gone].filter(([id]) => id !== coverThree.id)),
      { nowMs: T0 + 4, previous: first.revision, createId },
    );
    expect(second.carriedPlayIds).toEqual([verts.id]);
    expect(second.missingPlayIds).toEqual([coverThree.id]);
    const carried = second.revision.plays.find(
      ({ playId }) => playId === verts.id,
    )!;
    expect(carried.carriedFromRevisionId).toBe(first.revision.id);
    expect(carried.document).toEqual(verts);
    const rows = revisionRows(second.revision);
    expect(rows[0]!.calls.map(({ name, missing }) => [name, missing])).toEqual([
      ["Stick — Thunder", false],
      ["Four Verticals", false],
      ["Missing play", true],
    ]);
    expect(gamePlanRevisionSchema.safeParse(second.revision).success).toBe(
      true,
    );
  });
});
