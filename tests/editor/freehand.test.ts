import {
  FREEHAND_CORNER_DEGREES,
  FREEHAND_STRAIGHT_PX,
  FREEHAND_TOLERANCE_PX,
  fitFreehandStroke,
  isStraightStroke,
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

  it("bends a gentle arc through its vertices and lands on its end", () => {
    // A quarter circle of radius 10 yards, sampled every 15°: each turn is
    // 15°, far gentler than a cut.
    const arc = Array.from({ length: 7 }, (_, index) => {
      const angle = (index * 15 * Math.PI) / 180;
      return at(10 - 10 * Math.cos(angle), 10 * Math.sin(angle));
    });
    const fitted = smoothStroke(arc, scale);
    const end = fitted.at(-1)!;
    expect(end.lateralYards).toBeCloseTo(arc.at(-1)!.lateralYards, 6);
    expect(end.depthYards).toBeCloseTo(arc.at(-1)!.depthYards, 6);
    // Every segment is curved, and its control is a vertex the hand passed:
    // one segment per interior vertex, meeting at midpoints, then the end.
    expect(fitted.every((point) => point.control !== undefined)).toBe(true);
    expect(fitted.length).toBe(arc.length - 2);
    expect(fitted[0]!.control!.lateralYards).toBeCloseTo(
      arc[1]!.lateralYards,
      6,
    );
    expect(fitted[0]!.control!.depthYards).toBeCloseTo(arc[1]!.depthYards, 6);
  });

  it("keeps a cut sharp in the middle of two bends", () => {
    // Round the top of a stem, cut hard, round again.
    const vertices = [
      at(0, 0),
      at(0.5, 4),
      at(1.5, 8),
      at(3, 10),
      // The cut: back the other way.
      at(-1, 12),
      at(-3, 13),
      at(-6, 13.5),
    ];
    const fitted = smoothStroke(vertices, scale);
    const cut = fitted.find(
      (point) => point.lateralYards === 3 && point.depthYards === 10,
    );
    expect(cut).toBeDefined();
    // The line arrives at the cut and leaves it as a break: the point after
    // it starts a fresh run rather than a midpoint straddling the cut.
    const afterCut = fitted[fitted.indexOf(cut!) + 1]!;
    expect(afterCut.control).toMatchObject({
      lateralYards: -1,
      depthYards: 12,
    });
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
