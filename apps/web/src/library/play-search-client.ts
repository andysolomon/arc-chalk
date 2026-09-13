import {
  searchPlays,
  type PlaySearchHit,
  type PlaySearchQuery,
  type SearchablePlay,
} from "@chalk/domain";

/**
 * Worker-built local search with a main-thread fallback. Tests and browsers
 * that cannot spawn a module Worker still get the same answers; the Worker
 * exists so a 2,000-Play query cannot stall the field.
 */
export interface PlaySearchClient {
  search(
    plays: readonly SearchablePlay[],
    query: PlaySearchQuery,
  ): Promise<readonly PlaySearchHit[]>;
  dispose(): void;
}

type Waiter = {
  readonly resolve: (hits: readonly PlaySearchHit[]) => void;
  readonly reject: (error: unknown) => void;
};

/**
 * The Worker is spawned on the first search and again after a dispose, so a
 * client that outlives one mount — React's development double-mount
 * disposes it once before the real mount — keeps answering rather than
 * posting into a terminated Worker that never replies.
 */
export function createPlaySearchClient(): PlaySearchClient {
  if (typeof Worker !== "function") return createMainThreadSearchClient();
  let worker: Worker | undefined;
  let nextId = 1;
  const pending = new Map<number, Waiter>();
  const fallback = createMainThreadSearchClient();

  const spawn = (): Worker | undefined => {
    if (worker) return worker;
    try {
      const spawned = new Worker(
        new URL("./search.worker.ts", import.meta.url),
        { type: "module" },
      );
      spawned.addEventListener("message", (event: MessageEvent) => {
        const data = event.data as {
          id?: number;
          hits?: readonly PlaySearchHit[];
        };
        if (typeof data.id !== "number" || !data.hits) return;
        pending.get(data.id)?.resolve(data.hits);
        pending.delete(data.id);
      });
      spawned.addEventListener("error", (event) => {
        for (const waiter of pending.values()) waiter.reject(event);
        pending.clear();
      });
      worker = spawned;
      return spawned;
    } catch {
      return undefined;
    }
  };

  return {
    search(plays, query) {
      const target = spawn();
      if (!target) return fallback.search(plays, query);
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        target.postMessage({ id, plays, query });
      });
    },
    dispose() {
      worker?.terminate();
      worker = undefined;
      pending.clear();
    },
  };
}

export function createMainThreadSearchClient(): PlaySearchClient {
  return {
    search(plays, query) {
      return Promise.resolve(searchPlays(plays, query));
    },
    dispose() {
      return undefined;
    },
  };
}

export function projectionsForHits<T extends { readonly playId: string }>(
  items: readonly T[],
  hits: readonly PlaySearchHit[],
): readonly T[] {
  const byId = new Map(items.map((item) => [item.playId, item]));
  return hits.flatMap((hit) => {
    const item = byId.get(hit.playId);
    return item ? [item] : [];
  });
}
