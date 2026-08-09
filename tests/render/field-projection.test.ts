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
    expect(projection.depthPixelsPerYard).toBe(13);
    expect(projection.lateralPixelsPerYard).toBeCloseTo(19.575, 3);
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
