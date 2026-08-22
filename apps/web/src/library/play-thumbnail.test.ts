import { playThumbnailKey, stickThunderPlay } from "@chalk/domain";
import { describe, expect, it } from "vitest";

import { playThumbnailSvg, thumbnailKeyForPlay } from "./play-thumbnail";

describe("Play thumbnails", () => {
  it("keys a derivative by Play, revision, renderer, Field Profile, and theme", () => {
    expect(thumbnailKeyForPlay(stickThunderPlay, "abc123")).toBe(
      playThumbnailKey({
        playId: stickThunderPlay.id,
        revisionHash: "abc123",
        fieldProfileRevision: stickThunderPlay.fieldProfile.revision,
      }),
    );
  });

  it("draws a cancelable SVG picture from the Play's men and lines", () => {
    const svg = playThumbnailSvg(stickThunderPlay);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<circle");
    expect(svg).toContain("<path");
  });
});
