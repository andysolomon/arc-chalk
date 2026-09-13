import {
  addCalls,
  assignCallCode,
  createGamePlan,
  starterExamplePlays,
  starterPlaybookEnvelope,
  type GamePlan,
} from "@chalk/domain";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createMemoryLibrary, type ChalkLibrary } from "../app/editor-runtime";
import { useGamePlans } from "./use-game-plans";

const plays = starterExamplePlays();
const envelope = starterPlaybookEnvelope();
const stick = plays[0]!;
const T0 = 1_700_000_000_000;

function memoryLibrary(): ChalkLibrary {
  return createMemoryLibrary(
    {
      playbook: envelope.playbook,
      concepts: envelope.concepts,
      members: [],
    },
    plays.map((play) => ({
      id: play.id,
      playbookId: play.playbookId,
      document: play,
      documentHash: `hash_${play.id}`,
      updatedAtMs: 1,
    })),
  );
}

/**
 * A library whose plan saves wait at a gate until the test opens it — the
 * IndexedDB write that has not landed yet when the Coach clicks Prepare.
 */
function gatedLibrary(): ChalkLibrary & {
  readonly release: () => void;
  readonly pending: () => number;
} {
  const inner = memoryLibrary();
  const waiting: (() => void)[] = [];
  return {
    ...inner,
    saveGamePlan: (plan) =>
      new Promise<void>((resolve) => {
        waiting.push(resolve);
      }).then(() => inner.saveGamePlan(plan)),
    release: () => {
      for (const resolve of waiting.splice(0)) resolve();
    },
    pending: () => waiting.length,
  };
}

function weekThree(): GamePlan {
  const plan = createGamePlan({
    playbookId: stick.playbookId,
    name: "Week 3",
    unit: "offense",
    nowMs: T0,
  });
  return addCalls(plan, [stick.id], { nowMs: T0 + 1 }).plan;
}

describe("useGamePlans", () => {
  it("prepares the plan as it stands after an edit whose save is still in flight", async () => {
    const library = gatedLibrary();
    const { result } = renderHook(() => useGamePlans(library));
    const plan = weekThree();

    // The plan is created; its save is held at the gate.
    let created!: Promise<GamePlan>;
    act(() => {
      created = result.current.apply(plan);
    });
    // The list shows it at once, ahead of the write.
    expect(result.current.plans.map(({ id }) => id)).toEqual([plan.id]);
    await waitFor(() => expect(library.pending()).toBe(1));

    // The Coach types 99 into the call's number and, on blur, the edit is
    // applied — another held save — then clicks Prepare with the plan the
    // component was handed before the edit.
    const callId = plan.calls[0]!.id;
    const coded = assignCallCode(plan, callId, "99", T0 + 2);
    if (!coded.ok) throw new Error(coded.reason);
    let edited!: Promise<GamePlan>;
    let prepared!: ReturnType<typeof result.current.prepare>;
    act(() => {
      edited = result.current.apply(coded.plan);
      prepared = result.current.prepare(plan, T0 + 3);
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.plans[0]?.calls[0]?.code).toBe("99");
    // Nothing has been prepared yet: the queue is waiting on the saves.
    expect(library.pending()).toBe(1);
    expect(await library.listGamePlans()).toHaveLength(0);

    await act(async () => {
      library.release();
      await created;
    });
    // The second save was queued behind the first and is now at the gate.
    await waitFor(() => expect(library.pending()).toBe(1));
    await act(async () => {
      library.release();
      await edited;
    });
    // The revision's own save is not gated; the plan that follows it is.
    await waitFor(() => expect(library.pending()).toBe(1));
    let report!: Awaited<typeof prepared>;
    await act(async () => {
      library.release();
      report = await prepared;
    });
    expect(result.current.busy).toBe(false);

    expect(report.callCount).toBe(1);
    const [stored] = await library.listGamePlans();
    expect(stored?.preparedRevisionId).toBe(report.revisionId);
    const revision = await library.getGamePlanRevision(report.revisionId);
    expect(revision?.plan.calls[0]?.code).toBe("99");
    expect(result.current.revision?.id).toBe(report.revisionId);
    expect(result.current.plans[0]?.calls[0]?.code).toBe("99");
  });

  it("writes plans in the order they were applied, so the last edit wins", async () => {
    const library = gatedLibrary();
    const { result } = renderHook(() => useGamePlans(library));
    const plan = weekThree();
    const callId = plan.calls[0]!.id;
    const first = assignCallCode(plan, callId, "7", T0 + 2);
    const second = assignCallCode(plan, callId, "12", T0 + 3);
    if (!first.ok || !second.ok) throw new Error("codes");

    const settled: Promise<GamePlan>[] = [];
    act(() => {
      settled.push(result.current.apply(first.plan));
      settled.push(result.current.apply(second.plan));
    });
    expect(result.current.plans[0]?.calls[0]?.code).toBe("12");
    for (let step = 0; step < 2; step += 1) {
      await waitFor(() => expect(library.pending()).toBe(1));
      await act(async () => {
        library.release();
        await settled[step];
      });
    }
    const [stored] = await library.listGamePlans();
    expect(stored?.calls[0]?.code).toBe("12");
  });
});
