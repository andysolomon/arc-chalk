import {
  builtInPlayTypeDefinitions,
  createStableId,
  decryptBackup,
  encryptBackup,
  parseEncryptedBackup,
  serializeEncryptedBackup,
  stickThunderPlay,
  type PlaybookEnvelope,
} from "@chalk/domain";
import {
  createEditorStore,
  type EditorPersistence,
  type EditorStore,
} from "@chalk/editor";
import {
  createDexieLocalRepository,
  type BackupImportResult,
  type ChalkLocalRepository,
  type SessionRecovery,
  type StorageHealth,
} from "@chalk/local-db";

const DATABASE_NAME = "chalk-production-beta";
const SEED_TIME = 1_786_000_000_000;

const starterPlaybook: PlaybookEnvelope = {
  schemaVersion: 1,
  kind: "chalk-playbook",
  exportedAtMs: SEED_TIME,
  playbook: {
    schemaVersion: 1,
    id: stickThunderPlay.playbookId,
    name: "Chalk Starter Playbook",
    defaultFieldProfileId: stickThunderPlay.fieldProfile.id,
    fieldProfiles: [stickThunderPlay.fieldProfile],
    playTypes: [...builtInPlayTypeDefinitions],
    createdAtMs: SEED_TIME,
    updatedAtMs: SEED_TIME,
  },
  concepts: [],
  formations: [],
  plays: [stickThunderPlay],
};

export interface ChalkRuntime {
  readonly editorStore: EditorStore;
  readonly recovery: SessionRecovery;
  readonly storage: StorageHealth;
  /** Frees the disposable previews and search projections Chalk can rebuild. */
  releaseDerivedStorage(): Promise<StorageHealth>;
  /** Encrypts the Coach's work on this device before it becomes a file. */
  exportEncryptedBackup(passphrase: string): Promise<string>;
  /**
   * Restores a backup without overwriting newer local work; a Play the Coach
   * edited after the backup was written is kept.
   */
  importEncryptedBackup(
    contents: string,
    passphrase: string,
  ): Promise<BackupImportResult>;
}

export async function createBrowserRuntime(): Promise<ChalkRuntime> {
  const repository: ChalkLocalRepository = createDexieLocalRepository({
    databaseName: DATABASE_NAME,
  });
  await repository.open();

  const recovery = await repository.beginSession(createStableId("session"));
  // A session that ends cleanly leaves no recovery notice behind.
  globalThis.addEventListener?.("pagehide", () => {
    void repository.endSession();
  });

  await repository.requestPersistentStorage();
  // Upgrade anything an earlier release wrote before the Coach touches it.
  await repository.upgradeStoredPlays();
  await repository.purgeExpiredTrash();

  let storedPlay = await repository.getPlay(stickThunderPlay.id);
  if (!storedPlay) {
    await repository.savePlaybook(starterPlaybook);
    storedPlay = await repository.getPlay(stickThunderPlay.id);
  }
  if (!storedPlay) {
    throw new Error("Chalk could not initialize the starter Play.");
  }

  const persistence: EditorPersistence = {
    commitPlay: (input) => repository.commitPlay(input),
    createNamedVersion: (input) => repository.createNamedVersion(input),
    listPlayVersions: (playId) => repository.listPlayVersions(playId),
    loadVersionDocument: async (revisionId) =>
      (await repository.getRevision(revisionId))?.document,
  };

  const editorStore = createEditorStore({
    initialDocument: storedPlay.document,
    initialDocumentHash: storedPlay.documentHash,
    initialUndoHistory: await repository.getUndoHistory(storedPlay.id),
    initialVersions: await repository.listPlayVersions(storedPlay.id),
    persistence,
  });

  return {
    editorStore,
    recovery,
    storage: await repository.storageHealth(),
    async releaseDerivedStorage() {
      await repository.clearDerivedData();
      return repository.storageHealth();
    },
    async exportEncryptedBackup(passphrase) {
      const payload = await repository.exportBackup();
      return serializeEncryptedBackup(await encryptBackup(payload, passphrase));
    },
    async importEncryptedBackup(contents, passphrase) {
      const payload = await decryptBackup(
        parseEncryptedBackup(contents),
        passphrase,
      );
      return repository.importBackup(payload, { mode: "merge" });
    },
  };
}
