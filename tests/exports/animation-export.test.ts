import { stickThunderPlay } from "@chalk/domain";
import {
  frameSequenceManifest,
  playFileBase,
  progressionStripHtml,
} from "@chalk/exports";
import { describe, expect, it } from "vitest";

describe("animation exports", () => {
  it("writes a snap-relative frame-sequence manifest", () => {
    const manifest = frameSequenceManifest(stickThunderPlay);
    expect(manifest).toContain("Stick — Thunder — frame sequence");
    expect(manifest).toContain("0.2s per frame");
    expect(manifest).toContain("snap at 0.0s");
    expect(manifest).toMatch(/01 {2}Stick-Thunder-01\.png/);
    expect(playFileBase("Stick — Thunder")).toBe("Stick-Thunder");
  });

  it("lays four captioned frames on one letter-landscape sheet", () => {
    const html = progressionStripHtml({
      playName: "Stick — Thunder",
      frames: [
        { name: "Snap", clock: "0.0s", svgMarkup: "<svg></svg>" },
        { name: "First break", clock: "0.8s", svgMarkup: "<svg></svg>" },
        { name: "Throw", clock: "1.6s", svgMarkup: "<svg></svg>" },
        { name: "Finish", clock: "3.1s", svgMarkup: "<svg></svg>" },
      ],
    });
    expect(html).toContain("letter landscape");
    expect(html).toContain("Snap");
    expect(html).toContain("First break");
    expect(html).toContain("Throw");
    expect(html).toContain("Finish");
    expect(html.match(/class="fr"/g)?.length).toBe(4);
  });
});
