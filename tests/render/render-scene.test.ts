import { canonicalStringify } from "@chalk/domain";
import { buildRenderScene, buildSvgRenderScene } from "@chalk/render";
import {
  footballPathPrimitivePlay,
  stickThunderPlay,
} from "@chalk/test-fixtures";
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
    expect(scene.paths.find(({ id }) => id === "rx")?.strokes[0]?.d).toBe(
      "M 332.667 417.833 L 324 378.833 L 126.833 331.167",
    );
    expect(scene.paths.find(({ id }) => id === "rz")?.branches[0]).toEqual({
      id: "rz-branch-0",
      strokes: [
        {
          id: "rz-branch-0",
          d: "M 950.167 248.833 L 978.333 58.167",
          style: {
            line: "dotted",
            ending: "arrow",
            color: "ink",
          },
        },
      ],
      ticks: [],
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

  it("projects every original football path primitive behind one interface", () => {
    const first = buildSvgRenderScene(
      buildRenderScene(footballPathPrimitivePlay),
    );
    const second = buildSvgRenderScene(
      buildRenderScene(structuredClone(footballPathPrimitivePlay)),
    );

    expect(canonicalStringify(first)).toBe(canonicalStringify(second));
    expect(first.paths.map(({ kind }) => kind)).toEqual([
      "route",
      "motion",
      "block",
      "zone",
      "blitz",
      "stunt",
      "ball",
    ]);

    const route = first.paths.find(({ id }) => id === "path-route")!;
    expect(route.strokes).toHaveLength(2);
    expect(route.strokes[0]).toMatchObject({
      style: { line: "solid", ending: "diamond", color: "ink" },
    });
    expect(route.strokes[0]?.d).toContain(" Q ");
    expect(route.strokes[1]).toMatchObject({
      style: { line: "dotted", ending: "hook", color: "ink" },
    });
    expect(route.branches[0]?.strokes[0]?.style.ending).toBe("square");

    const motion = first.paths.find(({ id }) => id === "path-motion")!;
    expect(motion.variant).toBe("alternate");
    expect(motion.strokes[0]?.d.match(/ L /g)?.length).toBeGreaterThan(10);

    const block = first.paths.find(({ id }) => id === "path-block")!;
    expect(block.strokes[0]?.style.ending).toBe("bar");
    expect(block.ticks).toHaveLength(1);
    expect(block.ticks[0]?.color).toBe("green");

    const zone = first.paths.find(({ id }) => id === "path-zone")!;
    expect(zone.coverageArea).toEqual({
      id: "path-zone-coverage",
      type: "curl",
      center: { x: 571, y: 225 },
      radiusX: 68.25,
      radiusY: 32.5,
      fill: "#8B3FE0",
    });
    expect(zone.strokes[0]?.style.ending).toBe("none");

    expect(
      first.paths.find(({ id }) => id === "path-stunt")?.strokes[0]?.style,
    ).toMatchObject({ ending: "chevron", color: "orange" });
    expect(
      first.paths.find(({ id }) => id === "path-ball")?.strokes[0]?.style,
    ).toMatchObject({ ending: "dot", color: "gray" });
  });
});
