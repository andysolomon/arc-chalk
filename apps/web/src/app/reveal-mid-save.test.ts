import {
  canonicalSha256,
  starterPlaybookEnvelope,
  stickThunderPlay,
  type PlayDocument,
} from "@chalk/domain";
import { createEditorStore, type EditorStore } from "@chalk/editor";
import {
  createDexieLocalRepository,
  type ChalkLocalRepository,
} from "@chalk/local-db";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { repositoryPersistence } from "./editor-runtime";

const pathId = stickThunderPlay.paths[0]!.id;

/**
 * Holds the next SHA-256 the page asks for until the test lets it go, so a
 * turn can be caught waiting on its hash. `reached` settles once it asks.
 */
function holdNextHash(): {
  readonly reached: Promise<void>;
  readonly release: () => void;
} {
  const subtle = globalThis.crypto.subtle;
  const digest = subtle.digest.bind(subtle);
  let reach = () => {};
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(subtle, "digest").mockImplementationOnce(async (...args) => {
    reach();
    await held;
    return digest(...args);
  });
  return { reached, release };
}

describe("showing the other device's Play while a save waits on its hash", () => {
  let repository: ChalkLocalRepository;
  let store: EditorStore;
  let theirs: PlayDocument;

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    repository = createDexieLocalRepository({
      databaseName: `chalk-reveal-mid-save-${crypto.randomUUID()}`,
      indexedDB,
      IDBKeyRange,
    });
    await repository.open();
    await repository.savePlaybook(starterPlaybookEnvelope());
    const stored = await repository.getPlay(stickThunderPlay.id);
    if (!stored) throw new Error("The starter Play was not stored.");
    store = createEditorStore({
      initialDocument: stored.document,
      initialDocumentHash: stored.documentHash,
      persistence: repositoryPersistence(repository),
    });
    theirs = { ...stored.document, name: "Theirs" };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await repository.destroy();
  });

  const rename = (name: string) =>
    store.applyCommand({ kind: "set-play-name", name });
  const writeNote = (coachingNote: string) =>
    store.applyEdit((document) => ({
      kind: "update-path",
      path: {
        ...document.paths.find(({ id }) => id === pathId)!,
        coachingNote,
      },
    }));
  const stored = async () =>
    (await repository.getPlay(stickThunderPlay.id))?.document;

  /**
   * The Coach types. While his turn waits on its hash, sync takes the other
   * device's branch, as resolveConflict(..., "remote") does, and
   * onOpenPlayChanged shows it.
   */
  async function revealUnderTheTurn({
    before,
    after,
  }: {
    readonly before?: () => Promise<unknown>;
    readonly after?: () => Promise<unknown>;
  } = {}): Promise<void> {
    const hash = holdNextHash();
    const typed = rename("Mine");
    await hash.reached;
    await repository.applyRemotePlay({
      play: theirs,
      cloudRevisionId: "cloud_revision_theirs",
    });
    const theirHash = await canonicalSha256(theirs);
    const earlier = before?.();
    const revealed = store.revealPersistedPlay(theirs, theirHash);
    const later = after?.();
    hash.release();
    await Promise.all([typed, earlier, revealed, later]);
  }

  it("does not write the Coach's old branch over the other device's Play (FindingRevealMidSave)", async () => {
    await revealUnderTheTurn();

    expect(store.getSnapshot().document.name).toBe("Theirs");
    expect((await stored())?.name).toBe("Theirs");
  });

  it("says saved once it shows the other device's Play, though his old branch was refused", async () => {
    await revealUnderTheTurn();

    expect(store.getSnapshot().localSave.phase).toBe("saved");
    expect((await repository.getPlay(stickThunderPlay.id))?.documentHash).toBe(
      await canonicalSha256(store.getSnapshot().document),
    );
  });

  it("puts an edit asked for after the reveal on the other device's Play, and stores it", async () => {
    await revealUnderTheTurn({ after: () => writeNote("eyes up") });

    const onScreen = store.getSnapshot().document;
    expect(onScreen.name).toBe("Theirs");
    expect(onScreen.paths.find(({ id }) => id === pathId)?.coachingNote).toBe(
      "eyes up",
    );
    expect(await stored()).toEqual(onScreen);
    expect(store.getSnapshot().localSave.phase).toBe("saved");
  });

  it("leaves the Coach on the Play he opened before sync got to show the other device's", async () => {
    const other = await repository.getPlay("play_four_verticals");
    if (!other) throw new Error("The starter Play was not stored.");
    await revealUnderTheTurn({
      before: () =>
        store.openStoredPlay({
          document: other.document,
          documentHash: other.documentHash,
        }),
    });

    expect(store.getSnapshot().document).toEqual(other.document);
    expect(store.getSnapshot().localSave.phase).not.toBe("saving");
    expect((await stored())?.name).toBe("Theirs");
  });
});
