import {
  hashPlayDocument,
  stickThunderPlay,
  type PlayDocument,
} from "@chalk/domain";
import {
  createEditorStore,
  localSaveMessage,
  type EditorPersistence,
  type EditorPersistenceCommit,
  type EditorPersistenceReceipt,
  type EditorStore,
} from "@chalk/editor";

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("EditorStore local persistence", () => {
  it("keeps title typing transient until the field edit is committed", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const commits: EditorPersistenceCommit[] = [];
    const persistence: EditorPersistence = {
      async commitPlay(input) {
        commits.push(input);
        return {
          playId: input.play.id,
          documentHash: await hashPlayDocument(input.play),
          committedAtMs: 100,
          mutationId: input.mutation.id,
        };
      },
    };
    const store = createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: initialHash,
      persistence,
      createMutationId: () => "mutation_title",
      monotonicNow: () => 0,
    });

    store.setPlayNameDraft("Mesh — Alert");

    expect(store.getSnapshot().document.name).toBe("Stick — Thunder");
    expect(store.getSnapshot().draftPlayName).toBe("Mesh — Alert");
    expect(commits).toEqual([]);

    await expect(store.commitPlayName()).resolves.toEqual(
      expect.objectContaining({ ok: true, withinBudget: true }),
    );
    expect(commits).toHaveLength(1);
    expect(commits[0]?.expectedDocumentHash).toBe(initialHash);
    expect(commits[0]?.play.name).toBe("Mesh — Alert");
    expect(commits[0]?.mutation).toEqual({ id: "mutation_title" });
    expect(store.getSnapshot().document.name).toBe("Mesh — Alert");
    expect(localSaveMessage(store.getSnapshot().localSave)).toBe(
      "Saved on this device",
    );
  });

  it("serializes rapid commits and advances each optimistic hash guard", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const first = deferred<EditorPersistenceReceipt>();
    const calls: EditorPersistenceCommit[] = [];
    const persistence: EditorPersistence = {
      commitPlay(input) {
        calls.push(input);
        if (calls.length === 1) return first.promise;
        return Promise.resolve({
          playId: input.play.id,
          documentHash: "hash_second",
          committedAtMs: 200,
          mutationId: input.mutation.id,
        });
      },
    };
    let mutation = 0;
    const store = createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: initialHash,
      persistence,
      createMutationId: () => `mutation_${++mutation}`,
      monotonicNow: () => 0,
    });

    store.setPlayNameDraft("First name");
    const firstCommit = store.commitPlayName();
    store.setPlayNameDraft("Second name");
    const secondCommit = store.commitPlayName();

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.expectedDocumentHash).toBe(initialHash);
    expect(store.getSnapshot().localSave.phase).toBe("saving");

    first.resolve({
      playId: stickThunderPlay.id,
      documentHash: "hash_first",
      committedAtMs: 100,
      mutationId: "mutation_1",
    });
    await firstCommit;
    await secondCommit;

    expect(calls).toHaveLength(2);
    expect(calls[1]?.expectedDocumentHash).toBe("hash_first");
    expect(calls[1]?.play.name).toBe("Second name");
    expect(store.getSnapshot().localSave).toEqual(
      expect.objectContaining({
        phase: "saved",
        documentHash: "hash_second",
      }),
    );
  });

  it("retains the current document after failure and retries from the last durable hash", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const calls: EditorPersistenceCommit[] = [];
    let shouldFail = true;
    const persistence: EditorPersistence = {
      commitPlay(input) {
        calls.push(input);
        if (shouldFail) {
          return Promise.reject(new Error("IndexedDB unavailable"));
        }
        return Promise.resolve({
          playId: input.play.id,
          documentHash: "hash_retried",
          committedAtMs: 200,
          mutationId: input.mutation.id,
        });
      },
    };
    const store = createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: initialHash,
      persistence,
      createMutationId: () => `mutation_${calls.length + 1}`,
      monotonicNow: () => 0,
    });
    store.setPlayNameDraft("Kept locally in memory");

    await expect(store.commitPlayName()).resolves.toEqual({
      ok: false,
      durationMs: 0,
    });
    expect(store.getSnapshot().document.name).toBe("Kept locally in memory");
    expect(store.getSnapshot().localSave.phase).toBe("error");

    shouldFail = false;
    await expect(store.retryLocalSave()).resolves.toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(calls[1]?.expectedDocumentHash).toBe(initialHash);
    expect(calls[1]?.play.name).toBe("Kept locally in memory");
    expect(store.getSnapshot().localSave.phase).toBe("saved");
  });

  it("records whether the local acknowledgement met the strict 50 ms budget", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const times = [10, 59];
    const store = createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: initialHash,
      persistence: {
        commitPlay: (input) =>
          Promise.resolve({
            playId: input.play.id,
            documentHash: "hash_budget",
            committedAtMs: 100,
            mutationId: input.mutation.id,
          }),
      },
      createMutationId: () => "mutation_budget",
      monotonicNow: () => times.shift()!,
    });

    store.setPlayNameDraft("Budget test");
    await expect(store.commitPlayName()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        durationMs: 49,
        withinBudget: true,
      }),
    );
    expect(store.getSnapshot().localSave).toEqual(
      expect.objectContaining({ durationMs: 49, withinBudget: true }),
    );
  });
});

describe("EditorStore undo and redo", () => {
  interface Harness {
    readonly store: EditorStore;
    readonly commits: EditorPersistenceCommit[];
    readonly initialHash: string;
  }

  async function harness(): Promise<Harness> {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const commits: EditorPersistenceCommit[] = [];
    let mutation = 0;
    let entry = 0;
    const store = createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: initialHash,
      persistence: {
        async commitPlay(input) {
          commits.push(input);
          return {
            playId: input.play.id,
            documentHash: await hashPlayDocument(input.play),
            committedAtMs: 100,
            mutationId: input.mutation.id,
          };
        },
      },
      createMutationId: () => `mutation_${++mutation}`,
      createUndoEntryId: () => `undo_${++entry}`,
      monotonicNow: () => 0,
      wallClockNow: () => 1_786_000_000_000,
    });
    return { store, commits, initialHash };
  }

  it("undoes and redoes a committed edit and reports each step to the Coach", async () => {
    const { store, commits } = await harness();

    store.setPlayNameDraft("Mesh — Alert");
    await store.commitPlayName();

    expect(store.getSnapshot().undo).toEqual(
      expect.objectContaining({
        canUndo: true,
        canRedo: false,
        undoLabel: "Rename Play",
        undoDepth: 1,
      }),
    );
    expect(commits[0]?.undoHistory?.undo).toHaveLength(1);
    expect(commits[0]?.undoHistory?.undo[0]?.forward).toEqual({
      kind: "set-play-name",
      name: "Mesh — Alert",
    });

    await expect(store.undo()).resolves.toEqual(
      expect.objectContaining({ status: "applied" }),
    );
    expect(store.getSnapshot().document.name).toBe("Stick — Thunder");
    expect(store.getSnapshot().draftPlayName).toBe("Stick — Thunder");
    expect(store.getSnapshot().undo).toEqual(
      expect.objectContaining({
        canUndo: false,
        canRedo: true,
        redoLabel: "Rename Play",
      }),
    );
    expect(commits[1]?.play.name).toBe("Stick — Thunder");
    expect(commits[1]?.undoHistory?.undo).toEqual([]);
    expect(commits[1]?.undoHistory?.redo).toHaveLength(1);

    await expect(store.redo()).resolves.toEqual(
      expect.objectContaining({ status: "applied" }),
    );
    expect(store.getSnapshot().document.name).toBe("Mesh — Alert");
    expect(store.getSnapshot().undo.canUndo).toBe(true);
    expect(store.getSnapshot().localSave.phase).toBe("saved");
  });

  it("undoes a whole gesture, not each Player it moved", async () => {
    const { store } = await harness();
    const moved = stickThunderPlay.players.slice(0, 3);

    await store.applyCommand({
      kind: "move-players",
      moves: moved.map((player, index) => ({
        playerId: player.id,
        position: { lateralYards: index, depthYards: 8 },
      })),
    });

    expect(store.getSnapshot().undo.undoLabel).toBe("Move Players");
    expect(store.getSnapshot().undo.undoDepth).toBe(1);
    await store.undo();
    expect(
      store
        .getSnapshot()
        .document.players.slice(0, 3)
        .map((p) => p.position),
    ).toEqual(moved.map((player) => player.position));
  });

  it("reports an empty history instead of offering a step", async () => {
    const { store } = await harness();

    await expect(store.undo()).resolves.toEqual({ status: "empty" });
    await expect(store.redo()).resolves.toEqual({ status: "empty" });
    expect(store.getSnapshot().undo.canUndo).toBe(false);
  });

  it("quarantines history when the Play is replaced outside it", async () => {
    const { store } = await harness();

    store.setPlayNameDraft("Mesh — Alert");
    await store.commitPlayName();

    const restored: PlayDocument = {
      ...structuredClone(stickThunderPlay),
      notes: "Restored from a named version.",
    };
    await store.commitDocument(restored);

    expect(store.getSnapshot().undo.canUndo).toBe(false);
    const outcome = await store.undo();
    expect(outcome.status).toBe("quarantined");
    expect(store.getSnapshot().undo.quarantineReason).toMatch(
      /changed outside its history/,
    );
    expect(store.getSnapshot().document.notes).toBe(
      "Restored from a named version.",
    );
  });

  it("restores a persisted history so undo survives reopening the Play", async () => {
    const first = await harness();
    first.store.setPlayNameDraft("Mesh — Alert");
    await first.store.commitPlayName();
    const stored = first.commits.at(-1)?.undoHistory;
    const reopened = first.store.getSnapshot().document;

    const commits: EditorPersistenceCommit[] = [];
    const store = createEditorStore({
      initialDocument: reopened,
      initialDocumentHash: await hashPlayDocument(reopened),
      initialUndoHistory: stored,
      persistence: {
        async commitPlay(input) {
          commits.push(input);
          return {
            playId: input.play.id,
            documentHash: await hashPlayDocument(input.play),
            committedAtMs: 100,
          };
        },
      },
      monotonicNow: () => 0,
    });

    expect(store.getSnapshot().undo.canUndo).toBe(true);
    await expect(store.undo()).resolves.toEqual(
      expect.objectContaining({ status: "applied" }),
    );
    expect(store.getSnapshot().document.name).toBe("Stick — Thunder");
  });

  it("keeps the failed edit undoable once the retry succeeds", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const commits: EditorPersistenceCommit[] = [];
    let shouldFail = true;
    const store = createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: initialHash,
      persistence: {
        async commitPlay(input) {
          commits.push(input);
          if (shouldFail) throw new Error("IndexedDB unavailable");
          return {
            playId: input.play.id,
            documentHash: await hashPlayDocument(input.play),
            committedAtMs: 100,
          };
        },
      },
      monotonicNow: () => 0,
    });

    store.setPlayNameDraft("Mesh — Alert");
    await store.commitPlayName();
    expect(store.getSnapshot().localSave.phase).toBe("error");
    expect(store.getSnapshot().undo.canUndo).toBe(true);

    shouldFail = false;
    await store.retryLocalSave();
    expect(commits.at(-1)?.undoHistory?.undo).toHaveLength(1);
    await expect(store.undo()).resolves.toEqual(
      expect.objectContaining({ status: "applied" }),
    );
    expect(store.getSnapshot().document.name).toBe("Stick — Thunder");
  });
});
