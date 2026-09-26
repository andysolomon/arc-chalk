import {
  applyPlayCommand,
  stickThunderPlay,
  type MovementPath,
  type PlayDocument,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

const half = stickThunderPlay.fieldProfile.widthYards / 2;

const everyPoint = (play: PlayDocument) =>
  play.paths.flatMap((path) =>
    [
      ...path.points,
      ...path.branches.flatMap((branch) => branch.points),
    ].flatMap((point) => [point, ...(point.control ? [point.control] : [])]),
  );

/** The X's route, with its far end and a bend pushed well past the paint. */
function pastThePaint(play: PlayDocument): MovementPath {
  const path = play.paths[0]!;
  const last = path.points.length - 1;
  return {
    ...path,
    points: path.points.map((point, index) =>
      index === last
        ? {
            ...point,
            lateralYards: -half - 6,
            control: { lateralYards: -half - 3, depthYards: point.depthYards },
          }
        : point,
    ),
    branches: [
      {
        fromIndex: last,
        points: [{ lateralYards: half + 4, depthYards: 20 }],
        style: { line: "dashed", ending: "arrow", color: "ink" },
      },
    ],
  };
}

describe("the sidelines hold every line", () => {
  it("holds whatever a command lands past the paint", () => {
    const landed = applyPlayCommand(stickThunderPlay, {
      kind: "update-path",
      path: pastThePaint(stickThunderPlay),
    });
    for (const point of everyPoint(landed)) {
      expect(point.lateralYards).toBeGreaterThanOrEqual(-half);
      expect(point.lateralYards).toBeLessThanOrEqual(half);
    }
    const end = landed.paths[0]!.points.at(-1)!;
    expect(end.lateralYards).toBe(-half);
    expect(end.control?.lateralYards).toBe(-half);
    expect(landed.paths[0]!.branches[0]!.points[0]!.lateralYards).toBe(half);
  });
});
