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

  it("refuses a version the Coach did not name", async () => {
    const initialHash = await hashPlayDocument(stickThunderPlay);
    const { store } = versionHarness(initialHash);

    await expect(store.createVersion("   ")).resolves.toEqual({
      status: "failed",
      reason: "Name this version.",
    });
    expect(store.getSnapshot().versions).toEqual([]);
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
});
