import { canonicalSha256, type PlayDocument } from "@chalk/domain";
import {
  createDexieLocalRepository,
  type ChalkLocalRepository,
} from "@chalk/local-db";
import {
  defensiveCoverThreePlay,
  defensivePlaybookGolden,
} from "@chalk/test-fixtures";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";

import {
  readRawRecords,
  writeReleasedDatabase,
} from "./released-database-fixtures";

/**
 * Before #131 every defense Chalk put on the field was a bare letter, and a
 * Play saved then still is. ADR 0061 draws those defenders as triangles once
 * per device. The upgrade itself is proven end to end in
 * tests/e2e/defender-triangles.spec.ts; these are the ways it can fail that a
 * browser cannot practically reach.
 */

const FIXED_TIME = 1_786_000_100_000;
const RELEASED_VERSION = 1;
const playbook = defensivePlaybookGolden.playbook;

/** A Play as a release before #131 saved it: every defender letter-only. */
function letterOnly(id: string): PlayDocument {
  return {
    ...defensiveCoverThreePlay,
    id,
    players: defensiveCoverThreePlay.players.map((player) =>
      player.unit === "defense" ? { ...player, symbol: "none" } : player,
    ),
  };
}

async function storedPlay(
  document: PlayDocument,
  extra: { readonly documentHash?: string; readonly deletedAtMs?: number } = {},
) {
  return {
    id: document.id,
    playbookId: playbook.id,
    document,
    documentHash: extra.documentHash ?? (await canonicalSha256(document)),
    updatedAtMs: FIXED_TIME,
    ...(extra.deletedAtMs === undefined
      ? {}
      : { deletedAtMs: extra.deletedAtMs }),
  };
}

const symbolsOf = (document: PlayDocument) =>
  document.players
    .filter((player) => player.unit === "defense")
    .map((player) => player.symbol);

describe("drawing letter-only defenders an earlier release saved as triangles", () => {
  const repositories: ChalkLocalRepository[] = [];

  afterEach(async () => {
    await Promise.all(
      repositories.splice(0).map((repository) => repository.destroy()),
    );
  });

  async function releasedDatabase(
    plays: readonly unknown[],
  ): Promise<{ databaseName: string; repository: ChalkLocalRepository }> {
    const databaseName = `chalk-letter-only-${crypto.randomUUID()}`;
    await writeReleasedDatabase(indexedDB, {
      databaseName,
      version: RELEASED_VERSION,
      records: { playbooks: [playbook], plays },
    });
    const repository = createDexieLocalRepository({
      databaseName,
      indexedDB,
      IDBKeyRange,
      now: () => FIXED_TIME,
    });
    repositories.push(repository);
    return { databaseName, repository };
  }

  it("still upgrades the rest when one Play no longer matches its hash, rather than keeping the editor from opening", async () => {
    const healthy = letterOnly("play_letter_only_healthy");
    const corrupt = letterOnly("play_letter_only_corrupt");
    const { databaseName, repository } = await releasedDatabase([
      await storedPlay(healthy),
      await storedPlay(corrupt, { documentHash: "0".repeat(64) }),
    ]);

    await expect(repository.upgradeLetterOnlyDefenders()).resolves.toEqual([
      healthy.id,
    ]);

    const stored = await readRawRecords<{
      id: string;
      document: PlayDocument;
      documentHash: string;
    }>(indexedDB, databaseName, "plays");
    const byId = new Map(stored.map((record) => [record.id, record]));
    expect(new Set(symbolsOf(byId.get(healthy.id)!.document))).toEqual(
      new Set(["triangle"]),
    );
    // The corrupt Play is left exactly as found, for getPlay to report.
    expect(byId.get(corrupt.id)!.documentHash).toBe("0".repeat(64));
    expect(new Set(symbolsOf(byId.get(corrupt.id)!.document))).toEqual(
      new Set(["none"]),
    );
  });

  it("queues no sync push, so two devices upgrading the same Play do not raise a conflict", async () => {
    const play = letterOnly("play_letter_only_synced");
    const { databaseName, repository } = await releasedDatabase([
      { ...(await storedPlay(play)), cloudRevisionId: "revision_cloud_head" },
    ]);

    await expect(repository.upgradeLetterOnlyDefenders()).resolves.toEqual([
      play.id,
    ]);

    await expect(
      readRawRecords(indexedDB, databaseName, "syncMutations"),
    ).resolves.toEqual([]);
    // Still based on the same cloud head, so the Coach's next edit pushes
    // the triangles on top of it rather than on top of nothing.
    const upgraded = await repository.getPlay(play.id);
    expect(upgraded?.cloudRevisionId).toBe("revision_cloud_head");
  });

  it("upgrades a Play in the Trash, so restoring it does not bring letter-only defenders back", async () => {
    const play = letterOnly("play_letter_only_trashed");
    const { repository } = await releasedDatabase([
      await storedPlay(play, { deletedAtMs: FIXED_TIME - 1_000 }),
    ]);

    await expect(repository.upgradeLetterOnlyDefenders()).resolves.toEqual([
      play.id,
    ]);

    const restored = await repository.restorePlayFromTrash(play.id);
    expect(new Set(symbolsOf(restored.document))).toEqual(
      new Set(["triangle"]),
    );
  });
});
