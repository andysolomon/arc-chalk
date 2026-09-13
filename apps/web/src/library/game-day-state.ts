import type { CallRow, GamePlanRevision, SectionRows } from "@chalk/domain";

/**
 * What a coordinator writes on the sideline, kept apart from the authored
 * Play (issue #67): a note on a call, whether it was called and how it went,
 * and the calls he starred. Device-local, keyed by the prepared revision it
 * was written against, so a new packet starts clean and an old one keeps
 * its notes.
 */
export type CallResult = "gain" | "loss" | "score" | "turnover";

export interface CallMark {
  /** How many times the call went in. */
  readonly called: number;
  readonly result?: CallResult;
}

export interface RevisionNotes {
  readonly favorites: readonly string[];
  readonly notes: Readonly<Record<string, string>>;
  readonly marks: Readonly<Record<string, CallMark>>;
}

export type GameDayLayout = "list" | "grid";

/** Where the reader was, so rotation, a background and a reload land back there. */
export interface GameDayPlace {
  readonly planId: string;
  readonly revisionId: string;
  /** A section id, "all", or "favorites". */
  readonly section: string;
  readonly callId?: string;
  readonly query: string;
  readonly layout: GameDayLayout;
}

export interface GameDayState {
  readonly place?: GameDayPlace;
  readonly revisions: Readonly<Record<string, RevisionNotes>>;
}

export const GAME_DAY_KEY = "gameDay.v1";

export const emptyRevisionNotes: RevisionNotes = Object.freeze({
  favorites: [],
  notes: {},
  marks: {},
});

export const defaultGameDayState: GameDayState = Object.freeze({
  revisions: {},
});

const results: readonly CallResult[] = ["gain", "loss", "score", "turnover"];

function readNotes(value: unknown): RevisionNotes {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyRevisionNotes;
  }
  const record = value as Record<string, unknown>;
  const favorites = Array.isArray(record.favorites)
    ? record.favorites.filter((id): id is string => typeof id === "string")
    : [];
  const notes =
    record.notes && typeof record.notes === "object"
      ? Object.fromEntries(
          Object.entries(record.notes as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
  const marks: Record<string, CallMark> = {};
  if (record.marks && typeof record.marks === "object") {
    for (const [callId, mark] of Object.entries(
      record.marks as Record<string, unknown>,
    )) {
      if (!mark || typeof mark !== "object") continue;
      const m = mark as Record<string, unknown>;
      const called = typeof m.called === "number" ? m.called : 0;
      const result = results.find((r) => r === m.result);
      marks[callId] = result ? { called, result } : { called };
    }
  }
  return { favorites, notes, marks };
}

/** A stored state that no longer parses becomes the empty one, field by field. */
export function readGameDayState(value: unknown): GameDayState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultGameDayState;
  }
  const record = value as Record<string, unknown>;
  const revisions: Record<string, RevisionNotes> = {};
  if (record.revisions && typeof record.revisions === "object") {
    for (const [id, notes] of Object.entries(
      record.revisions as Record<string, unknown>,
    )) {
      revisions[id] = readNotes(notes);
    }
  }
  const place = record.place as Record<string, unknown> | undefined;
  const validPlace =
    place &&
    typeof place === "object" &&
    typeof place.planId === "string" &&
    typeof place.revisionId === "string"
      ? {
          planId: place.planId,
          revisionId: place.revisionId,
          section: typeof place.section === "string" ? place.section : "all",
          ...(typeof place.callId === "string" ? { callId: place.callId } : {}),
          query: typeof place.query === "string" ? place.query : "",
          layout:
            place.layout === "grid" ? ("grid" as const) : ("list" as const),
        }
      : undefined;
  return { ...(validPlace ? { place: validPlace } : {}), revisions };
}

export function notesFor(
  state: GameDayState,
  revisionId: string,
): RevisionNotes {
  return state.revisions[revisionId] ?? emptyRevisionNotes;
}

export function withNotes(
  state: GameDayState,
  revisionId: string,
  update: (notes: RevisionNotes) => RevisionNotes,
): GameDayState {
  return {
    ...state,
    revisions: {
      ...state.revisions,
      [revisionId]: update(notesFor(state, revisionId)),
    },
  };
}

export function toggleFavorite(
  notes: RevisionNotes,
  callId: string,
): RevisionNotes {
  const on = notes.favorites.includes(callId);
  return {
    ...notes,
    favorites: on
      ? notes.favorites.filter((id) => id !== callId)
      : [...notes.favorites, callId],
  };
}

export function setNote(
  notes: RevisionNotes,
  callId: string,
  text: string,
): RevisionNotes {
  const next = { ...notes.notes };
  if (text.trim() === "") delete next[callId];
  else next[callId] = text;
  return { ...notes, notes: next };
}

/** One more time in; a result names how the last one went. */
export function markCalled(
  notes: RevisionNotes,
  callId: string,
): RevisionNotes {
  const current = notes.marks[callId] ?? { called: 0 };
  return {
    ...notes,
    marks: {
      ...notes.marks,
      [callId]: { ...current, called: current.called + 1 },
    },
  };
}

export function markResult(
  notes: RevisionNotes,
  callId: string,
  result: CallResult | undefined,
): RevisionNotes {
  const current = notes.marks[callId] ?? { called: 0 };
  const next = result
    ? { called: current.called, result }
    : { called: current.called };
  return { ...notes, marks: { ...notes.marks, [callId]: next } };
}

export function clearMarks(
  notes: RevisionNotes,
  callId: string,
): RevisionNotes {
  const marks = { ...notes.marks };
  delete marks[callId];
  return { ...notes, marks };
}

/**
 * Whether a call answers to what the coordinator typed: its code, exactly or
 * by prefix, or any word of its name. "12" finds call 12 before it finds
 * "Stick — Thunder 120"; "stick" finds every Stick.
 */
export function callMatches(row: CallRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const code = row.code.trim().toLowerCase();
  if (code === q || code.startsWith(q)) return true;
  return row.name.toLowerCase().includes(q);
}

/** The rows the reader lists for a section choice, a search, and favorites. */
export function visibleRows(
  sections: readonly SectionRows[],
  choice: { readonly section: string; readonly query: string },
  favorites: readonly string[],
): readonly SectionRows[] {
  const wanted =
    choice.section === "all" || choice.section === "favorites"
      ? sections
      : sections.filter(
          (section) => (section.sectionId ?? "unsectioned") === choice.section,
        );
  const starred = new Set(favorites);
  return wanted
    .map((section) => ({
      ...section,
      calls: section.calls.filter(
        (call) =>
          callMatches(call, choice.query) &&
          (choice.section !== "favorites" || starred.has(call.callId)),
      ),
    }))
    .filter((section) => section.calls.length > 0);
}

/** Every visible call in reading order, for Previous and Next. */
export function flatten(sections: readonly SectionRows[]): readonly CallRow[] {
  return sections.flatMap((section) => section.calls);
}

/**
 * Whether this plan can be read without a connection: every call's Play is
 * in the revision and every image those Plays reference is on this device.
 * Says what is missing rather than claiming readiness it cannot show.
 */
export interface Readiness {
  readonly ready: boolean;
  readonly callCount: number;
  readonly missingPlays: readonly string[];
  readonly missingImages: readonly string[];
}

export async function planReadiness(
  revision: GamePlanRevision,
  hasImage: (hash: string) => Promise<boolean>,
): Promise<Readiness> {
  const missingPlays = revision.plan.calls
    .filter((call) => revision.missingPlayIds.includes(call.playId))
    .map((call) => call.code || call.playId);
  const hashes = new Set<string>();
  for (const play of revision.plays) {
    for (const attachment of play.document.attachments ?? []) {
      hashes.add(attachment.hash);
    }
  }
  const missingImages: string[] = [];
  for (const hash of hashes) {
    if (!(await hasImage(hash))) missingImages.push(hash);
  }
  return {
    ready: missingPlays.length === 0 && missingImages.length === 0,
    callCount: revision.plan.calls.length,
    missingPlays,
    missingImages,
  };
}
