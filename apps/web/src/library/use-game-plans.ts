import {
  gamePlanRevisionSchema,
  prepareGamePlan,
  type GamePlan,
  type GamePlanRevision,
  type PlayPickScope,
  type PlaySource,
} from "@chalk/domain";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ChalkLibrary } from "../app/editor-runtime";

export interface PrepareReport {
  readonly revisionId: string;
  /** How many calls the revision froze — the plan as it stood when it ran. */
  readonly callCount: number;
  readonly missingPlayIds: readonly string[];
  readonly carriedPlayIds: readonly string[];
}

function withPlan(
  plans: readonly GamePlan[],
  plan: GamePlan,
): readonly GamePlan[] {
  const rest = plans.filter(({ id }) => id !== plan.id);
  return [plan, ...rest].sort(
    (left, right) => right.updatedAtMs - left.updatedAtMs,
  );
}

/**
 * The Coach's Game Plans on this device: loaded from the library, written
 * back after every change, with the prepared revision of the open plan kept
 * beside it so the workspace can say whether the packet is still current.
 *
 * Every write goes through one queue in the order it was asked for, and the
 * plan list reflects a change the moment it is asked for rather than when
 * the write lands. Prepare joins the same queue and reads the plan as it
 * stands then, so a call number committed on blur a moment before the click
 * is in the packet even while its save is still in flight.
 */
export function useGamePlans(library: ChalkLibrary) {
  const [plans, setPlans] = useState<readonly GamePlan[]>([]);
  const [openId, setOpenId] = useState<string>();
  const [revision, setRevision] = useState<GamePlanRevision>();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string>();
  /**
   * Where Add plays looks — this book or every book on the shelf. Read once
   * with the plans and written as the Coach changes it, so the choice is
   * already in place by the time a plan is open (ADR 0067).
   */
  const [pickScope, setPickScope] = useState<PlayPickScope>("book");
  const openRef = useRef(openId);
  useEffect(() => {
    openRef.current = openId;
  });
  /** The list as last published — what Prepare reads, ahead of any render. */
  const plansRef = useRef<readonly GamePlan[]>([]);
  const versionRef = useRef(0);
  const publish = useCallback((next: readonly GamePlan[]) => {
    plansRef.current = next;
    versionRef.current += 1;
    setPlans(next);
  }, []);
  /** Library writes, one after another, in the order they were asked for. */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T>(task: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(task, task);
    queueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const loadRevision = useCallback(
    async (plan: GamePlan | undefined) => {
      if (!plan?.preparedRevisionId) {
        setRevision(undefined);
        return;
      }
      const stored = await library.getGamePlanRevision(plan.preparedRevisionId);
      setRevision(stored);
    },
    [library],
  );

  const refresh = useCallback(async () => {
    const next = await library.listGamePlans();
    publish(next);
    const open = next.find(({ id }) => id === openRef.current);
    if (openRef.current && !open) setOpenId(undefined);
    await loadRevision(open);
  }, [library, loadRevision, publish]);

  useEffect(() => {
    let cancelled = false;
    // A plan applied before the first load answers is newer than the load.
    const version = versionRef.current;
    void library.listGamePlans().then((next) => {
      if (!cancelled && versionRef.current === version) publish(next);
    });
    void library.loadPlanPickScope().then((scope) => {
      if (!cancelled) setPickScope(scope);
    });
    return () => {
      cancelled = true;
    };
  }, [library, publish]);

  const choosePickScope = useCallback(
    (scope: PlayPickScope) => {
      setPickScope(scope);
      void library.savePlanPickScope(scope).catch(() => undefined);
    },
    [library],
  );

  /** Writes a plan; if the write does not land, shows what the library holds. */
  const write = useCallback(
    async (plan: GamePlan) => {
      try {
        await library.saveGamePlan(plan);
      } catch (error) {
        await refresh();
        throw error;
      }
    },
    [library, refresh],
  );

  /**
   * Saves a plan the caller already changed. The list reflects it at once,
   * so the next edit and the next Prepare both start from it; the write
   * follows in turn behind whatever is already queued.
   */
  const apply = useCallback(
    async (plan: GamePlan) => {
      publish(withPlan(plansRef.current, plan));
      await enqueue(() => write(plan));
      return plan;
    },
    [enqueue, publish, write],
  );

  const open = useCallback(
    async (planId: string | undefined) => {
      setOpenId(planId);
      setReport(undefined);
      await loadRevision(plans.find(({ id }) => id === planId));
    },
    [loadRevision, plans],
  );

  const remove = useCallback(
    async (planId: string) => {
      await enqueue(() => library.deleteGamePlan(planId));
      publish(plansRef.current.filter(({ id }) => id !== planId));
      if (openRef.current === planId) {
        setOpenId(undefined);
        setRevision(undefined);
      }
    },
    [enqueue, library, publish],
  );

  /**
   * Prepare for game: the plan is read as it stands once every pending save
   * ahead of it has settled, every referenced Play is read as it stands now
   * from whichever book holds it, the revision is written first so a plan
   * never points at a revision that is not there, then the plan follows. A
   * Play in the Trash is no source: it is carried from the last packet, or
   * listed missing, the way ADR 0042 says a deleted Play is — the same word
   * the plan's status line already uses for it.
   */
  const prepare = useCallback(
    (plan: GamePlan, nowMs: number, label?: string): Promise<PrepareReport> => {
      setBusy(true);
      return enqueue(async () => {
        try {
          const latest =
            plansRef.current.find(({ id }) => id === plan.id) ?? plan;
          const playIds = [
            ...new Set(latest.calls.map(({ playId }) => playId)),
          ];
          const sources = new Map<string, PlaySource | undefined>();
          for (const playId of playIds) {
            const stored = await library.getPlay(playId);
            sources.set(
              playId,
              stored && stored.deletedAtMs === undefined
                ? {
                    document: stored.document,
                    documentHash: stored.documentHash,
                  }
                : undefined,
            );
          }
          const previous = latest.preparedRevisionId
            ? await library.getGamePlanRevision(latest.preparedRevisionId)
            : undefined;
          const result = prepareGamePlan(latest, sources, {
            nowMs,
            ...(label === undefined ? {} : { label }),
            ...(previous === undefined ? {} : { previous }),
          });
          await library.saveGamePlanRevision(
            gamePlanRevisionSchema.parse(result.revision),
          );
          publish(withPlan(plansRef.current, result.plan));
          await write(result.plan);
          setRevision(result.revision);
          return {
            revisionId: result.revision.id,
            callCount: latest.calls.length,
            missingPlayIds: result.missingPlayIds,
            carriedPlayIds: result.carriedPlayIds,
          };
        } finally {
          setBusy(false);
        }
      });
    },
    [enqueue, library, publish, write],
  );

  return {
    plans,
    openPlan: plans.find(({ id }) => id === openId),
    revision,
    busy,
    report,
    setReport,
    pickScope,
    choosePickScope,
    refresh,
    apply,
    open,
    remove,
    prepare,
  };
}

export type GamePlansState = ReturnType<typeof useGamePlans>;
