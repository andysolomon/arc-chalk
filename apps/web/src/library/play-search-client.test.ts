import { searchPlays } from "@chalk/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMainThreadSearchClient,
  createPlaySearchClient,
  projectionsForHits,
} from "./play-search-client";

/**
 * A Worker that answers the way the real one does, and records when it is
 * terminated, so a test can prove the client is still alive afterwards.
 */
class FakeSearchWorker extends EventTarget {
  static spawned: FakeSearchWorker[] = [];
  terminated = false;
  constructor() {
    super();
    FakeSearchWorker.spawned.push(this);
  }
  postMessage(data: {
    id: number;
    plays: Parameters<typeof searchPlays>[0];
    query: Parameters<typeof searchPlays>[1];
  }) {
    if (this.terminated) return;
    queueMicrotask(() => {
      this.dispatchEvent(
        new MessageEvent("message", {
          data: { id: data.id, hits: searchPlays(data.plays, data.query) },
        }),
      );
    });
  }
  terminate() {
    this.terminated = true;
  }
}

describe("Play search client", () => {
  const plays = Array.from({ length: 2_000 }, (_, index) => ({
    playId: `play_${index}`,
    playbookId: "playbook_a",
    name: index === 7 ? "Stick — Thunder" : `Play ${index}`,
    unit: "offense" as const,
    tags: index === 7 ? ["3rd down"] : [],
    playerRoles: [],
    assignmentText: [],
    notes: "",
  }));

  it("falls back to the same answers as the pure search on the main thread", async () => {
    const client = createMainThreadSearchClient();
    const query = { text: "stick" };
    await expect(client.search(plays, query)).resolves.toEqual(
      searchPlays(plays, query),
    );
    client.dispose();
  });

  describe("with a Worker", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      FakeSearchWorker.spawned = [];
    });

    it("keeps answering after a dispose, as a development double-mount needs", async () => {
      vi.stubGlobal("Worker", FakeSearchWorker);
      const client = createPlaySearchClient();
      await expect(client.search(plays, { text: "stick" })).resolves.toEqual(
        searchPlays(plays, { text: "stick" }),
      );
      expect(FakeSearchWorker.spawned).toHaveLength(1);

      // React's development StrictMode runs the unmount cleanup once before
      // the real mount; the memoized client must survive it.
      client.dispose();
      expect(FakeSearchWorker.spawned[0]?.terminated).toBe(true);
      await expect(client.search(plays, { text: "thunder" })).resolves.toEqual(
        searchPlays(plays, { text: "thunder" }),
      );
      expect(FakeSearchWorker.spawned).toHaveLength(2);
      client.dispose();
    });
  });

  it("maps ranked hits back onto metadata records without loading Plays", () => {
    const hits = searchPlays(plays, { text: "thunder" });
    expect(projectionsForHits(plays, hits).map(({ playId }) => playId)).toEqual(
      ["play_7"],
    );
  });
});
