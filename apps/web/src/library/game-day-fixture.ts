import {
  addCalls,
  createGamePlan,
  gamePlanRevisionSchema,
  prepareGamePlan,
  starterExamplePlays,
  type GamePlan,
  type GamePlanRevision,
  type PlayDocument,
} from "@chalk/domain";

/**
 * A representative coordinator packet for tests: a hundred numbered calls
 * over three sections, each its own Play (issue #67's retrieval target).
 */
export function hundredCallPlan(
  options: {
    readonly planId?: string;
    readonly nowMs?: number;
    /** Keeps a second packet's ids apart from the first's. */
    readonly idPrefix?: string;
  } = {},
): {
  readonly plan: GamePlan;
  readonly revision: GamePlanRevision;
  readonly plays: readonly PlayDocument[];
} {
  const seeds = starterExamplePlays();
  const playbookId = seeds[0]!.playbookId;
  let ids = 0;
  const createId = (prefix: string) =>
    `${prefix}_${options.idPrefix ?? ""}${(ids += 1)}`;
  const plays: PlayDocument[] = Array.from({ length: 100 }, (_, index) => {
    const seed = seeds[index % seeds.length]!;
    return {
      ...seed,
      id: `play_call_${index + 1}`,
      name: `${seed.name} ${index + 1}`,
    };
  });
  let plan = createGamePlan({
    id: options.planId ?? "plan_hundred",
    playbookId,
    name: "Week 5",
    unit: "offense",
    opponent: "Central",
    nowMs: options.nowMs ?? 1,
    sections: ["Openers", "3rd down", "Red zone"],
    createId,
  });
  plays.forEach((play, index) => {
    const n = index + 1;
    const added = addCalls(plan, [play.id], {
      nowMs: n,
      sectionId: plan.sections[index % 3]!.id,
      createId,
    });
    plan = {
      ...added.plan,
      calls: added.plan.calls.map((call) =>
        call.id === added.callIds[0] ? { ...call, code: String(n) } : call,
      ),
    };
  });
  const sources = new Map(
    plays.map((play) => [
      play.id,
      { document: play, documentHash: `h_${play.id}` },
    ]),
  );
  const prepared = prepareGamePlan(plan, sources, {
    nowMs: (options.nowMs ?? 1) + 1000,
    createId,
  });
  return {
    plan: prepared.plan,
    revision: gamePlanRevisionSchema.parse(prepared.revision),
    plays,
  };
}
