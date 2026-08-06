import * as z from "zod/mini";

import { canonicalStringify } from "./canonical";
import { playCommandSchema } from "./commands";
import { entityIdSchema, nameSchema } from "./schema";

/**
 * Each Play retains at most this much history, whichever limit is reached
 * first. Undo history is device-local, disposable, and never allowed to crowd
 * out the Coach's Plays, revisions, or named versions.
 */
export const UNDO_HISTORY_LIMITS = Object.freeze({
  maxEntries: 100,
  maxEncodedBytes: 20 * 1024 * 1024,
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
});

/** Boundary hashes are opaque here so tests and adapters can use any digest. */
const documentHashSchema = z.string().check(z.minLength(1));

export const undoEntrySchema = z.object({
  id: entityIdSchema,
  label: nameSchema,
  createdAtMs: z.number().check(z.int(), z.nonnegative()),
  beforeHash: documentHashSchema,
  afterHash: documentHashSchema,
  forward: playCommandSchema,
  inverse: playCommandSchema,
  coalesceKey: z.optional(z.string()),
});

export const undoHistorySchema = z.object({
  schemaVersion: z.literal(1),
  playId: entityIdSchema,
  undo: z.array(undoEntrySchema),
  redo: z.array(undoEntrySchema),
  encodedByteLength: z.number().check(z.int(), z.nonnegative()),
  updatedAtMs: z.number().check(z.int(), z.nonnegative()),
});

export type UndoEntry = z.infer<typeof undoEntrySchema>;
export type UndoHistory = z.infer<typeof undoHistorySchema>;

const encoder = new TextEncoder();

export function encodedUndoEntryBytes(entry: UndoEntry): number {
  return encoder.encode(canonicalStringify(entry)).byteLength;
}

/** Encoded size is the sum of canonical entry sizes, so trimming is monotone. */
export function encodedUndoHistoryBytes(entries: readonly UndoEntry[]): number {
  return entries.reduce(
    (total, entry) => total + encodedUndoEntryBytes(entry),
    0,
  );
}

export function createUndoHistory(
  playId: string,
  updatedAtMs: number,
): UndoHistory {
  return {
    schemaVersion: 1,
    playId,
    undo: [],
    redo: [],
    encodedByteLength: 0,
    updatedAtMs,
  };
}

/**
 * Trims to the retention limits without breaking a stack's hash chain: the
 * undo stack loses its oldest entries, and the redo stack loses its furthest
 * future entries. An expired redo stack is dropped whole, because everything
 * still on it is reachable only through the expired entry.
 */
export function boundUndoHistory(
  history: UndoHistory,
  nowMs: number,
): UndoHistory {
  const oldestAllowedMs = nowMs - UNDO_HISTORY_LIMITS.maxAgeMs;
  const undo = [...history.undo];
  let redo = [...history.redo];

  while (undo.length > 0 && (undo[0]?.createdAtMs ?? nowMs) < oldestAllowedMs) {
    undo.shift();
  }
  if ((redo.at(-1)?.createdAtMs ?? nowMs) < oldestAllowedMs) redo = [];

  const sizes = new Map<string, number>();
  const sizeOf = (entry: UndoEntry): number => {
    const known = sizes.get(entry.id);
    if (known !== undefined) return known;
    const size = encodedUndoEntryBytes(entry);
    sizes.set(entry.id, size);
    return size;
  };
  let bytes = [...undo, ...redo].reduce(
    (total, entry) => total + sizeOf(entry),
    0,
  );

  const dropOldest = (): void => {
    const dropped = undo.length > 0 ? undo.shift() : redo.shift();
    if (dropped) bytes -= sizeOf(dropped);
  };
  while (
    undo.length + redo.length > UNDO_HISTORY_LIMITS.maxEntries ||
    (bytes > UNDO_HISTORY_LIMITS.maxEncodedBytes &&
      undo.length + redo.length > 0)
  ) {
    dropOldest();
  }

  return {
    ...history,
    undo,
    redo,
    encodedByteLength: bytes,
    updatedAtMs: nowMs,
  };
}
