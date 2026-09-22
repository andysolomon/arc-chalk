import {
  applyPlayCommand,
  holdInsideSidelines,
  holdPathInsideSidelines,
  holdPathsInsideSidelines,
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
  it("holds a point on the sideline it crossed and leaves one inside alone", () => {
    const profile = stickThunderPlay.fieldProfile;
    const inside = { lateralYards: 3, depthYards: 5 };
    expect(holdInsideSidelines(profile, inside)).toBe(inside);
    expect(
      holdInsideSidelines(profile, { lateralYards: 40, depthYards: 5 }),
    ).toEqual({ lateralYards: half, depthYards: 5 });
    expect(
      holdInsideSidelines(profile, { lateralYards: -40, depthYards: 5 }),
    ).toEqual({ lateralYards: -half, depthYards: 5 });
  });

  it("holds a line's stem, its bends and its branches, keeping depth as drawn", () => {
    const path = pastThePaint(stickThunderPlay);
    const held = holdPathInsideSidelines(stickThunderPlay.fieldProfile, path);
    const end = held.points.at(-1)!;
    expect(end.lateralYards).toBe(-half);
    expect(end.depthYards).toBe(path.points.at(-1)!.depthYards);
    expect(end.control?.lateralYards).toBe(-half);
    expect(held.branches[0]!.points[0]!.lateralYards).toBe(half);
    expect(held.branches[0]!.points[0]!.depthYards).toBe(20);
  });

  it("gives a Play back untouched when every line is already on the paint", () => {
    expect(holdPathsInsideSidelines(stickThunderPlay)).toBe(stickThunderPlay);
    for (const point of everyPoint(stickThunderPlay)) {
      expect(Math.abs(point.lateralYards)).toBeLessThanOrEqual(half);
    }
  });

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

  it("holds every line again when the field is narrowed under it", () => {
    const narrow = {
      ...stickThunderPlay.fieldProfile,
      id: "narrow",
      name: "Narrow",
      widthYards: 30,
      hashInsetYards: 10,
      numberInsetYards: 5,
    };
    const landed = applyPlayCommand(stickThunderPlay, {
      kind: "set-field-profile",
      fieldProfile: narrow,
    });
    expect(
      everyPoint(stickThunderPlay).some((p) => Math.abs(p.lateralYards) > 15),
    ).toBe(true);
    for (const point of everyPoint(landed)) {
      expect(Math.abs(point.lateralYards)).toBeLessThanOrEqual(15);
    }
  });
});
