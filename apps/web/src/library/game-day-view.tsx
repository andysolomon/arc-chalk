import {
  gamePlanSubtitle,
  revisionRows,
  unitName,
  type GamePlan,
} from "@chalk/domain";
import { preparedStamp } from "@chalk/exports";

import type { ChalkLibrary, LibrarySnapshot } from "../app/editor-runtime";
import { useGamePlans } from "./use-game-plans";

/**
 * Game Day (issue #65): the destination a coordinator reads from. It lists
 * the plans that have been prepared and, for the one opened, the calls of
 * the prepared revision by section — never the live library, so what he
 * reads on the sideline is what was handed out (ADR 0042).
 */
export function GameDayView({
  library,
  onOpenPlaybooks,
  snapshot,
}: {
  library: ChalkLibrary;
  /** Where a plan is made and prepared. */
  onOpenPlaybooks: () => void;
  snapshot: LibrarySnapshot;
}) {
  const state = useGamePlans(library);
  const prepared = state.plans.filter((plan) => plan.preparedRevisionId);
  void snapshot;
  return (
    <main aria-label="Game Day" className="destination game-day">
      {state.openPlan && state.revision ? (
        <div className="game-day-plan">
          <div className="game-day-head">
            <button
              className="browser-link"
              onClick={() => void state.open(undefined)}
              type="button"
            >
              ‹ Plans
            </button>
            <div>
              <div className="game-day-title">{state.openPlan.name}</div>
              <div className="game-day-sub">
                {[
                  gamePlanSubtitle(state.openPlan),
                  unitName(state.openPlan.unit),
                  preparedStamp(state.revision),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </div>
          {revisionRows(state.revision).map((section) => (
            <section
              aria-label={section.name}
              className="game-day-section"
              key={section.sectionId ?? "unsectioned"}
            >
              <h2>{section.name}</h2>
              <ol className="game-day-calls">
                {section.calls.map((call) => (
                  <li
                    className={call.missing ? "missing" : undefined}
                    key={`${section.sectionId ?? "u"}:${call.callId}`}
                  >
                    <code>{call.code || "—"}</code>
                    <span>{call.name}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <div className="game-day-plans">
          <h1>Game Day</h1>
          {prepared.length === 0 ? (
            <p className="game-day-empty">
              Nothing is prepared for a game yet. Build a plan under Playbooks →
              Game plans and press <strong>Prepare for game</strong>; it appears
              here with its call codes.
            </p>
          ) : (
            <ul className="game-day-list">
              {prepared.map((plan: GamePlan) => (
                <li key={plan.id}>
                  <button
                    onClick={() => void state.open(plan.id)}
                    type="button"
                  >
                    <span className="game-day-name">{plan.name}</span>
                    <span className="game-day-meta">
                      {[gamePlanSubtitle(plan), unitName(plan.unit)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="browser-link"
            onClick={onOpenPlaybooks}
            type="button"
          >
            Open Game plans
          </button>
        </div>
      )}
    </main>
  );
}
