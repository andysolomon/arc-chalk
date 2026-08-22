import { planPlay, stickThunderPlay } from "@chalk/domain";
import { buildRenderScene } from "@chalk/render";
import { describe, expect, it } from "vitest";

describe("animated RenderScene", () => {
  it("keeps the static diagram at rest and moves men once a frame is asked for", () => {
    const rest = buildRenderScene(stickThunderPlay);
    const x = rest.players.find((player) => player.id === "x")!;
    expect(x.position).toEqual(
      stickThunderPlay.players.find((player) => player.id === "x")!.position,
    );

    const plan = planPlay(stickThunderPlay);
    const finish = buildRenderScene(stickThunderPlay, {
      atMs: plan.endMs,
      playing: true,
    });
    const moved = finish.players.find((player) => player.id === "x")!;
    expect(moved.position.depthYards).not.toBeCloseTo(x.position.depthYards, 1);
    expect(finish.paths.some((path) => path.opacity === 0.18)).toBe(true);
    expect(finish.paths.some((path) => path.trail === true)).toBe(true);
  });

  it("does not ghost the diagram when time is the timeline start and nothing is playing", () => {
    const plan = planPlay(stickThunderPlay);
    const rest = buildRenderScene(stickThunderPlay, { atMs: plan.startMs });
    expect(rest.paths.every((path) => path.opacity === undefined)).toBe(true);
    expect(rest.paths.every((path) => path.trail !== true)).toBe(true);
  });
});
