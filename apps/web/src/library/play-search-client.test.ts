import { searchPlays } from "@chalk/domain";
import { describe, expect, it } from "vitest";

import {
  createMainThreadSearchClient,
  projectionsForHits,
} from "./play-search-client";

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

  it("maps ranked hits back onto metadata records without loading Plays", () => {
    const hits = searchPlays(plays, { text: "thunder" });
    expect(projectionsForHits(plays, hits).map(({ playId }) => playId)).toEqual(
      ["play_7"],
    );
  });
});
