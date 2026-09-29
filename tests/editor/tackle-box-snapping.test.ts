import { nflFieldProfile } from "@chalk/domain";
import { snapPosition } from "@chalk/editor";
import { describe, expect, it } from "vitest";

/**
 * Snapping in the tackle box (issue #164), in isolation. Dragging a pull's
 * break across the box on the field is `tests/e2e/run-game.spec.ts`. These
 * are the ways the ranking could still put a break on a man:
 *
 * - the ball claiming a break meant for an A gap, landing it on the centre;
 * - a gap losing to the yard grid because the grid is nearer;
 * - a gap claiming a break from across the box, past the next man;
 * - the box's gaps changing how a break outside it snaps.
 */

const screenScale = {
  lateralPixelsPerYard: 18.3,
  depthPixelsPerYard: 12,
} as const;
const settings = { enabled: true, grid: 0.5 } as const;
const gaps = [
  { lateralYards: -0.985, name: "A gap left" },
  { lateralYards: 0.985, name: "A gap right" },
  { lateralYards: 2.95, name: "B gap right" },
  { lateralYards: 4.93, name: "C gap right" },
];

describe("snapping in the tackle box", () => {
  it("does not put a break on the centre when it is aimed at an A gap", () => {
    const { point, guides } = snapPosition({
      point: { lateralYards: 0.4, depthYards: -2.7 },
      fieldProfile: nflFieldProfile,
      gaps,
      screenScale,
      settings,
    });
    expect(point.lateralYards).not.toBe(0);
    expect(guides.some(({ source }) => source === "ball")).toBe(false);
  });

  it("prefers the gap to the grid", () => {
    const { point, guides } = snapPosition({
      point: { lateralYards: 2.6, depthYards: -2.7 },
      fieldProfile: nflFieldProfile,
      gaps,
      screenScale,
      settings,
    });
    expect(point.lateralYards).toBe(2.95);
    expect(guides.find(({ axis }) => axis === "lateral")?.label).toBe(
      "B gap right",
    );
  });

  it("does not reach past the next man for a gap", () => {
    const { point } = snapPosition({
      point: { lateralYards: 1.97, depthYards: -2.7 },
      fieldProfile: nflFieldProfile,
      gaps,
      screenScale,
      settings: { enabled: true, grid: "off" },
    });
    // Right behind the guard: a whole yard from either gap.
    expect(point.lateralYards).toBe(1.97);
  });

  it("leaves the ball to claim a break when no box is given", () => {
    const { point } = snapPosition({
      point: { lateralYards: 0.3, depthYards: -8 },
      fieldProfile: nflFieldProfile,
      screenScale,
      settings,
    });
    expect(point.lateralYards).toBe(0);
  });
});
