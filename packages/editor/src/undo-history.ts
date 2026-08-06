import {
  applyPlayCommand,
  boundUndoHistory,
  canonicalSha256,
  createUndoHistory,
  describePlayCommand,
  undoHistorySchema,
  type PlayCommand,
  type PlayDocument,
  type UndoEntry,
  type UndoHistory,
} from "@chalk/domain";

/** Consecutive edits to one field coalesce until the Coach pauses this long. */
export const UNDO_COALESCE_WINDOW_MS = 1_000;

export interface RecordUndoEntryInput {
  readonly id: string;
  readonly createdAtMs: number;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly forward: PlayCommand;
  readonly inverse: PlayCommand;
  readonly coalesceKey?: string;
  readonly label?: string;
}

export interface RecordUndoEntryOptions {
  readonly coalesceWindowMs?: number;
}

/**
 * Records one committed edit and clears this Play's redo stack. A run of edits
 * to the same field merges into the entry already on top, keeping that entry's
 * inverse so undoing returns to where the run started.
 */
export function recordUndoEntry(
  history: UndoHistory,
  input: RecordUndoEntryInput,
  { coalesceWindowMs = UNDO_COALESCE_WINDOW_MS }: RecordUndoEntryOptions = {},
): UndoHistory {
  if (input.beforeHash === input.afterHash) return history;

  const label = input.label ?? describePlayCommand(input.forward);
  const previous = history.undo.at(-1);
  const coalesces =
    input.coalesceKey !== undefined &&
    previous !== undefined &&
    previous.coalesceKey === input.coalesceKey &&
    previous.afterHash === input.beforeHash &&
    input.createdAtMs - previous.createdAtMs <= coalesceWindowMs;

  const entry: UndoEntry = coalesces
    ? {
        ...previous,
        label,
        createdAtMs: input.createdAtMs,
        afterHash: input.afterHash,
        forward: input.forward,
      }
    : {
        id: input.id,
        label,
        createdAtMs: input.createdAtMs,
        beforeHash: input.beforeHash,
        afterHash: input.afterHash,
        forward: input.forward,
        inverse: input.inverse,
        ...(input.coalesceKey === undefined
          ? {}
          : { coalesceKey: input.coalesceKey }),
      };

  return boundUndoHistory(
    {
      ...history,
      undo: coalesces
        ? [...history.undo.slice(0, -1), entry]
        : [...history.undo, entry],
      redo: [],
    },
    input.createdAtMs,
  );
}

/** Blurring a field, or moving to another one, ends the coalescing run. */
export function sealUndoCoalescing(history: UndoHistory): UndoHistory {
  const previous = history.undo.at(-1);
  if (!previous?.coalesceKey) return history;
  const sealed: Record<string, unknown> = { ...previous };
  delete sealed.coalesceKey;
  return {
    ...history,
    undo: [...history.undo.slice(0, -1), sealed as UndoEntry],
  };
}

export type UndoStepResult =
  | {
      readonly status: "applied";
      readonly history: UndoHistory;
      readonly document: PlayDocument;
      readonly entry: UndoEntry;
    }
  | { readonly status: "empty" }
  | {
      readonly status: "quarantined";
      readonly history: UndoHistory;
      readonly entries: readonly UndoEntry[];
      readonly reason: string;
    };

function quarantine(
  history: UndoHistory,
  nowMs: number,
  reason: string,
): UndoStepResult {
  return {
    status: "quarantined",
    history: boundUndoHistory({ ...history, undo: [], redo: [] }, nowMs),
    entries: [...history.undo, ...history.redo],
    reason,
  };
}

async function step(
  history: UndoHistory,
  document: PlayDocument,
  documentHash: string,
  nowMs: number,
  direction: "undo" | "redo",
): Promise<UndoStepResult> {
  const source = direction === "undo" ? history.undo : history.redo;
  const entry = source.at(-1);
  if (!entry) return { status: "empty" };

  const expectedBefore =
    direction === "undo" ? entry.afterHash : entry.beforeHash;
  const expectedAfter =
    direction === "undo" ? entry.beforeHash : entry.afterHash;
  if (expectedBefore !== documentHash) {
    return quarantine(
      history,
      nowMs,
      `This Play changed outside its history, so the stored ${direction} no longer applies.`,
    );
  }

  let next: PlayDocument;
  try {
    next = applyPlayCommand(
      document,
      direction === "undo" ? entry.inverse : entry.forward,
    );
  } catch {
    return quarantine(
      history,
      nowMs,
      `Chalk could not replay the stored ${direction} for this Play.`,
    );
  }
  if ((await canonicalSha256(next)) !== expectedAfter) {
    return quarantine(
      history,
      nowMs,
      `The stored ${direction} did not reproduce the expected Play.`,
    );
  }

  const moved =
    direction === "undo"
      ? { undo: history.undo.slice(0, -1), redo: [...history.redo, entry] }
      : { undo: [...history.undo, entry], redo: history.redo.slice(0, -1) };
  return {
    status: "applied",
    history: boundUndoHistory({ ...history, ...moved }, nowMs),
    document: next,
    entry,
  };
}

export function undoStep(
  history: UndoHistory,
  document: PlayDocument,
  documentHash: string,
  nowMs: number,
): Promise<UndoStepResult> {
  return step(history, document, documentHash, nowMs, "undo");
}

export function redoStep(
  history: UndoHistory,
  document: PlayDocument,
  documentHash: string,
  nowMs: number,
): Promise<UndoStepResult> {
  return step(history, document, documentHash, nowMs, "redo");
}

export interface UndoAvailability {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel?: string;
  readonly redoLabel?: string;
  readonly undoDepth: number;
  readonly redoDepth: number;
}

/**
 * A step is offered only when the Play in front of the Coach is the exact
 * document the entry expects, so no undo is ever applied speculatively.
 */
export function undoAvailability(
  history: UndoHistory,
  documentHash: string,
): UndoAvailability {
  const undoEntry = history.undo.at(-1);
  const redoEntry = history.redo.at(-1);
  const canUndo = undoEntry?.afterHash === documentHash;
  const canRedo = redoEntry?.beforeHash === documentHash;
  return {
    canUndo,
    canRedo,
    ...(canUndo && undoEntry ? { undoLabel: undoEntry.label } : {}),
    ...(canRedo && redoEntry ? { redoLabel: redoEntry.label } : {}),
    undoDepth: history.undo.length,
    redoDepth: history.redo.length,
  };
}

/**
 * A stored history that no longer parses is discarded rather than trusted; a
 * schema change may cost local undo but must never cost the Play itself.
 */
export function restoreUndoHistory(
  playId: string,
  stored: unknown,
  nowMs: number,
): UndoHistory {
  const parsed = undoHistorySchema.safeParse(stored);
  if (!parsed.success || parsed.data.playId !== playId) {
    return createUndoHistory(playId, nowMs);
  }
  return boundUndoHistory(parsed.data, nowMs);
}
