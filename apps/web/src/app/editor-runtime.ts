import {
  builtInPlayTypeDefinitions,
  canonicalSha256,
  createStableId,
  decryptBackup,
  encryptBackup,
  parseEncryptedBackup,
  serializeEncryptedBackup,
  stickThunderPlay,
  type Formation,
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

/**
 * Which sets and calls the Coach starred. The original kept these beside the
 * work rather than inside it — a favorite is how this Coach reaches for a set
 * on this device, not a fact about the Play — so they live in preferences and
 * never travel in a Play's document.
 */
const FAVORITE_FORMATIONS_KEY = "formations.favorites.v1";
const FAVORITE_CALLS_KEY = "defenses.favorites.v1";

/** The sets a Coach saved himself, and what he starred in either book. */
export interface CoachSets {
  readonly formations: readonly Formation[];
  readonly favoriteFormationIds: readonly string[];
  readonly favoriteCallIds: readonly string[];
}

const readIds = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];

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

const CLEAN_EXIT_KEY = "chalk.session.cleanExit";

function markCleanExit(sessionId: string): void {
  try {
    localStorage.setItem(CLEAN_EXIT_KEY, sessionId);
  } catch {
    // Without storage the IndexedDB marker alone decides.
  }
}

/**
 * An interrupted session whose id was written at pagehide ended cleanly; the
 * IndexedDB marker simply did not get to commit before the page went away.
 */
export function reconcileCleanExit(
  recovery: SessionRecovery,
  storage: Pick<Storage, "getItem"> | undefined = safeLocalStorage(),
): SessionRecovery {
  if (!recovery.interrupted || recovery.previousSessionId === undefined) {
    return recovery;
  }
  try {
    return storage?.getItem(CLEAN_EXIT_KEY) === recovery.previousSessionId
      ? { interrupted: false }
      : recovery;
  } catch {
    return recovery;
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export interface ChalkRuntime {
  readonly editorStore: EditorStore;
  readonly repository: ChalkLocalRepository;
  readonly recovery: SessionRecovery;
  readonly storage: StorageHealth;
  /** What the Coach had saved and starred when this session opened. */
  readonly coachSets: CoachSets;
  /** Fires after a local commit so background sync can drain. */
  subscribeLocalEdit(listener: () => void): () => void;
  /** Keeps a set the Coach named, so it is there the next time he opens Chalk. */
  saveCoachFormation(formation: Formation): Promise<void>;
  removeCoachFormation(formationId: string): Promise<void>;
  setFavoriteFormations(ids: readonly string[]): Promise<void>;
  setFavoriteCalls(ids: readonly string[]): Promise<void>;
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
  /** Sign-out path that discards this device's IndexedDB. */
  destroyLocalData(): Promise<void>;
}

export async function createBrowserRuntime(): Promise<ChalkRuntime> {
  const repository: ChalkLocalRepository = createDexieLocalRepository({
    databaseName: DATABASE_NAME,
  });
  await repository.open();

  const sessionId = createStableId("session");
  const recovery = reconcileCleanExit(await repository.beginSession(sessionId));
  // A session that ends cleanly leaves no recovery notice behind. The
  // IndexedDB delete may not land before a reload or an update takes the
  // page, so the same fact is also written synchronously where unload can
  // always reach it; startup reads both.
  globalThis.addEventListener?.("pagehide", () => {
    markCleanExit(sessionId);
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

  const localEditListeners = new Set<() => void>();

  const persistence: EditorPersistence = {
    commitPlay: async (input) => {
      const receipt = await repository.commitPlay(input);
      for (const listener of localEditListeners) listener();
      return receipt;
    },
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

  const [coachFormations, favoriteFormations, favoriteCalls] =
    await Promise.all([
      repository.listFormations(stickThunderPlay.playbookId),
      repository.getPreference(FAVORITE_FORMATIONS_KEY),
      repository.getPreference(FAVORITE_CALLS_KEY),
    ]);

  const rememberIds = async (key: string, ids: readonly string[]) => {
    await repository.setPreference({
      key,
      value: [...ids],
      updatedAtMs: Date.now(),
    });
  };

  return {
    editorStore,
    repository,
    recovery,
    storage: await repository.storageHealth(),
    coachSets: {
      formations: coachFormations,
      favoriteFormationIds: readIds(favoriteFormations?.value),
      favoriteCallIds: readIds(favoriteCalls?.value),
    },
    async saveCoachFormation(formation) {
      await repository.saveFormation(formation);
      await repository.enqueueSyncMutation({
        id: createStableId("mutation"),
        entityKind: "formation",
        entityId: formation.id,
        operation: "put",
        payloadHash: await canonicalSha256(formation),
        payload: formation,
        status: "pending",
        attempts: 0,
        createdAtMs: Date.now(),
        nextAttemptAtMs: Date.now(),
      });
      for (const listener of localEditListeners) listener();
    },
    async removeCoachFormation(formationId) {
      await repository.deleteFormation(formationId);
    },
    async setFavoriteFormations(ids) {
      await rememberIds(FAVORITE_FORMATIONS_KEY, ids);
    },
    async setFavoriteCalls(ids) {
      await rememberIds(FAVORITE_CALLS_KEY, ids);
    },
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
    subscribeLocalEdit(listener) {
      localEditListeners.add(listener);
      return () => localEditListeners.delete(listener);
    },
    async destroyLocalData() {
      await repository.destroy();
    },
  };
}
