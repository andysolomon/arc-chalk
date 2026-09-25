import { stickThunderPlay } from "@chalk/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryLibrary } from "../app/editor-runtime";
import { createThumbnailScheduler } from "./thumbnail-scheduler";

const library = () =>
  createMemoryLibrary(undefined, [
    {
      id: stickThunderPlay.id,
      playbookId: stickThunderPlay.playbookId,
      document: stickThunderPlay,
      documentHash: "hash_1",
      updatedAtMs: 1,
    },
  ]);

const request = { playId: stickThunderPlay.id, documentHash: "hash_1" };

describe("play thumbnails", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("still draws for a card that joined a run its starter let go of", async () => {
    // A card that re-renders cancels its first request and asks again; the
    // second ask lands on the run the first one started and then abandoned.
    let made = 0;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => `blob:thumb-${(made += 1)}`,
      revokeObjectURL: () => undefined,
    });
    const scheduler = createThumbnailScheduler(library());
    const first = new AbortController();
    const abandoned = scheduler.urlFor(request, first.signal);
    const waiting = scheduler.urlFor(request, new AbortController().signal);
    const gone = new AbortController();
    const alsoGone = scheduler.urlFor(request, gone.signal);
    first.abort();
    gone.abort();

    expect(await abandoned).toBeUndefined();
    expect(await alsoGone).toBeUndefined();
    expect(await waiting).toBe("blob:thumb-1");
    // Once drawn, every later card reads the same picture.
    expect(await scheduler.urlFor(request)).toBe("blob:thumb-1");
    scheduler.dispose();
  });
});
