import {
  applyFormation,
  emptyPlayDocument,
  highSchoolFieldProfile,
  MOTION_GAP_MS,
  motionAtSnap,
  motionCallPoints,
  motionCalls,
  planPlay,
  playerPositionAt,
  stockFormations,
  type MovementPath,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * The motion types and the snap, in isolation (ADR 0080). The Coach's
 * journey — a type picked for a man, Moving or Set chosen, the timeline
 * starting where it should — is `tests/e2e/motion-panel.spec.ts`. These are
 * the ways the shapes and the timeline could be wrong while the panel still
 * looks right, written before the code:
 *
 * - a jet from the left side runs away from the ball;
 * - a jet is drawn through the offensive line, or through a quarterback in
 *   the gun, or in front of one under center;
 * - an orbit cuts through the back standing beside the quarterback;
 * - an across stops on top of the man already in the far slot;
 * - a shift walks a back through the quarterback beside him;
 * - a return leaves him somewhere other than where he started from;
 * - a type is drawn for a lineman or a defender, who never goes in motion;
 * - a moving motion still stops a breath before the snap;
 * - one man's moving motion takes the breath from another man's set one;
 * - a Play saved before the choice existed starts its motion at a new time;
 * - a moving motion whose route starts somewhere else puts the man in two
 *   places at the snap.
 */

let nextId = 0;
const makeId = (prefix: string) => `${prefix}_${(nextId += 1)}`;

function playIn(set: string): PlayDocument {
  const formation = stockFormations.find(({ name }) => name === set);
  if (!formation) throw new Error(`No such set: ${set}`);
  const blank = emptyPlayDocument({
    playbookId: "playbook_motion",
    fieldProfile: highSchoolFieldProfile,
    id: "play_motion",
  });
  return applyFormation(blank, formation, makeId).play;
}

const man = (play: PlayDocument, label: string): Player => {
  const found = play.players.find((player) => player.label === label);
  if (!found) throw new Error(`Nobody lettered ${label}`);
  return found;
};

const shape = (play: PlayDocument, label: string, key: string) => {
  const points = motionCallPoints(play, man(play, label).id, key);
  if (!points) throw new Error(`${key} was not drawn for ${label}`);
  return points;
};

/** A symbol is about a yard round: nearer than this and two men overlap. */
const tooClose = (
  a: { lateralYards: number; depthYards: number },
  b: { lateralYards: number; depthYards: number },
) =>
  Math.abs(a.lateralYards - b.lateralYards) < 1.4 &&
  Math.abs(a.depthYards - b.depthYards) < 2;

describe("the motion types' shapes", () => {
  it("offers the five a Coach asks for, jet and orbit moving at the snap", () => {
    expect(motionCalls.map(({ name }) => name)).toEqual([
      "Jet",
      "Orbit",
      "Across",
      "Return",
      "Shift",
    ]);
    expect(
      motionCalls.filter(({ atSnap }) => atSnap === "moving").map((c) => c.key),
    ).toEqual(["jet", "orbit"]);
  });

  it("runs a jet toward the ball from either side", () => {
    const play = playIn("Gun Doubles Right");
    const fromRight = shape(play, "Z", "jet");
    const fromLeft = shape(play, "X", "jet");
    expect(fromRight[0]).toEqual(man(play, "Z").position);
    expect(fromRight.at(-1)!.lateralYards).toBeLessThan(5);
    expect(fromRight.at(-1)!.lateralYards).toBeGreaterThan(0);
    expect(fromLeft.at(-1)!.lateralYards).toBeGreaterThan(-5);
    expect(fromLeft.at(-1)!.lateralYards).toBeLessThan(0);
  });

  it("takes a jet between the line and a quarterback in the gun", () => {
    const play = playIn("Gun Doubles Right");
    const quarterback = man(play, "Q");
    const lane = shape(play, "Z", "jet").at(-1)!.depthYards;
    expect(lane).toBeLessThanOrEqual(-1.5 - 2);
    expect(lane).toBeGreaterThanOrEqual(quarterback.position.depthYards + 2);
  });

  it("takes a jet behind a quarterback under center", () => {
    const play = playIn("I-Form Right");
    const quarterback = man(play, "Q");
    const lane = shape(play, "Z", "jet").at(-1)!.depthYards;
    expect(lane).toBeLessThanOrEqual(quarterback.position.depthYards - 2);
  });

  it("bends an orbit behind the quarterback and the back beside him", () => {
    const play = playIn("Gun Doubles Right");
    const points = shape(play, "Z", "orbit");
    const end = points.at(-1)!;
    const quarterback = man(play, "Q");
    const back = man(play, "F");
    // Past the quarterback, to the far side of him, and deeper than he is.
    expect(end.lateralYards).toBeLessThan(quarterback.position.lateralYards);
    expect(end.depthYards).toBeLessThanOrEqual(
      quarterback.position.depthYards - 2,
    );
    // Already that deep before it reaches the back on the near side.
    const beforeBack = points.find(
      ({ lateralYards }) => lateralYards <= back.position.lateralYards + 1.5,
    )!;
    expect(beforeBack.depthYards).toBeLessThanOrEqual(
      back.position.depthYards - 2,
    );
  });

  it("stops an across clear of the man already in the far slot", () => {
    const play = playIn("Gun Trips Left");
    const end = shape(play, "Z", "across").at(-1)!;
    expect(end.lateralYards).toBeLessThan(-5);
    for (const other of play.players) {
      if (other.label === "Z") continue;
      expect(tooClose(end, other.position), other.label || other.id).toBe(
        false,
      );
    }
  });

  it("shifts a back away from the quarterback beside him", () => {
    const play = playIn("Gun Doubles Right");
    const back = man(play, "F");
    const quarterback = man(play, "Q");
    const end = shape(play, "F", "shift").at(-1)!;
    expect(
      Math.abs(end.lateralYards - quarterback.position.lateralYards),
    ).toBeGreaterThan(
      Math.abs(back.position.lateralYards - quarterback.position.lateralYards),
    );
  });

  it("shifts a wide receiver in toward the ball", () => {
    const play = playIn("Gun Doubles Right");
    const z = man(play, "Z");
    const end = shape(play, "Z", "shift").at(-1)!;
    expect(end.lateralYards).toBeLessThan(z.position.lateralYards);
    expect(end.lateralYards).toBeGreaterThan(z.position.lateralYards - 7);
  });

  it("brings a return back to where he started from", () => {
    const play = playIn("Gun Doubles Right");
    const z = man(play, "Z");
    const points = shape(play, "Z", "return");
    const far = points.reduce((most, point) =>
      Math.abs(point.lateralYards - z.position.lateralYards) >
      Math.abs(most.lateralYards - z.position.lateralYards)
        ? point
        : most,
    );
    expect(
      Math.abs(far.lateralYards - z.position.lateralYards),
    ).toBeGreaterThanOrEqual(4);
    expect(
      Math.abs(points.at(-1)!.lateralYards - z.position.lateralYards),
    ).toBeLessThanOrEqual(2);
  });

  it("draws nothing for a lineman, a defender or a type it does not have", () => {
    const play = playIn("Gun Doubles Right");
    const tackle = play.players.find(
      ({ label, position }) => label === "" && position.lateralYards > 3,
    )!;
    expect(motionCallPoints(play, tackle.id, "jet")).toBeUndefined();
    expect(
      motionCallPoints(play, man(play, "Z").id, "moonwalk"),
    ).toBeUndefined();
    const defender: Player = {
      ...man(play, "Z"),
      id: "corner",
      unit: "defense",
      label: "C",
      position: { lateralYards: 20, depthYards: 6 },
    };
    expect(
      motionCallPoints(
        { ...play, players: [...play.players, defender] },
        defender.id,
        "jet",
      ),
    ).toBeUndefined();
  });
});

const receiver: Player = {
  id: "wr",
  unit: "offense",
  position: { lateralYards: 12, depthYards: -1.8 },
  symbol: "circle",
  label: "Z",
  sublabel: "",
  fill: "none",
  color: "ink",
};
const slot: Player = {
  ...receiver,
  id: "slot",
  label: "H",
  position: { lateralYards: -12, depthYards: -1.8 },
};

const line = (
  partial: Partial<MovementPath> & Pick<MovementPath, "id" | "points">,
): MovementPath => ({
  kind: "route",
  playerId: "wr",
  branches: [],
  style: { line: "solid", ending: "arrow", color: "ink" },
  ...partial,
});

const timed = (
  players: readonly Player[],
  paths: readonly MovementPath[],
): PlayDocument => ({
  ...playIn("Gun Doubles Right"),
  players: [...players],
  paths: [...paths],
});

const across = (
  id: string,
  playerId: string,
  from: number,
  to: number,
  atSnap?: MovementPath["atSnap"],
): MovementPath =>
  line({
    id,
    kind: "motion",
    playerId,
    points: [
      { lateralYards: from, depthYards: -1.8 },
      { lateralYards: to, depthYards: -1.8 },
    ],
    style: { line: "zigzag", ending: "arrow", color: "ink" },
    ...(atSnap === undefined ? {} : { atSnap }),
  });

describe("what a motion is doing at the snap", () => {
  it("reads a motion nobody has chosen for as set", () => {
    expect(motionAtSnap(across("m", "wr", 12, 4))).toBe("set");
    expect(motionAtSnap(across("m", "wr", 12, 4, "moving"))).toBe("moving");
  });

  it("runs a moving motion right up to the snap", () => {
    const plan = planPlay(
      timed([receiver], [across("jet", "wr", 12, 2, "moving")]),
    );
    const motion = plan.items.find(({ path }) => path.id === "jet")!;
    expect(motion.startMs + motion.durationMs).toBe(0);
    expect(plan.startMs).toBe(-motion.durationMs);
    expect(plan.hasMotion).toBe(true);
  });

  it("leaves a set motion its breath when another man's is moving", () => {
    const plan = planPlay(
      timed(
        [receiver, slot],
        [
          across("jet", "wr", 12, 2, "moving"),
          across("shift", "slot", -12, -9, "set"),
        ],
      ),
    );
    const moving = plan.items.find(({ path }) => path.id === "jet")!;
    const set = plan.items.find(({ path }) => path.id === "shift")!;
    expect(moving.startMs + moving.durationMs).toBe(0);
    expect(set.startMs + set.durationMs).toBe(-MOTION_GAP_MS);
    expect(plan.startMs).toBe(Math.min(moving.startMs, set.startMs));
  });

  it("times a motion saved before the choice existed as it always was", () => {
    const plan = planPlay(timed([receiver], [across("old", "wr", 12, 2)]));
    const motion = plan.items.find(({ path }) => path.id === "old")!;
    expect(motion.startMs + motion.durationMs).toBe(-MOTION_GAP_MS);
    expect(plan.startMs).toBe(-(motion.durationMs + MOTION_GAP_MS));
  });

  it("carries a moving man straight into the route that starts where it ends", () => {
    const document = timed(
      [receiver],
      [
        across("jet", "wr", 12, 2, "moving"),
        line({
          id: "go",
          points: [
            { lateralYards: 2, depthYards: -1.8 },
            { lateralYards: 2, depthYards: 10 },
          ],
        }),
      ],
    );
    const plan = planPlay(document);
    const before = playerPositionAt(plan, receiver, -1);
    const after = playerPositionAt(plan, receiver, 1);
    expect(Math.abs(before.lateralYards - 2)).toBeLessThan(0.1);
    expect(Math.abs(after.lateralYards - 2)).toBeLessThan(0.1);
  });

  it("never has a moving man in two places when his route starts elsewhere", () => {
    const document = timed(
      [receiver],
      [
        across("jet", "wr", 12, 2, "moving"),
        // His route still sets out from his stance, ten yards away.
        line({
          id: "go",
          points: [
            { lateralYards: 12, depthYards: -1.8 },
            { lateralYards: 12, depthYards: 10 },
          ],
        }),
      ],
    );
    const plan = planPlay(document);
    const motion = plan.items.find(({ path }) => path.id === "jet")!;
    // He cannot carry on from where the motion leaves him, so he is given
    // the breath to get back, the way a set motion is.
    expect(motion.startMs + motion.durationMs).toBe(-MOTION_GAP_MS);
    const justBefore = playerPositionAt(plan, receiver, -1);
    expect(Math.abs(justBefore.lateralYards - 12)).toBeLessThan(0.5);
  });
});
