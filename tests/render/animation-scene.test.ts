import { planPlay, stickThunderPlay } from "@chalk/domain";
import { buildRenderScene } from "@chalk/render";
import { describe, expect, it } from "vitest";

describe("animated RenderScene", () => {
  it("keeps the static diagram on the stance written on the Play", () => {
    const rest = buildRenderScene(stickThunderPlay);
    const x = rest.players.find((player) => player.id === "x")!;
    expect(x.position).toEqual(
      stickThunderPlay.players.find((player) => player.id === "x")!.position,
    );
  });

  it("does not ghost the diagram when time is the timeline start and nothing is playing", () => {
    const plan = planPlay(stickThunderPlay);
    const rest = buildRenderScene(stickThunderPlay, { atMs: plan.startMs });
    expect(rest.paths.every((path) => path.opacity === undefined)).toBe(true);
    expect(rest.paths.every((path) => path.trail !== true)).toBe(true);
  });
});
