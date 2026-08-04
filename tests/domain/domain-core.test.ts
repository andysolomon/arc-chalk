import {
  canonicalSha256,
  canonicalStringify,
  evaluateMovement,
  legacyCanvasToYards,
  mirrorCoordinate,
  mirrorPlayGeometry,
  pathLength,
  playDocumentSchema,
  pointAtDistance,
  yardsToLegacyCanvas,
} from "@chalk/domain";
import { stickThunderPlay } from "@chalk/test-fixtures";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("canonical Play documents", () => {
  it("migrates the seeded original Play into strict yard-space data", () => {
    expect(playDocumentSchema.parse(stickThunderPlay)).toEqual(
      stickThunderPlay,
    );
    expect(stickThunderPlay.players).toHaveLength(11);
    expect(stickThunderPlay.paths).toHaveLength(5);
    expect(stickThunderPlay.labels).toHaveLength(12);
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
});
