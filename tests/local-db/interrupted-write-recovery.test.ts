import {
  canonicalSha256,
  createUndoHistory,
  type UndoHistory,
} from "@chalk/domain";
import {
  createDexieLocalRepository,
  type ChalkLocalRepository,
} from "@chalk/local-db";
import { offensivePlaybookGolden } from "@chalk/test-fixtures";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";

const FIXED_TIME = 1_786_000_100_000;
const play = offensivePlaybookGolden.plays[0]!;

describe("recovering from an interrupted write", () => {
  const repositories: ChalkLocalRepository[] = [];

  afterEach(async () => {
    await Promise.all(
      repositories.splice(0).map((repository) => repository.destroy()),
    );
  });

  function open(databaseName: string): ChalkLocalRepository {
    const repository = createDexieLocalRepository({
      databaseName,
      indexedDB,
      IDBKeyRange,
      now: () => FIXED_TIME,
    });
    repositories.push(repository);
    return repository;
  }

  function historyFor(afterHash: string, beforeHash: string): UndoHistory {
    return {
      ...createUndoHistory(play.id, FIXED_TIME),
      undo: [
        {
          id: "undo_interrupted",
          label: "Rename Play",
          createdAtMs: FIXED_TIME,
          beforeHash,
          afterHash,
          forward: { kind: "set-play-name", name: "Interrupted rename" },
          inverse: { kind: "set-play-name", name: play.name },
        },
      ],
      encodedByteLength: 128,
    };
  }

  it("leaves the prior Play when the device is closed mid-commit", async () => {
    const databaseName = `chalk-interrupted-${crypto.randomUUID()}`;
    const first = open(databaseName);
    await first.savePlaybook(offensivePlaybookGolden);
    const before = await first.getPlay(play.id);

    const renamed = { ...structuredClone(play), name: "Interrupted rename" };
    const interrupted = first.commitPlay({
      play: renamed,
      expectedDocumentHash: before!.documentHash,
      revision: { id: "revision_interrupted" },
      mutation: { id: "mutation_interrupted" },
      undoHistory: historyFor(
        await canonicalSha256(renamed),
        before!.documentHash,
      ),
    });
    // The tab disappears while the transaction is still in flight.
    first.close();
    await expect(interrupted).rejects.toThrow();

    const reopened = open(databaseName);
    const after = await reopened.getPlay(play.id);

    // Either the prior valid state or the complete new state — never a mix.
    const settled = after!.documentHash === before!.documentHash;
    expect(settled || after!.document.name === "Interrupted rename").toBe(true);
    if (settled) {
      expect(after!.document).toEqual(play);
      await expect(
        reopened.getRevision("revision_interrupted"),
      ).resolves.toBeUndefined();
      await expect(reopened.readSyncMutationBatch(10)).resolves.toEqual([]);
      await expect(reopened.getUndoHistory(play.id)).resolves.toBeUndefined();
    }
  });

  it("never leaves a Play disagreeing with the history committed beside it", async () => {
    const databaseName = `chalk-interrupted-history-${crypto.randomUUID()}`;
    const repository = open(databaseName);
    await repository.savePlaybook(offensivePlaybookGolden);
    const before = await repository.getPlay(play.id);
    const renamed = { ...structuredClone(play), name: "Interrupted rename" };
    const afterHash = await canonicalSha256(renamed);

    // A duplicate revision ID fails the transaction after the Play and its
    // history have already been written inside it.
    await repository.commitPlay({
      play: before!.document,
      expectedDocumentHash: before!.documentHash,
      revision: { id: "revision_taken" },
      mutation: { id: "mutation_first" },
    });
    const stable = await repository.getPlay(play.id);

    await expect(
      repository.commitPlay({
        play: renamed,
        expectedDocumentHash: stable!.documentHash,
        revision: { id: "revision_taken" },
        mutation: { id: "mutation_second" },
        undoHistory: historyFor(afterHash, stable!.documentHash),
      }),
    ).rejects.toThrow();

    const after = await repository.getPlay(play.id);
    expect(after!.document.name).toBe(play.name);
    expect(after!.documentHash).toBe(stable!.documentHash);
    // The history that would have described the rejected edit is not stored.
    await expect(repository.getUndoHistory(play.id)).resolves.toBeUndefined();
    await expect(repository.counts()).resolves.toEqual(
      expect.objectContaining({ revisions: 1, undoHistories: 0 }),
    );
  });

  it("reopens a database whose derived records were lost", async () => {
    const databaseName = `chalk-derived-loss-${crypto.randomUUID()}`;
    const repository = open(databaseName);
    await repository.savePlaybook(offensivePlaybookGolden);

    // Derived data is disposable: losing it must not cost the Coach a Play.
    await repository.clearDerivedData();
    repository.close();

    const reopened = open(databaseName);
    await expect(reopened.getPlay(play.id)).resolves.toEqual(
      expect.objectContaining({ document: play }),
    );
    await expect(reopened.loadPlaybook(play.playbookId)).resolves.toEqual(
      offensivePlaybookGolden,
    );
    await expect(reopened.listPlaySummaries(play.playbookId)).resolves.toEqual([
      expect.objectContaining({ playId: play.id, name: play.name }),
    ]);
  });

  it("keeps a completed commit after an interruption that follows it", async () => {
    const databaseName = `chalk-after-commit-${crypto.randomUUID()}`;
    const first = open(databaseName);
    await first.savePlaybook(offensivePlaybookGolden);
    const before = await first.getPlay(play.id);
    const renamed = {
      ...structuredClone(play),
      name: "Saved before the crash",
    };

    const receipt = await first.commitPlay({
      play: renamed,
      expectedDocumentHash: before!.documentHash,
      mutation: { id: "mutation_completed" },
      undoHistory: historyFor(
        await canonicalSha256(renamed),
        before!.documentHash,
      ),
    });
    // The acknowledgement came back, then the tab died.
    first.close();

    const reopened = open(databaseName);
    const after = await reopened.getPlay(play.id);
    expect(after!.document.name).toBe("Saved before the crash");
    expect(after!.documentHash).toBe(receipt.documentHash);
    await expect(reopened.getUndoHistory(play.id)).resolves.toEqual(
      expect.objectContaining({
        undo: [expect.objectContaining({ id: "undo_interrupted" })],
      }),
    );
    await expect(reopened.readSyncMutationBatch(10)).resolves.toEqual([
      expect.objectContaining({ id: "mutation_completed" }),
    ]);
  });
});
