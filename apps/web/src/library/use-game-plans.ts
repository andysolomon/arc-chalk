import {
  gamePlanRevisionSchema,
  prepareGamePlan,
  type GamePlan,
  type GamePlanRevision,
  type PlaySource,
} from "@chalk/domain";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ChalkLibrary } from "../app/editor-runtime";

export interface PrepareReport {
  readonly revisionId: string;
  readonly missingPlayIds: readonly string[];
  readonly carriedPlayIds: readonly string[];
}

/**
 * The Coach's Game Plans on this device: loaded from the library, written
 * back after every change, with the prepared revision of the open plan kept
 * beside it so the workspace can say whether the packet is still current.
 */
export function useGamePlans(library: ChalkLibrary) {
  const [plans, setPlans] = useState<readonly GamePlan[]>([]);
  const [openId, setOpenId] = useState<string>();
  const [revision, setRevision] = useState<GamePlanRevision>();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string>();
  const openRef = useRef(openId);
  useEffect(() => {
    openRef.current = openId;
  });

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
    setPlans(next);
    const open = next.find(({ id }) => id === openRef.current);
    if (openRef.current && !open) setOpenId(undefined);
    await loadRevision(open);
  }, [library, loadRevision]);

  useEffect(() => {
    let cancelled = false;
    void library.listGamePlans().then((next) => {
      if (!cancelled) setPlans(next);
    });
    return () => {
      cancelled = true;
    };
  }, [library]);

  /** Saves a plan the caller already changed and reflects it in the list. */
  const apply = useCallback(
    async (plan: GamePlan) => {
      await library.saveGamePlan(plan);
      setPlans((current) => {
        const rest = current.filter(({ id }) => id !== plan.id);
        return [plan, ...rest].sort(
          (left, right) => right.updatedAtMs - left.updatedAtMs,
        );
      });
      return plan;
    },
    [library],
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
      await library.deleteGamePlan(planId);
      setPlans((current) => current.filter(({ id }) => id !== planId));
      if (openRef.current === planId) {
        setOpenId(undefined);
        setRevision(undefined);
      }
    },
    [library],
  );

  /**
   * Prepare for game: every referenced Play is read as it stands now, the
   * revision is written first so a plan never points at a revision that is
   * not there, then the plan follows.
   */
  const prepare = useCallback(
    async (
      plan: GamePlan,
      nowMs: number,
      label?: string,
    ): Promise<PrepareReport> => {
      setBusy(true);
      try {
        const playIds = [...new Set(plan.calls.map(({ playId }) => playId))];
        const sources = new Map<string, PlaySource | undefined>();
        for (const playId of playIds) {
          const stored = await library.getPlay(playId);
          sources.set(
            playId,
            stored
              ? { document: stored.document, documentHash: stored.documentHash }
              : undefined,
          );
        }
        const previous = plan.preparedRevisionId
          ? await library.getGamePlanRevision(plan.preparedRevisionId)
          : undefined;
        const result = prepareGamePlan(plan, sources, {
          nowMs,
          ...(label === undefined ? {} : { label }),
          ...(previous === undefined ? {} : { previous }),
        });
        await library.saveGamePlanRevision(
          gamePlanRevisionSchema.parse(result.revision),
        );
        await apply(result.plan);
        setRevision(result.revision);
        return {
          revisionId: result.revision.id,
          missingPlayIds: result.missingPlayIds,
          carriedPlayIds: result.carriedPlayIds,
        };
      } finally {
        setBusy(false);
      }
    },
    [apply, library],
  );

  return {
    plans,
    openPlan: plans.find(({ id }) => id === openId),
    revision,
    busy,
    report,
    setReport,
    refresh,
    apply,
    open,
    remove,
    prepare,
  };
}

export type GamePlansState = ReturnType<typeof useGamePlans>;
