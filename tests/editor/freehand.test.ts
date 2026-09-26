import {
  FREEHAND_STRAIGHT_PX,
  isStraightStroke,
  simplifyStroke,
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
});

describe("telling a straight pull from a drawn shape", () => {
  it("takes a stem that wobbles inside the tolerance as straight", () => {
    // Half a yard is 5 px here: a finger's wobble, not a bend.
    const stem = Array.from({ length: 12 }, (_, index) =>
      at(index % 2 === 0 ? 0.5 : -0.5, index + 1),
    );
    expect(isStraightStroke(at(0, 0), [...stem, at(0, 13)], scale)).toBe(true);
    expect(isStraightStroke(at(0, 0), [], scale)).toBe(true);
  });

  it("takes a wheel, a hook past the tolerance, or a doubled-back stroke as drawn", () => {
    const wheel = Array.from({ length: 10 }, (_, index) => {
      const angle = ((index + 1) / 10) * (Math.PI / 2);
      return at(6 * (1 - Math.cos(angle)), 6 * Math.sin(angle));
    });
    expect(isStraightStroke(at(0, 0), wheel, scale)).toBe(false);

    const past = (FREEHAND_STRAIGHT_PX + 1) / 10;
    expect(
      isStraightStroke(at(0, 0), [at(0, 5), at(past, 10), at(0, 15)], scale),
    ).toBe(false);

    // Up and back down the same line: never further than a pixel off it,
    // but it ran well past where it ended.
    expect(
      isStraightStroke(at(0, 0), [at(0, 5), at(0, 10), at(0, 4)], scale),
    ).toBe(false);
  });
});
