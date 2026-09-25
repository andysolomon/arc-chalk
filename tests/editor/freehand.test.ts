import {
  FREEHAND_CORNER_DEGREES,
  FREEHAND_TOLERANCE_PX,
  fitFreehandStroke,
  simplifyStroke,
  smoothStroke,
  turnDegrees,
} from "@chalk/editor";
import type { Coordinate } from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * A traced line is fitted the way a Coach would clean up his own hand: the
 * tremor goes, the bends stay round, and every cut he meant stays a cut.
 */

const scale = { lateralPixelsPerYard: 10, depthPixelsPerYard: 10 };
const at = (lateralYards: number, depthYards: number): Coordinate => ({
  lateralYards,
  depthYards,
});

describe("thinning a traced stroke", () => {
  it("keeps the ends and drops the tremor along a straight line", () => {
    const jittered = Array.from({ length: 30 }, (_, index) =>
      // 0.1 yards is 1 px of wobble: under the tolerance.
      at(index % 2 === 0 ? 0.1 : -0.1, index),
    );
    const thinned = simplifyStroke(jittered, scale);
    expect(thinned).toHaveLength(2);
    expect(thinned[0]).toEqual(jittered[0]);
    expect(thinned.at(-1)).toEqual(jittered.at(-1));
  });

  it("keeps the one point that carries a cut", () => {
    const stem = Array.from({ length: 10 }, (_, index) => at(0, index));
    const out = Array.from({ length: 10 }, (_, index) => at(index + 1, 9));
    const thinned = simplifyStroke([...stem, ...out], scale);
    expect(thinned).toEqual([at(0, 0), at(0, 9), at(10, 9)]);
  });

  it("takes the tolerance on screen, so a wobble is a wobble at any zoom", () => {
    const wobble = [at(0, 0), at(0.2, 5), at(0, 10)];
    // At 10 px a yard the wobble is 2 px: dropped.
    expect(simplifyStroke(wobble, scale)).toHaveLength(2);
    // Zoomed in fourfold it is 8 px: a real bend, kept.
    expect(
      simplifyStroke(wobble, {
        lateralPixelsPerYard: 40,
        depthPixelsPerYard: 40,
      }),
    ).toHaveLength(3);
    expect(FREEHAND_TOLERANCE_PX).toBeLessThan(4);
  });
});

describe("smoothing the thinned stroke", () => {
  it("leaves a straight line and a sharp cut exactly as drawn", () => {
    expect(smoothStroke([at(0, 0), at(0, 10)], scale)).toEqual([at(0, 10)]);
    // An out: straight up, then square to the sideline.
    expect(smoothStroke([at(0, 0), at(0, 10), at(8, 10)], scale)).toEqual([
      at(0, 10),
      at(8, 10),
    ]);
    expect(turnDegrees(at(0, 0), at(0, 10), at(8, 10), scale)).toBeCloseTo(90);
    expect(FREEHAND_CORNER_DEGREES).toBeLessThan(45);
  });
});

describe("fitting a stroke after its anchor", () => {
  it("returns only what follows the anchor, and nothing for no stroke", () => {
    expect(fitFreehandStroke(at(0, 0), [], scale)).toEqual([]);
    const traced = Array.from({ length: 12 }, (_, index) =>
      at(index % 2 === 0 ? 0.05 : -0.05, index + 1),
    );
    const fitted = fitFreehandStroke(at(0, 0), traced, scale);
    expect(fitted).toEqual([at(traced.at(-1)!.lateralYards, 12)]);
  });
});
