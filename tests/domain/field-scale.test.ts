import {
  LEGACY_FIELD_GEOMETRY,
  highSchoolFieldProfile,
  legacyCanvasToYards,
  legacyDepthSpanToYards,
  legacyLateralSpanToYards,
  stickThunderPlay,
  yardsToLegacyCanvas,
  type PlayDocument,
} from "@chalk/domain";
import {
  defensivePlaybookGolden,
  offensivePlaybookGolden,
  footballPathPrimitivePlay,
  playerLabelPrimitivePlay,
} from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

/**
 * The original canvas is anisotropic — 18.3 pixels per yard across the field
 * against 12 downfield. Reading a crossfield span with the depth scale
 * overstates it by half, which is the defect recorded against the prototype
 * as review finding #3. These tests exist because the same mistake was made a
 * second time while converting the original's Plays into yard space, where a
 * compensating stretch in the renderer hid it.
 */
describe("legacy canvas conversion", () => {
  it("reads each axis on its own scale", () => {
    expect(LEGACY_FIELD_GEOMETRY.depthPixelsPerYard).toBe(12);
    expect(LEGACY_FIELD_GEOMETRY.lateralPixelsPerYard).toBeCloseTo(18.3, 10);
    // The scales differ by half again; treating them as one is the bug.
    expect(
      LEGACY_FIELD_GEOMETRY.lateralPixelsPerYard /
        LEGACY_FIELD_GEOMETRY.depthPixelsPerYard,
    ).toBeCloseTo(1.525, 10);
  });

  it("spans the full field width across the drawn canvas", () => {
    // 976 pixels of canvas carry the whole 160-foot field.
    const leftSideline = legacyCanvasToYards({ x: 500 - 488, y: 430 });
    const rightSideline = legacyCanvasToYards({ x: 500 + 488, y: 430 });

    expect(leftSideline.lateralYards).toBeCloseTo(
      -highSchoolFieldProfile.widthYards / 2,
      10,
    );
    expect(rightSideline.lateralYards).toBeCloseTo(
      highSchoolFieldProfile.widthYards / 2,
      10,
    );
  });

  it("round-trips a point back to the canvas it came from", () => {
    for (const point of [
      { x: 886, y: 452 },
      { x: 126, y: 372 },
      { x: 500, y: 430 },
    ]) {
      const returned = yardsToLegacyCanvas(legacyCanvasToYards(point));
      expect(returned.x).toBeCloseTo(point.x, 10);
      expect(returned.y).toBeCloseTo(point.y, 10);
    }
  });

  it("converts a span without moving it relative to the origin", () => {
    expect(legacyLateralSpanToYards(976)).toBeCloseTo(
      highSchoolFieldProfile.widthYards,
      10,
    );
    expect(legacyDepthSpanToYards(120)).toBe(10);
  });
});

describe("the seeded Play stands on the field", () => {
  const plays: readonly (readonly [string, PlayDocument])[] = [
    ["Stick — Thunder seed", stickThunderPlay],
    ["offensive golden", offensivePlaybookGolden.plays[0]!],
    ["defensive golden", defensivePlaybookGolden.plays[0]!],
    ["football path primitives", footballPathPrimitivePlay],
    ["player and label primitives", playerLabelPrimitivePlay],
  ];

  it.each(plays)("keeps every Player of the %s inbounds", (_name, play) => {
    const halfWidth = play.fieldProfile.widthYards / 2;
    const outside = play.players.filter(
      ({ position }) => Math.abs(position.lateralYards) > halfWidth,
    );

    expect(
      outside.map(({ id, position }) => `${id} at ${position.lateralYards}`),
    ).toEqual([]);
  });

  it("places the split end wide but inside the sideline", () => {
    const halfWidth = stickThunderPlay.fieldProfile.widthYards / 2;
    const splitEnd = stickThunderPlay.players.find(({ id }) => id === "z")!;

    // The original draws Z at canvas x 886, 386 pixels outside midfield.
    expect(splitEnd.position.lateralYards).toBeCloseTo(
      legacyLateralSpanToYards(386),
      10,
    );
    expect(splitEnd.position.lateralYards).toBeCloseTo(21.09, 2);
    expect(splitEnd.position.lateralYards).toBeLessThan(halfWidth);
  });

  it("gives the offensive line realistic splits", () => {
    const line = stickThunderPlay.players
      .filter(({ id }) => id.startsWith("ol"))
      .map(({ position }) => position.lateralYards)
      .sort((left, right) => left - right);

    const splits = line
      .slice(1)
      .map((lateral, index) => lateral - line[index]!);

    // Two-yard splits, not the six yards the depth scale would report.
    for (const split of splits) expect(split).toBeCloseTo(1.967, 3);
  });
});
