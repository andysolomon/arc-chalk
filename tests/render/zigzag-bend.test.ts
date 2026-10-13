import { highSchoolFieldProfile, type PathPoint } from "@chalk/domain";
import {
  buildPathStrokes,
  createSvgProjection,
  projectCoordinate,
} from "@chalk/render";
import { describe, expect, it } from "vitest";

/**
 * A zigzag on a bent line (ADR 0080). An orbit is one sweep behind the
 * quarterback, and the zigzag used to be drawn chord to chord — straight
 * through him — while the handles, the hit test and the playback all
 * followed the bend. These are the ways drawing it along the bend could go
 * wrong, written before the code:
 *
 * - the zigzag still cuts straight across, ignoring the bend;
 * - following the bend changes how a straight zigzag is drawn, and every
 *   motion already on a card moves;
 * - the last tooth misses the end of the line, so the arrowhead floats;
 * - the teeth bunch up or stretch round the bend;
 * - a straight leg after a bent one starts from the wrong place.
 */

const viewport = createSvgProjection(highSchoolFieldProfile);
const style = { line: "zigzag", ending: "arrow", color: "ink" } as const;

const drawn = (points: readonly PathPoint[]) => {
  const { d } = buildPathStrokes("motion", points, style, viewport)[0]!;
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const pairs: { x: number; y: number }[] = [];
  for (let index = 0; index < numbers.length; index += 2) {
    pairs.push({ x: numbers[index]!, y: numbers[index + 1]! });
  }
  return { d, pairs };
};

const stance = { lateralYards: 20, depthYards: -1.8 };
const orbit: PathPoint[] = [
  stance,
  {
    lateralYards: -2.5,
    depthYards: -8.5,
    control: { lateralYards: 4, depthYards: -10 },
  },
];

/** Where the bend is at its middle, on the frame. */
const middleOfBend = () => {
  const [from, to] = orbit as [PathPoint, PathPoint];
  const a = projectCoordinate(from, viewport);
  const c = projectCoordinate(to.control!, viewport);
  const b = projectCoordinate(to, viewport);
  return {
    x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x,
    y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y,
  };
};

describe("a zigzag line", () => {
  it("is drawn on a straight line exactly as it always was", () => {
    const { d } = drawn([
      stance,
      { lateralYards: 17.5, depthYards: -3.8 },
      { lateralYards: 12, depthYards: -3.8 },
    ]);
    expect(d).toBe(
      "M 866 451.6 L 855 452 L 850 465 L 836 462 L 831 475 L 820 476 L 809 471 L 798 480 L 787 471 L 776 480 L 764 471 L 753 480 L 742 471 L 731 480 L 720 476",
    );
  });

  it("follows a bend instead of cutting straight across it", () => {
    const { pairs } = drawn(orbit);
    const middle = middleOfBend();
    const nearest = Math.min(
      ...pairs.map(({ x, y }) => Math.hypot(x - middle.x, y - middle.y)),
    );
    // A tooth is 4.5 px off the line, and the teeth are 11 px apart.
    expect(nearest).toBeLessThan(9);
    // The chord's own middle is nowhere near the bend's, so a line drawn
    // chord to chord would have missed it by a long way.
    const start = projectCoordinate(orbit[0]!, viewport);
    const end = projectCoordinate(orbit[1]!, viewport);
    expect(
      Math.hypot(
        (start.x + end.x) / 2 - middle.x,
        (start.y + end.y) / 2 - middle.y,
      ),
    ).toBeGreaterThan(20);
  });

  it("finishes on the end of a bent line, where the arrowhead is", () => {
    const { pairs } = drawn(orbit);
    const end = projectCoordinate(orbit[1]!, viewport);
    expect(Math.abs(pairs.at(-1)!.x - end.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(pairs.at(-1)!.y - end.y)).toBeLessThanOrEqual(0.5);
  });

  it("keeps its teeth evenly spaced round a bend", () => {
    const { pairs } = drawn(orbit);
    expect(pairs.length).toBeGreaterThan(20);
    for (let index = 1; index < pairs.length; index += 1) {
      const gap = Math.hypot(
        pairs[index]!.x - pairs[index - 1]!.x,
        pairs[index]!.y - pairs[index - 1]!.y,
      );
      expect(gap, `tooth ${index}`).toBeGreaterThan(8);
      expect(gap, `tooth ${index}`).toBeLessThan(19);
    }
  });

  it("carries on straight from the end of a bend", () => {
    const on = { lateralYards: -9, depthYards: -8.5 };
    const { pairs } = drawn([...orbit, on]);
    const bendEnd = projectCoordinate(orbit[1]!, viewport);
    const end = projectCoordinate(on, viewport);
    expect(Math.abs(pairs.at(-1)!.x - end.x)).toBeLessThanOrEqual(0.5);
    // The bend's own last point is on the line, and what follows it is flat.
    const joint = pairs.findIndex(
      ({ x, y }) =>
        Math.abs(x - bendEnd.x) <= 0.5 && Math.abs(y - bendEnd.y) <= 0.5,
    );
    expect(joint).toBeGreaterThan(0);
    for (const { y } of pairs.slice(joint)) {
      expect(Math.abs(y - bendEnd.y)).toBeLessThanOrEqual(5);
    }
  });
});
