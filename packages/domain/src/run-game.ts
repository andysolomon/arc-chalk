import { isLineman } from "./classifications";
import type {
  Coordinate,
  MovementPath,
  PathPoint,
  PlayDocument,
  Player,
} from "./schema";

/**
 * The run game, read off the Play (issue #164). A pull goes to the play side,
 * a back's kick-out and lead block go upfield to the edge, and a break drawn
 * in the box lands in a gap rather than on a man. None of it is stored: the
 * side a run is going is whatever the Play already says, so a Coach who
 * changes the down blocks changes where the next pull goes.
 */

/** Right is 1, left is −1, the way lateral yards run. */
export type PlaySide = 1 | -1;

/** Calls that block down, toward the ball: the play is going the other way. */
const DOWN_CALLS: ReadonlySet<string> = new Set(["down", "climb"]);

/** Calls that pull: the man runs to the play side. */
export const PULL_CALLS: ReadonlySet<string> = new Set([
  "kick",
  "wrap",
  "trap",
]);

/** A line that moves less than this across the field says nothing about a side. */
const SIDE_SIGNAL_YARDS = 1;

/** Deeper than this behind the ball and he is a back, who might carry it. */
const BACKFIELD_DEPTH_YARDS = -2;

/** How far off the line's depth a man can be and still be on it. */
const ON_LINE_YARDS = 1;

/** How far outside the end of the line a man can be and still be attached. */
const ATTACHED_YARDS = 3.5;

/** How far outside the end man the last gap is. */
const OUTSIDE_GAP_YARDS = 1;

/** How much ground around the men on the line counts as the box. */
const BOX_LATERAL_MARGIN_YARDS = 2;
const BOX_DEPTH_BEHIND_YARDS = 3;
const BOX_DEPTH_PAST_LOS_YARDS = 3;

const GAP_LETTERS = "ABCDEFG";

const signOf = (value: number): -1 | 0 | 1 =>
  value > 0 ? 1 : value < 0 ? -1 : 0;

function netLateral(path: MovementPath): number {
  const first = path.points[0];
  const last = path.points.at(-1);
  if (!first || !last) return 0;
  return last.lateralYards - first.lateralYards;
}

const isQuarterback = (player: Player): boolean =>
  /^(Q|QB)$/i.test(player.label.trim());

/** Where a man is at the snap: at the end of his motion, if he has one. */
export function snapSpotOf(play: PlayDocument, playerId: string): Coordinate {
  const motion = play.paths
    .filter(
      (path) =>
        path.playerId === playerId &&
        path.kind === "motion" &&
        path.points.length > 1,
    )
    .at(-1);
  const end = motion?.points.at(-1);
  if (end)
    return { lateralYards: end.lateralYards, depthYards: end.depthYards };
  const player = play.players.find(({ id }) => id === playerId);
  return player?.position ?? { lateralYards: 0, depthYards: 0 };
}

/**
 * Which way the run is going, read in the order a coach would read the
 * diagram: the down blocks first — the play side blocks down, away from the
 * hole — then the ball carrier's path, then any other man already pulling,
 * then the strength of the set. The man being given a call is left out, so
 * his own old pull does not decide his new one. Nothing to read is no side.
 */
export function playSideOf(
  play: PlayDocument,
  exceptPlayerId?: string,
): PlaySide | undefined {
  const players = new Map(play.players.map((player) => [player.id, player]));
  const offense = (path: MovementPath): Player | undefined => {
    if (path.playerId === exceptPlayerId) return undefined;
    const player = players.get(path.playerId);
    return player && player.unit !== "defense" ? player : undefined;
  };
  const decided = (total: number): PlaySide | undefined => {
    const sign = signOf(total);
    return sign === 0 ? undefined : sign;
  };
  const moved = (path: MovementPath): number => {
    const across = netLateral(path);
    return Math.abs(across) < SIDE_SIGNAL_YARDS * 0.5 ? 0 : signOf(across);
  };

  const downs = play.paths.reduce((total, path) => {
    if (path.kind !== "block" || !path.preset || !DOWN_CALLS.has(path.preset))
      return total;
    return offense(path) ? total - moved(path) : total;
  }, 0);
  const byDowns = decided(downs);
  if (byDowns) return byDowns;

  const carried = new Set<string>();
  const carriers = play.paths.reduce((total, path) => {
    const player = offense(path);
    if (path.kind !== "route" || !player || carried.has(player.id))
      return total;
    if (isLineman(player) || isQuarterback(player)) return total;
    const inMotion = play.paths.some(
      (line) => line.playerId === player.id && line.kind === "motion",
    );
    if (!inMotion && player.position.depthYards > BACKFIELD_DEPTH_YARDS)
      return total;
    // His base stem is the run; alternates are other calls he could run.
    carried.add(player.id);
    const across = netLateral(path);
    return Math.abs(across) < SIDE_SIGNAL_YARDS
      ? total
      : total + signOf(across);
  }, 0);
  const byCarrier = decided(carriers);
  if (byCarrier) return byCarrier;

  const pulls = play.paths.reduce((total, path) => {
    if (path.kind !== "block" || !path.preset || !PULL_CALLS.has(path.preset))
      return total;
    return offense(path) ? total + moved(path) : total;
  }, 0);
  const byPulls = decided(pulls);
  if (byPulls) return byPulls;

  const box = tackleBoxOf(play);
  if (!box) return undefined;
  const attached = box.men.filter((man) => !isLineman(man));
  return decided(
    attached.reduce(
      (total, man) => total + signOf(man.position.lateralYards),
      0,
    ),
  );
}

export interface TackleBoxGap {
  readonly lateralYards: number;
  /** What a coach calls it: "A gap right". */
  readonly name: string;
}

export interface TackleBox {
  /** The men on the line, the tight ends with them, left to right. */
  readonly men: readonly Player[];
  readonly gaps: readonly TackleBoxGap[];
  /** Where the end man on each side stands. */
  readonly edges: { readonly left: number; readonly right: number };
  readonly lineDepthYards: number;
  readonly bounds: {
    readonly left: number;
    readonly right: number;
    readonly back: number;
    readonly front: number;
  };
}

/**
 * The box: the offensive line and anybody attached to it, and the gaps
 * between them named out from the ball — A beside the centre, then B, C and
 * on, with one more outside the end man. A split end on the line is not
 * attached, so he is not in it. With fewer than two linemen there are no
 * gaps between anybody, and so no box.
 */
export function tackleBoxOf(play: PlayDocument): TackleBox | undefined {
  const linemen = play.players
    .filter((player) => player.unit !== "defense" && isLineman(player))
    .sort((a, b) => a.position.lateralYards - b.position.lateralYards);
  if (linemen.length < 2) return undefined;
  const lineDepthYards =
    linemen.reduce((sum, { position }) => sum + position.depthYards, 0) /
    linemen.length;

  const men = [...linemen];
  const others = play.players
    .filter(
      (player) =>
        player.unit !== "defense" &&
        !isLineman(player) &&
        Math.abs(player.position.depthYards - lineDepthYards) <= ON_LINE_YARDS,
    )
    .sort((a, b) => a.position.lateralYards - b.position.lateralYards);
  const attach = (side: PlaySide): void => {
    const pool = side > 0 ? others : [...others].reverse();
    for (const player of pool) {
      const end = side > 0 ? men.at(-1)! : men[0]!;
      const beyond =
        (player.position.lateralYards - end.position.lateralYards) * side;
      if (beyond <= 0) continue;
      if (beyond > ATTACHED_YARDS) break;
      if (side > 0) men.push(player);
      else men.unshift(player);
    }
  };
  attach(1);
  attach(-1);

  // The centre is whoever of the line stands nearest the ball.
  const centre = linemen.reduce((best, player) =>
    Math.abs(player.position.lateralYards) <
    Math.abs(best.position.lateralYards)
      ? player
      : best,
  );
  const at = men.indexOf(centre);
  const gaps: TackleBoxGap[] = [];
  const between = (left: Player, right: Player): number =>
    (left.position.lateralYards + right.position.lateralYards) / 2;
  for (let index = at - 1, letter = 0; index >= -1; index -= 1, letter += 1) {
    const name = `${GAP_LETTERS[letter] ?? "?"} gap left`;
    gaps.unshift({
      name,
      lateralYards:
        index >= 0
          ? between(men[index]!, men[index + 1]!)
          : men[0]!.position.lateralYards - OUTSIDE_GAP_YARDS,
    });
  }
  for (
    let index = at + 1, letter = 0;
    index <= men.length;
    index += 1, letter += 1
  ) {
    const name = `${GAP_LETTERS[letter] ?? "?"} gap right`;
    gaps.push({
      name,
      lateralYards:
        index < men.length
          ? between(men[index - 1]!, men[index]!)
          : men.at(-1)!.position.lateralYards + OUTSIDE_GAP_YARDS,
    });
  }

  const left = men[0]!.position.lateralYards;
  const right = men.at(-1)!.position.lateralYards;
  return {
    men,
    gaps,
    edges: { left, right },
    lineDepthYards,
    bounds: {
      left: left - BOX_LATERAL_MARGIN_YARDS,
      right: right + BOX_LATERAL_MARGIN_YARDS,
      back: lineDepthYards - BOX_DEPTH_BEHIND_YARDS,
      front: BOX_DEPTH_PAST_LOS_YARDS,
    },
  };
}

export function inTackleBox(box: TackleBox, point: Coordinate): boolean {
  return (
    point.lateralYards >= box.bounds.left &&
    point.lateralYards <= box.bounds.right &&
    point.depthYards >= box.bounds.back &&
    point.depthYards <= box.bounds.front
  );
}

/** How far outside the edge a back meets the man he kicks out. */
const KICK_CONTACT_YARDS = 0.6;
/** How far past the ball he makes contact, and where a lead block finishes. */
const KICK_DEPTH_YARDS = 0.6;
const LEAD_DEPTH_YARDS = 3;
/** Where a back's path turns up: just behind the line, inside the edge. */
const TURN_UP_BEHIND_LINE_YARDS = 0.8;

/**
 * A back's kick-out or lead block. A pull's shape is a lineman's — out of his
 * stance, back off the line and along it — which from the backfield runs him
 * the wrong way. A back goes upfield: a kick-out aims inside the end man and
 * meets the edge defender just outside him; a lead block goes up through the
 * hole inside the end man to the second level.
 */
export function backfieldBlockPoints(
  call: string,
  stance: Coordinate,
  side: PlaySide,
  box: TackleBox,
): readonly PathPoint[] | undefined {
  if (!PULL_CALLS.has(call)) return undefined;
  const endIndex = side > 0 ? box.men.length - 1 : 0;
  const edge = box.men[endIndex]!.position.lateralYards;
  const inside = box.men[endIndex - side];
  const hole = inside
    ? (edge + inside.position.lateralYards) / 2
    : edge - side * OUTSIDE_GAP_YARDS;
  const turnDepth = box.lineDepthYards - TURN_UP_BEHIND_LINE_YARDS;
  const turn = (lateralYards: number): PathPoint[] =>
    stance.depthYards < turnDepth
      ? [{ lateralYards, depthYards: turnDepth }]
      : [];
  if (call === "wrap") {
    return [
      stance,
      ...turn(hole),
      { lateralYards: hole, depthYards: LEAD_DEPTH_YARDS },
    ];
  }
  return [
    stance,
    ...turn(edge - side * (OUTSIDE_GAP_YARDS * 0.6)),
    {
      lateralYards: edge + side * KICK_CONTACT_YARDS,
      depthYards: KICK_DEPTH_YARDS,
    },
  ];
}
