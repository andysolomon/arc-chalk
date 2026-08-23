import {
  applyPlayCommandWithInverse,
  canonicalSha256,
  canonicalStringify,
  createStableId,
  createUndoHistory,
  describePlayCommand,
  diffPlayDocuments,
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
  /** Absent on the first write of a Play that has no prior identity. */
  readonly expectedDocumentHash?: string;
  readonly mutation: { readonly id: string };
  readonly undoHistory?: UndoHistory;
}

export interface EditorPersistenceReceipt {
  readonly playId: string;
  readonly documentHash: string;
  readonly committedAtMs: number;
  readonly mutationId?: string;
}

/** Metadata for one point in this Play's history. */
export interface EditorVersionSummary {
  readonly id: string;
  readonly label?: string;
  readonly createdAtMs: number;
  readonly documentHash: string;
}

export interface EditorPersistence {
  commitPlay(input: EditorPersistenceCommit): Promise<EditorPersistenceReceipt>;
  createNamedVersion?(input: {
    readonly playId: string;
    readonly revisionId: string;
    readonly label: string;
  }): Promise<EditorVersionSummary>;
  listPlayVersions?(playId: string): Promise<readonly EditorVersionSummary[]>;
  loadVersionDocument?(revisionId: string): Promise<PlayDocument | undefined>;
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
  readonly versions: readonly EditorVersionSummary[];
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

export type EditorVersionOutcome =
  | { readonly status: "created"; readonly version: EditorVersionSummary }
  | { readonly status: "restored"; readonly commit: EditorCommitOutcome }
  | { readonly status: "unchanged" }
  | { readonly status: "unavailable" }
  | { readonly status: "failed"; readonly reason: string };

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
  /**
   * Applies an edit built against the Play as it will actually be when the
   * edit runs, rather than as it was when the Coach's keystroke was handled.
   * Saves are serialised, so a command built in the shell can be a save or
   * two out of date — and a command carries whole entities, so an out-of-date
   * one silently puts back the field the one before it had just changed.
   * Anything typed quickly has to be built this way; a one-off gesture may
   * use {@link applyCommand}.
   */
  applyEdit(
    this: void,
    build: (document: PlayDocument) => PlayCommand | undefined,
    options?: ApplyCommandOptions,
  ): Promise<EditorCommitOutcome | undefined>;
  commitDocument(
    this: void,
    document: PlayDocument,
  ): Promise<EditorCommitOutcome>;
  /**
   * Replaces the working document with a new identity. The Play that was
   * open is left where it is; the next save writes a new record. Demo
   * handoff uses this so opening a tour cannot rewrite the Coach's work
   * (parity-matrix B1).
   */
  adoptPlay(this: void, document: PlayDocument): Promise<EditorCommitOutcome>;
  /**
   * Switches to a Play already stored on this device. History and versions
   * come with it; the open Play is not rewritten.
   */
  openStoredPlay(
    this: void,
    input: {
      readonly document: PlayDocument;
      readonly documentHash: string;
      readonly undoHistory?: unknown;
      readonly versions?: readonly EditorVersionSummary[];
    },
  ): Promise<void>;
  /**
   * Shows a Play that sync already wrote, without another local mutation.
   * Used when the Coach takes the other device's branch of the open Play.
   */
  revealPersistedPlay(
    this: void,
    document: PlayDocument,
    persistedHash: string,
  ): void;
  retryLocalSave(this: void): Promise<EditorCommitOutcome | undefined>;
  undo(this: void): Promise<EditorUndoOutcome>;
  redo(this: void): Promise<EditorUndoOutcome>;
  createVersion(this: void, label: string): Promise<EditorVersionOutcome>;
  restoreVersion(this: void, revisionId: string): Promise<EditorVersionOutcome>;
  refreshVersions(this: void): Promise<readonly EditorVersionSummary[]>;
  endCoalescing(this: void): void;
  getUndoHistory(this: void): UndoHistory;
}

export interface CreateEditorStoreOptions {
  readonly initialDocument: PlayDocument;
  readonly initialDocumentHash: string;
  readonly persistence: EditorPersistence;
  /** A stored history that no longer parses is replaced with an empty one. */
  readonly initialUndoHistory?: unknown;
  readonly initialVersions?: readonly EditorVersionSummary[];
  readonly createMutationId?: () => string;
  readonly createUndoEntryId?: () => string;
  readonly createVersionId?: () => string;
  readonly monotonicNow?: () => number;
  readonly wallClockNow?: () => number;
  readonly saveBudgetMs?: number;
  readonly coalesceWindowMs?: number;
}

function defaultMutationId(): string {
  return `mutation_${globalThis.crypto.randomUUID()}`;
}

/** The terse form the original shows at the end of its status bar. */
export function localSaveStatus(localSave: LocalSaveState): string {
  switch (localSave.phase) {
    case "saving":
      return "saving";
    case "saved":
      return "saved";
    case "error":
      return "save failed";
  }
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
  initialVersions = [],
  createMutationId = defaultMutationId,
  createUndoEntryId = () => createStableId("undo"),
  createVersionId = () => createStableId("revision"),
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
  let persistedDocumentHash: string | undefined = initialDocumentHash;
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
    versions: [...initialVersions],
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
        ...(persistedDocumentHash === undefined
          ? {}
          : { expectedDocumentHash: persistedDocumentHash }),
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
            documentHash: persistedDocumentHash ?? documentHash,
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

  /**
   * Commands are built from the document as it stands when the queued turn
   * runs, so a restore diffs against the Play the Coach will actually see.
   */
  const runCommand = (
    build: (document: PlayDocument) => PlayCommand,
    options: ApplyCommandOptions = {},
  ): Promise<EditorCommitOutcome> => {
    const { sequence, requestedAtMs } = startSaving();
    return enqueue(async () => {
      const before = state.getState().document;
      const command = build(before);
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

  const applyCommand = (
    command: PlayCommand,
    options: ApplyCommandOptions = {},
  ): Promise<EditorCommitOutcome> => runCommand(() => command, options);

  const applyEdit = (
    build: (document: PlayDocument) => PlayCommand | undefined,
    options: ApplyCommandOptions = {},
  ): Promise<EditorCommitOutcome | undefined> => {
    let asked = false;
    return runCommand((document) => {
      const command = build(document);
      asked = command !== undefined;
      // Nothing to do is expressed as a batch of nothing, which applies
      // cleanly and is thrown away below rather than reaching the history.
      return command ?? { kind: "batch", commands: [] };
    }, options).then((outcome) => (asked ? outcome : undefined));
  };

  const publishVersions = (
    versions: readonly EditorVersionSummary[],
  ): readonly EditorVersionSummary[] => {
    state.setState((current) => ({ ...current, versions }));
    return versions;
  };

  const refreshVersions = async (): Promise<
    readonly EditorVersionSummary[]
  > => {
    if (!persistence.listPlayVersions) return state.getState().versions;
    return publishVersions(
      await persistence.listPlayVersions(state.getState().document.id),
    );
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

  const adoptPlay = (
    nextDocument: PlayDocument,
  ): Promise<EditorCommitOutcome> => {
    const adopted = playDocumentSchema.parse(nextDocument);
    const { sequence, requestedAtMs } = startSaving();
    return enqueue(async () => {
      if (adopted.id !== state.getState().document.id) {
        history = createUndoHistory(adopted.id, wallClockNow());
        persistedDocumentHash = undefined;
      }
      documentHash = await canonicalSha256(adopted);
      showDocument(adopted);
      publishUndo();
      state.setState((current) => ({ ...current, versions: [] }));
      return persist(adopted, sequence, requestedAtMs, history);
    });
  };

  const openStoredPlay = (input: {
    readonly document: PlayDocument;
    readonly documentHash: string;
    readonly undoHistory?: unknown;
    readonly versions?: readonly EditorVersionSummary[];
  }): Promise<void> =>
    enqueue(() => {
      const opened = playDocumentSchema.parse(input.document);
      history = restoreUndoHistory(
        opened.id,
        input.undoHistory,
        wallClockNow(),
      );
      documentHash = input.documentHash;
      persistedDocumentHash = input.documentHash;
      showDocument(opened);
      publishUndo();
      publishVersions(input.versions ?? []);
      return Promise.resolve();
    });
  const revealPersistedPlay = (
    nextDocument: PlayDocument,
    persistedHash: string,
  ): void => {
    const revealed = playDocumentSchema.parse(nextDocument);
    if (revealed.id !== state.getState().document.id) {
      history = createUndoHistory(revealed.id, wallClockNow());
      state.setState((current) => ({ ...current, versions: [] }));
    }
    documentHash = persistedHash;
    persistedDocumentHash = persistedHash;
    showDocument(revealed);
    publishUndo();
    state.setState((current) => ({
      ...current,
      localSave: {
        phase: "saved",
        documentHash: persistedHash,
        budgetMs: saveBudgetMs,
      },
    }));
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
    applyEdit,
    commitDocument,
    adoptPlay,
    openStoredPlay,
    revealPersistedPlay,
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
    async createVersion(label) {
      const named = label.trim();
      if (!named) return { status: "failed", reason: "Name this version." };
      if (!persistence.createNamedVersion) return { status: "unavailable" };
      // Queued so the version marks the Play after every pending save lands.
      return enqueue(async () => {
        try {
          const version = await persistence.createNamedVersion!({
            playId: state.getState().document.id,
            revisionId: createVersionId(),
            label: named,
          });
          publishVersions([version, ...state.getState().versions]);
          return { status: "created", version } as const;
        } catch {
          return {
            status: "failed",
            reason: "Chalk could not create this version on this device.",
          } as const;
        }
      });
    },
    async restoreVersion(revisionId) {
      if (!persistence.loadVersionDocument) return { status: "unavailable" };
      let restored: PlayDocument | undefined;
      try {
        restored = await persistence.loadVersionDocument(revisionId);
      } catch {
        restored = undefined;
      }
      if (!restored) {
        return {
          status: "failed",
          reason: "Chalk could not read that version on this device.",
        };
      }
      const target = restored;
      if (
        canonicalStringify(target) ===
        canonicalStringify(state.getState().document)
      ) {
        return { status: "unchanged" };
      }
      // A restore is an ordinary hash-bound edit, so the Coach can undo it.
      const commit = await runCommand(
        (current) => diffPlayDocuments(current, target, "Restore version"),
        { label: "Restore version" },
      );
      return { status: "restored", commit };
    },
    refreshVersions,
    endCoalescing() {
      history = sealUndoCoalescing(history);
    },
    getUndoHistory: () => history,
  };
}
