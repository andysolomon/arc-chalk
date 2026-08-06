import {
  BackupPassphraseError,
  backupPayloadSchema,
  decryptBackup,
  encryptBackup,
  parseEncryptedBackup,
  readBackupPayload,
  serializeEncryptedBackup,
  type BackupPayload,
} from "@chalk/domain";
import {
  offensivePlaybookGolden,
  releasedPlayDocumentV1,
} from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

// A Coach's real backup uses the strong default; tests would spend seconds on
// key derivation alone, so they say so explicitly.
const TEST_ITERATIONS = 1_000;
const PASSPHRASE = "third and long from the boundary";

const payload: BackupPayload = backupPayloadSchema.parse({
  schemaVersion: 1,
  kind: "chalk-backup",
  createdAtMs: 1_786_000_100_000,
  databaseVersion: 1,
  playbooks: [offensivePlaybookGolden.playbook],
  concepts: offensivePlaybookGolden.concepts,
  formations: offensivePlaybookGolden.formations,
  plays: offensivePlaybookGolden.plays.map((document) => ({
    playId: document.id,
    playbookId: document.playbookId,
    document,
    updatedAtMs: 1_786_000_100_000,
  })),
  revisions: [],
  preferences: [{ key: "editor.snap.enabled", value: true, updatedAtMs: 1 }],
});

describe("encrypted Coach backups", () => {
  it("round-trips a Coach's work through an encrypted file", async () => {
    const backup = await encryptBackup(payload, PASSPHRASE, {
      iterations: TEST_ITERATIONS,
    });
    const file = serializeEncryptedBackup(backup);

    await expect(
      decryptBackup(parseEncryptedBackup(file), PASSPHRASE),
    ).resolves.toEqual(payload);
  });

  it("never writes Play content into the file", async () => {
    const backup = await encryptBackup(payload, PASSPHRASE, {
      iterations: TEST_ITERATIONS,
    });
    const file = serializeEncryptedBackup(backup);

    // The header is readable, but nothing a Coach wrote may be.
    expect(file).toContain("chalk-encrypted-backup");
    expect(file).not.toContain(offensivePlaybookGolden.plays[0]!.name);
    expect(file).not.toContain(offensivePlaybookGolden.playbook.name);
    for (const assignment of offensivePlaybookGolden.plays[0]!.assignments) {
      expect(file).not.toContain(assignment.text);
    }
  });

  it("refuses the wrong passphrase", async () => {
    const backup = await encryptBackup(payload, PASSPHRASE, {
      iterations: TEST_ITERATIONS,
    });

    await expect(
      decryptBackup(backup, "the wrong passphrase"),
    ).rejects.toBeInstanceOf(BackupPassphraseError);
  });

  it("refuses a file whose contents or header were altered", async () => {
    const backup = await encryptBackup(payload, PASSPHRASE, {
      iterations: TEST_ITERATIONS,
    });

    const flipped = [...backup.ciphertext];
    flipped[10] = flipped[10] === "A" ? "B" : "A";
    await expect(
      decryptBackup({ ...backup, ciphertext: flipped.join("") }, PASSPHRASE),
    ).rejects.toBeInstanceOf(BackupPassphraseError);

    // The header is authenticated too: weakening the recorded work factor
    // must not produce a readable backup.
    await expect(
      decryptBackup({ ...backup, iterations: 1 }, PASSPHRASE),
    ).rejects.toBeInstanceOf(BackupPassphraseError);
  });

  it("produces a different file every time the same work is exported", async () => {
    const first = await encryptBackup(payload, PASSPHRASE, {
      iterations: TEST_ITERATIONS,
    });
    const second = await encryptBackup(payload, PASSPHRASE, {
      iterations: TEST_ITERATIONS,
    });

    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    await expect(decryptBackup(second, PASSPHRASE)).resolves.toEqual(payload);
  });

  it("refuses to write a backup without a passphrase", async () => {
    await expect(encryptBackup(payload, "")).rejects.toBeInstanceOf(RangeError);
  });

  it("uses a strong work factor unless a test says otherwise", async () => {
    const backup = await encryptBackup(payload, PASSPHRASE, {
      iterations: TEST_ITERATIONS,
    });

    expect(backup.keyDerivation).toBe("PBKDF2-SHA-256");
    expect(backup.cipher).toBe("AES-GCM");
    const { BACKUP_KDF_ITERATIONS } = await import("@chalk/domain");
    expect(BACKUP_KDF_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  it("upgrades Plays inside a backup an earlier release wrote", async () => {
    const legacy = {
      ...payload,
      plays: [
        {
          playId: releasedPlayDocumentV1.id,
          playbookId: offensivePlaybookGolden.playbook.id,
          document: releasedPlayDocumentV1,
          updatedAtMs: 1,
        },
      ],
    };

    const read = readBackupPayload(legacy);

    expect(read.plays[0]?.document.schemaVersion).toBe(3);
    // The Play returns to the Playbook the Coach kept it in.
    expect(read.plays[0]?.document.playbookId).toBe(
      offensivePlaybookGolden.playbook.id,
    );
    await expect(
      encryptBackup(legacy as never, PASSPHRASE, {
        iterations: TEST_ITERATIONS,
      }),
    ).rejects.toThrow();
  });

  it("refuses a file that is not a Chalk backup", () => {
    expect(() => parseEncryptedBackup('{"kind":"something-else"}')).toThrow();
  });
});
