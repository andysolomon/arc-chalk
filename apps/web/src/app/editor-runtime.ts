import {
  canonicalSha256,
  createStableId,
  decryptBackup,
  encryptBackup,
  parseEncryptedBackup,
  serializeEncryptedBackup,
  searchPlays,
  starterPlaybookEnvelope,
  stickThunderPlay,
  type Concept,
  type Formation,
  type PlaySearchQuery,
  type Playbook,
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
  type PlayListPage,
  type PlaySearchProjection,
  type PlaybookSummary,
  type LocalImageBlob,
  type SessionRecovery,
  type StorageHealth,
  type StoredPlay,
  type ThumbnailDerivative,
} from "@chalk/local-db";

import { createShareCloud, type ShareCloudPort } from "../share/convex-share";

const DATABASE_NAME = "chalk-production-beta";
export const LIBRARY_OPEN_KEY = "libraryOpen.v1";
export const LIBRARY_BROWSER_KEY = "library.browser.v1";

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

export interface LibrarySnapshot {
  readonly playbook: Playbook;
  readonly concepts: readonly Concept[];
  readonly members: readonly PlaySearchProjection[];
}

export interface LibraryBrowserState {
  readonly scrollTop: number;
  readonly focusedPlayId?: string;
  readonly query: string;
}

const readIds = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];

export interface ChalkLibrary {
  readonly playbookId: string;
  loadSnapshot(): Promise<LibrarySnapshot | undefined>;
  listPlaybooks(): Promise<readonly PlaybookSummary[]>;
  getPlay(playId: string): Promise<StoredPlay | undefined>;
  getPlaybook(): Promise<Playbook | undefined>;
  savePlaybook(playbook: Playbook): Promise<void>;
  saveConcept(concept: Concept): Promise<void>;
  deleteConcept(conceptId: string): Promise<void>;
  trashPlay(playId: string): Promise<void>;
  search(query: PlaySearchQuery): Promise<readonly PlaySearchProjection[]>;
  listPlaySummaryPage(page: {
    readonly offset: number;
    readonly limit: number;
  }): Promise<PlayListPage>;
  loadDisclosure(): Promise<Readonly<Record<string, boolean>>>;
  saveDisclosure(open: Readonly<Record<string, boolean>>): Promise<void>;
  loadBrowserState(): Promise<LibraryBrowserState>;
  saveBrowserState(state: LibraryBrowserState): Promise<void>;
  getThumbnail(key: string): Promise<ThumbnailDerivative | undefined>;
  putThumbnail(thumbnail: ThumbnailDerivative): Promise<void>;
  getUndoHistory(
    playId: string,
  ): ReturnType<ChalkLocalRepository["getUndoHistory"]>;
  listPlayVersions(
    playId: string,
  ): ReturnType<ChalkLocalRepository["listPlayVersions"]>;
}

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
  readonly library: ChalkLibrary;
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
  putImage(image: LocalImageBlob): Promise<void>;
  getImage(hash: string): Promise<LocalImageBlob | undefined>;
  listImages(): Promise<readonly LocalImageBlob[]>;
  markImageUploaded(hash: string, uploadedAtMs: number): Promise<void>;
  /** Present when a Convex deployment URL is configured. */
  readonly shareCloud?: ShareCloudPort;
  /** Sign-out path that discards this device's IndexedDB. */
  destroyLocalData(): Promise<void>;
}

export function emptyLibrarySnapshot(
  playbookId = stickThunderPlay.playbookId,
): LibrarySnapshot {
  return {
    playbook: {
      schemaVersion: 1,
      id: playbookId,
      name: "Playbook",
      defaultFieldProfileId: stickThunderPlay.fieldProfile.id,
      fieldProfiles: [stickThunderPlay.fieldProfile],
      playTypes: [],
      createdAtMs: 0,
      updatedAtMs: 0,
    },
    concepts: [],
    members: [],
  };
}

export function createMemoryLibrary(
  snapshot: LibrarySnapshot = emptyLibrarySnapshot(),
  plays: readonly StoredPlay[] = [],
): ChalkLibrary {
  let current = snapshot;
  const stored = new Map(plays.map((play) => [play.id, play]));
  let disclosure: Record<string, boolean> = {};
  let browser: LibraryBrowserState = { scrollTop: 0, query: "" };
  return {
    playbookId: current.playbook.id,
    loadSnapshot() {
      return Promise.resolve(current);
    },
    listPlaybooks() {
      return Promise.resolve([
        {
          id: current.playbook.id,
          name: current.playbook.name,
          playCount: current.members.length,
          updatedAtMs: current.playbook.updatedAtMs,
          defaultFieldProfileId: current.playbook.defaultFieldProfileId,
        },
      ]);
    },
    getPlay(playId) {
      return Promise.resolve(stored.get(playId));
    },
    getPlaybook() {
      return Promise.resolve(current.playbook);
    },
    savePlaybook(playbook) {
      current = { ...current, playbook };
      return Promise.resolve();
    },
    saveConcept(concept) {
      const rest = current.concepts.filter(({ id }) => id !== concept.id);
      current = { ...current, concepts: [...rest, concept] };
      return Promise.resolve();
    },
    deleteConcept(conceptId) {
      current = {
        ...current,
        concepts: current.concepts.filter(({ id }) => id !== conceptId),
      };
      return Promise.resolve();
    },
    trashPlay(playId) {
      stored.delete(playId);
      current = {
        ...current,
        members: current.members.filter((member) => member.playId !== playId),
      };
      return Promise.resolve();
    },
    search(query) {
      const hits = new Set(
        searchPlays(current.members, query).map(({ playId }) => playId),
      );
      return Promise.resolve(
        current.members.filter((member) => hits.has(member.playId)),
      );
    },
    listPlaySummaryPage(page) {
      return Promise.resolve({
        offset: page.offset,
        limit: page.limit,
        total: current.members.length,
        items: current.members.slice(page.offset, page.offset + page.limit),
      });
    },
    loadDisclosure() {
      return Promise.resolve(disclosure);
    },
    saveDisclosure(open) {
      disclosure = { ...open };
      return Promise.resolve();
    },
    loadBrowserState() {
      return Promise.resolve(browser);
    },
    saveBrowserState(state) {
      browser = state;
      return Promise.resolve();
    },
    getThumbnail() {
      return Promise.resolve(undefined);
    },
    putThumbnail() {
      return Promise.resolve();
    },
    getUndoHistory() {
      return Promise.resolve(undefined);
    },
    listPlayVersions() {
      return Promise.resolve([]);
    },
  };
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
    await repository.savePlaybook(starterPlaybookEnvelope());
    storedPlay = await repository.getPlay(stickThunderPlay.id);
  }
  if (!storedPlay) {
    throw new Error("Chalk could not initialize the starter Play.");
  }

  const playbookId = storedPlay.document.playbookId;
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
      repository.listFormations(playbookId),
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

  const rememberJson = async (key: string, value: unknown) => {
    await repository.setPreference({
      key,
      value: value as never,
      updatedAtMs: Date.now(),
    });
  };

  const library: ChalkLibrary = {
    playbookId,
    async loadSnapshot() {
      const envelope = await repository.loadPlaybook(playbookId);
      if (!envelope) return undefined;
      return {
        playbook: envelope.playbook,
        concepts: envelope.concepts,
        members: await repository.listPlaySummaries(playbookId),
      };
    },
    listPlaybooks: () => repository.listPlaybooks(),
    getPlay: (playId) => repository.getPlay(playId),
    async getPlaybook() {
      return (await repository.loadPlaybook(playbookId))?.playbook;
    },
    savePlaybook: (playbook) => repository.savePlaybookRecord(playbook),
    saveConcept: (concept) => repository.saveConcept(concept),
    deleteConcept: (conceptId) => repository.deleteConcept(conceptId),
    trashPlay: (playId) => repository.movePlayToTrash(playId),
    search: (query) =>
      repository.searchPlays({
        ...query,
        filters: { playbookId, ...query.filters },
      }),
    listPlaySummaryPage: (page) =>
      repository.listPlaySummaryPage(playbookId, page),
    async loadDisclosure() {
      const stored = await repository.getPreference(LIBRARY_OPEN_KEY);
      return stored?.value &&
        typeof stored.value === "object" &&
        !Array.isArray(stored.value)
        ? (stored.value as Record<string, boolean>)
        : {};
    },
    async saveDisclosure(open) {
      await rememberJson(LIBRARY_OPEN_KEY, open);
    },
    async loadBrowserState() {
      const stored = await repository.getPreference(LIBRARY_BROWSER_KEY);
      const value = stored?.value;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { scrollTop: 0, query: "" };
      }
      const record = value as Record<string, unknown>;
      return {
        scrollTop: typeof record.scrollTop === "number" ? record.scrollTop : 0,
        query: typeof record.query === "string" ? record.query : "",
        ...(typeof record.focusedPlayId === "string"
          ? { focusedPlayId: record.focusedPlayId }
          : {}),
      };
    },
    async saveBrowserState(state) {
      await rememberJson(LIBRARY_BROWSER_KEY, state);
    },
    getThumbnail: (key) => repository.getThumbnail(key),
    putThumbnail: (thumbnail) => repository.putThumbnail(thumbnail),
    getUndoHistory: (playId) => repository.getUndoHistory(playId),
    listPlayVersions: (playId) => repository.listPlayVersions(playId),
  };

  return {
    editorStore,
    repository,
    recovery,
    storage: await repository.storageHealth(),
    library,
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
      await repository.rebuildSearchProjections();
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
    putImage: (image) => repository.putImage(image),
    getImage: (hash) => repository.getImage(hash),
    listImages: () => repository.listImages(),
    markImageUploaded: (hash, uploadedAtMs) =>
      repository.markImageUploaded(hash, uploadedAtMs),
    ...(import.meta.env.VITE_CONVEX_URL
      ? { shareCloud: createShareCloud(import.meta.env.VITE_CONVEX_URL) }
      : {}),
    subscribeLocalEdit(listener) {
      localEditListeners.add(listener);
      return () => localEditListeners.delete(listener);
    },
    async destroyLocalData() {
      await repository.destroy();
    },
  };
}
