import { stickThunderPlay } from "@chalk/domain";
import {
  buildRenderScene,
  buildSvgRenderScene,
  FADED_GROUP_OPACITY,
} from "@chalk/render";
import { describe, expect, it } from "vitest";

describe("scene emphasis and line weight", () => {
  it("fades everyone outside the emphasised set and strips their coaching", () => {
    const scene = buildRenderScene(stickThunderPlay, {
      emphasis: { playerIds: new Set(["x", "z"]) },
    });
    const x = scene.players.find(({ id }) => id === "x")!;
    const q = scene.players.find(({ id }) => id === "q")!;
    expect(x.opacity).toBeUndefined();
    expect(q.opacity).toBe(FADED_GROUP_OPACITY);
    const rx = scene.paths.find(({ id }) => id === "rx")!;
    const ry = scene.paths.find(({ id }) => id === "ry")!;
    expect(rx.opacity).toBeUndefined();
    expect(ry.opacity).toBe(FADED_GROUP_OPACITY);
    expect(ry.assignment).toBeUndefined();
    // Nobody is removed — the sheet keeps its context.
    expect(scene.players).toHaveLength(stickThunderPlay.players.length);
    const svg = buildSvgRenderScene(scene);
    expect(svg.players.find(({ id }) => id === "q")?.opacity).toBe(0.22);
  });

  it("carries a line-weight override through to the SVG scene", () => {
    const svg = buildSvgRenderScene(
      buildRenderScene(stickThunderPlay, { lineWeight: 1.5 }),
    );
    expect(svg.lineWeight).toBe(1.5);
    expect(
      buildSvgRenderScene(buildRenderScene(stickThunderPlay)).lineWeight,
    ).toBeUndefined();
  });
});
