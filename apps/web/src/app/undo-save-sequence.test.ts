import {
  canonicalSha256,
  starterPlaybookEnvelope,
  stickThunderPlay,
  type PlayCommand,
} from "@chalk/domain";
import {
  createEditorStore,
  type EditorPersistence,
  type EditorStore,
} from "@chalk/editor";
import {
  createDexieLocalRepository,
  type ChalkLocalRepository,
} from "@chalk/local-db";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { repositoryPersistence } from "./editor-runtime";

/**
 * The real repository on a fake IndexedDB, behind the editor store. The
 * writes a test names are refused, as a full disk refuses them.
 */
interface Harness {
  readonly store: EditorStore;
  readonly repository: ChalkLocalRepository;
  /** Refuses the nth commit from now, counting from 1. */
  refuseCommit(nth: number): void;
}

async function openHarness(): Promise<Harness> {
  const repository = createDexieLocalRepository({
    databaseName: `chalk-undo-save-sequence-${crypto.randomUUID()}`,
    indexedDB,
    IDBKeyRange,
  });
  await repository.open();
  await repository.savePlaybook(starterPlaybookEnvelope());
  const stored = await repository.getPlay(stickThunderPlay.id);
  if (!stored) throw new Error("The starter Play was not stored.");

  const real = repositoryPersistence(repository);
  const refused = new Set<number>();
  let commits = 0;
  const persistence: EditorPersistence = {
    ...real,
    commitPlay(input) {
      commits += 1;
      if (refused.has(commits)) {
        return Promise.reject(new Error("QuotaExceededError"));
      }
      return real.commitPlay(input);
    },
  };
  const store = createEditorStore({
    initialDocument: stored.document,
    initialDocumentHash: stored.documentHash,
    persistence,
  });
  return {
    store,
    repository,
    refuseCommit(nth) {
      refused.add(commits + nth);
    },
  };
}

const rename = (name: string): PlayCommand => ({ kind: "set-play-name", name });

async function storedName(harness: Harness): Promise<string | undefined> {
  return (await harness.repository.getPlay(stickThunderPlay.id))?.document.name;
}

describe("the save status after an Undo or Redo the Coach asked for behind a save", () => {
  let harness: Harness;

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    harness = await openHarness();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await harness.repository.destroy();
  });

  it("says the save failed when the edit asked for after an Undo is refused (FindingUndoSequence)", async () => {
    const { store } = harness;
    // The third write is the second edit's: the first edit, the Undo, then it.
    harness.refuseCommit(3);
    await Promise.all([
      store.applyEdit(() => rename("one")),
      store.undo(),
      store.applyEdit(() => rename("two")),
    ]);

    expect(store.getSnapshot().document.name).toBe("two");
    expect(await storedName(harness)).toBe(stickThunderPlay.name);
    expect(store.getSnapshot().localSave.phase).toBe("error");
  });

  it("says the save failed when the edit asked for after a Redo is refused", async () => {
    const { store } = harness;
    await store.applyEdit(() => rename("one"));
    await store.undo();
    // The fourth write is the second edit's: the first edit, the Undo, the
    // Redo, then it.
    harness.refuseCommit(4);
    await Promise.all([
      store.applyEdit(() => rename("three")),
      store.undo(),
      store.redo(),
      store.applyEdit(() => rename("two")),
    ]);

    expect(store.getSnapshot().document.name).toBe("two");
    expect(await storedName(harness)).toBe("three");
    expect(store.getSnapshot().localSave.phase).toBe("error");
  });

  it("does not leave the status saving when the Undo finds nothing to take back", async () => {
    const { store } = harness;
    await Promise.all([
      store.commitDocument({ ...store.getSnapshot().document, name: "one" }),
      store.undo(),
    ]);

    expect(await storedName(harness)).toBe("one");
    expect(store.getSnapshot().localSave.phase).toBe("saved");
  });

  it("still says the save failed when the Undo behind the refused write finds nothing to take back", async () => {
    const { store } = harness;
    harness.refuseCommit(1);
    await Promise.all([
      store.commitDocument({ ...store.getSnapshot().document, name: "one" }),
      store.undo(),
    ]);

    expect(store.getSnapshot().document.name).toBe("one");
    expect(await storedName(harness)).toBe(stickThunderPlay.name);
    expect(store.getSnapshot().localSave.phase).toBe("error");
  });

  it("still says the save failed when the Undo behind the refused write is quarantined", async () => {
    const { store } = harness;
    await store.applyEdit(() => rename("one"));
    harness.refuseCommit(1);
    // A Play shown without an undo entry leaves the top entry starting from
    // a Play no longer on screen, so the Undo is quarantined.
    const outcomes = await Promise.all([
      store.commitDocument({ ...store.getSnapshot().document, name: "two" }),
      store.undo(),
    ]);

    expect(outcomes[1]).toMatchObject({ status: "quarantined" });
    expect(await storedName(harness)).toBe("one");
    expect(store.getSnapshot().localSave.phase).toBe("error");
  });

  it("stores what the screen shows when it says saved, after an Undo and an edit asked for together", async () => {
    const { store } = harness;
    await Promise.all([
      store.applyEdit(() => rename("one")),
      store.undo(),
      store.applyEdit(() => rename("two")),
    ]);

    expect(store.getSnapshot().localSave.phase).toBe("saved");
    expect(await storedName(harness)).toBe(store.getSnapshot().document.name);
    expect(
      (await harness.repository.getPlay(stickThunderPlay.id))?.documentHash,
    ).toBe(await canonicalSha256(store.getSnapshot().document));
  });
});
