import {
  evaluatePlayAt,
  planPlay,
  stickThunderPlay,
  type Coordinate,
  type MovementPath,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * Pre-snap motion goes around the men in its way (the E2E spec
 * motion-clearance.spec.ts shows it on the field). What the field cannot
 * practically measure is the geometry of the way round, so each way it could
 * go wrong is one test here:
 *
 * 1. Going round moves where the motion starts or ends: he jumps off his
 *    stance as motion begins, or his route no longer sets out where the
 *    motion left him.
 * 2. Going round a lineman he is barely behind, he is pushed in front of
 *    him — across the line of scrimmage — instead of behind him.
 * 3. Going round a row of linemen, each man's detour is added to the last
 *    and he is driven far deeper than one way round needs.
 * 4. A motion that comes near nobody is bent anyway.
 * 5. Which side to go round is chosen frame by frame, so he jumps from one
 *    side of a man to the other mid-motion.
 * 6. A defender walking across with the motion goes round a man deeper than
 *    him on the side toward the ball, and crosses the line of scrimmage.
 */

const base: Player = {
  id: "z",
  unit: "offense",
  position: { lateralYards: 15, depthYards: -1 },
  symbol: "circle",
  label: "Z",
  sublabel: "",
  fill: "none",
  color: "ink",
};

const at = (id: string, lateralYards: number, depthYards: number): Player => ({
  ...base,
  id,
  label: "",
  position: { lateralYards, depthYards },
});

const line = [-4, -2, 0, 2, 4].map((lateral, index) =>
  at(`ol${index}`, lateral, -1.5),
);

function motion(points: readonly Coordinate[], playerId = "z"): MovementPath {
  return {
    id: `motion-${playerId}`,
    kind: "motion",
    playerId,
    points: [...points],
    branches: [],
    style: { line: "solid", ending: "arrow", color: "ink" },
  };
}

function playOf(
  players: readonly Player[],
  paths: readonly MovementPath[],
): PlayDocument {
  return {
    ...stickThunderPlay,
    id: "play-motion-clearance",
    name: "Motion clearance fixture",
    players: [...players],
    paths: [...paths],
    labels: [],
    assignments: [],
  };
}

/** Where everyone stands at every 10 ms from the first frame to the snap. */
function presnap(play: PlayDocument): Record<string, Coordinate>[] {
  const plan = planPlay(play);
  const frames: Record<string, Coordinate>[] = [];
  for (let atMs = plan.startMs; atMs <= 0; atMs += 10) {
    frames.push({ ...evaluatePlayAt(play, atMs, plan).playerPositions });
  }
  return frames;
}

describe("pre-snap motion going round the men in its way", () => {
  it("leaves his stance and arrives at the drawn end without a jump (1)", () => {
    const end = { lateralYards: -10, depthYards: -1 };
    const route: MovementPath = {
      ...motion([end, { lateralYards: -14, depthYards: 6 }]),
      id: "sweep",
      kind: "route",
    };
    const play = playOf([base, ...line], [motion([base.position, end]), route]);
    const plan = planPlay(play);
    const first = evaluatePlayAt(play, plan.startMs, plan).playerPositions.z!;
    const snap = evaluatePlayAt(play, 0, plan).playerPositions.z!;
    expect(first.lateralYards).toBeCloseTo(base.position.lateralYards, 6);
    expect(first.depthYards).toBeCloseTo(base.position.depthYards, 6);
    expect(snap.lateralYards).toBeCloseTo(end.lateralYards, 6);
    expect(snap.depthYards).toBeCloseTo(end.depthYards, 6);
  });

  it("goes behind a lineman he is barely behind, never across the line (2)", () => {
    const play = playOf(
      [base, ...line],
      [
        motion([
          { lateralYards: 15, depthYards: -1.2 },
          { lateralYards: -15, depthYards: -1.2 },
        ]),
      ],
    );
    for (const frame of presnap(play)) {
      const z = frame.z!;
      expect(z.depthYards).toBeLessThan(0);
      if (Math.abs(z.lateralYards) <= 4) {
        expect(z.depthYards).toBeLessThan(-1.5);
      }
    }
  });

  it("goes round a row of linemen once, not once per lineman (3)", () => {
    const play = playOf(
      [base, ...line],
      [
        motion([
          { lateralYards: 15, depthYards: -1.5 },
          { lateralYards: -15, depthYards: -1.5 },
        ]),
      ],
    );
    const deepest = Math.min(
      ...presnap(play).map((frame) => frame.z!.depthYards),
    );
    // Two symbols touch at 26 frame px, 12 px to a yard of depth; going
    // round asks for a little more than that and no more than a yard extra.
    expect(deepest).toBeLessThan(-1.5 - 26 / 12);
    expect(deepest).toBeGreaterThan(-1.5 - 26 / 12 - 1);
  });

  it("leaves a motion that comes near nobody exactly as drawn (4)", () => {
    const drawn = [
      { lateralYards: 15, depthYards: -1 },
      { lateralYards: 8, depthYards: -1 },
    ];
    const play = playOf([base, ...line], [motion(drawn)]);
    const plan = planPlay(play);
    const item = plan.items.find(({ kind }) => kind === "motion")!;
    expect(item.geometry.points).toEqual(drawn);
  });

  it("keeps to one side of each man the whole way round (5)", () => {
    // Drawn on a slant straight through the centre, from in front of his
    // depth to behind it.
    const play = playOf(
      [base, ...line],
      [
        motion([
          { lateralYards: 15, depthYards: -1 },
          { lateralYards: -15, depthYards: -2 },
        ]),
      ],
    );
    const frames = presnap(play);
    for (let index = 1; index < frames.length; index += 1) {
      const before = frames[index - 1]!.z!;
      const after = frames[index]!.z!;
      expect(
        Math.hypot(
          after.lateralYards - before.lateralYards,
          after.depthYards - before.depthYards,
        ),
      ).toBeLessThan(0.5);
    }
  });

  it("walks a defender in man behind a deeper man, not across the line (6)", () => {
    const corner: Player = {
      ...at("c", 15, 1),
      unit: "defense",
      label: "C",
    };
    const backer: Player = { ...at("m", 2, 1.6), unit: "defense", label: "M" };
    const man: MovementPath = {
      ...motion([corner.position, { lateralYards: 15, depthYards: 12 }], "c"),
      id: "c-man",
      kind: "zone",
      covers: { playerId: "z" },
    };
    const play = playOf(
      [base, corner, backer],
      [
        motion([
          { lateralYards: 15, depthYards: -1 },
          { lateralYards: -10, depthYards: -1 },
        ]),
        man,
      ],
    );
    const frames = presnap(play);
    expect(frames.at(-1)!.c!.lateralYards).toBeCloseTo(-10, 1);
    for (const frame of frames) {
      expect(frame.c!.depthYards).toBeGreaterThan(0);
    }
  });
});
