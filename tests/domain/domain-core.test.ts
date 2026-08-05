import {
  buildFieldLandmarks,
  buildPathGeometry,
  canonicalSha256,
  canonicalStringify,
  collegeFieldProfile,
  evaluateMovement,
  highSchoolFieldProfile,
  legacyCanvasToYards,
  migrateLegacyPlay,
  migrateLegacyFieldProfile,
  migratePlayDocument,
  mirrorCoordinate,
  mirrorPlayGeometry,
  nflFieldProfile,
  pathLength,
  playDocumentSchema,
  pointAtDistance,
  yardsToLegacyCanvas,
} from "@chalk/domain";
import {
  footballPathPrimitivePlay,
  stickThunderPlay,
} from "@chalk/test-fixtures";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("canonical Play documents", () => {
  it("migrates the seeded original Play into strict yard-space data", () => {
    expect(playDocumentSchema.parse(stickThunderPlay)).toEqual(
      stickThunderPlay,
    );
    expect(stickThunderPlay.schemaVersion).toBe(2);
    expect(stickThunderPlay.players).toHaveLength(11);
    expect(stickThunderPlay.paths).toHaveLength(5);
    expect(stickThunderPlay.labels).toHaveLength(12);
    expect(stickThunderPlay.fieldProfile).toEqual(highSchoolFieldProfile);
    expect(
      stickThunderPlay.players.find((player) => player.id === "q")?.position,
    ).toEqual({
      lateralYards: 0,
      depthYards: -4,
    });
  });

  it("serializes equivalent key order to one hash", async () => {
    const left = { z: [3, { b: true, a: "chalk" }], a: -0 };
    const right = { a: 0, z: [3, { a: "chalk", b: true }] };

    expect(canonicalStringify(left)).toBe(canonicalStringify(right));
    expect(await canonicalSha256(left)).toBe(await canonicalSha256(right));
  });

  it("evaluates distance along a route independently of render pixels", () => {
    const path = stickThunderPlay.paths.find(
      (candidate) => candidate.id === "rx",
    )!;
    const length = pathLength(path);
    const halfway = pointAtDistance(path, length / 2);

    expect(length).toBeGreaterThan(15);
    expect(halfway.lateralYards).toBeLessThan(path.points[0]!.lateralYards);
  });

  it("evaluates the same integer timestamp deterministically", () => {
    const path = stickThunderPlay.paths.find(
      (candidate) => candidate.id === "rx",
    )!;
    const first = evaluateMovement(path, 750);
    const second = evaluateMovement(structuredClone(path), 750);

    expect(first).toEqual(second);
    expect(first.phase).toBe("moving");
    expect(first.progress).toBeGreaterThan(0);
    expect(() => evaluateMovement(path, 750.5)).toThrow("integer milliseconds");
  });

  it("samples curved routes by yard distance using the rendered quadratic", () => {
    const path = footballPathPrimitivePlay.paths.find(
      ({ id }) => id === "path-route",
    )!;
    const chordLength = Math.hypot(2, 8) + Math.hypot(8, 4);
    const length = pathLength(path);
    const first = pointAtDistance(path, length / 2);
    const second = pointAtDistance(structuredClone(path), length / 2);

    expect(length).toBeGreaterThan(chordLength);
    expect(first).toEqual(second);
    expect(first.lateralYards).toBeGreaterThan(-18);
    expect(first.depthYards).toBeGreaterThan(4);
  });

  it("bounds curve sampling work for extreme control geometry", () => {
    const geometry = buildPathGeometry({
      points: [
        { lateralYards: 0, depthYards: 0 },
        {
          lateralYards: 100_000,
          depthYards: 100_000,
          control: { lateralYards: -100_000, depthYards: 100_000 },
        },
      ],
    });

    expect(geometry.points).toHaveLength(257);
    expect(geometry.lengthYards).toBeGreaterThan(0);
  });

  it("preserves original segment styles, endings, zones, and colors", () => {
    const migrated = migrateLegacyPlay({
      id: "legacy_path_primitives",
      name: "Legacy path primitives",
      cat: "Defense",
      doc: {
        players: [
          {
            id: "defender",
            x: 500,
            y: 370,
            symbol: "circle",
            color: "g",
          },
        ],
        routes: [
          {
            id: "drop",
            kind: "zone",
            playerId: "defender",
            lineStyle: "dashed",
            endMarker: "bubble",
            color: "o",
            points: [
              { x: 500, y: 370 },
              { x: 520, y: 300, ls: "solid", em: "diamond" },
              { x: 540, y: 240 },
            ],
            zone: { rx: 64, ry: 30, t: "curl" },
          },
          {
            id: "base-route",
            kind: "route",
            playerId: "defender",
            points: [
              { x: 500, y: 370 },
              { x: 480, y: 300 },
            ],
          },
          {
            id: "alternate-route",
            kind: "route",
            playerId: "defender",
            points: [
              { x: 500, y: 370 },
              { x: 560, y: 280 },
            ],
          },
        ],
        labels: [],
      },
    });

    expect(migrated.players[0]?.color).toBe("gray");
    expect(migrated.paths[0]).toMatchObject({
      style: { line: "dashed", ending: "bubble", color: "orange" },
      coverageArea: {
        type: "curl",
        radiusLateralYards: 64 / 12,
        radiusDepthYards: 2.5,
      },
      points: [{}, { segmentStyle: { line: "solid", ending: "diamond" } }, {}],
    });
    expect(migrated.paths[1]?.variant).toBeUndefined();
    expect(migrated.paths[2]?.variant).toBe("alternate");
  });
});

describe("versioned Field Profiles", () => {
  it("stores every built-in marking in explicit yard units", () => {
    expect(highSchoolFieldProfile).toMatchObject({
      schemaVersion: 1,
      revision: 1,
      widthYards: 160 / 3,
      hashInsetYards: (53 + 4 / 12) / 3,
      numberInsetYards: 8,
    });
    expect(collegeFieldProfile.hashInsetYards).toBe(20);
    expect(nflFieldProfile.hashInsetYards).toBe((70 + 9 / 12) / 3);
  });

  it("upgrades the released ambiguous hash property from feet to yards", () => {
    expect(
      migrateLegacyFieldProfile({
        id: "field_custom_legacy",
        name: "Legacy custom",
        widthYards: 160 / 3,
        endZoneDepthYards: 10,
        hashOffsetYards: 60,
      }),
    ).toMatchObject({
      schemaVersion: 1,
      revision: 1,
      hashInsetYards: 20,
    });

    const migratedPlay = migratePlayDocument({
      ...stickThunderPlay,
      schemaVersion: 1,
      fieldProfile: {
        id: "field_high_school",
        name: "High school",
        widthYards: 160 / 3,
        endZoneDepthYards: 10,
        hashOffsetYards: 53 + 4 / 12,
      },
    });

    expect(migratedPlay.schemaVersion).toBe(2);
    expect(migratedPlay.fieldProfile).toEqual(highSchoolFieldProfile);
    expect(playDocumentSchema.parse(migratedPlay)).toEqual(migratedPlay);
  });

  it("derives deterministic lines, marks, and numbers around the LOS", () => {
    const first = buildFieldLandmarks(highSchoolFieldProfile);
    const second = buildFieldLandmarks(structuredClone(highSchoolFieldProfile));

    expect(first).toEqual(second);
    expect(first.yardLines.map(({ depthYards }) => depthYards)).toEqual([
      -10, -5, 0, 5, 10, 15, 20, 25, 30,
    ]);
    expect(first.hashMarks).toHaveLength(64);
    expect(first.sidelineMarks).toHaveLength(64);
    expect(first.numbers).toHaveLength(8);
    expect(
      first.hashMarks.every(
        ({ lateralYards }) =>
          Math.abs(lateralYards) < highSchoolFieldProfile.widthYards / 2,
      ),
    ).toBe(true);
  });

  it("bounds custom landmark density", () => {
    expect(() =>
      buildFieldLandmarks({
        ...highSchoolFieldProfile,
        id: "field_too_dense",
        minorMarkIntervalYards: 0.001,
      }),
    ).toThrow("too many field landmarks");
  });
});

describe("yard-space geometry invariants", () => {
  it("round-trips every finite legacy point and mirrors twice exactly", () => {
    fc.assert(
      fc.property(
        fc.double({
          min: -10_000,
          max: 10_000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.double({
          min: -10_000,
          max: 10_000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (x, y) => {
          const yards = legacyCanvasToYards({ x, y });
          const canvas = yardsToLegacyCanvas(yards);
          const mirroredTwice = mirrorCoordinate(mirrorCoordinate(yards));

          expect(canvas.x).toBeCloseTo(x, 9);
          expect(canvas.y).toBeCloseTo(y, 9);
          expect(mirroredTwice).toEqual(yards);
        },
      ),
    );
  });

  it("mirrors the complete canonical Play twice without drift", () => {
    expect(mirrorPlayGeometry(mirrorPlayGeometry(stickThunderPlay))).toEqual(
      stickThunderPlay,
    );
  });

  it("mirrors new path semantics twice without dropping style or coverage", () => {
    expect(
      mirrorPlayGeometry(mirrorPlayGeometry(footballPathPrimitivePlay)),
    ).toEqual(footballPathPrimitivePlay);
  });
});
