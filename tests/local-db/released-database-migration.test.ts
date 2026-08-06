import {
  LEGACY_IMPORT_PLAYBOOK_ID,
  canonicalSha256,
  migrateStoredPlayDocument,
  playDocumentSchema,
  type PlayDocument,
} from "@chalk/domain";
import {
  createDexieLocalRepository,
  type ChalkLocalRepository,
} from "@chalk/local-db";
import {
  offensivePlaybookGolden,
  releasedPlayDocumentV1,
  releasedPlayDocumentV2,
} from "@chalk/test-fixtures";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";

import {
  CHALK_LOCAL_DATABASE_VERSION,
  readRawRecords,
  writeReleasedDatabase,
} from "./released-database-fixtures";

const FIXED_TIME = 1_786_000_100_000;
const playbook = offensivePlaybookGolden.playbook;

describe("upgrading a database an earlier release wrote", () => {
  const repositories: ChalkLocalRepository[] = [];

  afterEach(async () => {
    await Promise.all(
      repositories.splice(0).map((repository) => repository.destroy()),
    );
  });

  async function releasedDatabase(): Promise<{
    readonly databaseName: string;
    readonly repository: ChalkLocalRepository;
  }> {
    const databaseName = `chalk-released-v1-${crypto.randomUUID()}`;
    await writeReleasedDatabase(indexedDB, {
      databaseName,
      version: CHALK_LOCAL_DATABASE_VERSION,
      records: {
        playbooks: [playbook],
        concepts: [...offensivePlaybookGolden.concepts],
        formations: [...offensivePlaybookGolden.formations],
        plays: [
          {
            id: releasedPlayDocumentV1.id,
            playbookId: playbook.id,
            document: releasedPlayDocumentV1,
            documentHash: "hash-a-previous-release-computed-for-v1",
            updatedAtMs: FIXED_TIME,
          },
          {
            id: `${releasedPlayDocumentV2.id}_v2`,
            playbookId: playbook.id,
            document: {
              ...releasedPlayDocumentV2,
              id: `${releasedPlayDocumentV2.id}_v2`,
            },
            documentHash: "hash-a-previous-release-computed-for-v2",
            updatedAtMs: FIXED_TIME,
          },
        ],
        preferences: [
          {
            key: "editor.snap.enabled",
            value: true,
            updatedAtMs: FIXED_TIME,
          },
        ],
      },
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

  it("opens a released database without losing a Coach's Plays", async () => {
    const { repository } = await releasedDatabase();

    const upgraded = await repository.getPlay(releasedPlayDocumentV1.id);

    expect(upgraded?.document.schemaVersion).toBe(3);
    expect(upgraded?.document.name).toBe(releasedPlayDocumentV1.name);
    expect(upgraded?.document.players).toHaveLength(
      releasedPlayDocumentV1.players.length,
    );
    // The Play stays in the Coach's Playbook rather than the import bucket.
    expect(upgraded?.document.playbookId).toBe(playbook.id);
    expect(upgraded?.documentHash).toBe(
      await canonicalSha256(upgraded!.document),
    );
    // The released Field Profile is carried forward, not discarded.
    expect(upgraded?.document.fieldProfile.schemaVersion).toBe(1);
    expect(upgraded?.document.fieldProfile.endZoneDepthYards).toBe(10);
    // Route prose released on the path becomes a hybrid Assignment.
    expect(upgraded?.document.assignments[0]?.text).toBe(
      "Push vertical, then win to the flat",
    );

    await expect(
      repository.getPreference("editor.snap.enabled"),
    ).resolves.toEqual(expect.objectContaining({ value: true }));
  });

  it("loads the whole Playbook out of a released database", async () => {
    const { repository } = await releasedDatabase();

    const envelope = await repository.loadPlaybook(playbook.id);

    expect(envelope?.plays).toHaveLength(2);
    expect(
      envelope?.plays.every(({ schemaVersion }) => schemaVersion === 3),
    ).toBe(true);
    expect(envelope?.concepts).toHaveLength(
      offensivePlaybookGolden.concepts.length,
    );
    expect(envelope?.formations).toHaveLength(
      offensivePlaybookGolden.formations.length,
    );
  });

  it("rewrites upgraded Plays once so later reads are already current", async () => {
    const { databaseName, repository } = await releasedDatabase();

    const upgradedIds = await repository.upgradeStoredPlays();

    expect(upgradedIds).toEqual(
      [releasedPlayDocumentV1.id, `${releasedPlayDocumentV2.id}_v2`].sort(),
    );
    const stored = await readRawRecords<{
      document: PlayDocument;
      documentHash: string;
    }>(indexedDB, databaseName, "plays");
    expect(stored.every(({ document }) => document.schemaVersion === 3)).toBe(
      true,
    );
    for (const record of stored) {
      expect(record.documentHash).toBe(await canonicalSha256(record.document));
      expect(() => playDocumentSchema.parse(record.document)).not.toThrow();
    }

    // The upgraded Plays are searchable, and running again is a no-op.
    await expect(
      repository.listPlaySummaries(playbook.id),
    ).resolves.toHaveLength(2);
    await expect(repository.upgradeStoredPlays()).resolves.toEqual([]);
  });

  it("lets a Coach edit an upgraded Play with an ordinary hash guard", async () => {
    const { repository } = await releasedDatabase();
    await repository.upgradeStoredPlays();
    const upgraded = await repository.getPlay(releasedPlayDocumentV1.id);

    const result = await repository.commitPlay({
      play: {
        ...structuredClone(upgraded!.document),
        name: "Edited after upgrade",
      },
      expectedDocumentHash: upgraded!.documentHash,
      mutation: { id: "mutation_after_upgrade" },
    });

    expect(result.documentHash).toMatch(/^[a-f0-9]{64}$/);
    const edited = await repository.getPlay(releasedPlayDocumentV1.id);
    expect(edited?.document.name).toBe("Edited after upgrade");
    expect(edited?.documentHash).toBe(result.documentHash);
  });

  it("still reports a current Play that no longer matches its hash", async () => {
    const databaseName = `chalk-corrupt-${crypto.randomUUID()}`;
    await writeReleasedDatabase(indexedDB, {
      databaseName,
      version: CHALK_LOCAL_DATABASE_VERSION,
      records: {
        playbooks: [playbook],
        plays: [
          {
            id: offensivePlaybookGolden.plays[0]!.id,
            playbookId: playbook.id,
            document: offensivePlaybookGolden.plays[0]!,
            documentHash: "0".repeat(64),
            updatedAtMs: FIXED_TIME,
          },
        ],
      },
    });
    const repository = createDexieLocalRepository({
      databaseName,
      indexedDB,
      IDBKeyRange,
    });
    repositories.push(repository);

    await expect(
      repository.getPlay(offensivePlaybookGolden.plays[0]!.id),
    ).rejects.toThrow(/does not match its document hash/);
  });
});

describe("migrating a stored Play document", () => {
  it("keeps a stored Play in its own Playbook", () => {
    const migrated = migrateStoredPlayDocument(
      releasedPlayDocumentV1,
      playbook.id,
    );

    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.playbookId).toBe(playbook.id);
    expect(migrated.playbookId).not.toBe(LEGACY_IMPORT_PLAYBOOK_ID);
  });

  it("returns a current Play untouched", () => {
    const current = offensivePlaybookGolden.plays[0]!;

    expect(migrateStoredPlayDocument(current, playbook.id)).toEqual(current);
  });
});
