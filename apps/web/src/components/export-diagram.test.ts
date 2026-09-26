import { stickThunderPlay } from "@chalk/domain";
import { describe, expect, it } from "vitest";

import { createDiagramRenderer } from "./export-diagram";

describe("createDiagramRenderer", () => {
  it("renders the Play through the editor's field with overrides applied", () => {
    const render = createDiagramRenderer();
    const markup = render(stickThunderPlay, {
      typePreset: "print",
      lineWeight: 1.5,
      layers: { text: false },
      emphasisPlayerIds: new Set(["x"]),
    });
    expect(markup.startsWith("<svg")).toBe(true);
    expect(markup).toContain('data-type-preset="print"');
    expect(markup).toContain('stroke-width="1.5"');
    expect(markup).not.toContain("data-scene-label");
    expect(markup).toContain('data-scene-player="q"');
    expect(markup).toMatch(/data-scene-player="q"[^>]*opacity="0.22"/);
    expect(markup).toMatch(/data-scene-player="x"[^>]*opacity="1"/);
  });

  it("renders an animation frame when asked for a time", () => {
    const render = createDiagramRenderer();
    const still = render(stickThunderPlay);
    const frame = render(stickThunderPlay, { atMs: 800 });
    expect(frame).not.toBe(still);
    expect(frame).toContain("data-scene-trail");
  });
});
