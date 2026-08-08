import {
  buildFieldLandmarks,
  buildPathGeometry,
  canonicalSha256,
  canonicalStringify,
  collegeFieldProfile,
  evaluateMovement,
  highSchoolFieldProfile,
  legacyCanvasToYards,
  legacyDepthSpanToYards,
  legacyLateralSpanToYards,
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
  playerLabelPrimitivePlay,
  releasedPlayDocumentV1,
  stickThunderPlay,
} from "@chalk/test-fixtures";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("canonical Play documents", () => {
  it("migrates the seeded original Play into strict yard-space data", () => {
    expect(playDocumentSchema.parse(stickThunderPlay)).toEqual(
      stickThunderPlay,
    );
    expect(stickThunderPlay.schemaVersion).toBe(3);
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

    // X's shallow crosser measures about 13.6 yards of grass. The same route
    // spans 224 original canvas pixels, and reading its crossfield leg on the
    // depth scale would overstate it by half.
    expect(length).toBeCloseTo(13.63, 2);
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
        // A zone's width is a crossfield span and a zone's height is a
        // downfield one, so the two radii read on different scales.
        type: "curl",
        radiusLateralYards: legacyLateralSpanToYards(64),
        radiusDepthYards: legacyDepthSpanToYards(30),
      },
      points: [{}, { segmentStyle: { line: "solid", ending: "diamond" } }, {}],
    });
    expect(migrated.paths[1]?.variant).toBeUndefined();
    expect(migrated.paths[2]?.variant).toBe("alternate");
  });

  it("preserves the original player and annotation vocabulary", () => {
    expect(playDocumentSchema.parse(playerLabelPrimitivePlay)).toEqual(
      playerLabelPrimitivePlay,
    );
    expect(
      playerLabelPrimitivePlay.players.map(({ symbol }) => symbol),
    ).toEqual(["circle", "square", "oval", "triangle", "x", "none"]);
    expect(playerLabelPrimitivePlay.players.map(({ fill }) => fill)).toEqual([
      "none",
      "half",
      "solid",
      "half",
      "none",
      "none",
    ]);
    expect(playerLabelPrimitivePlay.labels.map(({ role }) => role)).toEqual([
      "landmark",
      "assignment",
      "progression",
      "adjustment",
      "alert",
      "coaching",
    ]);
  });

  it("migrates rich original players, bound labels, and leaders without loss", () => {
    const migrated = migrateLegacyPlay({
      id: "legacy_player_label_primitives",
      name: "Legacy player and label primitives",
      cat: "Pass",
      doc: {
        players: [
          {
            id: "mike",
            x: 500,
            y: 370,
            symbol: "oval",
            label: "M",
            sub: "MIKE",
            fill: "half",
            color: "gr",
            side: "def",
            role: "middle-linebacker",
            group: "linebackers",
          },
        ],
        routes: [
          {
            id: "mike-drop",
            kind: "zone",
            playerId: "mike",
            points: [
              { x: 500, y: 370 },
              { x: 520, y: 300 },
            ],
          },
        ],
        labels: [
          {
            id: "read",
            x: 0,
            y: 0,
            text: "read 1",
            color: "b",
            size: 12,
            box: "circle",
            boxColor: "b",
            caps: true,
            mono: true,
            role: "progression",
            side: "def",
            leader: { x: 540, y: 280, style: "dashed" },
            bind: {
              routeId: "mike-drop",
              segIdx: 1,
              t: 0.5,
              ox: 24,
              oy: -6,
            },
          },
        ],
      },
    });

    expect(migrated.players[0]).toMatchObject({
      unit: "defense",
      symbol: "oval",
      fill: "half",
      color: "green",
      role: "middle-linebacker",
      group: "linebackers",
    });
    expect(migrated.labels[0]).toMatchObject({
      box: "circle",
      caps: true,
      mono: true,
      role: "progression",
      unit: "defense",
      leader: {
        endpoint: {
          lateralYards: legacyLateralSpanToYards(40),
          depthYards: 12.5,
        },
        line: "dashed",
      },
      binding: {
        pathId: "mike-drop",
        segmentIndex: 1,
        progress: 0.5,
        offset: {
          lateralYards: legacyLateralSpanToYards(24),
          depthYards: 0.5,
        },
      },
    });
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

    const migratedPlay = migratePlayDocument(releasedPlayDocumentV1);

    expect(migratedPlay.schemaVersion).toBe(3);
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

  it("mirrors players, bound labels, and leader endpoints twice exactly", () => {
    expect(
      mirrorPlayGeometry(mirrorPlayGeometry(playerLabelPrimitivePlay)),
    ).toEqual(playerLabelPrimitivePlay);
  });
});
