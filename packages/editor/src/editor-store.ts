import {
  applyPlayCommandWithInverse,
  canonicalSha256,
  createStableId,
  describePlayCommand,
  playCommandCoalesceKey,
  playDocumentSchema,
  type PlayCommand,
  type PlayDocument,
  type UndoEntry,
  type UndoHistory,
} from "@chalk/domain";
import { createStore } from "zustand/vanilla";

import {
  recordUndoEntry,
  redoStep,
  restoreUndoHistory,
  sealUndoCoalescing,
  undoAvailability,
  undoStep,
  type UndoAvailability,
} from "./undo-history";

export const LOCAL_SAVE_BUDGET_MS = 50;

export interface EditorPersistenceCommit {
  readonly play: PlayDocument;
  readonly expectedDocumentHash: string;
  readonly mutation: { readonly id: string };
  readonly undoHistory?: UndoHistory;
}

export interface EditorPersistenceReceipt {
  readonly playId: string;
  readonly documentHash: string;
  readonly committedAtMs: number;
  readonly mutationId?: string;
}

export interface EditorPersistence {
  commitPlay(input: EditorPersistenceCommit): Promise<EditorPersistenceReceipt>;
}

export type LocalSaveState =
  | {
      readonly phase: "saving";
      readonly documentHash: string;
      readonly budgetMs: number;
    }
  | {
      readonly phase: "saved";
      readonly documentHash: string;
      readonly budgetMs: number;
      readonly savedAtMs?: number;
      readonly durationMs?: number;
      readonly withinBudget?: boolean;
    }
  | {
      readonly phase: "error";
      readonly documentHash: string;
      readonly budgetMs: number;
      readonly durationMs: number;
    };

export interface EditorUndoState extends UndoAvailability {
  readonly quarantineReason?: string;
}

export interface EditorSnapshot {
  readonly document: PlayDocument;
  readonly draftPlayName: string;
  readonly localSave: LocalSaveState;
  readonly undo: EditorUndoState;
}

export type EditorCommitOutcome =
  | {
      readonly ok: true;
      readonly documentHash: string;
      readonly committedAtMs: number;
      readonly durationMs: number;
      readonly withinBudget: boolean;
    }
  | {
      readonly ok: false;
      readonly durationMs: number;
    };

export type EditorUndoOutcome =
  | {
      readonly status: "applied";
      readonly entry: UndoEntry;
      readonly commit: EditorCommitOutcome;
    }
  | { readonly status: "empty" }
  | { readonly status: "quarantined"; readonly reason: string };

export interface ApplyCommandOptions {
  /** Merge into the entry on top when the Coach is still in the same field. */
  readonly coalesce?: boolean;
  readonly label?: string;
}

export interface EditorStore {
  getSnapshot(this: void): EditorSnapshot;
  subscribe(this: void, listener: () => void): () => void;
  setPlayNameDraft(this: void, name: string): void;
  resetPlayNameDraft(this: void): void;
  commitPlayName(this: void): Promise<EditorCommitOutcome | undefined>;
  applyCommand(
    this: void,
    command: PlayCommand,
    options?: ApplyCommandOptions,
  ): Promise<EditorCommitOutcome>;
  commitDocument(
    this: void,
    document: PlayDocument,
  ): Promise<EditorCommitOutcome>;
  retryLocalSave(this: void): Promise<EditorCommitOutcome | undefined>;
  undo(this: void): Promise<EditorUndoOutcome>;
  redo(this: void): Promise<EditorUndoOutcome>;
  endCoalescing(this: void): void;
  getUndoHistory(this: void): UndoHistory;
}

export interface CreateEditorStoreOptions {
  readonly initialDocument: PlayDocument;
  readonly initialDocumentHash: string;
  readonly persistence: EditorPersistence;
  /** A stored history that no longer parses is replaced with an empty one. */
  readonly initialUndoHistory?: unknown;
  readonly createMutationId?: () => string;
  readonly createUndoEntryId?: () => string;
  readonly monotonicNow?: () => number;
  readonly wallClockNow?: () => number;
  readonly saveBudgetMs?: number;
  readonly coalesceWindowMs?: number;
}

function defaultMutationId(): string {
  return `mutation_${globalThis.crypto.randomUUID()}`;
}

export function localSaveMessage(localSave: LocalSaveState): string {
  switch (localSave.phase) {
    case "saving":
      return "Saving on this device…";
    case "saved":
      return "Saved on this device";
    case "error":
      return "Local save failed — retry";
  }
}

export function createEditorStore({
  initialDocument,
  initialDocumentHash,
  persistence,
  initialUndoHistory,
  createMutationId = defaultMutationId,
  createUndoEntryId = () => createStableId("undo"),
  monotonicNow = performance.now.bind(performance),
  wallClockNow = Date.now,
  saveBudgetMs = LOCAL_SAVE_BUDGET_MS,
  coalesceWindowMs,
}: CreateEditorStoreOptions): EditorStore {
  const document = playDocumentSchema.parse(initialDocument);
  if (!Number.isFinite(saveBudgetMs) || saveBudgetMs <= 0) {
    throw new RangeError("The local-save budget must be a positive number.");
  }

  /** The hash of the document the Coach is looking at, and the history head. */
  let documentHash = initialDocumentHash;
  let history = restoreUndoHistory(
    document.id,
    initialUndoHistory,
    wallClockNow(),
  );
  let persistedDocumentHash = initialDocumentHash;
  let latestSequence = 0;
  let saveTail: Promise<void> = Promise.resolve();

  const state = createStore<EditorSnapshot>(() => ({
    document,
    draftPlayName: document.name,
    localSave: {
      phase: "saved",
      documentHash: initialDocumentHash,
      budgetMs: saveBudgetMs,
    },
    undo: undoAvailability(history, initialDocumentHash),
  }));

  const publishUndo = (quarantineReason?: string): void => {
    state.setState((current) => ({
      ...current,
      undo: {
        ...undoAvailability(history, documentHash),
        ...(quarantineReason === undefined ? {} : { quarantineReason }),
      },
    }));
  };

  const startSaving = (
    requestedAtMs = monotonicNow(),
  ): { sequence: number; requestedAtMs: number } => {
    const sequence = ++latestSequence;
    state.setState((current) => ({
      ...current,
      localSave: {
        phase: "saving",
        documentHash: current.localSave.documentHash,
        budgetMs: saveBudgetMs,
      },
    }));
    return { sequence, requestedAtMs };
  };

  const persist = async (
    committedDocument: PlayDocument,
    sequence: number,
    requestedAtMs: number,
    committedHistory: UndoHistory | undefined,
  ): Promise<EditorCommitOutcome> => {
    try {
      const receipt = await persistence.commitPlay({
        play: committedDocument,
        expectedDocumentHash: persistedDocumentHash,
        mutation: { id: createMutationId() },
        ...(committedHistory === undefined
          ? {}
          : { undoHistory: committedHistory }),
      });
      const durationMs = Math.max(0, monotonicNow() - requestedAtMs);
      const withinBudget = durationMs < saveBudgetMs;
      persistedDocumentHash = receipt.documentHash;
      if (sequence === latestSequence) {
        state.setState((current) => ({
          ...current,
          localSave: {
            phase: "saved",
            documentHash: receipt.documentHash,
            budgetMs: saveBudgetMs,
            savedAtMs: receipt.committedAtMs,
            durationMs,
            withinBudget,
          },
        }));
      }
      return {
        ok: true,
        documentHash: receipt.documentHash,
        committedAtMs: receipt.committedAtMs,
        durationMs,
        withinBudget,
      };
    } catch {
      const durationMs = Math.max(0, monotonicNow() - requestedAtMs);
      if (sequence === latestSequence) {
        state.setState((current) => ({
          ...current,
          localSave: {
            phase: "error",
            documentHash: persistedDocumentHash,
            budgetMs: saveBudgetMs,
            durationMs,
          },
        }));
      }
      return { ok: false, durationMs };
    }
  };

  /**
   * Every document change runs through one queue, so undo entries chain from
   * the hash of the document the previous entry produced.
   */
  const enqueue = <Result>(task: () => Promise<Result>): Promise<Result> => {
    const outcome = saveTail.then(task);
    saveTail = outcome.then(
      () => undefined,
      () => undefined,
    );
    return outcome;
  };

  const showDocument = (next: PlayDocument): void => {
    state.setState((current) => ({
      ...current,
      document: next,
      draftPlayName: next.name,
    }));
  };

  const applyCommand = (
    command: PlayCommand,
    options: ApplyCommandOptions = {},
  ): Promise<EditorCommitOutcome> => {
    const { sequence, requestedAtMs } = startSaving();
    return enqueue(async () => {
      const before = state.getState().document;
      const { document: next, inverse } = applyPlayCommandWithInverse(
        before,
        command,
      );
      const beforeHash = documentHash;
      const afterHash = await canonicalSha256(next);
      const coalesceKey = options.coalesce
        ? playCommandCoalesceKey(command)
        : undefined;

      history = recordUndoEntry(
        history,
        {
          id: createUndoEntryId(),
          createdAtMs: wallClockNow(),
          beforeHash,
          afterHash,
          forward: command,
          inverse,
          label: options.label ?? describePlayCommand(command),
          ...(coalesceKey === undefined ? {} : { coalesceKey }),
        },
        coalesceWindowMs === undefined ? {} : { coalesceWindowMs },
      );
      documentHash = afterHash;
      showDocument(next);
      publishUndo();
      return persist(next, sequence, requestedAtMs, history);
    });
  };

  const commitDocument = (
    nextDocument: PlayDocument,
  ): Promise<EditorCommitOutcome> => {
    const committedDocument = playDocumentSchema.parse(nextDocument);
    const { sequence, requestedAtMs } = startSaving();
    return enqueue(async () => {
      documentHash = await canonicalSha256(committedDocument);
      showDocument(committedDocument);
      publishUndo();
      return persist(committedDocument, sequence, requestedAtMs, history);
    });
  };

  const stepHistory = (
    direction: "undo" | "redo",
  ): Promise<EditorUndoOutcome> => {
    const requestedAtMs = monotonicNow();
    return enqueue(async () => {
      const current = state.getState().document;
      const nowMs = wallClockNow();
      const step = direction === "undo" ? undoStep : redoStep;
      const result = await step(history, current, documentHash, nowMs);
      if (result.status === "empty") return { status: "empty" };
      if (result.status === "quarantined") {
        history = result.history;
        publishUndo(result.reason);
        return { status: "quarantined", reason: result.reason };
      }

      const { sequence } = startSaving(requestedAtMs);
      history = result.history;
      documentHash =
        direction === "undo" ? result.entry.beforeHash : result.entry.afterHash;
      showDocument(result.document);
      publishUndo();
      const commit = await persist(
        result.document,
        sequence,
        requestedAtMs,
        history,
      );
      return { status: "applied", entry: result.entry, commit };
    });
  };

  return {
    getSnapshot: state.getState,
    subscribe(listener) {
      return state.subscribe(listener);
    },
    setPlayNameDraft(name) {
      state.setState((current) => ({ ...current, draftPlayName: name }));
    },
    resetPlayNameDraft() {
      state.setState((current) => ({
        ...current,
        draftPlayName: current.document.name,
      }));
    },
    async commitPlayName() {
      const current = state.getState();
      if (!current.draftPlayName.trim()) {
        state.setState({
          ...current,
          draftPlayName: current.document.name,
        });
        return undefined;
      }
      if (current.draftPlayName === current.document.name) return undefined;
      return applyCommand({
        kind: "set-play-name",
        name: current.draftPlayName,
      });
    },
    applyCommand,
    commitDocument,
    retryLocalSave() {
      if (state.getState().localSave.phase !== "error") {
        return Promise.resolve(undefined);
      }
      const { sequence, requestedAtMs } = startSaving();
      return enqueue(() =>
        persist(state.getState().document, sequence, requestedAtMs, history),
      );
    },
    undo: () => stepHistory("undo"),
    redo: () => stepHistory("redo"),
    endCoalescing() {
      history = sealUndoCoalescing(history);
    },
    getUndoHistory: () => history,
  };
}
