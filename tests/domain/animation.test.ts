import {
  evaluateMovement,
  evaluatePlayAt,
  formatPlaybackClock,
  frameSequenceTimes,
  isHitchSitDown,
  planPlay,
  playKeyFrames,
  resolvePathTiming,
  stickThunderPlay,
  type MovementPath,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

const receiver: Player = {
  id: "wr",
  unit: "offense",
  position: { lateralYards: -12, depthYards: 0 },
  symbol: "circle",
  label: "X",
  sublabel: "",
  fill: "none",
  color: "ink",
};

const back: Player = {
  ...receiver,
  id: "h",
  label: "H",
  position: { lateralYards: -2, depthYards: -5 },
};

const lineman: Player = {
  ...receiver,
  id: "lt",
  label: "",
  position: { lateralYards: -4, depthYards: -1.5 },
};

const defender: Player = {
  ...receiver,
  id: "s",
  unit: "defense",
  label: "S",
  position: { lateralYards: 0, depthYards: 12 },
};

function path(
  partial: Partial<MovementPath> & Pick<MovementPath, "points">,
): MovementPath {
  return {
    id: "route-1",
    kind: "route",
    playerId: "wr",
    branches: [],
    style: { line: "solid", ending: "arrow", color: "ink" },
    ...partial,
  };
}

function playOf(
  players: readonly Player[],
  paths: readonly MovementPath[],
): PlayDocument {
  return {
    ...stickThunderPlay,
    id: "play-anim",
    name: "Animation fixture",
    players: [...players],
    paths: [...paths],
    labels: [],
    assignments: [],
  };
}

describe("route timing defaults", () => {
  it("gives a hitch a sit-down hold and a back a beat of delay", () => {
    const hitch = path({
      points: [
        { lateralYards: 0, depthYards: 0 },
        { lateralYards: 0, depthYards: 6 },
        { lateralYards: 1, depthYards: 5 },
      ],
    });
    expect(isHitchSitDown(hitch)).toBe(true);
    expect(resolvePathTiming(hitch, receiver).holdSeconds).toBe(0.6);
    expect(
      resolvePathTiming(path({ points: hitch.points }), back).delayBeats,
    ).toBe(0.5);
    expect(
      resolvePathTiming(path({ points: hitch.points }), receiver).delayBeats,
    ).toBe(0);
  });

  it("slows linemen, drops, and blocks without rewriting a stored speed", () => {
    const stem = path({
      points: [
        { lateralYards: 0, depthYards: 0 },
        { lateralYards: 0, depthYards: 8 },
      ],
    });
    const receiverTime = resolvePathTiming(stem, receiver);
    const lineTime = resolvePathTiming(stem, lineman);
    const drop = resolvePathTiming({ ...stem, kind: "zone" }, defender);
    expect(lineTime.durationMs).toBeGreaterThan(receiverTime.durationMs);
    expect(drop.holdSeconds).toBe(0.8);
    expect(drop.delayBeats).toBe(0.2);
    const faster = resolvePathTiming(
      { ...stem, timing: { delayMs: 0, holdMs: 0, speedMultiplier: 2 } },
      receiver,
    );
    expect(faster.durationMs).toBeLessThan(receiverTime.durationMs);
  });
});

describe("play animation plan", () => {
  it("runs motion before the snap and keeps snap at 0", () => {
    const motion = path({
      id: "jet",
      kind: "motion",
      playerId: "wr",
      points: [
        { lateralYards: 12, depthYards: 0 },
        { lateralYards: 0, depthYards: 0 },
      ],
    });
    const route = path({
      id: "go",
      playerId: "wr",
      points: [
        { lateralYards: 0, depthYards: 0 },
        { lateralYards: 0, depthYards: 12 },
      ],
    });
    const plan = planPlay(playOf([receiver], [motion, route]));
    expect(plan.snapMs).toBe(0);
    expect(plan.hasMotion).toBe(true);
    expect(plan.startMs).toBeLessThan(0);
    const plannedMotion = plan.items.find((item) => item.path.id === "jet")!;
    const plannedRoute = plan.items.find((item) => item.path.id === "go")!;
    expect(plannedMotion.startMs + plannedMotion.durationMs).toBeLessThan(0);
    expect(plannedRoute.startMs).toBeGreaterThanOrEqual(0);
  });

  it("moves a receiver at constant pace through a break", () => {
    const broken = path({
      points: [
        { lateralYards: 0, depthYards: 0 },
        { lateralYards: 0, depthYards: 8 },
        { lateralYards: 8, depthYards: 8 },
      ],
    });
    const document = playOf([receiver], [broken]);
    const plan = planPlay(document);
    const item = plan.items[0]!;
    const mid = evaluatePlayAt(
      document,
      item.startMs + Math.round(item.durationMs / 2),
      plan,
    );
    const position = mid.playerPositions.wr!;
    // Halfway along 16 yards is the break at 8 yards deep.
    expect(position.depthYards).toBeCloseTo(8, 1);
    expect(position.lateralYards).toBeCloseTo(0, 1);
  });

  it("evaluates the same integer timestamp from playback or a seek", () => {
    const document = stickThunderPlay;
    const plan = planPlay(document);
    const atMs = Math.round(plan.endMs / 2);
    expect(evaluatePlayAt(document, atMs, plan)).toEqual(
      evaluatePlayAt(
        structuredClone(document),
        atMs,
        planPlay(structuredClone(document)),
      ),
    );
    expect(() => evaluatePlayAt(document, 1.5)).toThrow("integer milliseconds");
  });

  it("leaves a man at his stance until his line starts, then at his end", () => {
    const stem = path({
      playerId: "wr",
      timing: { delayMs: 400, holdMs: 0 },
      points: [
        { lateralYards: -12, depthYards: 0 },
        { lateralYards: -12, depthYards: 10 },
      ],
    });
    const document = playOf([receiver], [stem]);
    const plan = planPlay(document);
    const before = evaluatePlayAt(document, 0, plan);
    const after = evaluatePlayAt(document, plan.endMs, plan);
    expect(before.playerPositions.wr).toEqual(receiver.position);
    expect(after.playerPositions.wr?.depthYards).toBeCloseTo(10, 1);
  });

  it("formats the clock from the snap, with a minus for pre-snap time", () => {
    expect(formatPlaybackClock(0)).toBe("0.0s");
    expect(formatPlaybackClock(1400)).toBe("1.4s");
    expect(formatPlaybackClock(-1200)).toBe("\u22121.2s");
  });

  it("names the four progression frames and a 0.2s frame sequence", () => {
    const plan = planPlay(stickThunderPlay);
    const frames = playKeyFrames(stickThunderPlay, plan);
    expect(frames.map((frame) => frame.name)).toEqual([
      "Snap",
      "First break",
      "Throw",
      "Finish",
    ]);
    expect(frames[0]?.atMs).toBe(0);
    expect(frames[3]?.atMs).toBe(plan.endMs);
    const times = frameSequenceTimes(plan);
    expect(times[0]).toBe(plan.startMs);
    expect(times.at(-1)).toBe(plan.endMs);
    expect(times.length).toBeGreaterThan(1);
    expect(times[1]! - times[0]!).toBe(200);
  });
});

describe("single-path evaluation", () => {
  it("still samples a stored path at an integer millisecond", () => {
    const route = stickThunderPlay.paths.find(
      (candidate) => candidate.id === "rx",
    )!;
    const first = evaluateMovement(route, 750);
    expect(first.phase).toBe("moving");
    expect(evaluateMovement(structuredClone(route), 750)).toEqual(first);
  });
});
