import { CHALK_LOCAL_DATABASE_VERSION } from "@chalk/local-db";

/**
 * Builds a device database the way a released build left it, writing straight
 * through IndexedDB instead of through the current repository. A fixture the
 * current code produced could only ever prove that today's code agrees with
 * itself; these records are the shapes Chalk actually shipped.
 */
export interface ReleasedDatabaseFixture {
  readonly databaseName: string;
  readonly version: number;
  readonly records: Readonly<Record<string, readonly unknown[]>>;
}

/** The object stores and key paths of released database version 1. */
const releasedStores: Readonly<
  Record<number, Readonly<Record<string, string>>>
> = {
  1: {
    playbooks: "id",
    concepts: "id",
    formations: "id",
    plays: "id",
    revisions: "id",
    syncMutations: "id",
    conflicts: "id",
    preferences: "key",
    imageBlobs: "hash",
    undoHistories: "playId",
    searchProjections: "playId",
    thumbnails: "key",
  },
};

const releasedIndexes: Readonly<
  Record<number, Readonly<Record<string, readonly [string, string][]>>>
> = {
  1: {
    concepts: [["playbookId", "playbookId"]],
    formations: [["playbookId", "playbookId"]],
    plays: [["playbookId", "playbookId"]],
    revisions: [["playId", "playId"]],
    searchProjections: [["playbookId", "playbookId"]],
    thumbnails: [["playId", "playId"]],
  },
};

function failure(error: DOMException | null, what: string): Error {
  return error ?? new Error(`IndexedDB ${what} failed without an error.`);
}

function request<Result>(source: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(failure(source.error, "request"));
  });
}

export async function writeReleasedDatabase(
  factory: IDBFactory,
  fixture: ReleasedDatabaseFixture,
): Promise<void> {
  const stores = releasedStores[fixture.version];
  const indexes = releasedIndexes[fixture.version] ?? {};
  if (!stores) {
    throw new Error(
      `No released database layout is recorded for version ${fixture.version}.`,
    );
  }

  const open = factory.open(fixture.databaseName, fixture.version);
  open.onupgradeneeded = () => {
    const database = open.result;
    for (const [name, keyPath] of Object.entries(stores)) {
      const store = database.createObjectStore(name, { keyPath });
      for (const [indexName, indexKeyPath] of indexes[name] ?? []) {
        store.createIndex(indexName, indexKeyPath);
      }
    }
  };
  const database = await request(open);

  const names = Object.keys(fixture.records);
  if (names.length > 0) {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(names, "readwrite");
      for (const name of names) {
        const store = transaction.objectStore(name);
        for (const record of fixture.records[name] ?? []) store.put(record);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(failure(transaction.error, "transaction"));
      transaction.onabort = () =>
        reject(failure(transaction.error, "transaction"));
    });
  }
  database.close();
}

export async function readRawRecords<Record_ = unknown>(
  factory: IDBFactory,
  databaseName: string,
  storeName: string,
): Promise<readonly Record_[]> {
  const database = await request(factory.open(databaseName));
  try {
    const records = await request<unknown[]>(
      database.transaction(storeName).objectStore(storeName).getAll(),
    );
    return records as Record_[];
  } finally {
    database.close();
  }
}

export { CHALK_LOCAL_DATABASE_VERSION };
