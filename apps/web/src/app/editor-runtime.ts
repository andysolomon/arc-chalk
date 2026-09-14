import {
  blankPlaybook,
  canonicalSha256,
  createStableId,
  decryptBackup,
  DEFAULT_PLAYBOOK_ID,
  emptyPlayDocument,
  encryptBackup,
  highSchoolFieldProfile,
  parseEncryptedBackup,
  serializeEncryptedBackup,
  searchPlays,
  gamePlanRevisionSummary,
  starterPlaybookEnvelope,
  stickThunderPlay,
  type Concept,
  type Formation,
  type GamePlan,
  type GamePlanRevision,
  type GamePlanRevisionSummary,
  type PlayDocument,
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

import {
  readCallSheetConfigs,
  readOutputPresets,
  readWristbandConfigs,
  type CallSheetConfig,
  type OutputPreset,
  type WristbandConfig,
} from "@chalk/exports";

import {
  GAME_DAY_KEY,
  defaultGameDayState,
  readGameDayState,
  type GameDayState,
} from "../library/game-day-state";
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

/**
 * How the Coach left the chrome: which panels stand open, which inspector
 * sections he unfolded, and the presets he starred or reached for lately.
 * Device-local, like favorites — it says how he works here, not what a Play
 * is (issue #64).
 */
export interface ChromeState {
  readonly inspectorOpen: boolean;
  readonly railOpen: boolean;
  /**
   * Whether the tool rail shows each tool's name beside its glyph (issue
   * #65). Unset until the Coach chooses: a touch screen shows them, a desk
   * with a pointer keeps the original's compact rail.
   */
  readonly railLabels?: boolean;
  /**
   * Whether the Coach left Chalk on Game Day (issue #67). A sideline device
   * that restarts — offline, after a background — opens on the plan he was
   * reading rather than on the editor.
   */
  readonly gameDay?: boolean;
  readonly open: Readonly<Record<string, boolean>>;
  readonly favoritePresets: readonly string[];
  readonly recentPresets: readonly string[];
}

export const CHROME_KEY = "chrome.v1";
export const OUTPUT_PRESETS_KEY = "output.presets.v1";
export const CALL_SHEET_KEY = "callSheet.v1";
export const WRISTBAND_KEY = "wristband.v1";

export const defaultChromeState: ChromeState = Object.freeze({
  inspectorOpen: true,
  railOpen: true,
  open: {},
  favoritePresets: [],
  recentPresets: [],
});

export function readChromeState(value: unknown): ChromeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultChromeState;
  }
  const record = value as Record<string, unknown>;
  const open =
    record.open &&
    typeof record.open === "object" &&
    !Array.isArray(record.open)
      ? Object.fromEntries(
          Object.entries(record.open as Record<string, unknown>).filter(
            (entry): entry is [string, boolean] =>
              typeof entry[1] === "boolean",
          ),
        )
      : {};
  return {
    inspectorOpen:
      typeof record.inspectorOpen === "boolean" ? record.inspectorOpen : true,
    railOpen: typeof record.railOpen === "boolean" ? record.railOpen : true,
    ...(typeof record.railLabels === "boolean"
      ? { railLabels: record.railLabels }
      : {}),
    ...(record.gameDay === true ? { gameDay: true } : {}),
    open,
    favoritePresets: readIds(record.favoritePresets),
    recentPresets: readIds(record.recentPresets),
  };
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
  loadChrome(): Promise<ChromeState>;
  saveChrome(state: ChromeState): Promise<void>;
  /** Where the Game Day reader was and what the coordinator wrote there (issue #67). */
  loadGameDay(): Promise<GameDayState>;
  saveGameDay(state: GameDayState): Promise<void>;
  /** The outputs the Coach ran lately, so one runs again in a click (issue #69). */
  loadOutputPresets(): Promise<readonly OutputPreset[]>;
  saveOutputPresets(presets: readonly OutputPreset[]): Promise<void>;
  /** How each plan's coordinator sheet is laid out, by plan id (issue #70). */
  loadCallSheetConfigs(): Promise<Readonly<Record<string, CallSheetConfig>>>;
  saveCallSheetConfig(planId: string, config: CallSheetConfig): Promise<void>;
  /** How each plan's wristband inserts are cut, by plan id (issue #71). */
  loadWristbandConfigs(): Promise<Readonly<Record<string, WristbandConfig>>>;
  saveWristbandConfig(planId: string, config: WristbandConfig): Promise<void>;
  getThumbnail(key: string): Promise<ThumbnailDerivative | undefined>;
  putThumbnail(thumbnail: ThumbnailDerivative): Promise<void>;
  getUndoHistory(
    playId: string,
  ): ReturnType<ChalkLocalRepository["getUndoHistory"]>;
  listPlayVersions(
    playId: string,
  ): ReturnType<ChalkLocalRepository["listPlayVersions"]>;
  /** Game Plans: curated, numbered views of this Playbook's Plays (ADR 0042). */
  listGamePlans(): Promise<readonly GamePlan[]>;
  getGamePlan(planId: string): Promise<GamePlan | undefined>;
  saveGamePlan(plan: GamePlan): Promise<void>;
  deleteGamePlan(planId: string): Promise<void>;
  /** The frozen revisions Prepare for game writes; the packet reads these. */
  saveGamePlanRevision(revision: GamePlanRevision): Promise<void>;
  getGamePlanRevision(
    revisionId: string,
  ): Promise<GamePlanRevision | undefined>;
  listGamePlanRevisions(
    planId: string,
  ): Promise<readonly GamePlanRevisionSummary[]>;
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
  playbookId = DEFAULT_PLAYBOOK_ID,
): LibrarySnapshot {
  return {
    playbook: blankPlaybook(playbookId),
    concepts: [],
    members: [],
  };
}

/**
 * Parity and interaction tests still need the Stick family on a fresh device.
 * Product boot stays blank unless this opt-in is set before the runtime opens.
 */
export function preferStarterSeed(
  storage: Pick<Storage, "getItem"> | undefined = safeSessionStorage(),
  search = safeLocationSearch(),
): boolean {
  try {
    if (storage?.getItem("chalk.seedStarter") === "1") return true;
  } catch {
    // Session storage may be blocked; fall through to the URL.
  }
  return new URLSearchParams(search).get("seed") === "starter";
}

function safeSessionStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

function safeLocationSearch(): string {
  try {
    return globalThis.location?.search ?? "";
  } catch {
    return "";
  }
}

async function mostRecentStoredPlay(
  repository: ChalkLocalRepository,
): Promise<StoredPlay | undefined> {
  const playbooks = await repository.listPlaybooks();
  let best: { playId: string; updatedAtMs: number } | undefined;
  for (const playbook of playbooks) {
    const members = await repository.listPlaySummaries(playbook.id);
    for (const member of members) {
      if (
        !best ||
        member.updatedAtMs > best.updatedAtMs ||
        (member.updatedAtMs === best.updatedAtMs &&
          member.playId === stickThunderPlay.id)
      ) {
        best = { playId: member.playId, updatedAtMs: member.updatedAtMs };
      }
    }
  }
  return best ? repository.getPlay(best.playId) : undefined;
}

async function ensurePlaybookRecord(
  repository: ChalkLocalRepository,
  playbookId: string,
): Promise<void> {
  if (await repository.loadPlaybook(playbookId)) return;
  await repository.savePlaybookRecord(blankPlaybook(playbookId, Date.now()));
}

interface InitialEditorDocument {
  readonly document: PlayDocument;
  readonly documentHash: string;
  readonly storedPlay?: StoredPlay;
  readonly playbookId: string;
}

async function resolveInitialEditorDocument(
  repository: ChalkLocalRepository,
  seedStarter: boolean,
): Promise<InitialEditorDocument> {
  const playbooks = await repository.listPlaybooks();
  if (playbooks.length === 0 && seedStarter) {
    await repository.savePlaybook(starterPlaybookEnvelope());
    const seeded = await repository.getPlay(stickThunderPlay.id);
    if (!seeded) {
      throw new Error("Chalk could not initialize the starter Play.");
    }
    return {
      document: seeded.document,
      documentHash: seeded.documentHash,
      storedPlay: seeded,
      playbookId: seeded.document.playbookId,
    };
  }

  const storedPlay = await mostRecentStoredPlay(repository);
  if (storedPlay) {
    return {
      document: storedPlay.document,
      documentHash: storedPlay.documentHash,
      storedPlay,
      playbookId: storedPlay.document.playbookId,
    };
  }

  const playbookId = playbooks[0]?.id ?? DEFAULT_PLAYBOOK_ID;
  const fieldProfile =
    (await repository.loadPlaybook(playbookId))?.playbook.fieldProfiles[0] ??
    highSchoolFieldProfile;
  const document = emptyPlayDocument({
    playbookId,
    fieldProfile,
  });
  return {
    document,
    documentHash: await canonicalSha256(document),
    playbookId,
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
  let chrome: ChromeState = defaultChromeState;
  let gameDay: GameDayState = defaultGameDayState;
  let outputPresets: readonly OutputPreset[] = [];
  let callSheets: Record<string, CallSheetConfig> = {};
  let wristbands: Record<string, WristbandConfig> = {};
  const gamePlans = new Map<string, GamePlan>();
  const gamePlanRevisions = new Map<string, GamePlanRevision>();
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
    loadChrome() {
      return Promise.resolve(chrome);
    },
    saveChrome(state) {
      chrome = state;
      return Promise.resolve();
    },
    loadGameDay() {
      return Promise.resolve(gameDay);
    },
    saveGameDay(state) {
      gameDay = state;
      return Promise.resolve();
    },
    loadOutputPresets() {
      return Promise.resolve(outputPresets);
    },
    saveOutputPresets(presets) {
      outputPresets = presets;
      return Promise.resolve();
    },
    loadCallSheetConfigs() {
      return Promise.resolve(callSheets);
    },
    saveCallSheetConfig(planId, config) {
      callSheets = { ...callSheets, [planId]: config };
      return Promise.resolve();
    },
    loadWristbandConfigs() {
      return Promise.resolve(wristbands);
    },
    saveWristbandConfig(planId, config) {
      wristbands = { ...wristbands, [planId]: config };
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
    listGamePlans() {
      return Promise.resolve(
        [...gamePlans.values()].sort(
          (left, right) => right.updatedAtMs - left.updatedAtMs,
        ),
      );
    },
    getGamePlan(planId) {
      return Promise.resolve(gamePlans.get(planId));
    },
    saveGamePlan(plan) {
      gamePlans.set(plan.id, plan);
      return Promise.resolve();
    },
    deleteGamePlan(planId) {
      gamePlans.delete(planId);
      for (const [id, revision] of gamePlanRevisions) {
        if (revision.planId === planId) gamePlanRevisions.delete(id);
      }
      return Promise.resolve();
    },
    saveGamePlanRevision(revision) {
      gamePlanRevisions.set(revision.id, revision);
      return Promise.resolve();
    },
    getGamePlanRevision(revisionId) {
      return Promise.resolve(gamePlanRevisions.get(revisionId));
    },
    listGamePlanRevisions(planId) {
      return Promise.resolve(
        [...gamePlanRevisions.values()]
          .filter((revision) => revision.planId === planId)
          .sort((left, right) => right.createdAtMs - left.createdAtMs)
          .map(gamePlanRevisionSummary),
      );
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

  const initial = await resolveInitialEditorDocument(
    repository,
    preferStarterSeed(),
  );
  const playbookId = initial.playbookId;
  const localEditListeners = new Set<() => void>();

  const persistence: EditorPersistence = {
    commitPlay: async (input) => {
      await ensurePlaybookRecord(repository, input.play.playbookId);
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
    initialDocument: initial.document,
    initialDocumentHash: initial.documentHash,
    initialUndoHistory: initial.storedPlay
      ? await repository.getUndoHistory(initial.storedPlay.id)
      : undefined,
    initialVersions: initial.storedPlay
      ? await repository.listPlayVersions(initial.storedPlay.id)
      : [],
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
    async loadChrome() {
      return readChromeState(
        (await repository.getPreference(CHROME_KEY))?.value,
      );
    },
    async saveChrome(state) {
      await rememberJson(CHROME_KEY, state);
    },
    async loadGameDay() {
      return readGameDayState(
        (await repository.getPreference(GAME_DAY_KEY))?.value,
      );
    },
    async saveGameDay(state) {
      await rememberJson(GAME_DAY_KEY, state);
    },
    async loadOutputPresets() {
      return readOutputPresets(
        (await repository.getPreference(OUTPUT_PRESETS_KEY))?.value,
      );
    },
    async saveOutputPresets(presets) {
      await rememberJson(OUTPUT_PRESETS_KEY, presets);
    },
    async loadCallSheetConfigs() {
      return readCallSheetConfigs(
        (await repository.getPreference(CALL_SHEET_KEY))?.value,
      );
    },
    async saveCallSheetConfig(planId, config) {
      const current = readCallSheetConfigs(
        (await repository.getPreference(CALL_SHEET_KEY))?.value,
      );
      await rememberJson(CALL_SHEET_KEY, { ...current, [planId]: config });
    },
    async loadWristbandConfigs() {
      return readWristbandConfigs(
        (await repository.getPreference(WRISTBAND_KEY))?.value,
      );
    },
    async saveWristbandConfig(planId, config) {
      const current = readWristbandConfigs(
        (await repository.getPreference(WRISTBAND_KEY))?.value,
      );
      await rememberJson(WRISTBAND_KEY, { ...current, [planId]: config });
    },
    getThumbnail: (key) => repository.getThumbnail(key),
    putThumbnail: (thumbnail) => repository.putThumbnail(thumbnail),
    getUndoHistory: (playId) => repository.getUndoHistory(playId),
    listPlayVersions: (playId) => repository.listPlayVersions(playId),
    listGamePlans: () => repository.listGamePlans(playbookId),
    getGamePlan: (planId) => repository.getGamePlan(planId),
    saveGamePlan: (plan) => repository.saveGamePlan(plan),
    deleteGamePlan: (planId) => repository.deleteGamePlan(planId),
    saveGamePlanRevision: (revision) =>
      repository.saveGamePlanRevision(revision),
    getGamePlanRevision: (revisionId) =>
      repository.getGamePlanRevision(revisionId),
    listGamePlanRevisions: (planId) => repository.listGamePlanRevisions(planId),
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
