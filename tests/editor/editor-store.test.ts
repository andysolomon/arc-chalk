import {
  hashPlayDocument,
  demoHandoffPlay,
  demoTour,
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
  type EditorVersionSummary,
} from "@chalk/editor";

/**
 * When these Plays were worked on. History is kept for seven days, so a store
 * that stamps its entries at a fixed hour and a store that reads the real
 * clock disagree about them the moment that week is up — a test that passes
 * for a week and then rots. Every store here reads this one.
 */
const WORKED_ON_MS = 1_786_000_000_000;

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

describe("EditorStore edits built against the Play they will land on", () => {
  const settled = (): EditorPersistence => ({
    async commitPlay(input) {
      return {
        playId: input.play.id,
        documentHash: await hashPlayDocument(input.play),
        committedAtMs: 100,
        mutationId: input.mutation.id,
      };
    },
  });

  it("does not let a second edit put back what the first had just changed", async () => {
    const store = createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: await hashPlayDocument(stickThunderPlay),
      persistence: settled(),
      createMutationId: () => `mutation_${Math.random()}`,
      monotonicNow: () => 0,
    });
    const pathId = stickThunderPlay.paths[0]!.id;
    const change = (field: "conversion" | "coachingNote", value: string) =>
      store.applyEdit(
        (document) => ({
          kind: "update-path",
          path: {
            ...document.paths.find(({ id }) => id === pathId)!,
            [field]: value,
          },
        }),
        { coalesce: true },
      );

    // Both are asked for before either has landed, which is what typing
    // quickly into two fields of the same line does. A command carries the
    // whole line, so the second must be built on the first rather than on the
    // Play as it was when the Coach's keystroke was handled.
    const both = Promise.all([
      change("conversion", "vs man: fade"),
      change("coachingNote", "eyes to the safety"),
    ]);
    await both;

    const path = store
      .getSnapshot()
      .document.paths.find(({ id }) => id === pathId)!;
    expect(path.conversion).toBe("vs man: fade");
    expect(path.coachingNote).toBe("eyes to the safety");
  });

  it("says nothing happened when the edit turns out to be no change at all", async () => {
    const store = createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: await hashPlayDocument(stickThunderPlay),
      persistence: settled(),
      createMutationId: () => "mutation_none",
      monotonicNow: () => 0,
    });
    await expect(store.applyEdit(() => undefined)).resolves.toBeUndefined();
    expect(store.getSnapshot().undo.canUndo).toBe(false);
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
      wallClockNow: () => WORKED_ON_MS,
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
      wallClockNow: () => WORKED_ON_MS,
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

describe("EditorStore named versions", () => {
  interface VersionHarness {
    readonly store: EditorStore;
    readonly commits: EditorPersistenceCommit[];
    readonly versions: Map<string, PlayDocument>;
  }

  function versionHarness(initialHash: string): VersionHarness {
    const versions = new Map<string, PlayDocument>();
    const summaries: EditorVersionSummary[] = [];
    const commits: EditorPersistenceCommit[] = [];
    let current: PlayDocument = stickThunderPlay;
    let clock = WORKED_ON_MS;

    const store = createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: initialHash,
      persistence: {
        async commitPlay(input) {
          commits.push(input);
          current = input.play;
          return {
            playId: input.play.id,
            documentHash: await hashPlayDocument(input.play),
            committedAtMs: 100,
          };
        },
        async createNamedVersion({ revisionId, label }) {
          versions.set(revisionId, current);
          const summary = {
            id: revisionId,
            label,
            createdAtMs: (clock += 1_000),
            documentHash: await hashPlayDocument(current),
          };
          summaries.unshift(summary);
          return summary;
        },
        listPlayVersions: () => Promise.resolve([...summaries]),
        loadVersionDocument: (revisionId) =>
          Promise.resolve(versions.get(revisionId)),
      },
      createVersionId: () => `revision_${versions.size + 1}`,
      monotonicNow: () => 0,
    });
    return { store, commits, versions };
  }

  it("marks the Play the Coach sees, after every pending save", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const { store, versions } = versionHarness(initialHash);

    store.setPlayNameDraft("Install week copy");
    const pending = store.commitPlayName();
    const created = await store.createVersion("Install week");
    await pending;

    expect(created.status).toBe("created");
    if (created.status !== "created") return;
    expect(created.version.label).toBe("Install week");
    expect(versions.get("revision_1")?.name).toBe("Install week copy");
    expect(store.getSnapshot().versions).toEqual([
      expect.objectContaining({ label: "Install week" }),
    ]);
  });

  it("refuses a version the Coach did not name", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const { store } = versionHarness(initialHash);

    await expect(store.createVersion("   ")).resolves.toEqual({
      status: "failed",
      reason: "Name this version.",
    });
    expect(store.getSnapshot().versions).toEqual([]);
  });

  it("restores a version as one undoable edit", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const { store, commits } = versionHarness(initialHash);

    await store.createVersion("Install week");
    store.setPlayNameDraft("Thursday rewrite");
    await store.commitPlayName();
    await store.applyCommand({
      kind: "set-notes",
      notes: "Everything changed on Thursday.",
    });
    expect(store.getSnapshot().undo.undoDepth).toBe(2);

    const restored = await store.restoreVersion("revision_1");

    expect(restored).toEqual(expect.objectContaining({ status: "restored" }));
    expect(store.getSnapshot().document.name).toBe("Stick — Thunder");
    expect(store.getSnapshot().document.notes).toBe(stickThunderPlay.notes);
    // The restore is one more entry on the stack, not a rewrite of history.
    expect(store.getSnapshot().undo.undoDepth).toBe(3);
    expect(store.getSnapshot().undo.undoLabel).toBe("Restore version");
    expect(commits.at(-1)?.undoHistory?.undo.at(-1)?.forward.kind).toBe(
      "batch",
    );

    await expect(store.undo()).resolves.toEqual(
      expect.objectContaining({ status: "applied" }),
    );
    expect(store.getSnapshot().document.name).toBe("Thursday rewrite");
    expect(store.getSnapshot().document.notes).toBe(
      "Everything changed on Thursday.",
    );
  });

  it("does nothing when the Coach restores the version they are already on", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const { store, commits } = versionHarness(initialHash);
    await store.createVersion("Install week");
    const before = commits.length;

    await expect(store.restoreVersion("revision_1")).resolves.toEqual({
      status: "unchanged",
    });
    expect(commits).toHaveLength(before);
    expect(store.getSnapshot().undo.undoDepth).toBe(0);
  });

  it("reports a version it cannot read instead of guessing", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const { store } = versionHarness(initialHash);

    await expect(store.restoreVersion("revision_missing")).resolves.toEqual({
      status: "failed",
      reason: "Chalk could not read that version on this device.",
    });
  });

  it("reports versions as unavailable when the device cannot store them", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const store = createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: initialHash,
      persistence: {
        commitPlay: async (input) => ({
          playId: input.play.id,
          documentHash: await hashPlayDocument(input.play),
          committedAtMs: 100,
        }),
      },
      monotonicNow: () => 0,
    });

    await expect(store.createVersion("Install week")).resolves.toEqual({
      status: "unavailable",
    });
    await expect(store.restoreVersion("revision_1")).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("adopts a demo as a new Play and leaves the previous record untouched", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const records = new Map<string, PlayDocument>([
      [stickThunderPlay.id, stickThunderPlay],
    ]);
    const commits: EditorPersistenceCommit[] = [];
    const store = createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: initialHash,
      persistence: {
        async commitPlay(input) {
          commits.push(input);
          records.set(input.play.id, input.play);
          return {
            playId: input.play.id,
            documentHash: await hashPlayDocument(input.play),
            committedAtMs: 100,
            mutationId: input.mutation.id,
          };
        },
      },
      createMutationId: () => "mutation_demo",
      monotonicNow: () => 0,
      wallClockNow: () => WORKED_ON_MS,
    });

    const opened = demoHandoffPlay(demoTour("defense"), {
      id: "play_from_demo",
      playbookId: stickThunderPlay.playbookId,
    });
    await expect(store.adoptPlay(opened)).resolves.toEqual(
      expect.objectContaining({ ok: true }),
    );

    expect(store.getSnapshot().document.id).toBe("play_from_demo");
    expect(store.getSnapshot().document.name).toBe("Cover 3 — Fire Zone");
    expect(store.getSnapshot().undo.canUndo).toBe(false);
    expect(commits[0]?.expectedDocumentHash).toBeUndefined();
    expect(commits[0]?.play.id).toBe("play_from_demo");
    expect(records.get(stickThunderPlay.id)).toBe(stickThunderPlay);
    expect(records.get(stickThunderPlay.id)?.name).toBe("Stick — Thunder");
    expect(records.get("play_from_demo")?.name).toBe("Cover 3 — Fire Zone");
  });

  it("opens a stored Play without rewriting the one that was in front", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const other: PlayDocument = {
      ...stickThunderPlay,
      id: "play_other",
      name: "Four Verticals",
    };
    const otherHash = await hashPlayDocument(other);
    const records = new Map<string, PlayDocument>([
      [stickThunderPlay.id, stickThunderPlay],
    ]);
    const store = createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: initialHash,
      persistence: {
        async commitPlay(input) {
          records.set(input.play.id, input.play);
          return {
            playId: input.play.id,
            documentHash: await hashPlayDocument(input.play),
            committedAtMs: 100,
            mutationId: input.mutation.id,
          };
        },
      },
      createMutationId: () => "mutation_open",
      monotonicNow: () => 0,
      wallClockNow: () => WORKED_ON_MS,
    });

    store.setPlayNameDraft("Should not land");
    await store.openStoredPlay({
      document: other,
      documentHash: otherHash,
    });

    expect(store.getSnapshot().document.id).toBe("play_other");
    expect(store.getSnapshot().document.name).toBe("Four Verticals");
    expect(store.getSnapshot().draftPlayName).toBe("Four Verticals");
    expect(records.get(stickThunderPlay.id)).toBe(stickThunderPlay);
    expect(records.get(stickThunderPlay.id)?.name).toBe("Stick — Thunder");
  });

  it("reveals a Play already written by sync without committing again", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const commits: EditorPersistenceCommit[] = [];
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
      monotonicNow: () => 0,
      wallClockNow: () => WORKED_ON_MS,
    });
    const remote = { ...stickThunderPlay, name: "From the other device" };
    const remoteHash = await hashPlayDocument(remote);
    store.revealPersistedPlay(remote, remoteHash);
    expect(store.getSnapshot().document.name).toBe("From the other device");
    expect(store.getSnapshot().localSave).toEqual(
      expect.objectContaining({ phase: "saved", documentHash: remoteHash }),
    );
    expect(commits).toEqual([]);
  });
});
