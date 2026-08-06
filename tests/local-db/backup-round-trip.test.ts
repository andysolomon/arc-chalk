import {
  BackupPassphraseError,
  decryptBackup,
  encryptBackup,
  parseEncryptedBackup,
  serializeEncryptedBackup,
} from "@chalk/domain";
import {
  createDexieLocalRepository,
  type ChalkLocalRepository,
} from "@chalk/local-db";
import {
  offensivePlaybookGolden,
  releasedPlayDocumentV1,
} from "@chalk/test-fixtures";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";

const FIXED_TIME = 1_786_000_100_000;
const TEST_ITERATIONS = 1_000;
const PASSPHRASE = "third and long from the boundary";
const play = offensivePlaybookGolden.plays[0]!;

describe("encrypted backup round trip", () => {
  const repositories: ChalkLocalRepository[] = [];

  afterEach(async () => {
    await Promise.all(
      repositories.splice(0).map((repository) => repository.destroy()),
    );
  });

  function open(now: () => number = () => FIXED_TIME): ChalkLocalRepository {
    const repository = createDexieLocalRepository({
      databaseName: `chalk-backup-${crypto.randomUUID()}`,
      indexedDB,
      IDBKeyRange,
      now,
    });
    repositories.push(repository);
    return repository;
  }

  /** A device holding real work: an edit, a named version, and a Trash item. */
  async function seededDevice(): Promise<ChalkLocalRepository> {
    let clock = FIXED_TIME;
    const repository = open(() => (clock += 1_000));
    await repository.savePlaybook(offensivePlaybookGolden);
    await repository.createNamedVersion({
      playId: play.id,
      revisionId: "revision_install_week",
      label: "Install week",
    });
    const stored = await repository.getPlay(play.id);
    await repository.commitPlay({
      play: { ...structuredClone(play), name: "Stick — Alert" },
      expectedDocumentHash: stored!.documentHash,
      mutation: { id: "mutation_seed" },
    });
    await repository.setPreference({
      key: "editor.snap.enabled",
      value: true,
      updatedAtMs: FIXED_TIME,
    });
    await repository.beginSession("session_that_wrote_the_backup");
    return repository;
  }

  it("restores a Coach's work and immutable versions onto a new device", async () => {
    const source = await seededDevice();
    const payload = await source.exportBackup();
    const file = serializeEncryptedBackup(
      await encryptBackup(payload, PASSPHRASE, { iterations: TEST_ITERATIONS }),
    );

    const replacement = open();
    const restored = await decryptBackup(
      parseEncryptedBackup(file),
      PASSPHRASE,
    );
    const result = await replacement.importBackup(restored);

    expect(result).toEqual(
      expect.objectContaining({
        playbooks: 1,
        concepts: offensivePlaybookGolden.concepts.length,
        formations: offensivePlaybookGolden.formations.length,
        plays: 1,
        revisions: 1,
        skippedPlays: [],
        skippedRevisions: [],
      }),
    );

    // Current work.
    const play_ = await replacement.getPlay(play.id);
    expect(play_?.document.name).toBe("Stick — Alert");
    expect(play_?.documentHash).toBe(
      (await source.getPlay(play.id))!.documentHash,
    );
    // The immutable version, with the Coach's label intact.
    await expect(
      replacement.getRevision("revision_install_week"),
    ).resolves.toEqual(
      expect.objectContaining({ label: "Install week", document: play }),
    );
    await expect(replacement.listPlayVersions(play.id)).resolves.toHaveLength(
      1,
    );
    // Searchable, and the Coach's preference came along.
    await expect(
      replacement.listPlaySummaries(play.playbookId),
    ).resolves.toEqual([expect.objectContaining({ name: "Stick — Alert" })]);
    await expect(
      replacement.getPreference("editor.snap.enabled"),
    ).resolves.toEqual(expect.objectContaining({ value: true }));
  });

  it("carries the Trash across without resurrecting deleted Plays", async () => {
    const source = await seededDevice();
    await source.movePlayToTrash(play.id);

    const payload = await source.exportBackup();
    const replacement = open();
    await replacement.importBackup(payload);

    await expect(replacement.listTrash()).resolves.toEqual([
      expect.objectContaining({ playId: play.id }),
    ]);
    await expect(
      replacement.listPlaySummaries(play.playbookId),
    ).resolves.toEqual([]);
    await expect(replacement.loadPlaybook(play.playbookId)).resolves.toEqual(
      expect.objectContaining({ plays: [] }),
    );
    // The Play and its version are still recoverable.
    await expect(replacement.restorePlayFromTrash(play.id)).resolves.toEqual(
      expect.objectContaining({ id: play.id }),
    );
    await expect(
      replacement.getRevision("revision_install_week"),
    ).resolves.toBeDefined();
  });

  it("leaves device-local records out of the file", async () => {
    const source = await seededDevice();

    const payload = await source.exportBackup();

    expect(payload.preferences.map(({ key }) => key)).toEqual([
      "editor.snap.enabled",
    ]);
    expect(payload.databaseVersion).toBe(1);
    // Sync queues, conflicts, undo history, and previews belong to a device.
    expect(Object.keys(payload)).toEqual([
      "schemaVersion",
      "kind",
      "createdAtMs",
      "databaseVersion",
      "playbooks",
      "concepts",
      "formations",
      "plays",
      "revisions",
      "preferences",
    ]);
  });

  it("keeps a newer local Play rather than overwriting it with the backup", async () => {
    const source = await seededDevice();
    const payload = await source.exportBackup();

    // The Coach kept working after the backup was written.
    const stored = await source.getPlay(play.id);
    await source.commitPlay({
      play: { ...structuredClone(stored!.document), name: "Newer than backup" },
      expectedDocumentHash: stored!.documentHash,
      mutation: { id: "mutation_after_backup" },
    });

    const result = await source.importBackup(payload);

    expect(result.plays).toBe(0);
    expect(result.skippedPlays).toEqual([play.id]);
    const kept = await source.getPlay(play.id);
    expect(kept?.document.name).toBe("Newer than backup");
  });

  it("never rewrites an immutable version that is already stored", async () => {
    const source = await seededDevice();
    const payload = await source.exportBackup();
    const tampered = {
      ...payload,
      revisions: payload.revisions.map((revision) => ({
        ...revision,
        label: "Relabelled by an import",
      })),
    };

    const result = await source.importBackup(tampered);

    expect(result.skippedRevisions).toEqual(["revision_install_week"]);
    await expect(source.getRevision("revision_install_week")).resolves.toEqual(
      expect.objectContaining({ label: "Install week" }),
    );
  });

  it("discards current records only when the Coach asks to replace", async () => {
    const source = await seededDevice();
    const payload = await source.exportBackup();

    const replacement = open();
    await replacement.savePlaybook({
      ...structuredClone(offensivePlaybookGolden),
      plays: [
        {
          ...structuredClone(play),
          id: "play_only_on_this_device",
          name: "Only on this device",
        },
      ],
    });

    await replacement.importBackup(payload, { mode: "replace" });

    await expect(
      replacement.getPlay("play_only_on_this_device"),
    ).resolves.toBeUndefined();
    await expect(replacement.getPlay(play.id)).resolves.toBeDefined();
    await expect(
      replacement.listPlaySummaries(play.playbookId),
    ).resolves.toHaveLength(1);
  });

  it("writes nothing when any part of the backup is unreadable", async () => {
    const source = await seededDevice();
    const payload = await source.exportBackup();
    const before = await source.counts();

    const broken = {
      ...payload,
      plays: payload.plays.map((entry) => ({
        ...entry,
        document: { ...entry.document, players: "not a roster" },
      })),
    };

    await expect(source.importBackup(broken as never)).rejects.toThrow();
    await expect(source.counts()).resolves.toEqual(before);
    const untouched = await source.getPlay(play.id);
    expect(untouched?.document.name).toBe("Stick — Alert");
  });

  it("refuses a backup the Coach cannot open", async () => {
    const source = await seededDevice();
    const backup = await encryptBackup(
      await source.exportBackup(),
      PASSPHRASE,
      { iterations: TEST_ITERATIONS },
    );

    await expect(
      decryptBackup(backup, "not the passphrase"),
    ).rejects.toBeInstanceOf(BackupPassphraseError);
  });

  it("restores a backup an earlier release wrote", async () => {
    const source = await seededDevice();
    const payload = await source.exportBackup();
    // A file written before Plays carried their own Playbook or Assignments.
    const legacy = {
      ...payload,
      plays: [
        {
          playId: releasedPlayDocumentV1.id,
          playbookId: offensivePlaybookGolden.playbook.id,
          document: releasedPlayDocumentV1,
          updatedAtMs: FIXED_TIME,
        },
      ],
      revisions: [],
    };

    // encryptBackup writes strictly, so a legacy file cannot be produced by
    // today's code; import is the seam that must tolerate one, and decrypting
    // routes through the same reader.
    const replacement = open();
    await replacement.importBackup(legacy as never);

    const upgraded = await replacement.getPlay(releasedPlayDocumentV1.id);
    expect(upgraded?.document.schemaVersion).toBe(3);
    expect(upgraded?.document.playbookId).toBe(
      offensivePlaybookGolden.playbook.id,
    );
    expect(upgraded?.document.assignments[0]?.text).toBe(
      "Push vertical, then win to the flat",
    );
  });
});
