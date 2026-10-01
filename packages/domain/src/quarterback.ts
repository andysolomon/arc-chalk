import { assignRoles, ballLateralYards, offensivePlayers } from "./formations";
import {
  handednessOf,
  routePresetNames,
  routePresetPoints,
} from "./route-catalogue";
import { playSideOf, snapSpotOf, tackleBoxOf, type PlaySide } from "./run-game";
import type { Coordinate, PathPoint, PlayDocument, Player } from "./schema";

/**
 * What a quarterback is asked to do. The route tree is a receiver's — a
 * quarterback does not run a slant or a corner — so he is offered his own
 * calls instead: how he drops, how he fakes and moves the pocket, and how he
 * gives the ball or keeps it. Each is drawn as his own line, the way the
 * original draws a quarterback's drop, from where he takes the snap.
 *
 * A drop is shorter from the gun than from under center, because he is
 * already deep, and every drop stays on the painted field. A fake, a
 * handoff and a read open to the side the run is going, read off the Play
 * the way a pull is (ADR 0065). The boot and the sprint-out name their side,
 * because that is how a play caller says them.
 */

/** One call a man can be given off a catalogue of route-like shapes. */
export interface RouteCall {
  readonly key: string;
  readonly name: string;
}

export interface QuarterbackCall extends RouteCall {
  /** Whether it is a throw he sets up for or a run he hands off or keeps. */
  readonly game: "pass" | "run";
}

/** Every quarterback call, in the order he is offered them. */
export const quarterbackCalls: readonly QuarterbackCall[] = Object.freeze([
  { key: "drop3", name: "3-step drop", game: "pass" },
  { key: "drop5", name: "5-step drop", game: "pass" },
  { key: "drop7", name: "7-step drop", game: "pass" },
  { key: "playaction", name: "Play action", game: "pass" },
  { key: "bootleft", name: "Boot left", game: "pass" },
  { key: "bootright", name: "Boot right", game: "pass" },
  { key: "sprintleft", name: "Sprint out left", game: "pass" },
  { key: "sprintright", name: "Sprint out right", game: "pass" },
  { key: "handoff", name: "Handoff", game: "run" },
  { key: "zoneread", name: "Zone read", game: "run" },
  { key: "sneak", name: "QB sneak", game: "run" },
  { key: "qbdraw", name: "QB draw", game: "run" },
] as const);

const quarterbackCallKeys: ReadonlySet<string> = new Set(
  quarterbackCalls.map(({ key }) => key),
);

export const isQuarterbackCall = (key: string): boolean =>
  quarterbackCallKeys.has(key);

/** The name of a call off the route tree or the quarterback's catalogue. */
export function routeCallName(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  return (
    routePresetNames.find((call) => call.key === key)?.name ??
    quarterbackCalls.find((call) => call.key === key)?.name
  );
}

/** Whether this man is the quarterback, read the way the roster reads him. */
export function isQuarterback(
  play: Pick<PlayDocument, "players">,
  player: Pick<Player, "id" | "unit">,
): boolean {
  if (player.unit === "defense") return false;
  const offense = play.players.filter(({ unit }) => unit !== "defense");
  const index = offense.findIndex(({ id }) => id === player.id);
  return index >= 0 && assignRoles(offense)[index] === "QB";
}

/** The calls a man who runs routes is offered: his own, if he is the quarterback. */
export function routeCallsFor(
  play: Pick<PlayDocument, "players">,
  player: Pick<Player, "id" | "unit">,
): readonly RouteCall[] {
  return isQuarterback(play, player) ? quarterbackCalls : routePresetNames;
}

/**
 * How far back each drop takes him. Under center he has to get away from
 * the line first, so a drop is longer; in the gun or the pistol he is
 * already deep, and the same call is shorter. Even the shortest is drawn
 * long enough to show past the man himself.
 */
const DROP_YARDS = {
  underCenter: { drop3: 2, drop5: 3.5, drop7: 5 },
  gun: { drop3: 1.75, drop5: 2.5, drop7: 3.25 },
} as const;
/**
 * Deeper than this off the ball and he took the snap in the gun or the
 * pistol. The original stands him four yards off it under center, a little
 * over five in the pistol and six in the gun.
 */
const GUN_DEPTH_YARDS = -4.5;
/** The original paints ten yards behind the line; a drop stays on it. */
const DEEPEST_YARDS = -9.5;
/** However deep he already is, a drop is at least a step back. */
const MIN_DROP_YARDS = 1;
/** How far outside the edge a moving pocket gets. */
const OUTSIDE_EDGE_YARDS = 3.5;
/** Without a line to read, how far from the ball the edge is. */
const EDGE_WITHOUT_LINE_YARDS = 4;
/** Where he meets the back: a step and a half to the side, a little deeper. */
const MESH_ACROSS_YARDS = 1.5;
const MESH_BACK_YARDS = 1.25;
/** How far a back has to be off to one side for the side to be his. */
const OFFSET_BACK_YARDS = 1;
/** How far past the line a sneak, a draw and a keep finish. */
const SNEAK_PAST_LOS_YARDS = 1.5;
const RUN_PAST_LOS_YARDS = 4;

const at = (lateralYards: number, depthYards: number): Coordinate => ({
  lateralYards,
  depthYards,
});

/** The side a back offset beside the quarterback stands on, if he is. */
function backSideOf(
  play: PlayDocument,
  quarterbackId: string,
  stance: Coordinate,
): PlaySide | undefined {
  const offense = offensivePlayers(play);
  const roles = assignRoles(offense);
  const backs = offense.filter(
    (man, index) => roles[index] === "RB" && man.id !== quarterbackId,
  );
  const nearest = backs.reduce<Player | undefined>(
    (best, man) =>
      !best ||
      Math.hypot(
        man.position.lateralYards - stance.lateralYards,
        man.position.depthYards - stance.depthYards,
      ) <
        Math.hypot(
          best.position.lateralYards - stance.lateralYards,
          best.position.depthYards - stance.depthYards,
        )
        ? man
        : best,
    undefined,
  );
  if (!nearest) return undefined;
  const offset = nearest.position.lateralYards - stance.lateralYards;
  if (Math.abs(offset) < OFFSET_BACK_YARDS) return undefined;
  return offset > 0 ? 1 : -1;
}

/**
 * The side his fake, handoff or mesh opens to: the side the Play says the
 * run is going, else the side his back is offset to, else the right.
 */
function runSideOf(
  play: PlayDocument,
  quarterbackId: string,
  stance: Coordinate,
): PlaySide {
  return (
    playSideOf(play, quarterbackId) ??
    backSideOf(play, quarterbackId, stance) ??
    1
  );
}

/**
 * The quarterback's line for a call, from `from` — where he takes the snap,
 * unless a line is being run on from somewhere else. Undefined for a key
 * that is not one of his calls.
 */
export function quarterbackCallPoints(
  play: PlayDocument,
  playerId: string,
  key: string,
  from: Coordinate = snapSpotOf(play, playerId),
): readonly PathPoint[] | undefined {
  if (!isQuarterbackCall(key)) return undefined;
  const ball = ballLateralYards(offensivePlayers(play));
  const box = tackleBoxOf(play);
  const edge = (side: PlaySide): number =>
    box
      ? side > 0
        ? box.edges.right
        : box.edges.left
      : ball + side * EDGE_WITHOUT_LINE_YARDS;
  const outside = (side: PlaySide): number =>
    edge(side) + side * OUTSIDE_EDGE_YARDS;
  const gap = (side: PlaySide, letter: "A" | "B"): number => {
    const name = `${letter} gap ${side > 0 ? "right" : "left"}`;
    return (
      box?.gaps.find((candidate) => candidate.name === name)?.lateralYards ??
      ball + side * (letter === "A" ? 1 : 2)
    );
  };
  /** The depth this many yards behind where he took the snap. */
  const back = (yards: number): number =>
    Math.max(
      from.depthYards - yards,
      Math.min(DEEPEST_YARDS, from.depthYards - MIN_DROP_YARDS),
    );
  const drops =
    from.depthYards < GUN_DEPTH_YARDS ? DROP_YARDS.gun : DROP_YARDS.underCenter;
  const run = runSideOf(play, playerId, from);
  const mesh = (side: PlaySide): Coordinate =>
    at(
      from.lateralYards + side * MESH_ACROSS_YARDS,
      from.depthYards - MESH_BACK_YARDS,
    );
  const boot = (side: PlaySide): readonly PathPoint[] => [
    from,
    // He fakes the run away from where he is going …
    at(from.lateralYards - side * MESH_ACROSS_YARDS, from.depthYards - 1),
    // … bends back behind the guard on the boot side …
    at(ball + side * MESH_ACROSS_YARDS, back(2.5)),
    // … and gets outside the edge, still behind the line.
    at(outside(side), back(1.5)),
  ];
  const sprint = (side: PlaySide): readonly PathPoint[] => [
    from,
    at(from.lateralYards + side * 2.5, back(2)),
    at(outside(side), back(1.5)),
  ];

  switch (key) {
    case "drop3":
    case "drop5":
    case "drop7":
      return [from, at(from.lateralYards, back(drops[key]))];
    case "playaction": {
      // He fakes at the mesh and sets straight back off it, clear of a back
      // lined up behind him.
      const fake = mesh(run);
      return [from, fake, at(fake.lateralYards, back(drops.drop5))];
    }
    case "bootleft":
      return boot(-1);
    case "bootright":
      return boot(1);
    case "sprintleft":
      return sprint(-1);
    case "sprintright":
      return sprint(1);
    case "handoff":
      return [from, mesh(run)];
    case "zoneread": {
      // The back takes the run side; he reads the backside end and keeps
      // it outside him.
      const keep = -run as PlaySide;
      const line = box?.lineDepthYards ?? 0;
      return [
        from,
        at(edge(keep) + keep * 1.5, line - 1.5),
        at(edge(keep) + keep * 2.5, RUN_PAST_LOS_YARDS),
      ];
    }
    case "sneak":
      return [from, at(gap(run, "A"), SNEAK_PAST_LOS_YARDS)];
    case "qbdraw": {
      // He shows pass, then runs up through the line on the run side. The
      // drop leans that way, so the run goes up beside where he stood
      // rather than back over him.
      const hole = gap(run, "B");
      const line = box?.lineDepthYards ?? 0;
      return [
        from,
        at(from.lateralYards + run, back(2)),
        at(hole, line - 0.5),
        at(hole, RUN_PAST_LOS_YARDS),
      ];
    }
    default:
      return undefined;
  }
}

/**
 * The shape for any call a man who runs routes can be given: the
 * quarterback's own, read off the Play, or one off the route tree, measured
 * from his own spot and turned out to his side of the ball.
 */
export function routeCallPoints(
  play: PlayDocument,
  playerId: string,
  key: string,
  from: Coordinate,
): readonly PathPoint[] | undefined {
  if (isQuarterbackCall(key)) {
    return quarterbackCallPoints(play, playerId, key, from);
  }
  return routePresetPoints(key, from, handednessOf(snapSpotOf(play, playerId)));
}
