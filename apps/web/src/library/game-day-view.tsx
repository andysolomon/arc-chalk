import {
  gamePlanSubtitle,
  planPlay,
  playbackShowsAnimation,
  revisionRows,
  revisionStatus,
  unitName,
  type CallRow,
  type GamePlan,
  type GamePlanRevision,
  type SectionRows,
} from "@chalk/domain";
import {
  clampPlaybackTime,
  idlePlayback,
  resetPlayback,
  seekPlayback,
  setPlaybackRate,
  tickPlayback,
  togglePlayback,
  type PlaybackClock,
  type PlaybackRate,
} from "@chalk/editor";
import { preparedStamp } from "@chalk/exports";
import {
  buildRenderScene,
  buildSvgRenderScene,
  defaultPresentation,
} from "@chalk/render";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChalkLibrary, LibrarySnapshot } from "../app/editor-runtime";
import { FieldDiagram } from "../components/field-diagram";
import { PlaybackBar } from "../components/playback-bar";
import { readPlaybackNow } from "../components/playback-now";
import {
  clearMarks,
  defaultGameDayState,
  flatten,
  markCalled,
  markResult,
  notesFor,
  planReadiness,
  setNote,
  toggleFavorite,
  visibleRows,
  withNotes,
  type CallResult,
  type GameDayLayout,
  type GameDayPlace,
  type GameDayState,
  type Readiness,
} from "./game-day-state";

/**
 * Game Day (issue #67): a coordinator reads a prepared plan here — never the
 * live library (ADR 0042). He picks a section, finds a call by its code or
 * name, steps Previous and Next with a thumb, and comes back to the section
 * he was in. The diagram cannot be edited: it is rendered with no pointer
 * handlers, and a swipe or a resting Pencil only moves through calls. His
 * notes and marks live beside the revision on this device, apart from the
 * authored Play.
 */
export function GameDayView({
  hasImage,
  library,
  onOpenPlaybooks,
  snapshot,
}: {
  /** Whether an image the plan's Plays reference is on this device. */
  hasImage: (hash: string) => Promise<boolean>;
  library: ChalkLibrary;
  /** Where a plan is made and prepared. */
  onOpenPlaybooks: () => void;
  snapshot: LibrarySnapshot;
}) {
  const [plans, setPlans] = useState<readonly GamePlan[]>([]);
  const [state, setState] = useState<GameDayState>(defaultGameDayState);
  const stateRef = useRef(state);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState<GamePlanRevision>();
  const [checked, setChecked] = useState<{
    readonly revisionId: string;
    readonly readiness: Readiness;
  }>();
  const readiness =
    checked && checked.revisionId === revision?.id
      ? checked.readiness
      : undefined;

  const remember = useCallback(
    (next: GameDayState) => {
      stateRef.current = next;
      setState(next);
      void library.saveGameDay(next).catch(() => undefined);
    },
    [library],
  );

  // Plans and where the reader was, once; the revision it was on, if any.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([library.listGamePlans(), library.loadGameDay()]).then(
      async ([list, stored]) => {
        if (cancelled) return;
        setPlans(list);
        stateRef.current = stored;
        setState(stored);
        setLoaded(true);
        const place = stored.place;
        if (place && list.some((plan) => plan.id === place.planId)) {
          const found = await library.getGamePlanRevision(place.revisionId);
          if (!cancelled && found) setRevision(found);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [library]);

  useEffect(() => {
    if (!revision) return;
    let cancelled = false;
    void planReadiness(revision, hasImage).then((result) => {
      if (!cancelled) {
        setChecked({ revisionId: revision.id, readiness: result });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hasImage, revision]);

  const place = state.place;
  const plan = plans.find(({ id }) => id === place?.planId);

  const openPlan = async (candidate: GamePlan) => {
    if (!candidate.preparedRevisionId) return;
    const found = await library.getGamePlanRevision(
      candidate.preparedRevisionId,
    );
    if (!found) return;
    setRevision(found);
    remember({
      ...stateRef.current,
      place: {
        planId: candidate.id,
        revisionId: found.id,
        section: "all",
        query: "",
        layout: stateRef.current.place?.layout ?? "list",
      },
    });
  };

  const leavePlan = () => {
    setRevision(undefined);
    const { place: _gone, ...rest } = stateRef.current;
    void _gone;
    remember(rest);
  };

  if (!loaded) {
    return <main aria-label="Game Day" className="destination game-day" />;
  }

  if (!revision || !place || !plan) {
    const prepared = plans.filter((candidate) => candidate.preparedRevisionId);
    return (
      <main aria-label="Game Day" className="destination game-day">
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
              {prepared.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    onClick={() => void openPlan(candidate)}
                    type="button"
                  >
                    <span className="game-day-name">{candidate.name}</span>
                    <span className="game-day-meta">
                      {[gamePlanSubtitle(candidate), unitName(candidate.unit)]
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
      </main>
    );
  }

  const switchToNewest = async () => {
    if (!plan.preparedRevisionId) return;
    const found = await library.getGamePlanRevision(plan.preparedRevisionId);
    if (!found) return;
    setRevision(found);
    const { callId: _was, ...kept } = place;
    void _was;
    remember({
      ...stateRef.current,
      place: { ...kept, revisionId: found.id },
    });
  };

  return (
    <Reader
      key={revision.id}
      notes={notesFor(state, revision.id)}
      onLeave={leavePlan}
      onNotes={(update) =>
        remember(withNotes(stateRef.current, revision.id, update))
      }
      onPlace={(next) =>
        remember({ ...stateRef.current, place: { ...place, ...next } })
      }
      onSwitchRevision={() => {
        void switchToNewest();
      }}
      place={place}
      plan={plan}
      readiness={readiness}
      revision={revision}
      snapshot={snapshot}
    />
  );
}

const resultLabels: Record<CallResult, string> = {
  gain: "Gain",
  loss: "Loss",
  score: "Score",
  turnover: "Turnover",
};

function Reader({
  notes,
  onLeave,
  onNotes,
  onPlace,
  onSwitchRevision,
  place,
  plan,
  readiness,
  revision,
  snapshot,
}: {
  notes: ReturnType<typeof notesFor>;
  onLeave: () => void;
  onNotes: (
    update: (notes: ReturnType<typeof notesFor>) => ReturnType<typeof notesFor>,
  ) => void;
  onPlace: (next: Partial<GameDayPlace>) => void;
  onSwitchRevision: () => void;
  place: GameDayPlace;
  plan: GamePlan;
  readiness: Readiness | undefined;
  revision: GamePlanRevision;
  snapshot: LibrarySnapshot;
}) {
  const sections = useMemo(() => revisionRows(revision), [revision]);
  const shown = useMemo(
    () => visibleRows(sections, place, notes.favorites),
    [notes.favorites, place, sections],
  );
  const order = useMemo(() => flatten(shown), [shown]);
  const current =
    order.find((row) => row.callId === place.callId) ??
    flatten(sections).find((row) => row.callId === place.callId);
  const index = order.findIndex((row) => row.callId === current?.callId);
  const step = (direction: 1 | -1) => {
    if (order.length === 0) return;
    const next =
      index < 0
        ? direction > 0
          ? 0
          : order.length - 1
        : (index + direction + order.length) % order.length;
    onPlace({ callId: order[next]!.callId });
  };
  const sectionOfCurrent = sections.find((section) =>
    section.calls.some((row) => row.callId === current?.callId),
  );
  const backToSection = () => {
    onPlace({
      section: sectionOfCurrent?.sectionId ?? "all",
      query: "",
    });
  };

  // Left and right step calls; nothing here reaches the Play.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) {
        return;
      }
      if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
      else return;
      event.preventDefault();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  });

  const status = useMemo(
    () =>
      revisionStatus(
        plan,
        revision,
        new Map(
          snapshot.members.map((member) => [
            member.playId,
            member.documentHash,
          ]),
        ),
      ),
    [plan, revision, snapshot.members],
  );
  const newerPrepared =
    plan.preparedRevisionId !== undefined &&
    plan.preparedRevisionId !== revision.id;

  const mark = current ? notes.marks[current.callId] : undefined;
  const note = current ? (notes.notes[current.callId] ?? "") : "";
  const [noteDraft, setNoteDraft] = useState<string>();
  const layout: GameDayLayout = place.layout;

  return (
    <main aria-label="Game Day" className="destination game-day reader">
      <div className="reader-head">
        <button
          aria-label="Back to plans"
          className="browser-link"
          onClick={onLeave}
          type="button"
        >
          ‹ Plans
        </button>
        <div className="reader-title-block">
          <div className="game-day-title">
            {`${unitName(revision.plan.unit)} · ${revision.plan.name}`}
          </div>
          <div className="game-day-sub">
            {[gamePlanSubtitle(revision.plan), preparedStamp(revision)]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <ReadinessChip readiness={readiness} />
        <input
          aria-label="Find a call by number or name"
          className="reader-search"
          inputMode="search"
          onChange={(event) => onPlace({ query: event.target.value })}
          placeholder="Call number or name"
          spellCheck={false}
          type="search"
          value={place.query}
        />
        <div
          className="segments reader-layout"
          role="group"
          aria-label="Layout"
        >
          {(["list", "grid"] as const).map((choice) => (
            <button
              aria-pressed={layout === choice}
              className={layout === choice ? "active" : undefined}
              key={choice}
              onClick={() => onPlace({ layout: choice })}
              type="button"
            >
              {choice === "list" ? "List" : "Grid"}
            </button>
          ))}
        </div>
      </div>
      {newerPrepared || status.stale ? (
        <div className="reader-notice" role="status">
          {newerPrepared ? (
            <>
              <span>
                A newer packet has been prepared for this plan. You are reading
                the one you opened.
              </span>
              <button onClick={onSwitchRevision} type="button">
                Switch to the newest
              </button>
            </>
          ) : (
            <span>
              The plan or its plays have changed since this packet was prepared.
              Nothing here changes until you prepare again.
            </span>
          )}
        </div>
      ) : null}
      <nav aria-label="Situations" className="reader-tabs">
        <button
          aria-pressed={place.section === "all"}
          className={place.section === "all" ? "active" : undefined}
          onClick={() => onPlace({ section: "all" })}
          type="button"
        >
          All
        </button>
        <button
          aria-pressed={place.section === "favorites"}
          className={place.section === "favorites" ? "active" : undefined}
          onClick={() => onPlace({ section: "favorites" })}
          type="button"
        >
          ★ Favorites
        </button>
        {sections.map((section) => {
          const id = section.sectionId ?? "unsectioned";
          return (
            <button
              aria-pressed={place.section === id}
              className={place.section === id ? "active" : undefined}
              key={id}
              onClick={() => onPlace({ section: id })}
              type="button"
            >
              {section.name}
            </button>
          );
        })}
      </nav>
      <div className="reader-body">
        <CallList
          current={current?.callId}
          favorites={notes.favorites}
          layout={layout}
          marks={notes.marks}
          onPick={(callId) => onPlace({ callId })}
          onStar={(callId) => onNotes((n) => toggleFavorite(n, callId))}
          sections={shown}
        />
        <section aria-label="Selected call" className="reader-stage">
          {current ? (
            <>
              <div className="reader-call-head">
                <code className="reader-code">{current.code || "—"}</code>
                <span className="reader-name">{current.name}</span>
                {sectionOfCurrent ? (
                  <span className="reader-section-name">
                    {sectionOfCurrent.name}
                  </span>
                ) : null}
                <button
                  aria-label={
                    notes.favorites.includes(current.callId)
                      ? "Remove from favorites"
                      : "Add to favorites"
                  }
                  aria-pressed={notes.favorites.includes(current.callId)}
                  className="reader-star"
                  onClick={() =>
                    onNotes((n) => toggleFavorite(n, current.callId))
                  }
                  type="button"
                >
                  ★
                </button>
              </div>
              {current.play ? (
                <Diagram key={current.playId} play={current.play} />
              ) : (
                <p className="reader-missing">
                  This call's play is not in the packet. It was deleted from the
                  library before the plan was prepared.
                </p>
              )}
              <div className="reader-nav">
                <button
                  aria-label="Previous call"
                  className="reader-step"
                  disabled={order.length < 2}
                  onClick={() => step(-1)}
                  type="button"
                >
                  ‹ Previous
                </button>
                <span className="reader-position">
                  {index >= 0 ? `${index + 1} / ${order.length}` : "—"}
                </span>
                <button
                  className="reader-back"
                  onClick={backToSection}
                  type="button"
                >
                  Back to {sectionOfCurrent?.name ?? "all"}
                </button>
                <button
                  aria-label="Next call"
                  className="reader-step"
                  disabled={order.length < 2}
                  onClick={() => step(1)}
                  type="button"
                >
                  Next ›
                </button>
              </div>
              <div
                className="reader-marks"
                role="group"
                aria-label="Game notes"
              >
                <button
                  className="reader-called"
                  onClick={() => onNotes((n) => markCalled(n, current.callId))}
                  type="button"
                >
                  Called{mark && mark.called > 0 ? ` ×${mark.called}` : ""}
                </button>
                <div className="segments reader-results">
                  {(Object.keys(resultLabels) as CallResult[]).map((result) => (
                    <button
                      aria-pressed={mark?.result === result}
                      className={mark?.result === result ? "active" : undefined}
                      key={result}
                      onClick={() =>
                        onNotes((n) =>
                          markResult(
                            n,
                            current.callId,
                            mark?.result === result ? undefined : result,
                          ),
                        )
                      }
                      type="button"
                    >
                      {resultLabels[result]}
                    </button>
                  ))}
                </div>
                {mark ? (
                  <button
                    className="reader-clear"
                    onClick={() =>
                      onNotes((n) => clearMarks(n, current.callId))
                    }
                    type="button"
                  >
                    Clear marks
                  </button>
                ) : null}
                <textarea
                  aria-label="Game note"
                  className="reader-note"
                  onBlur={() => {
                    if (noteDraft !== undefined) {
                      onNotes((n) => setNote(n, current.callId, noteDraft));
                      setNoteDraft(undefined);
                    }
                  }}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="A note for this call — it stays on this device, not on the play"
                  rows={2}
                  value={noteDraft ?? note}
                />
              </div>
            </>
          ) : (
            <p className="reader-pick">
              {order.length === 0
                ? "No call answers to that. Clear the search or pick another section."
                : "Pick a call, or press Next."}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function ReadinessChip({ readiness }: { readiness: Readiness | undefined }) {
  if (!readiness) {
    return <span className="reader-ready checking">Checking…</span>;
  }
  if (readiness.ready) {
    return (
      <span
        className="reader-ready ok"
        title="Every play and image this plan needs is on this device"
      >
        Ready offline · {readiness.callCount}{" "}
        {readiness.callCount === 1 ? "call" : "calls"}
      </span>
    );
  }
  const missing = [
    ...readiness.missingPlays.map((code) => `play ${code}`),
    ...readiness.missingImages.map((hash) => `image ${hash.slice(0, 8)}`),
  ];
  return (
    <span className="reader-ready missing" title={missing.join(", ")}>
      Not ready offline — missing {missing.length}:{" "}
      {missing.slice(0, 3).join(", ")}
      {missing.length > 3 ? "…" : ""}
    </span>
  );
}

function CallList({
  current,
  favorites,
  layout,
  marks,
  onPick,
  onStar,
  sections,
}: {
  current: string | undefined;
  favorites: readonly string[];
  layout: GameDayLayout;
  marks: ReturnType<typeof notesFor>["marks"];
  onPick: (callId: string) => void;
  onStar: (callId: string) => void;
  sections: readonly SectionRows[];
}) {
  const starred = new Set(favorites);
  return (
    <div
      className={`reader-list ${layout}`}
      role="navigation"
      aria-label="Calls"
    >
      {sections.map((section) => (
        <section
          aria-label={section.name}
          className="reader-list-section"
          key={section.sectionId ?? "unsectioned"}
        >
          <h2>{section.name}</h2>
          <ol className="reader-calls">
            {section.calls.map((row: CallRow) => (
              <li
                className={`reader-row${row.callId === current ? " current" : ""}${row.missing ? " missing" : ""}`}
                key={`${section.sectionId ?? "u"}:${row.callId}`}
              >
                <button
                  aria-current={row.callId === current ? "true" : undefined}
                  className="reader-pick-call"
                  onClick={() => onPick(row.callId)}
                  type="button"
                >
                  <code>{row.code || "—"}</code>{" "}
                  <span className="reader-row-name">{row.name}</span>
                  {marks[row.callId]?.called ? (
                    <span className="reader-row-mark">
                      ×{marks[row.callId]!.called}
                    </span>
                  ) : null}
                </button>
                <button
                  aria-label={
                    starred.has(row.callId)
                      ? `Unstar ${row.name}`
                      : `Star ${row.name}`
                  }
                  aria-pressed={starred.has(row.callId)}
                  className="reader-star"
                  onClick={() => onStar(row.callId)}
                  type="button"
                >
                  ★
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/**
 * The prepared Play, read-only: rendered with no pointer handlers, so a
 * touch, a swipe or a Pencil resting on the glass cannot move a man. Playback
 * is offered on demand and keeps its controls out of the call list.
 */
function Diagram({ play }: { play: NonNullable<CallRow["play"]> }) {
  const plan = useMemo(() => planPlay(play), [play]);
  const [clock, setClock] = useState<PlaybackClock>(() =>
    idlePlayback(plan.startMs),
  );
  const clockRef = useRef(clock);
  const [showPlayback, setShowPlayback] = useState(false);
  const bounds = { startMs: plan.startMs, endMs: plan.endMs };
  const run = (next: PlaybackClock) => {
    clockRef.current = next;
    setClock(next);
  };
  useEffect(() => {
    if (!clock.playing) return;
    let frame = 0;
    const loop = (now: number) => {
      const next = tickPlayback(clockRef.current, now, bounds);
      clockRef.current = next;
      setClock(next);
      if (next.playing) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bounds is derived from plan
  }, [clock.playing, plan]);
  const timeMs = clampPlaybackTime(clock.timeMs, bounds);
  const animating = playbackShowsAnimation(timeMs, plan.startMs, clock.playing);
  const scene = useMemo(
    () =>
      buildSvgRenderScene(
        buildRenderScene(play, {
          presentation: { ...defaultPresentation, present: true },
          ...(animating ? { atMs: timeMs, playing: clock.playing } : {}),
        }),
      ),
    [animating, clock.playing, play, timeMs],
  );
  return (
    <div className="reader-diagram">
      <FieldDiagram scene={scene} />
      {plan.items.length > 0 ? (
        <div className="reader-playback">
          <button
            aria-expanded={showPlayback}
            className="reader-play-toggle"
            onClick={() => setShowPlayback((open) => !open)}
            type="button"
          >
            {showPlayback ? "Hide playback" : "Play it"}
          </button>
          {showPlayback ? (
            <PlaybackBar
              clock={{ ...clock, timeMs }}
              onPlay={() =>
                run(togglePlayback(clockRef.current, readPlaybackNow(), bounds))
              }
              onRate={(rate: PlaybackRate) =>
                run(setPlaybackRate(clockRef.current, rate, readPlaybackNow()))
              }
              onReset={() => run(resetPlayback(clockRef.current, plan.startMs))}
              onSeek={(ms) => run(seekPlayback(clockRef.current, ms, bounds))}
              plan={plan}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
