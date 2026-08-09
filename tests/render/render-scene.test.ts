import { canonicalStringify } from "@chalk/domain";
import { buildRenderScene, buildSvgRenderScene } from "@chalk/render";
import {
  footballPathPrimitivePlay,
  playerLabelPrimitivePlay,
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

    // The Quarterback is on the midfield line, so he lands on the drawn
    // midfield line rather than two pixels beside it.
    expect(scene.players.find(({ id }) => id === "q")?.position).toEqual({
      x: 534,
      y: 446,
    });
    expect(scene.paths.find(({ id }) => id === "rx")?.strokes[0]?.d).toBe(
      "M 337.18 417.833 L 328.623 378.833 L 133.943 331.167",
    );
    expect(scene.paths.find(({ id }) => id === "rz")?.branches[0]).toEqual({
      id: "rz-branch-0",
      strokes: [
        {
          id: "rz-branch-0",
          d: "M 946.893 248.833 L 974.705 58.167",
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
      center: { x: 592.725, y: 225 },
      // 5.25 yards across and 2.5 yards deep, each on its own scale.
      radiusX: 102.76875,
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

  it("projects every original player and label primitive behind one interface", () => {
    const first = buildSvgRenderScene(
      buildRenderScene(playerLabelPrimitivePlay),
    );
    const second = buildSvgRenderScene(
      buildRenderScene(structuredClone(playerLabelPrimitivePlay)),
    );

    expect(canonicalStringify(first)).toBe(canonicalStringify(second));
    expect(
      first.players.map(({ shapes }) => shapes.map(({ kind }) => kind)),
    ).toEqual([
      ["circle"],
      ["rect", "path"],
      ["ellipse"],
      ["path", "path"],
      ["circle", "path"],
      [],
    ]);
    expect(first.players[1]?.shapes[1]).toMatchObject({
      kind: "path",
      d: "M0 -12 L12 -12 L12 12 L0 12 Z",
      fill: "#0072F5",
    });
    expect(first.players[2]?.texts[0]).toMatchObject({
      text: "B",
      fill: "#FFFFFF",
    });
    expect(first.players[5]).toMatchObject({
      role: "middle-linebacker",
      group: "linebackers",
      ariaLabel: "M defense player",
    });

    const progression = first.labels.find(
      ({ id }) => id === "label-progression",
    )!;
    expect(progression.box).toMatchObject({
      kind: "circle",
      fill: "#FFFFFF",
      stroke: "#0072F5",
    });
    expect(
      first.labels.find(({ id }) => id === "label-assignment")?.text,
    ).toMatchObject({
      text: "SETTLE",
      fontFamily: "Geist Mono, monospace",
      letterSpacing: 0.6,
    });
    expect(
      first.labels.find(({ id }) => id === "label-alert")?.leader,
    ).toMatchObject({
      x2: 808.05,
      y2: 264,
      stroke: "#E5484D",
      strokeDasharray: "4 3",
      endpointRadius: 2.6,
    });
    expect(
      first.labels.find(({ id }) => id === "label-coaching")?.position,
    ).toEqual({ x: 220.8, y: 303 });
  });
});
