import {
  collegeFieldProfile,
  highSchoolFieldProfile,
  nflFieldProfile,
  stickThunderPlay,
  type FieldProfile,
} from "@chalk/domain";
import {
  buildRenderScene,
  buildSvgRenderScene,
  createSvgProjection,
  editorSvgViewport,
  projectCoordinate,
  projectTranslation,
  unprojectPoint,
} from "@chalk/render";
import { describe, expect, it } from "vitest";

/**
 * Players and field markings must be drawn by the same projection. When they
 * were not, the markings were stretched half again wider than the Players, and
 * a split end standing five yards out of bounds was drawn comfortably inside
 * the sideline.
 */
describe("one projection draws the whole field", () => {
  const profiles: readonly (readonly [string, FieldProfile])[] = [
    ["high school", highSchoolFieldProfile],
    ["college", collegeFieldProfile],
    ["NFL", nflFieldProfile],
  ];

  it.each(profiles)(
    "puts a %s Player on the sideline onto the drawn sideline",
    (_name, profile) => {
      const scene = buildSvgRenderScene(
        buildRenderScene({ ...stickThunderPlay, fieldProfile: profile }),
      );
      const halfWidth = profile.widthYards / 2;

      const onLeftSideline = projectCoordinate(
        { lateralYards: -halfWidth, depthYards: 0 },
        scene.viewport,
      );
      const onRightSideline = projectCoordinate(
        { lateralYards: halfWidth, depthYards: 0 },
        scene.viewport,
      );
      const drawn = scene.field.sidelines
        .map(({ x1 }) => x1)
        .sort((left, right) => left - right);

      expect(onLeftSideline.x).toBeCloseTo(drawn[0]!, 6);
      expect(onRightSideline.x).toBeCloseTo(drawn[1]!, 6);
    },
  );

  it.each(profiles)(
    "spans the %s field across the drawn frame",
    (_name, profile) => {
      const scene = buildSvgRenderScene(
        buildRenderScene({ ...stickThunderPlay, fieldProfile: profile }),
      );
      const drawn = scene.field.sidelines
        .map(({ x1 }) => x1)
        .sort((left, right) => left - right);

      // Pins the lateral scale to the frame itself. Asserting only that
      // Players and markings agree would pass even if both were drawn on the
      // depth scale, which is how the original defect survived.
      expect(drawn[0]).toBeCloseTo(editorSvgViewport.fieldInsetX, 6);
      expect(drawn[1]).toBeCloseTo(
        editorSvgViewport.width - editorSvgViewport.fieldInsetX,
        6,
      );
    },
  );

  it("puts a Player on the midfield line onto the drawn midfield line", () => {
    const scene = buildSvgRenderScene(buildRenderScene(stickThunderPlay));
    const midfield = projectCoordinate(
      { lateralYards: 0, depthYards: 0 },
      scene.viewport,
    );
    const drawn = scene.field.sidelines.map(({ x1 }) => x1);

    expect(midfield.x).toBeCloseTo((drawn[0]! + drawn[1]!) / 2, 6);
  });

  it("puts a Player on the line of scrimmage onto the drawn line", () => {
    const scene = buildSvgRenderScene(buildRenderScene(stickThunderPlay));
    const onLine = projectCoordinate(
      { lateralYards: 0, depthYards: 0 },
      scene.viewport,
    );
    const drawn = scene.field.yardLines.find(
      ({ isLineOfScrimmage }) => isLineOfScrimmage,
    );

    expect(onLine.y).toBeCloseTo(drawn!.y1, 6);
  });

  it("draws the field anisotropically, as the original does", () => {
    const projection = createSvgProjection(highSchoolFieldProfile);

    // Depth stays readable while the full width fits across the frame; the
    // two scales are not interchangeable.
    expect(projection.depthPixelsPerYard).toBe(12);
    expect(projection.lateralPixelsPerYard).toBeCloseTo(18.3, 10);
    expect(projection.lateralPixelsPerYard).not.toBe(
      projection.depthPixelsPerYard,
    );
  });

  it("recovers the yards a drawn point came from", () => {
    const projection = createSvgProjection(
      highSchoolFieldProfile,
      editorSvgViewport,
    );

    for (const coordinate of [
      { lateralYards: 21.09, depthYards: -1.83 },
      { lateralYards: -26.6, depthYards: 30 },
      { lateralYards: 0, depthYards: 0 },
    ]) {
      const returned = unprojectPoint(
        projectCoordinate(coordinate, projection),
        projection,
      );
      expect(returned.lateralYards).toBeCloseTo(coordinate.lateralYards, 9);
      expect(returned.depthYards).toBeCloseTo(coordinate.depthYards, 9);
    }
  });

  it("keeps every seeded Player inside the drawn sidelines", () => {
    const scene = buildSvgRenderScene(buildRenderScene(stickThunderPlay));
    const [left, right] = scene.field.sidelines
      .map(({ x1 }) => x1)
      .sort((a, b) => a - b);

    for (const player of scene.players) {
      expect(player.position.x).toBeGreaterThanOrEqual(left!);
      expect(player.position.x).toBeLessThanOrEqual(right!);
    }
  });
});

describe("zone coverage", () => {
  /**
   * A zone drop the Coach has not sized still owns an area. The original
   * draws a small default bubble at the drop's end until the corner handle
   * is dragged, so a drop drawn today is not invisible until then.
   */
  const zonePlay = {
    ...stickThunderPlay,
    paths: [
      {
        id: "drop",
        kind: "zone" as const,
        playerId: "q",
        points: [
          { lateralYards: 0, depthYards: 0 },
          { lateralYards: 4, depthYards: 10 },
        ],
        branches: [],
        style: {
          line: "dashed" as const,
          ending: "bubble" as const,
          color: "blue" as const,
        },
      },
    ],
  };

  it("draws a default bubble for a drop that was never sized", () => {
    const scene = buildSvgRenderScene(buildRenderScene(zonePlay));
    const coverage = scene.paths[0]?.coverageArea;
    expect(coverage).toBeDefined();
    // Centred on the drop's end. The original's default is eleven canvas
    // pixels on both axes, so the bubble is round on the drawing and
    // elliptical on the grass.
    expect(coverage!.center).toEqual(
      projectCoordinate({ lateralYards: 4, depthYards: 10 }, scene.viewport),
    );
    expect(coverage!.radiusX).toBeCloseTo(11, 6);
    expect(coverage!.radiusY).toBeCloseTo(11, 6);
    // Ten yards deep in the middle of the field reads as a curl drop.
    expect(coverage!.type).toBe("curl");
  });

  it("keeps a sized zone's own radii", () => {
    const sized = {
      ...zonePlay,
      paths: [
        {
          ...zonePlay.paths[0]!,
          coverageArea: {
            type: "flat" as const,
            radiusLateralYards: 6,
            radiusDepthYards: 3,
          },
        },
      ],
    };
    const scene = buildSvgRenderScene(buildRenderScene(sized));
    const coverage = scene.paths[0]!.coverageArea!;
    expect(coverage.type).toBe("flat");
    expect(coverage.radiusX).toBeCloseTo(
      6 * scene.viewport.lateralPixelsPerYard,
      6,
    );
    expect(coverage.radiusY).toBeCloseTo(
      3 * scene.viewport.depthPixelsPerYard,
      6,
    );
  });

  it("leaves ordinary routes without a coverage area", () => {
    const scene = buildSvgRenderScene(buildRenderScene(stickThunderPlay));
    expect(
      scene.paths.filter(({ coverageArea }) => coverageArea !== undefined),
    ).toHaveLength(0);
  });

  it("translates a yard-space delta onto the anisotropic frame", () => {
    const projection = createSvgProjection(stickThunderPlay.fieldProfile);
    const delta = projectTranslation(
      { lateralYards: 1, depthYards: 1 },
      projection,
    );
    expect(delta.x).toBeCloseTo(projection.lateralPixelsPerYard, 6);
    expect(delta.y).toBeCloseTo(-projection.depthPixelsPerYard, 6);
  });
});
