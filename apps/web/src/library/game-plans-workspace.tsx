import {
  addCalls,
  addSection,
  assignCallCode,
  createGamePlan,
  defaultGamePlanSections,
  describeAddition,
  duplicateGamePlan,
  formatClassification,
  gamePlanSubtitle,
  moveCallInSection,
  moveCallToSection,
  moveSection,
  nextFreeCallCode,
  placeCallInSection,
  playUnits,
  previewAddition,
  removeCall,
  removeCallFromSection,
  removeSection,
  renameGamePlan,
  renameSection,
  revisionStatus,
  searchPlays,
  sectionName,
  setCallNote,
  setGamePlanDetails,
  sortSectionByCode,
  unitName,
  unsectionedCallIds,
  type Formation,
  type GamePlan,
  type GamePlanFilter,
  type GamePlanRevision,
  type PlayUnit,
} from "@chalk/domain";
import {
  gamePlanCallSheetHtml,
  gamePlanHandoutHtml,
  gamePlanWristbandHtml,
  type DiagramRenderer,
} from "@chalk/exports";
import type { PlaySearchProjection } from "@chalk/local-db";
import { useMemo, useState } from "react";

import type { ChalkLibrary, LibrarySnapshot } from "../app/editor-runtime";
import { UnitBadge } from "../components/unit-badge";
import { agoStamp } from "../components/ago-stamp";
import { openPrintWindow } from "../components/print-window";
import { UNCLASSIFIED, typeChipsFor } from "./type-chips";
import { useGamePlans, type GamePlansState } from "./use-game-plans";

/**
 * The Playbooks workspace: the Coach's Game Plans, each a curated, numbered
 * view of the library for one game. Plays are referenced, never copied;
 * Prepare for game freezes a revision that the call sheet, wristband and
 * handout all read, so a packet already handed out is never rewritten from
 * under a coach.
 */
export function GamePlansWorkspace({
  embedded = false,
  formations,
  library,
  now = () => Date.now(),
  onClose,
  onOpenPlay,
  render,
  snapshot,
}: {
  /** A page of the Playbooks destination rather than a dialog (issue #65). */
  embedded?: boolean;
  formations: readonly Formation[];
  library: ChalkLibrary;
  now?: () => number;
  onClose: () => void;
  onOpenPlay: (playId: string) => void;
  render: DiagramRenderer;
  snapshot: LibrarySnapshot;
}) {
  const state = useGamePlans(library);
  return (
    <div
      className={`overlay browser-overlay${embedded ? " embedded" : ""}`}
      onClick={embedded ? undefined : onClose}
      role="presentation"
    >
      <div
        aria-label="Game plans"
        className="browser game-plans"
        onClick={(event) => event.stopPropagation()}
        role={embedded ? "region" : "dialog"}
      >
        {state.openPlan ? (
          <PlanEditor
            formations={formations}
            now={now}
            onClose={onClose}
            onOpenPlay={onOpenPlay}
            plan={state.openPlan}
            render={render}
            snapshot={snapshot}
            state={state}
          />
        ) : (
          <PlanList
            now={now}
            onClose={onClose}
            snapshot={snapshot}
            state={state}
          />
        )}
      </div>
    </div>
  );
}

function hashesOf(
  snapshot: LibrarySnapshot,
): ReadonlyMap<string, string | undefined> {
  return new Map(
    snapshot.members.map((member) => [member.playId, member.documentHash]),
  );
}

function planStatusLine(
  plan: GamePlan,
  revision: GamePlanRevision | undefined,
  snapshot: LibrarySnapshot,
  nowMs: number,
): { readonly text: string; readonly stale: boolean } {
  const status = revisionStatus(plan, revision, hashesOf(snapshot));
  if (!status.prepared || !revision) {
    return { text: "Not prepared yet", stale: false };
  }
  const when = `Prepared ${agoStamp(revision.createdAtMs, nowMs)}`;
  if (!status.stale) return { text: when, stale: false };
  const names = status.changedPlayIds
    .map(
      (playId) =>
        snapshot.members.find((member) => member.playId === playId)?.name ??
        playId,
    )
    .slice(0, 3);
  const detail = [
    names.length ? `changed: ${names.join(", ")}` : undefined,
    status.missingPlayIds.length
      ? `${status.missingPlayIds.length} missing`
      : undefined,
    status.planChanged ? "calls or codes changed" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    text: `${when} — the library has moved on since (${detail}). Prepare again to hand out a new packet.`,
    stale: true,
  };
}

function PlanList({
  now,
  onClose,
  snapshot,
  state,
}: {
  now: () => number;
  onClose: () => void;
  snapshot: LibrarySnapshot;
  state: GamePlansState;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<PlayUnit>("offense");
  const [opponent, setOpponent] = useState("");
  const [gameLabel, setGameLabel] = useState("");
  const [renamingId, setRenamingId] = useState<string>();
  const [renameDraft, setRenameDraft] = useState("");
  const [copyingId, setCopyingId] = useState<string>();
  const [copyDraft, setCopyDraft] = useState("");
  const [armedId, setArmedId] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const create = () => {
    try {
      const plan = createGamePlan({
        playbookId: snapshot.playbook.id,
        name,
        unit,
        opponent,
        gameLabel,
        nowMs: now(),
        sections: defaultGamePlanSections[unit],
      });
      void state.apply(plan).then(() => {
        setCreating(false);
        setName("");
        setOpponent("");
        setGameLabel("");
        void state.open(plan.id);
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <div className="browser-head">
        <div className="browser-title">Game plans</div>
        <span className="game-plans-count">
          {state.plans.length === 0
            ? "A curated, numbered view of the library for one game"
            : `${state.plans.length} ${state.plans.length === 1 ? "plan" : "plans"}`}
        </span>
        <button
          className="game-plans-new"
          onClick={() => setCreating((open) => !open)}
          type="button"
        >
          {creating ? "Cancel" : "New plan"}
        </button>
        <button
          aria-label="Close game plans"
          className="browser-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      {creating ? (
        <form
          aria-label="New game plan"
          className="game-plan-form"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <input
            aria-label="Plan name"
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder="Plan name — Week 3"
            spellCheck={false}
            value={name}
          />
          <div className="segments" role="group" aria-label="Coordinator">
            {playUnits.map((choice) => (
              <button
                aria-pressed={unit === choice.id}
                className={unit === choice.id ? "active" : undefined}
                data-unit={choice.id}
                key={choice.id}
                onClick={() => setUnit(choice.id)}
                type="button"
              >
                {choice.name}
              </button>
            ))}
          </div>
          <input
            aria-label="Opponent"
            onChange={(event) => setOpponent(event.target.value)}
            placeholder="Opponent"
            spellCheck={false}
            value={opponent}
          />
          <input
            aria-label="Game"
            onChange={(event) => setGameLabel(event.target.value)}
            placeholder="Game — Week 3, Homecoming"
            spellCheck={false}
            value={gameLabel}
          />
          <button
            className="menu-primary"
            disabled={!name.trim()}
            type="submit"
          >
            Create plan
          </button>
          {notice ? (
            <p className="menu-hint" role="status">
              {notice}
            </p>
          ) : null}
        </form>
      ) : null}
      <div className="browser-body game-plan-list">
        {state.plans.length === 0 && !creating ? (
          <p className="browser-empty">
            No game plans yet. A plan picks calls from the library, arranges
            them in sections, and gives each a number — without copying the
            plays themselves.
          </p>
        ) : null}
        {state.plans.map((plan) => {
          const status = planStatusLine(plan, undefined, snapshot, now());
          const subtitle = gamePlanSubtitle(plan);
          return (
            <div className="game-plan-row" data-plan-id={plan.id} key={plan.id}>
              <div className="game-plan-row-main">
                {renamingId === plan.id ? (
                  <input
                    aria-label="Rename plan"
                    autoFocus
                    onBlur={() => setRenamingId(undefined)}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        try {
                          void state.apply(
                            renameGamePlan(plan, renameDraft, now()),
                          );
                          setRenamingId(undefined);
                        } catch (error) {
                          setNotice(
                            error instanceof Error
                              ? error.message
                              : String(error),
                          );
                        }
                      }
                      if (event.key === "Escape") setRenamingId(undefined);
                    }}
                    value={renameDraft}
                  />
                ) : (
                  <button
                    className="game-plan-open"
                    onClick={() => void state.open(plan.id)}
                    type="button"
                  >
                    <strong>{plan.name}</strong>
                    <span>
                      <UnitBadge unit={plan.unit} />
                      {subtitle ? ` · ${subtitle}` : ""}
                      {` · ${plan.calls.length} ${plan.calls.length === 1 ? "call" : "calls"}`}
                      {` · ${plan.preparedRevisionId ? "Prepared" : status.text}`}
                    </span>
                  </button>
                )}
              </div>
              {copyingId === plan.id ? (
                <form
                  className="game-plan-inline"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const copy = duplicateGamePlan(plan, {
                      name: copyDraft,
                      nowMs: now(),
                    });
                    void state.apply(copy).then(() => {
                      setCopyingId(undefined);
                      void state.open(copy.id);
                    });
                  }}
                >
                  <input
                    aria-label="Copy name"
                    autoFocus
                    onChange={(event) => setCopyDraft(event.target.value)}
                    value={copyDraft}
                  />
                  <button disabled={!copyDraft.trim()} type="submit">
                    Duplicate
                  </button>
                  <button onClick={() => setCopyingId(undefined)} type="button">
                    Keep
                  </button>
                </form>
              ) : armedId === plan.id ? (
                <span className="library-delete-ask">
                  <span>Delete plan? Its plays stay in the library.</span>
                  <button
                    onClick={() => {
                      setArmedId(undefined);
                      void state.remove(plan.id);
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                  <button onClick={() => setArmedId(undefined)} type="button">
                    Keep
                  </button>
                </span>
              ) : (
                <span className="game-plan-row-actions">
                  <button
                    onClick={() => {
                      setRenameDraft(plan.name);
                      setRenamingId(plan.id);
                    }}
                    type="button"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => {
                      setCopyDraft(`${plan.name} copy`);
                      setCopyingId(plan.id);
                    }}
                    type="button"
                  >
                    Duplicate
                  </button>
                  <button
                    aria-label={`Delete ${plan.name}`}
                    className="library-remove"
                    onClick={() => setArmedId(plan.id)}
                    title="Delete this plan"
                    type="button"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

interface DragPayload {
  readonly callId: string;
  readonly fromSectionId?: string;
}

function PlanEditor({
  formations,
  now,
  onClose,
  onOpenPlay,
  plan,
  render,
  snapshot,
  state,
}: {
  formations: readonly Formation[];
  now: () => number;
  onClose: () => void;
  onOpenPlay: (playId: string) => void;
  plan: GamePlan;
  render: DiagramRenderer;
  snapshot: LibrarySnapshot;
  state: GamePlansState;
}) {
  const [codeNotice, setCodeNotice] = useState<{
    readonly callId: string;
    readonly text: string;
  }>();
  const [armed, setArmed] = useState<string>();
  const [renamingSection, setRenamingSection] = useState<string>();
  const [sectionDraft, setSectionDraft] = useState("");
  const [newSection, setNewSection] = useState("");
  const [dragging, setDragging] = useState<DragPayload>();
  const members = useMemo(
    () => new Map(snapshot.members.map((member) => [member.playId, member])),
    [snapshot.members],
  );
  const nameOf = (playId: string) =>
    members.get(playId)?.name ??
    state.revision?.plays.find((entry) => entry.playId === playId)?.document
      .name ??
    "Missing play";
  const callById = new Map(plan.calls.map((call) => [call.id, call]));
  const status = planStatusLine(plan, state.revision, snapshot, now());
  const canPrint = state.revision !== undefined;

  const apply = (next: GamePlan) => {
    if (next !== plan) void state.apply(next);
  };

  const commitCode = (callId: string, code: string) => {
    const result = assignCallCode(plan, callId, code, now());
    if (!result.ok) {
      const holder = callById.get(result.holderCallId);
      setCodeNotice({
        callId,
        text: `${result.reason} It belongs to ${holder ? nameOf(holder.playId) : "another call"}.`,
      });
      return;
    }
    setCodeNotice(undefined);
    apply(result.plan);
  };

  const drop = (
    payload: DragPayload,
    sectionId: string,
    index: number | undefined,
  ) => {
    let next = placeCallInSection(
      plan,
      payload.callId,
      sectionId,
      index,
      now(),
    );
    if (payload.fromSectionId && payload.fromSectionId !== sectionId) {
      next = removeCallFromSection(
        next,
        payload.callId,
        payload.fromSectionId,
        now(),
      );
    }
    apply(next);
  };

  const printOptions = { concepts: snapshot.concepts, formations, render };
  const print = (kind: "sheet" | "wristband" | "handout") => {
    const revision = state.revision;
    if (!revision) return;
    const html =
      kind === "sheet"
        ? gamePlanCallSheetHtml(revision, {})
        : kind === "wristband"
          ? gamePlanWristbandHtml(revision, { render })
          : gamePlanHandoutHtml(revision, {
              ...printOptions,
              year: new Date(now()).getFullYear(),
            });
    openPrintWindow(html);
  };

  const renderCall = (
    callId: string,
    sectionId: string | undefined,
    index: number,
    count: number,
  ) => {
    const call = callById.get(callId);
    if (!call) return null;
    const otherSections = plan.sections.filter(({ id }) => id !== sectionId);
    return (
      <div
        className={`game-plan-call${dragging?.callId === callId ? " dragging" : ""}`}
        data-call-id={callId}
        draggable
        key={`${sectionId ?? "loose"}:${callId}`}
        onDragEnd={() => setDragging(undefined)}
        onDragOver={(event) => {
          if (dragging && sectionId) event.preventDefault();
        }}
        onDragStart={(event) => {
          const payload: DragPayload = {
            callId,
            ...(sectionId === undefined ? {} : { fromSectionId: sectionId }),
          };
          event.dataTransfer.setData("text/plain", callId);
          event.dataTransfer.effectAllowed = "move";
          setDragging(payload);
        }}
        onDrop={(event) => {
          if (!dragging || !sectionId) return;
          event.preventDefault();
          event.stopPropagation();
          drop(dragging, sectionId, index);
          setDragging(undefined);
        }}
      >
        <span className="game-plan-grip" aria-hidden="true">
          ⋮⋮
        </span>
        <CodeField
          callId={callId}
          code={call.code}
          name={nameOf(call.playId)}
          onCommit={(code) => commitCode(callId, code)}
          onNextFree={() => commitCode(callId, nextFreeCallCode(plan))}
        />
        <button
          className="game-plan-call-name"
          onClick={() => {
            onClose();
            onOpenPlay(call.playId);
          }}
          title="Open this play in the editor"
          type="button"
        >
          {nameOf(call.playId)}
        </button>
        <NoteField
          callId={callId}
          note={call.note ?? ""}
          onCommit={(note) => apply(setCallNote(plan, callId, note, now()))}
        />
        <span className="game-plan-call-actions">
          {sectionId ? (
            <>
              <button
                aria-label={`Move ${nameOf(call.playId)} up`}
                disabled={index === 0}
                onClick={() =>
                  apply(moveCallInSection(plan, sectionId, callId, "up", now()))
                }
                title="Move up"
                type="button"
              >
                ↑
              </button>
              <button
                aria-label={`Move ${nameOf(call.playId)} down`}
                disabled={index >= count - 1}
                onClick={() =>
                  apply(
                    moveCallInSection(plan, sectionId, callId, "down", now()),
                  )
                }
                title="Move down"
                type="button"
              >
                ↓
              </button>
            </>
          ) : null}
          {otherSections.length > 0 ? (
            <select
              aria-label={`Move ${nameOf(call.playId)} to section`}
              onChange={(event) => {
                const to = event.target.value;
                if (!to) return;
                apply(
                  sectionId
                    ? moveCallToSection(plan, callId, sectionId, to, now())
                    : placeCallInSection(plan, callId, to, undefined, now()),
                );
                event.target.value = "";
              }}
              title="Move to another section"
              value=""
            >
              <option value="">Move to…</option>
              {otherSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          ) : null}
          {sectionId ? (
            <button
              onClick={() =>
                apply(removeCallFromSection(plan, callId, sectionId, now()))
              }
              title="Take this call out of the section — it stays in the plan"
              type="button"
            >
              Unlist
            </button>
          ) : null}
          {armed === callId ? (
            <span className="library-delete-ask">
              <span>Remove call?</span>
              <button
                onClick={() => {
                  setArmed(undefined);
                  apply(removeCall(plan, callId, now()));
                }}
                type="button"
              >
                Delete
              </button>
              <button onClick={() => setArmed(undefined)} type="button">
                Keep
              </button>
            </span>
          ) : (
            <button
              aria-label={`Remove ${nameOf(call.playId)} from the plan`}
              className="library-remove"
              onClick={() => setArmed(callId)}
              title="Remove this call from the plan"
              type="button"
            >
              ×
            </button>
          )}
        </span>
        {codeNotice?.callId === callId ? (
          <p className="game-plan-notice" role="status">
            {codeNotice.text}
          </p>
        ) : null}
      </div>
    );
  };

  const loose = unsectionedCallIds(plan);

  return (
    <>
      <div className="browser-head">
        <button
          aria-label="Back to game plans"
          className="back-button"
          onClick={() => void state.open(undefined)}
          title="Back to game plans"
          type="button"
        >
          ←
        </button>
        <input
          aria-label="Plan name"
          className="game-plan-title"
          defaultValue={plan.name}
          key={`${plan.id}:${plan.name}`}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value && value !== plan.name) {
              apply(renameGamePlan(plan, value, now()));
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          spellCheck={false}
        />
        <span className="game-plans-count">
          <UnitBadge unit={plan.unit} />
        </span>
        <button
          aria-label="Close game plans"
          className="browser-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <div className="game-plan-details">
        <input
          aria-label="Opponent"
          defaultValue={plan.opponent ?? ""}
          key={`${plan.id}:opp:${plan.opponent ?? ""}`}
          onBlur={(event) =>
            apply(
              setGamePlanDetails(plan, { opponent: event.target.value }, now()),
            )
          }
          placeholder="Opponent"
          spellCheck={false}
        />
        <input
          aria-label="Game"
          defaultValue={plan.gameLabel ?? ""}
          key={`${plan.id}:game:${plan.gameLabel ?? ""}`}
          onBlur={(event) =>
            apply(
              setGamePlanDetails(
                plan,
                { gameLabel: event.target.value },
                now(),
              ),
            )
          }
          placeholder="Game — Week 3"
          spellCheck={false}
        />
        <div className="game-plan-prepare">
          <button
            className="menu-primary"
            disabled={state.busy || plan.calls.length === 0}
            onClick={() => {
              // A call number or note still focused commits on blur; the
              // packet must carry it, so the field is left before we ask.
              const focused = document.activeElement;
              if (focused instanceof HTMLElement) focused.blur();
              void state.prepare(plan, now()).then((result) => {
                const parts = [
                  `Prepared ${result.callCount} ${result.callCount === 1 ? "call" : "calls"}`,
                  result.carriedPlayIds.length
                    ? `${result.carriedPlayIds.length} carried from the last revision`
                    : undefined,
                  result.missingPlayIds.length
                    ? `${result.missingPlayIds.length} missing`
                    : undefined,
                ].filter(Boolean);
                state.setReport(parts.join(" · "));
              });
            }}
            title="Freeze every diagram in this plan into the packet the sheets and the reader use"
            type="button"
          >
            Prepare for game
          </button>
          <p
            className={`game-plan-status${status.stale ? " stale" : ""}`}
            data-stale={status.stale}
            role="status"
          >
            {state.report ?? status.text}
          </p>
        </div>
        <div className="game-plan-outputs" role="group" aria-label="Outputs">
          <button
            disabled={!canPrint}
            onClick={() => print("sheet")}
            title={
              canPrint
                ? "Print the call sheet from the prepared revision"
                : "Prepare for game first"
            }
            type="button"
          >
            Call sheet
          </button>
          <button
            disabled={!canPrint}
            onClick={() => print("wristband")}
            title={
              canPrint
                ? "Print the wristband from the prepared revision"
                : "Prepare for game first"
            }
            type="button"
          >
            Wristband
          </button>
          <button
            disabled={!canPrint}
            onClick={() => print("handout")}
            title={
              canPrint
                ? "Print the handout from the prepared revision"
                : "Prepare for game first"
            }
            type="button"
          >
            Handout
          </button>
        </div>
      </div>
      <div className="browser-body game-plan-body">
        <div className="game-plan-sections">
          {plan.sections.map((section, sectionIndex) => (
            <section
              aria-label={section.name}
              className={`game-plan-section${dragging ? " droppable" : ""}`}
              data-section-id={section.id}
              key={section.id}
              onDragOver={(event) => {
                if (dragging) event.preventDefault();
              }}
              onDrop={(event) => {
                if (!dragging) return;
                event.preventDefault();
                drop(dragging, section.id, undefined);
                setDragging(undefined);
              }}
            >
              <div className="section-heading game-plan-section-head">
                {renamingSection === section.id ? (
                  <input
                    aria-label="Section name"
                    autoFocus
                    onBlur={() => setRenamingSection(undefined)}
                    onChange={(event) => setSectionDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (sectionDraft.trim()) {
                          apply(
                            renameSection(
                              plan,
                              section.id,
                              sectionDraft,
                              now(),
                            ),
                          );
                        }
                        setRenamingSection(undefined);
                      }
                      if (event.key === "Escape") setRenamingSection(undefined);
                    }}
                    value={sectionDraft}
                  />
                ) : (
                  <button
                    className="game-plan-section-name"
                    onClick={() => {
                      setSectionDraft(section.name);
                      setRenamingSection(section.id);
                    }}
                    title="Rename this section"
                    type="button"
                  >
                    {section.name}
                  </button>
                )}
                <span className="game-plan-section-count">
                  {section.callIds.length}
                </span>
                <span className="game-plan-section-actions">
                  <button
                    aria-label={`Move ${section.name} up`}
                    disabled={sectionIndex === 0}
                    onClick={() =>
                      apply(moveSection(plan, section.id, "up", now()))
                    }
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${section.name} down`}
                    disabled={sectionIndex >= plan.sections.length - 1}
                    onClick={() =>
                      apply(moveSection(plan, section.id, "down", now()))
                    }
                    type="button"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() =>
                      apply(sortSectionByCode(plan, section.id, now()))
                    }
                    title="Order by call number — no number changes"
                    type="button"
                  >
                    Sort by code
                  </button>
                  {armed === `section:${section.id}` ? (
                    <span className="library-delete-ask">
                      <span>Remove section? Its calls stay in the plan.</span>
                      <button
                        onClick={() => {
                          setArmed(undefined);
                          apply(removeSection(plan, section.id, now()));
                        }}
                        type="button"
                      >
                        Delete
                      </button>
                      <button onClick={() => setArmed(undefined)} type="button">
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      aria-label={`Remove section ${section.name}`}
                      className="library-remove"
                      onClick={() => setArmed(`section:${section.id}`)}
                      title="Remove this section — its calls stay in the plan"
                      type="button"
                    >
                      ×
                    </button>
                  )}
                </span>
              </div>
              {section.callIds.length === 0 ? (
                <p className="game-plan-empty">
                  No calls here yet — add plays on the right, or drop one in.
                </p>
              ) : (
                section.callIds.map((callId, index) =>
                  renderCall(callId, section.id, index, section.callIds.length),
                )
              )}
            </section>
          ))}
          {loose.length > 0 ? (
            <section aria-label="Unsectioned" className="game-plan-section">
              <div className="section-heading game-plan-section-head">
                <span className="game-plan-section-name">Unsectioned</span>
                <span className="game-plan-section-count">{loose.length}</span>
              </div>
              {loose.map((callId, index) =>
                renderCall(callId, undefined, index, loose.length),
              )}
            </section>
          ) : null}
          <form
            className="game-plan-inline game-plan-add-section"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newSection.trim()) return;
              apply(addSection(plan, { name: newSection, nowMs: now() }));
              setNewSection("");
            }}
          >
            <input
              aria-label="New section"
              onChange={(event) => setNewSection(event.target.value)}
              placeholder="New section — Goal line"
              spellCheck={false}
              value={newSection}
            />
            <button disabled={!newSection.trim()} type="submit">
              Add section
            </button>
          </form>
        </div>
        <AddPlaysPanel
          now={now}
          onApply={apply}
          plan={plan}
          snapshot={snapshot}
        />
      </div>
    </>
  );
}

function CodeField({
  callId,
  code,
  name,
  onCommit,
  onNextFree,
}: {
  callId: string;
  code: string;
  name: string;
  onCommit: (code: string) => void;
  onNextFree: () => void;
}) {
  return (
    <span className="game-plan-code">
      <input
        aria-label={`Call number for ${name}`}
        defaultValue={code}
        key={`${callId}:${code}`}
        onBlur={(event) => {
          if (event.target.value.trim() !== code) {
            onCommit(event.target.value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.currentTarget.value = code;
            event.currentTarget.blur();
          }
        }}
        placeholder="#"
        spellCheck={false}
      />
      {code ? null : (
        <button
          aria-label={`Next free number for ${name}`}
          onClick={onNextFree}
          title="Give it the next free number"
          type="button"
        >
          #
        </button>
      )}
    </span>
  );
}

function NoteField({
  callId,
  note,
  onCommit,
}: {
  callId: string;
  note: string;
  onCommit: (note: string) => void;
}) {
  return (
    <input
      aria-label="Call note"
      className="game-plan-note"
      defaultValue={note}
      key={`${callId}:${note}`}
      onBlur={(event) => {
        if (event.target.value.trim() !== note) onCommit(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      placeholder="Note — vs 2-high"
      spellCheck={false}
    />
  );
}

function matchesFilter(
  members: readonly PlaySearchProjection[],
  filter: {
    readonly text: string;
    readonly unit?: PlayUnit;
    readonly playTypeId?: string;
  },
): readonly PlaySearchProjection[] {
  const scoped = members.filter(
    (member) =>
      (filter.unit === undefined || member.unit === filter.unit) &&
      (filter.playTypeId === undefined ||
        (filter.playTypeId === UNCLASSIFIED
          ? member.playTypeId === undefined
          : member.playTypeId === filter.playTypeId)),
  );
  const hits = new Set(
    searchPlays(scoped, { text: filter.text }).map(({ playId }) => playId),
  );
  return scoped.filter((member) => hits.has(member.playId));
}

function AddPlaysPanel({
  now,
  onApply,
  plan,
  snapshot,
}: {
  now: () => number;
  onApply: (plan: GamePlan) => void;
  plan: GamePlan;
  snapshot: LibrarySnapshot;
}) {
  const [query, setQuery] = useState("");
  const [unit, setUnit] = useState<"all" | PlayUnit>(plan.unit);
  const [playType, setPlayType] = useState("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [targetSectionId, setTargetSectionId] = useState(
    plan.sections[0]?.id ?? "",
  );
  const [report, setReport] = useState<string>();
  const typeChips = useMemo(
    () => typeChipsFor(snapshot.playbook.playTypes, snapshot.members, unit),
    [snapshot.members, snapshot.playbook.playTypes, unit],
  );
  const filter = {
    text: query,
    ...(unit === "all" ? {} : { unit }),
    ...(playType === "all" ? {} : { playTypeId: playType }),
  };
  const matching = useMemo(
    () => matchesFilter(snapshot.members, filter),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter is rebuilt from these
    [snapshot.members, query, unit, playType],
  );
  const target = plan.sections.some(({ id }) => id === targetSectionId)
    ? targetSectionId
    : undefined;
  const selectedIds = [...selected];
  const preview = previewAddition(plan, selectedIds);
  const previewText = describeAddition(preview, sectionName(plan, target));
  const held = new Set(plan.calls.map(({ playId }) => playId));

  const savedMatches = plan.savedFilter
    ? matchesFilter(snapshot.members, {
        text: plan.savedFilter.text,
        ...(plan.savedFilter.unit === undefined
          ? {}
          : { unit: plan.savedFilter.unit }),
        ...(plan.savedFilter.playTypeId === undefined
          ? {}
          : { playTypeId: plan.savedFilter.playTypeId }),
      })
    : [];
  const savedPreview = previewAddition(
    plan,
    savedMatches.map(({ playId }) => playId),
  );

  const add = (playIds: readonly string[]) => {
    const result = addCalls(plan, playIds, {
      nowMs: now(),
      ...(target === undefined ? {} : { sectionId: target }),
    });
    onApply(result.plan);
    setSelected(new Set());
    setReport(
      `Added ${result.preview.added} new ${result.preview.added === 1 ? "call" : "calls"}${
        result.preview.already
          ? ` · ${result.preview.already} already in the plan${target ? `, placed in ${sectionName(plan, target)}` : ""}`
          : ""
      }`,
    );
  };

  const toggle = (playId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(playId)) next.delete(playId);
      else next.add(playId);
      return next;
    });

  return (
    <aside aria-label="Add plays" className="game-plan-add">
      <div className="section-heading">Add plays</div>
      <input
        aria-label="Search plays to add"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search — stick, red zone…"
        spellCheck={false}
        value={query}
      />
      <div className="chip-row game-plan-chips" role="group" aria-label="Unit">
        {[{ id: "all" as const, name: "All" }, ...playUnits].map((choice) => (
          <button
            className={`chip${unit === choice.id ? " active" : ""}`}
            data-unit={choice.id === "all" ? undefined : choice.id}
            key={choice.id}
            onClick={() => {
              setUnit(choice.id);
              setPlayType("all");
            }}
            type="button"
          >
            {choice.name}
          </button>
        ))}
      </div>
      <div className="chip-row game-plan-chips" role="group" aria-label="Type">
        <button
          className={`chip${playType === "all" ? " active" : ""}`}
          onClick={() => setPlayType("all")}
          type="button"
        >
          Any type
        </button>
        {typeChips.map((chip) => (
          <button
            className={`chip${playType === chip.id ? " active" : ""}`}
            key={chip.id}
            onClick={() => setPlayType(chip.id)}
            type="button"
          >
            {chip.name}
          </button>
        ))}
      </div>
      <div className="game-plan-pick-tools">
        <button
          disabled={matching.length === 0}
          onClick={() =>
            setSelected(new Set(matching.map(({ playId }) => playId)))
          }
          type="button"
        >
          Select all {matching.length} matching
        </button>
        {snapshot.concepts.length > 0 ? (
          <select
            aria-label="Add a concept's variants"
            onChange={(event) => {
              const conceptId = event.target.value;
              if (!conceptId) return;
              setSelected(
                new Set(
                  snapshot.members
                    .filter((member) => member.conceptId === conceptId)
                    .map(({ playId }) => playId),
                ),
              );
              event.target.value = "";
            }}
            value=""
          >
            <option value="">Concept's variants…</option>
            {snapshot.concepts.map((concept) => (
              <option key={concept.id} value={concept.id}>
                {concept.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div
        className="game-plan-pick-list"
        role="group"
        aria-label="Matching plays"
      >
        {matching.length === 0 ? (
          <p className="game-plan-empty">No plays match.</p>
        ) : (
          matching.map((member) => (
            <label className="game-plan-pick" key={member.playId}>
              <input
                aria-label={member.name}
                checked={selected.has(member.playId)}
                onChange={() => toggle(member.playId)}
                type="checkbox"
              />
              <span className="game-plan-pick-name">{member.name}</span>
              <span className="game-plan-pick-meta">
                {formatClassification({
                  unit: member.unit,
                  ...(member.playTypeId === undefined
                    ? {}
                    : {
                        playType: {
                          id: member.playTypeId,
                          name: member.playTypeName ?? member.playTypeId,
                        },
                      }),
                })}
                {held.has(member.playId) ? " · in plan" : ""}
              </span>
            </label>
          ))
        )}
      </div>
      <div className="game-plan-pick-target">
        <span>Into</span>
        <select
          aria-label="Target section"
          onChange={(event) => setTargetSectionId(event.target.value)}
          value={target ?? ""}
        >
          <option value="">No section</option>
          {plan.sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </div>
      <p className="game-plan-preview" data-preview role="status">
        {previewText}
      </p>
      <button
        className="menu-primary"
        disabled={preview.total === 0}
        onClick={() => add(selectedIds)}
        type="button"
      >
        Add {preview.total ? `${preview.total} ` : ""}to plan
      </button>
      {report ? <p className="game-plan-report">{report}</p> : null}
      <div className="game-plan-saved">
        <button
          disabled={!query.trim() && unit === "all" && playType === "all"}
          onClick={() => {
            const saved: GamePlanFilter = {
              text: query,
              ...(unit === "all" ? {} : { unit }),
              ...(playType === "all" ? {} : { playTypeId: playType }),
            };
            onApply({ ...plan, savedFilter: saved, updatedAtMs: now() });
          }}
          title="Remember this search with the plan; expanding from it later is always a deliberate step"
          type="button"
        >
          Save this search with the plan
        </button>
        {plan.savedFilter ? (
          <button
            disabled={savedPreview.added === 0}
            onClick={() => add(savedMatches.map(({ playId }) => playId))}
            title={`Saved search: "${plan.savedFilter.text || "everything"}"${plan.savedFilter.unit ? ` · ${unitName(plan.savedFilter.unit)}` : ""}`}
            type="button"
          >
            Expand from saved search ({savedPreview.added} new)
          </button>
        ) : null}
      </div>
    </aside>
  );
}
