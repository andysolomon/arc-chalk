import { searchPlays, type PlaySearchQuery, type SearchablePlay } from "@chalk/domain";

export interface PlaySearchWorkerRequest {
  readonly id: number;
  readonly plays: readonly SearchablePlay[];
  readonly query: PlaySearchQuery;
}

export interface PlaySearchWorkerResponse {
  readonly id: number;
  readonly hits: ReturnType<typeof searchPlays>;
}

self.addEventListener("message", (event: MessageEvent<PlaySearchWorkerRequest>) => {
  const { id, plays, query } = event.data;
  const response: PlaySearchWorkerResponse = {
    id,
    hits: searchPlays(plays, query),
  };
  self.postMessage(response);
});
