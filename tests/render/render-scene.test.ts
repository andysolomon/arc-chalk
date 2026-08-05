import { canonicalStringify } from "@chalk/domain";
import { buildRenderScene, buildSvgRenderScene } from "@chalk/render";
import { stickThunderPlay } from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

describe("RenderScene", () => {
  it("derives one deterministic scene from the canonical Play", () => {
    const first = buildRenderScene(stickThunderPlay);
    const second = buildRenderScene(structuredClone(stickThunderPlay));

    expect(canonicalStringify(first)).toBe(canonicalStringify(second));
    expect(first.schemaVersion).toBe(2);
    expect(first.playId).toBe("play-8lkpvgj");
    expect(first.players).toHaveLength(11);
    expect(first.paths.at(-1)?.branches).toHaveLength(1);
    expect(first.field.lineOfScrimmageDepthYards).toBe(0);
  });

  it("projects yard geometry into deterministic editor SVG primitives", () => {
    const scene = buildSvgRenderScene(buildRenderScene(stickThunderPlay));

    expect(scene.players.find(({ id }) => id === "q")?.position).toEqual({
      x: 532,
      y: 446,
    });
    expect(scene.paths.find(({ id }) => id === "rx")?.d).toBe(
      "M 332.667 417.833 L 324 378.833 L 126.833 331.167",
    );
    expect(scene.paths.find(({ id }) => id === "rz")?.branches[0]).toEqual({
      id: "rz-branch-0",
      d: "M 950.167 248.833 L 978.333 58.167",
      style: {
        line: "dotted",
        ending: "arrow",
        color: "ink",
      },
    });
    expect(scene.paths.find(({ id }) => id === "rh")?.ticks).toHaveLength(1);
    expect(scene.field.sidelines).toHaveLength(2);
    expect(scene.field.yardLines).toHaveLength(9);
    expect(scene.field.hashMarks).toHaveLength(64);
    expect(scene.field.sidelineMarks).toHaveLength(64);
    expect(scene.field.numbers).toHaveLength(8);
    expect(
      scene.field.yardLines.find(({ isLineOfScrimmage }) =>
        Boolean(isLineOfScrimmage),
      )?.y1,
    ).toBe(394);
  });
});
