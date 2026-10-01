import {
  applyDefensiveCall,
  applyFormation,
  currentBallSpot,
  currentDefensiveCall,
  defensiveCallName,
  defensiveFieldOf,
  emptyPlayDocument,
  hashSpots,
  highSchoolFieldProfile,
  linePresetByKey,
  spotBall,
  stockDefensiveCalls,
  stockFormations,
  type DefensiveCall,
  type PlayDocument,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * Where the ball is on a defensive Play, and whether the call keeps its name
 * once the ball has moved (issue #159). The Coach's journey — 4-3 Cover 3
 * alone on the field, the ball spotted on each hash, undone, redone, reloaded
 * and printed — is `tests/e2e/defensive-hash.spec.ts`. These are the ways the
 * reading could be wrong while that journey still looked right:
 *
 * - the spot read off a front the hash has squeezed, whose middle the squeeze
 *   pulled toward the field;
 * - the same hash pressed twice moving the whole defense again, because the
 *   mapping read the ball off an offense that is not there;
 * - a move from one hash to the other leaving the men over the ball in the
 *   middle of the field;
 * - the field's own ball — what the gaps and the landmarks are measured
 *   from — read short of the hash, so a curl/flat lands five yards inside;
 * - corners pressed at the line, one squeezed in by the hash, counted as the
 *   front and dragging the ball with them;
 * - a defense dragged off every spot snapped to the nearest hash anyway;
 * - one end dragged wider moving the ball, and every gap with it;
 * - the call losing its name on the hash, or with a shadow offense wider than
 *   its corners whose squeeze it took, or back in the middle with the squeeze
 *   still in it;
 * - one man moved on the hash still reading as the call, or reading as a
 *   custom front with no word of where it came from;
 * - a call read with its man calls on losing its name on the hash;
 * - one stock call on the hash reading as another.
 */

let nextId = 0;
const makeId = (prefix: string) => `${prefix}_${(nextId += 1)}`;

const callNamed = (name: string): DefensiveCall => {
  const call = stockDefensiveCalls.find(
    ({ formation }) => formation.name === name,
  );
  if (!call) throw new Error(`No such call: ${name}`);
  return call;
};

const blank = (): PlayDocument =>
  emptyPlayDocument({
    playbookId: "playbook_hash",
    fieldProfile: highSchoolFieldProfile,
    id: "play_hash",
    unit: "defense",
  });

/** A call alone on the field, with or without its lines. */
const defenseAlone = (name: string, withAssignments = true): PlayDocument =>
  applyDefensiveCall(blank(), callNamed(name), makeId, { withAssignments })
    .play;

const named = (play: PlayDocument) =>
  currentDefensiveCall(play, stockDefensiveCalls)?.formation.name;

const men = (play: PlayDocument, label: string) =>
  play.players.filter(
    (player) => player.unit === "defense" && player.label === label,
  );

/** A man dragged by hand, nothing else touched. */
function drag(
  play: PlayDocument,
  playerId: string,
  by: { readonly lateralYards: number; readonly depthYards: number },
): PlayDocument {
  return {
    ...play,
    players: play.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            position: {
              lateralYards: player.position.lateralYards + by.lateralYards,
              depthYards: player.position.depthYards + by.depthYards,
            },
          }
        : player,
    ),
  };
}

const laterals = (play: PlayDocument) =>
  new Map(play.players.map(({ id, position }) => [id, position.lateralYards]));

describe("where the ball is on a defense drawn alone", () => {
  it("reads the right hash off a front the hash squeezed", () => {
    const { play, tightened } = spotBall(defenseAlone("4-3 Cover 3"), "right");
    // The boundary corner had to come in, which pulls the front's middle
    // toward the field; the ball is still on the hash.
    expect(tightened).toBe(true);
    expect(currentBallSpot(play)).toBe("right");
    expect(currentBallSpot(spotBall(play, "left").play)).toBe("left");
  });

  it("moves nobody when the hash the ball is on is spotted again", () => {
    const once = spotBall(defenseAlone("4-3 Cover 3"), "right").play;
    const twice = spotBall(once, "right").play;
    for (const [id, lateral] of laterals(once)) {
      expect(laterals(twice).get(id)).toBeCloseTo(lateral, 9);
    }
  });

  it("carries the men over the ball from one hash to the other", () => {
    const right = spotBall(defenseAlone("4-3 Cover 3"), "right").play;
    const left = spotBall(right, "left").play;
    for (const label of ["M", "F"]) {
      const [man] = men(left, label);
      expect(man!.position.lateralYards).toBeCloseTo(hashSpots(left).left, 9);
    }
  });

  it("measures the gaps and the landmarks from the hash", () => {
    const { play } = spotBall(defenseAlone("4-3 Cover 3"), "right");
    const field = defensiveFieldOf(play);
    const hash = hashSpots(play).right;
    expect(field.ballLateralYards).toBeCloseTo(hash, 9);
    // The front is the four linemen, whatever the squeeze did to them.
    expect(field.front).toHaveLength(4);
    // The strong-side backer's curl/flat sits twelve yards outside the hash.
    const [sam] = men(play, "S");
    const curl = linePresetByKey("curlflat")!.pointsFrom(sam!.position, field);
    expect(curl.at(-1)!.lateralYards).toBeCloseTo(hash + 12, 9);
  });

  it("does not count corners pressed at the line as the front", () => {
    // Nickel Cover 2 presses both corners; on the right hash the boundary one
    // is squeezed in toward the front.
    const { play } = spotBall(defenseAlone("Nickel Cover 2"), "right");
    expect(currentBallSpot(play)).toBe("right");
    expect(defensiveFieldOf(play).ballLateralYards).toBeCloseTo(
      hashSpots(play).right,
      9,
    );
    expect(defensiveFieldOf(play).front).toHaveLength(4);
  });

  it("reads a defense dragged off every spot where it stands", () => {
    const start = defenseAlone("4-3 Cover 3");
    const dragged = {
      ...start,
      players: start.players.map((player) => ({
        ...player,
        position: {
          ...player.position,
          lateralYards: player.position.lateralYards + 4,
        },
      })),
    };
    expect(currentBallSpot(dragged)).toBeUndefined();
    expect(defensiveFieldOf(dragged).ballLateralYards).toBeCloseTo(4, 9);
  });

  it("keeps the ball where it is when one end is dragged wider", () => {
    const start = defenseAlone("4-3 Cover 3");
    const rightEnd = men(start, "E").sort(
      (left, right) => right.position.lateralYards - left.position.lateralYards,
    )[0]!;
    const dragged = drag(start, rightEnd.id, {
      lateralYards: 2,
      depthYards: 0,
    });
    expect(currentBallSpot(dragged)).toBe("middle");
    expect(defensiveFieldOf(dragged).ballLateralYards).toBe(0);
  });
});

describe("a call on the hash is still that call", () => {
  it("keeps its name spotted on either hash and brought back to the middle", () => {
    const start = defenseAlone("4-3 Cover 3");
    const right = spotBall(start, "right").play;
    expect(named(right)).toBe("4-3 Cover 3");
    expect(named(spotBall(right, "left").play)).toBe("4-3 Cover 3");
    // Coming back does not undo the squeeze, and the name survives that too.
    const back = spotBall(right, "middle").play;
    expect(named(back)).toBe("4-3 Cover 3");
    expect(currentBallSpot(back)).toBe("middle");
  });

  it("keeps its name under a shadow offense wider than its corners", () => {
    const doubles = stockFormations.find(
      ({ name }) => name === "Gun Doubles Right",
    )!;
    const offense = applyFormation(
      emptyPlayDocument({
        playbookId: "playbook_hash",
        fieldProfile: highSchoolFieldProfile,
        id: "play_hash_offense",
      }),
      doubles,
      makeId,
    ).play;
    const both = applyDefensiveCall(offense, callNamed("4-3 Cover 3"), makeId, {
      withAssignments: false,
    }).play;
    // The set's widest man is wider than the corners, so the hash squeezes
    // the defense by the offense's factor rather than its own.
    const { play, tightened } = spotBall(both, "right");
    expect(tightened).toBe(true);
    expect(currentBallSpot(play)).toBe("right");
    expect(named(play)).toBe("4-3 Cover 3");
  });

  it("becomes a custom front named for its source once one man moves", () => {
    const right = spotBall(defenseAlone("4-3 Cover 3"), "right").play;
    const [mike] = men(right, "M");
    const moved = drag(right, mike!.id, { lateralYards: 2, depthYards: 0 });
    expect(named(moved)).toBeUndefined();
    expect(defensiveCallName(moved)).toBe("Custom · from 4-3 Cover 3");
    expect(defensiveCallName(right)).toBe("4-3 Cover 3");
    // A defense the Play does not remember a call for has no source to name.
    const unremembered = { ...moved };
    delete unremembered.defensiveCallSource;
    expect(defensiveCallName(unremembered)).toBe("Custom front");
  });

  it("reads a call with its man calls on when it is on the hash", () => {
    const trips = stockFormations.find(
      ({ name }) => name === "Gun Trips Right",
    )!;
    const offense = applyFormation(
      emptyPlayDocument({
        playbookId: "playbook_hash",
        fieldProfile: highSchoolFieldProfile,
        id: "play_hash_man",
      }),
      trips,
      makeId,
    ).play;
    const both = applyDefensiveCall(
      offense,
      callNamed("Nickel Cover 1"),
      makeId,
    ).play;
    expect(named(both)).toBe("Nickel Cover 1");
    expect(named(spotBall(both, "left").play)).toBe("Nickel Cover 1");
  });

  it("reads every stock call on either hash as it reads in the middle", () => {
    for (const call of stockDefensiveCalls) {
      const alone = defenseAlone(call.formation.name);
      // Two calls can stand their men alike — Tampa 2 is Cover 2 until the
      // Mike drops — so the hash has to give the same answer as the middle,
      // whichever of the two that is.
      const inTheMiddle = named(alone);
      expect(inTheMiddle).toBeDefined();
      for (const spot of ["left", "right"] as const) {
        const { play } = spotBall(alone, spot);
        expect(currentBallSpot(play)).toBe(spot);
        expect(named(play)).toBe(inTheMiddle);
      }
    }
  });
});
