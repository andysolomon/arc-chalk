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

export function createPlaySearchClient(): PlaySearchClient {
  if (typeof Worker !== "function") return createMainThreadSearchClient();
  try {
    const worker = new Worker(new URL("./search.worker.ts", import.meta.url), {
      type: "module",
    });
    let nextId = 1;
    const pending = new Map<
      number,
      {
        readonly resolve: (hits: readonly PlaySearchHit[]) => void;
        readonly reject: (error: unknown) => void;
      }
    >();
    worker.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as {
        id?: number;
        hits?: readonly PlaySearchHit[];
      };
      if (typeof data.id !== "number" || !data.hits) return;
      pending.get(data.id)?.resolve(data.hits);
      pending.delete(data.id);
    });
    worker.addEventListener("error", (event) => {
      for (const waiter of pending.values()) waiter.reject(event);
      pending.clear();
    });
    return {
      search(plays, query) {
        const id = nextId;
        nextId += 1;
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          worker.postMessage({ id, plays, query });
        });
      },
      dispose() {
        worker.terminate();
        pending.clear();
      },
    };
  } catch {
    return createMainThreadSearchClient();
  }
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
