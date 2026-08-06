import { Blob as RuntimeBlob } from "node:buffer";

import {
  UNDO_HISTORY_LIMITS,
  hashPlayDocument,
  type PlayDocument,
  type UndoHistory,
} from "@chalk/domain";
import {
  defensivePlaybookGolden,
  offensivePlaybookGolden,
} from "@chalk/test-fixtures";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";

import {
  CorruptLocalDataError,
  createDexieLocalRepository,
  StaleLocalPlayError,
  TRASH_RETENTION_MS,
  type ChalkLocalRepository,
} from "@chalk/local-db";

const FIXED_TIME = 1_786_000_100_000;

function createRepository(
  suffix: string,
  now: () => number = () => FIXED_TIME,
): ChalkLocalRepository {
  return createDexieLocalRepository({
    databaseName: `chalk-local-repository-${suffix}-${crypto.randomUUID()}`,
    indexedDB,
    IDBKeyRange,
    now,
  });
}

function cloneableBlob(contents: string, type: string): Blob {
  return new RuntimeBlob([contents], { type }) as unknown as Blob;
}

describe("ChalkLocalRepository", () => {
  const repositories: ChalkLocalRepository[] = [];

  afterEach(async () => {
    await Promise.all(
      repositories.splice(0).map((repository) => repository.destroy()),
    );
  });

  function track(repository: ChalkLocalRepository): ChalkLocalRepository {
    repositories.push(repository);
    return repository;
  }

  it.each([
    ["offensive", offensivePlaybookGolden],
    ["defensive", defensivePlaybookGolden],
  ])("round-trips the %s Playbook golden", async (_name, golden) => {
    const repository = track(createRepository(`round-trip-${_name}`));
    await repository.open();

    await repository.savePlaybook(golden);

    await expect(repository.loadPlaybook(golden.playbook.id)).resolves.toEqual(
      golden,
    );
    await expect(
      repository.listPlaySummaries(golden.playbook.id),
    ).resolves.toEqual([
      expect.objectContaining({
        playId: golden.plays[0]!.id,
        playbookId: golden.playbook.id,
        name: golden.plays[0]!.name,
        unit: golden.plays[0]!.unit,
      }),
    ]);
    await expect(repository.counts()).resolves.toEqual({
      playbooks: 1,
      concepts: 1,
      formations: 1,
      plays: 1,
      revisions: 0,
      syncMutations: 0,
      conflicts: 0,
      preferences: 0,
      imageBlobs: 0,
      undoHistories: 0,
      searchProjections: 1,
      thumbnails: 0,
    });
  });

  it("atomically commits current state, an immutable revision, a sync mutation, and a search projection", async () => {
    const repository = track(createRepository("commit"));
    await repository.savePlaybook(offensivePlaybookGolden);
    const original = await repository.getPlay(
      offensivePlaybookGolden.plays[0]!.id,
    );
    expect(original).toBeDefined();
    const changedPlay = {
      ...structuredClone(offensivePlaybookGolden.plays[0]!),
      name: "Stick Thunder — Boundary Alert",
      tags: ["third-down", "boundary"],
    };

    const result = await repository.commitPlay({
      play: changedPlay,
      expectedDocumentHash: original!.documentHash,
      revision: { id: "revision_boundary_alert", label: "Boundary alert" },
      mutation: { id: "mutation_boundary_alert" },
    });

    expect(result).toEqual({
      playId: changedPlay.id,
      documentHash: result.documentHash,
      committedAtMs: FIXED_TIME,
      revisionId: "revision_boundary_alert",
      mutationId: "mutation_boundary_alert",
    });
    expect(result.documentHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(repository.getPlay(changedPlay.id)).resolves.toEqual(
      expect.objectContaining({
        document: changedPlay,
        documentHash: result.documentHash,
        currentRevisionId: "revision_boundary_alert",
        updatedAtMs: FIXED_TIME,
      }),
    );
    await expect(
      repository.getRevision("revision_boundary_alert"),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "revision_boundary_alert",
        document: changedPlay,
        documentHash: result.documentHash,
      }),
    );
    await expect(repository.readSyncMutationBatch(10)).resolves.toEqual([
      expect.objectContaining({
        id: "mutation_boundary_alert",
        entityId: changedPlay.id,
        payload: changedPlay,
        payloadHash: result.documentHash,
      }),
    ]);
    await expect(
      repository.listPlaySummaries(changedPlay.playbookId),
    ).resolves.toEqual([
      expect.objectContaining({
        name: changedPlay.name,
        tags: changedPlay.tags,
        documentHash: result.documentHash,
      }),
    ]);
  });

  it("rejects a stale write without changing the stored Play", async () => {
    const repository = track(createRepository("stale"));
    await repository.savePlaybook(offensivePlaybookGolden);
    const original = await repository.getPlay(
      offensivePlaybookGolden.plays[0]!.id,
    );

    await expect(
      repository.commitPlay({
        play: {
          ...structuredClone(offensivePlaybookGolden.plays[0]!),
          name: "Stale name",
        },
        expectedDocumentHash: "0".repeat(64),
        revision: { id: "revision_stale" },
        mutation: { id: "mutation_stale" },
      }),
    ).rejects.toBeInstanceOf(StaleLocalPlayError);

    await expect(repository.getPlay(original!.id)).resolves.toEqual(original);
    await expect(repository.counts()).resolves.toEqual(
      expect.objectContaining({ revisions: 0, syncMutations: 0 }),
    );
  });

  it("rolls back every local write when a later transaction operation fails", async () => {
    const repository = track(createRepository("rollback"));
    await repository.savePlaybook(offensivePlaybookGolden);
    const play = offensivePlaybookGolden.plays[0]!;
    const original = await repository.getPlay(play.id);
    await repository.commitPlay({
      play,
      expectedDocumentHash: original!.documentHash,
      mutation: { id: "mutation_duplicate" },
    });

    await expect(
      repository.commitPlay({
        play: { ...structuredClone(play), name: "Must roll back" },
        expectedDocumentHash: original!.documentHash,
        revision: { id: "revision_must_roll_back" },
        mutation: { id: "mutation_duplicate" },
      }),
    ).rejects.toThrow();

    const stored = await repository.getPlay(play.id);
    expect(stored?.document).toEqual(play);
    expect(stored?.currentRevisionId).toBeUndefined();
    await expect(
      repository.getRevision("revision_must_roll_back"),
    ).resolves.toBeUndefined();
    await expect(repository.counts()).resolves.toEqual(
      expect.objectContaining({ revisions: 0, syncMutations: 1 }),
    );
  });

  it("rejects an invalid aggregate before creating partial records", async () => {
    const repository = track(createRepository("invalid"));
    const invalid = {
      ...structuredClone(offensivePlaybookGolden),
      playbook: {
        ...structuredClone(offensivePlaybookGolden.playbook),
        playTypes: [],
      },
    };

    await expect(repository.savePlaybook(invalid)).rejects.toThrow();
    await expect(repository.counts()).resolves.toEqual({
      playbooks: 0,
      concepts: 0,
      formations: 0,
      plays: 0,
      revisions: 0,
      syncMutations: 0,
      conflicts: 0,
      preferences: 0,
      imageBlobs: 0,
      undoHistories: 0,
      searchProjections: 0,
      thumbnails: 0,
    });
  });

  it("persists recovery, preference, image, undo, conflict, and derivative records", async () => {
    const repository = track(createRepository("auxiliary"));
    await repository.savePlaybook(defensivePlaybookGolden);
    const playId = defensivePlaybookGolden.plays[0]!.id;
    const thumbnailBlob = cloneableBlob("thumbnail", "image/webp");
    const imageBlob = cloneableBlob("image", "image/png");

    await repository.putConflict({
      id: "conflict_1",
      playId,
      localRevisionId: "revision_local",
      remoteRevisionId: "revision_remote",
      status: "unresolved",
      createdAtMs: FIXED_TIME,
    });
    await repository.setPreference({
      key: "editor.snap.enabled",
      value: true,
      updatedAtMs: FIXED_TIME,
    });
    await repository.putImage({
      hash: "image_hash",
      mimeType: "image/png",
      width: 1,
      height: 1,
      byteLength: imageBlob.size,
      blob: imageBlob,
      thumbnail: thumbnailBlob,
      createdAtMs: FIXED_TIME,
    });
    await repository.putUndoHistory({
      playId,
      schemaVersion: 1,
      undo: [],
      redo: [],
      encodedByteLength: 0,
      updatedAtMs: FIXED_TIME,
    });
    await repository.putThumbnail({
      key: `${playId}:revision_hash:1:1:light`,
      playId,
      revisionHash: "revision_hash",
      rendererVersion: 1,
      fieldProfileRevision: 1,
      theme: "light",
      blob: thumbnailBlob,
      createdAtMs: FIXED_TIME,
    });

    await expect(repository.listUnresolvedConflicts()).resolves.toEqual([
      expect.objectContaining({ id: "conflict_1", playId }),
    ]);
    await expect(
      repository.getPreference("editor.snap.enabled"),
    ).resolves.toEqual(expect.objectContaining({ value: true }));
    expect(await (await repository.getImage("image_hash"))!.blob.text()).toBe(
      "image",
    );
    await expect(repository.getUndoHistory(playId)).resolves.toEqual(
      expect.objectContaining({ playId, undo: [], redo: [] }),
    );
    expect(
      await (await repository.getThumbnail(
        `${playId}:revision_hash:1:1:light`,
      ))!.blob.text(),
    ).toBe("thumbnail");

    await repository.clearDerivedData();
    await expect(
      repository.listPlaySummaries(defensivePlaybookGolden.playbook.id),
    ).resolves.toEqual([]);
    await expect(
      repository.getThumbnail(`${playId}:revision_hash:1:1:light`),
    ).resolves.toBeUndefined();
    await expect(repository.getPlay(playId)).resolves.toBeDefined();
  });

  it("reopens the same IndexedDB database without losing authoritative records", async () => {
    const databaseName = `chalk-local-reopen-${crypto.randomUUID()}`;
    const first = track(
      createDexieLocalRepository({ databaseName, indexedDB, IDBKeyRange }),
    );
    await first.savePlaybook(offensivePlaybookGolden);
    first.close();

    const reopened = track(
      createDexieLocalRepository({ databaseName, indexedDB, IDBKeyRange }),
    );
    await reopened.open();

    await expect(
      reopened.loadPlaybook(offensivePlaybookGolden.playbook.id),
    ).resolves.toEqual(offensivePlaybookGolden);
  });

  it("commits per-Play undo history inside the Play transaction", async () => {
    const repository = track(createRepository("undo-commit"));
    await repository.savePlaybook(offensivePlaybookGolden);
    const play = offensivePlaybookGolden.plays[0]!;
    const stored = await repository.getPlay(play.id);
    const renamed = { ...structuredClone(play), name: "Stick — Alert" };
    const history: UndoHistory = {
      schemaVersion: 1,
      playId: play.id,
      undo: [
        {
          id: "undo_1",
          label: "Rename Play",
          createdAtMs: FIXED_TIME,
          beforeHash: stored!.documentHash,
          afterHash: await hashPlayDocument(renamed),
          forward: { kind: "set-play-name", name: "Stick — Alert" },
          inverse: { kind: "set-play-name", name: play.name },
        },
      ],
      redo: [],
      encodedByteLength: 256,
      updatedAtMs: FIXED_TIME,
    };

    await expect(
      repository.commitPlay({
        play: renamed,
        expectedDocumentHash: stored!.documentHash,
        mutation: { id: "mutation_undo" },
        undoHistory: history,
      }),
    ).resolves.toEqual(expect.objectContaining({ undoEntryCount: 1 }));
    await expect(repository.getUndoHistory(play.id)).resolves.toEqual(history);

    await expect(
      repository.commitPlay({
        play: { ...renamed, name: "Never committed" },
        expectedDocumentHash: "a-hash-this-Play-no-longer-has",
        mutation: { id: "mutation_stale" },
        undoHistory: { ...history, undo: [], encodedByteLength: 0 },
      }),
    ).rejects.toThrow(StaleLocalPlayError);
    await expect(repository.getUndoHistory(play.id)).resolves.toEqual(history);
    await expect(
      repository.commitPlay({
        play: renamed,
        mutation: { id: "mutation_mismatched" },
        undoHistory: { ...history, playId: "play_somewhere_else" },
      }),
    ).rejects.toThrow(CorruptLocalDataError);
  });

  it("discards undo history that no longer parses without touching the Play", async () => {
    const databaseName = `chalk-local-undo-${crypto.randomUUID()}`;
    const first = track(
      createDexieLocalRepository({ databaseName, indexedDB, IDBKeyRange }),
    );
    await first.savePlaybook(offensivePlaybookGolden);
    const play = offensivePlaybookGolden.plays[0]!;
    await first.putUndoHistory({
      schemaVersion: 1,
      playId: play.id,
      undo: [],
      redo: [],
      encodedByteLength: 0,
      updatedAtMs: FIXED_TIME,
    });
    first.close();

    const reopened = track(
      createDexieLocalRepository({ databaseName, indexedDB, IDBKeyRange }),
    );
    await expect(reopened.getUndoHistory(play.id)).resolves.toEqual(
      expect.objectContaining({ playId: play.id, undo: [] }),
    );

    await expect(
      reopened.putUndoHistory({
        schemaVersion: 1,
        playId: play.id,
        undo: [
          {
            id: "undo_unreadable",
            label: "Rename Play",
            createdAtMs: FIXED_TIME,
            beforeHash: "before",
            afterHash: "after",
            forward: { kind: "set-play-name" },
            inverse: { kind: "set-play-name", name: play.name },
          },
        ],
        redo: [],
        encodedByteLength: 0,
        updatedAtMs: FIXED_TIME,
      } as unknown as UndoHistory),
    ).rejects.toThrow();
    await expect(reopened.getPlay(play.id)).resolves.toBeDefined();
  });

  it("creates Coach-named versions that nothing can rename or overwrite", async () => {
    let clock = FIXED_TIME;
    const repository = track(
      createRepository("versions", () => (clock += 1_000)),
    );
    await repository.savePlaybook(offensivePlaybookGolden);
    const play = offensivePlaybookGolden.plays[0]!;

    const first = await repository.createNamedVersion({
      playId: play.id,
      revisionId: "revision_install_week",
      label: "Install week",
    });
    expect(first.label).toBe("Install week");
    expect(first.document).toEqual(play);
    expect(first.parentRevisionId).toBeUndefined();

    const stored = await repository.getPlay(play.id);
    expect(stored?.currentRevisionId).toBe("revision_install_week");

    const edited = { ...structuredClone(play), name: "Stick — Alert" };
    await repository.commitPlay({
      play: edited,
      expectedDocumentHash: stored!.documentHash,
      mutation: { id: "mutation_after_version" },
    });
    const second = await repository.createNamedVersion({
      playId: play.id,
      revisionId: "revision_game_plan_final",
      label: "Game Plan Final",
    });
    expect(second.parentRevisionId).toBe("revision_install_week");

    // An automatic process cannot reuse a version ID to rewrite the Coach's
    // labelled point in history.
    await expect(
      repository.createNamedVersion({
        playId: play.id,
        revisionId: "revision_install_week",
        label: "Overwritten by a background job",
      }),
    ).rejects.toThrow();
    await expect(
      repository.getRevision("revision_install_week"),
    ).resolves.toEqual(expect.objectContaining({ label: "Install week" }));

    await expect(repository.listPlayVersions(play.id)).resolves.toEqual([
      expect.objectContaining({ id: "revision_game_plan_final" }),
      expect.objectContaining({ id: "revision_install_week" }),
    ]);
    await expect(
      repository.createNamedVersion({
        playId: play.id,
        revisionId: "revision_unnamed",
        label: "   ",
      }),
    ).rejects.toThrow(RangeError);
  });

  it("keeps a deleted Play recoverable for thirty days", async () => {
    let clock = FIXED_TIME;
    const repository = track(createRepository("trash", () => clock));
    await repository.savePlaybook(offensivePlaybookGolden);
    const play = offensivePlaybookGolden.plays[0]!;
    await repository.putUndoHistory({
      schemaVersion: 1,
      playId: play.id,
      undo: [],
      redo: [],
      encodedByteLength: 0,
      updatedAtMs: FIXED_TIME,
    });
    await repository.createNamedVersion({
      playId: play.id,
      revisionId: "revision_before_delete",
      label: "Before delete",
    });

    await repository.movePlayToTrash(play.id);

    // Gone from the Playbook and its derived data, still stored.
    await expect(
      repository.listPlaySummaries(play.playbookId),
    ).resolves.toEqual([]);
    await expect(repository.loadPlaybook(play.playbookId)).resolves.toEqual(
      expect.objectContaining({ plays: [] }),
    );
    await expect(repository.listTrash()).resolves.toEqual([
      {
        playId: play.id,
        playbookId: play.playbookId,
        name: play.name,
        deletedAtMs: FIXED_TIME,
        purgeAfterMs: FIXED_TIME + TRASH_RETENTION_MS,
      },
    ]);
    await expect(
      repository.getRevision("revision_before_delete"),
    ).resolves.toBeDefined();

    // A Play in the Trash cannot be edited back into the Playbook.
    const trashed = await repository.getPlay(play.id);
    await expect(
      repository.commitPlay({
        play: { ...structuredClone(play), name: "Edited while deleted" },
        expectedDocumentHash: trashed!.documentHash,
        mutation: { id: "mutation_while_deleted" },
      }),
    ).rejects.toThrow(CorruptLocalDataError);

    // One day short of the window purges nothing.
    clock = FIXED_TIME + TRASH_RETENTION_MS - 1;
    await expect(repository.purgeExpiredTrash()).resolves.toEqual([]);

    const restored = await repository.restorePlayFromTrash(play.id);
    expect(restored.deletedAtMs).toBeUndefined();
    expect(restored.document).toEqual(play);
    await expect(repository.listTrash()).resolves.toEqual([]);
    await expect(
      repository.listPlaySummaries(play.playbookId),
    ).resolves.toEqual([expect.objectContaining({ playId: play.id })]);
  });

  it("purges a Play and everything derived from it once retention passes", async () => {
    let clock = FIXED_TIME;
    const repository = track(createRepository("purge", () => clock));
    await repository.savePlaybook(offensivePlaybookGolden);
    const play = offensivePlaybookGolden.plays[0]!;
    await repository.createNamedVersion({
      playId: play.id,
      revisionId: "revision_purged",
      label: "Purged with its Play",
    });
    await repository.putUndoHistory({
      schemaVersion: 1,
      playId: play.id,
      undo: [],
      redo: [],
      encodedByteLength: 0,
      updatedAtMs: FIXED_TIME,
    });
    await repository.movePlayToTrash(play.id);

    clock = FIXED_TIME + TRASH_RETENTION_MS;
    await expect(repository.purgeExpiredTrash()).resolves.toEqual([play.id]);

    await expect(repository.getPlay(play.id)).resolves.toBeUndefined();
    await expect(
      repository.getRevision("revision_purged"),
    ).resolves.toBeUndefined();
    await expect(repository.getUndoHistory(play.id)).resolves.toBeUndefined();
    await expect(repository.counts()).resolves.toEqual(
      expect.objectContaining({
        plays: 0,
        revisions: 0,
        undoHistories: 0,
        searchProjections: 0,
        playbooks: 1,
      }),
    );
  });

  it("commits one Play at 2,000-Play beta scale without growing with Playbook size", async () => {
    const basePlay = offensivePlaybookGolden.plays[0]!;
    const fullHistoryFor = (play: PlayDocument): UndoHistory => ({
      schemaVersion: 1,
      playId: play.id,
      undo: Array.from(
        { length: UNDO_HISTORY_LIMITS.maxEntries },
        (_unused, index) => ({
          id: `undo_${index}`,
          label: "Move Players",
          createdAtMs: FIXED_TIME - index,
          beforeHash: `hash_${index}`,
          afterHash: `hash_${index + 1}`,
          forward: {
            kind: "move-players" as const,
            moves: play.players.map((player) => ({
              playerId: player.id,
              position: { lateralYards: index, depthYards: 5 },
            })),
          },
          inverse: {
            kind: "move-players" as const,
            moves: play.players.map((player) => ({
              playerId: player.id,
              position: player.position,
            })),
          },
        }),
      ),
      redo: [],
      encodedByteLength: 0,
      updatedAtMs: FIXED_TIME,
    });

    async function measureCommit(
      suffix: string,
      playCount: number,
    ): Promise<number> {
      const repository = track(createRepository(suffix));
      const plays = Array.from({ length: playCount }, (_unused, index) => ({
        ...structuredClone(basePlay),
        id: `play_scale_${index.toString().padStart(4, "0")}`,
        name: `Scale Play ${index.toString().padStart(4, "0")}`,
      }));
      await repository.savePlaybook({
        ...structuredClone(offensivePlaybookGolden),
        plays,
      });
      const targetId = `play_scale_${Math.floor(playCount / 2)
        .toString()
        .padStart(4, "0")}`;
      const target = await repository.getPlay(targetId);
      expect(target).toBeDefined();
      const measuredPlay = {
        ...structuredClone(target!.document),
        name: "Measured commit",
      };

      const startedAtMs = performance.now();
      const result = await repository.commitPlay({
        play: measuredPlay,
        expectedDocumentHash: target!.documentHash,
        mutation: { id: `mutation_measured_${suffix}` },
        undoHistory: fullHistoryFor(measuredPlay),
      });
      const durationMs = performance.now() - startedAtMs;

      expect(result.documentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.undoEntryCount).toBe(UNDO_HISTORY_LIMITS.maxEntries);
      await expect(repository.counts()).resolves.toEqual(
        expect.objectContaining({
          plays: playCount,
          syncMutations: 1,
          searchProjections: playCount,
          undoHistories: 1,
        }),
      );
      return durationMs;
    }

    const smallMs = await measureCommit("scale-small", 2);
    const betaMs = await measureCommit("scale-beta", 2_000);

    // A commit reads only its own Play plus that Playbook's Concepts and
    // Formations, so committing into a 1,000x larger Playbook must not cost
    // meaningfully more. Wall-clock ceilings against the Coach-visible 50 ms
    // budget belong on real devices, not on this in-memory IndexedDB shim.
    expect(betaMs).toBeLessThan(smallMs * 3 + 25);
  }, 30_000);
});
