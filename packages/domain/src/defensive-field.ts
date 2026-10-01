import { playBallLateralYards } from "./ball-spot";
import { isLineman, isOnDefensiveFrontAt } from "./classifications";
import { roleFromLabel } from "./formations";
import {
  legacyCanvasToYards,
  legacyLateralSpanToYards,
  LEGACY_FIELD_GEOMETRY,
} from "./geometry";
import type { Coordinate, PathPoint, PlayDocument, Player } from "./schema";

/**
 * What a defender's call is aimed at, read off the field rather than off the
 * man (issue #165). A zone is a piece of the field — curl/flat is ten yards
 * deep between the hash and the numbers whoever is sent there, so a safety
 * rolled down from eighteen yards lands at ten rather than at eighteen. A spy
 * sits over the quarterback. Pressure goes through a gap, and a gap is the
 * space between two offensive linemen: the A gap either side of the center,
 * B between guard and tackle, C outside the tackle (inside the tight end
 * when there is one) and D outside that.
 *
 * The offense on the field decides where the gaps are, so a line spotted on
 * the hash has its gaps on the hash. A defense drawn on its own is given the
 * original's line — five men two yards apart — centred on the ball its front
 * straddles, which is the hash it was spotted on.
 */

export type GapLetter = "A" | "B" | "C" | "D";
export const gapLetters: readonly GapLetter[] = Object.freeze([
  "A",
  "B",
  "C",
  "D",
]);

/** Left of the ball is −1, right of it +1; a man over the ball is right. */
export type SideOfBall = -1 | 1;

export interface DefensiveField {
  readonly ballLateralYards: number;
  /** Where the quarterback stands, or where he would in the gun. */
  readonly quarterback: Coordinate;
  /** Each gap's distance from the ball, A to D, on each side. */
  readonly gaps: Readonly<
    Record<"left" | "right", readonly [number, number, number, number]>
  >;
  readonly halfWidthYards: number;
  /** Where the men on the defensive front stand, left to right. */
  readonly front: readonly Coordinate[];
}

/** The original's split: 36 canvas pixels between linemen. */
const SPLIT_YARDS = legacyLateralSpanToYards(36);
/** A gun quarterback, where the original's sets stand him. */
const GUN_DEPTH_YARDS = legacyCanvasToYards({
  x: LEGACY_FIELD_GEOMETRY.midfieldX,
  y: 504,
}).depthYards;

/** A man head up on a lineman is given the gap inside him. */
const HEAD_UP_YARDS = 0.25;

/** How far past the line of scrimmage a rush is drawn. */
const PENETRATION_YARDS = 2;
/** A slant or a twist is a step, not a rush to the quarterback. */
const STEP_YARDS = 1.5;

/** Hook and curl/flat bubbles sit this deep, whoever is sent there. */
export const UNDERNEATH_LANDMARK_YARDS = 10;
const ROBBER_LANDMARK_YARDS = 11;
/** A spy sits here, over the quarterback. */
export const SPY_LANDMARK_YARDS = 6;
/** A hook over the ball, or out over the tackle and the tight end. */
const MIDDLE_HOOK_REACH_YARDS = 2;
const HOOK_LATERAL_YARDS = 4.5;
/** Curl/flat: between the hash and the numbers. */
const CURL_FLAT_LATERAL_YARDS = 12;
/** A bubble is held this far inside a sideline. */
const SIDELINE_MARGIN_YARDS = 1;

type Gaps = readonly [number, number, number, number];

function gapsFrom(guard: number, tackle: number, end?: number): Gaps {
  const split = tackle - guard;
  return end === undefined
    ? [
        guard / 2,
        (guard + tackle) / 2,
        tackle + split / 2,
        tackle + split * 1.5,
      ]
    : [guard / 2, (guard + tackle) / 2, (tackle + end) / 2, end + split / 2];
}

const DEFAULT_GAPS = gapsFrom(SPLIT_YARDS, SPLIT_YARDS * 2);

/**
 * One side's gaps, off the offensive line where it stands: the guard and the
 * tackle are the first two linemen out from the ball, and a third, or a tight
 * end in line just outside the tackle, closes the C gap. A side without two
 * linemen on it is given the original's.
 */
function sideGaps(
  offense: readonly Player[],
  linemen: readonly Player[],
  ball: number,
  side: SideOfBall,
): Gaps {
  const out = (player: Player) => (player.position.lateralYards - ball) * side;
  const line = linemen
    .map(out)
    .filter((distance) => distance > HEAD_UP_YARDS)
    .sort((left, right) => left - right);
  const [guard, tackle, third] = line;
  if (guard === undefined || tackle === undefined) return DEFAULT_GAPS;
  const lineDepth =
    linemen.reduce((sum, { position }) => sum + position.depthYards, 0) /
    linemen.length;
  const reach = tackle + (tackle - guard) * 1.5 + 0.5;
  const tightEnd =
    third ??
    offense
      .filter(
        (player) =>
          !linemen.includes(player) &&
          Math.abs(player.position.depthYards - lineDepth) <= 1,
      )
      .map(out)
      .filter((distance) => distance > tackle && distance <= reach)
      .sort((left, right) => left - right)[0];
  return gapsFrom(guard, tackle, tightEnd);
}

function quarterbackOf(
  offense: readonly Player[],
  ball: number,
): Coordinate | undefined {
  const lettered = offense.find(({ label }) => roleFromLabel(label) === "QB");
  if (lettered) return lettered.position;
  // Unlettered: the back nearest the line straight behind the ball.
  return offense
    .filter(
      (player) =>
        !isLineman(player) &&
        player.position.depthYards < -0.5 &&
        Math.abs(player.position.lateralYards - ball) < 1.5,
    )
    .sort(
      (left, right) => right.position.depthYards - left.position.depthYards,
    )[0]?.position;
}

/** The field a defender's calls are aimed at, read off the Play. */
export function defensiveFieldOf(
  play: Pick<PlayDocument, "players"> & {
    readonly fieldProfile: Pick<PlayDocument["fieldProfile"], "widthYards">;
  },
): DefensiveField {
  const offense = play.players.filter(({ unit }) => unit !== "defense");
  const defense = play.players.filter(({ unit }) => unit === "defense");
  // Under the line, or — with no offense — on the front, which lines up on
  // it: the one reading the Ball on control and every export share.
  const ball = playBallLateralYards(play);
  const linemen = offense.filter(isLineman);
  return {
    ballLateralYards: ball,
    quarterback: quarterbackOf(offense, ball) ?? {
      lateralYards: ball,
      depthYards: GUN_DEPTH_YARDS,
    },
    gaps: {
      left: sideGaps(offense, linemen, ball, -1),
      right: sideGaps(offense, linemen, ball, 1),
    },
    halfWidthYards: play.fieldProfile.widthYards / 2,
    front: defense
      .filter(({ position }) => isOnDefensiveFrontAt(position, ball))
      .map(({ position }) => position)
      .sort((left, right) => left.lateralYards - right.lateralYards),
  };
}

/** The original's field and line, with nobody on it: how the catalogue is drawn. */
export const DEFAULT_DEFENSIVE_FIELD: DefensiveField = Object.freeze({
  ballLateralYards: 0,
  quarterback: Object.freeze({ lateralYards: 0, depthYards: GUN_DEPTH_YARDS }),
  gaps: Object.freeze({ left: DEFAULT_GAPS, right: DEFAULT_GAPS }),
  halfWidthYards: 80 / 3,
  front: Object.freeze([]),
});

/** Whether a man standing here is on the defensive front. */
export function isOnDefensiveFront(
  position: Coordinate,
  field: DefensiveField,
): boolean {
  return isOnDefensiveFrontAt(position, field.ballLateralYards);
}

export function sideOfBall(
  field: DefensiveField,
  lateralYards: number,
): SideOfBall {
  return lateralYards < field.ballLateralYards ? -1 : 1;
}

/** Where a gap is across the field. */
export function gapLateralYards(
  field: DefensiveField,
  side: SideOfBall,
  index: number,
): number {
  const gaps = side < 0 ? field.gaps.left : field.gaps.right;
  return field.ballLateralYards + side * gaps[index]!;
}

/**
 * The gap a man lined up here owns: the nearest one on his side, and the one
 * inside him when he is head up between two. That is what his technique
 * says — a 3 shades the guard's outside and owns B, a 5 the tackle's and
 * owns C.
 */
export function ownGapOf(
  field: DefensiveField,
  stance: Coordinate,
): { readonly side: SideOfBall; readonly index: number } {
  const side = sideOfBall(field, stance.lateralYards);
  const out = (stance.lateralYards - field.ballLateralYards) * side;
  const gaps = side < 0 ? field.gaps.left : field.gaps.right;
  let index = 0;
  for (let next = 1; next < gaps.length; next += 1) {
    if (
      Math.abs(gaps[next]! - out) <
      Math.abs(gaps[index]! - out) - HEAD_UP_YARDS
    ) {
      index = next;
    }
  }
  return { side, index };
}

/** One gap over, inward or outward; inside the A gap is the other A gap. */
function gapBeside(
  gap: { readonly side: SideOfBall; readonly index: number },
  step: -1 | 1,
): { readonly side: SideOfBall; readonly index: number } {
  const index = gap.index + step;
  if (index < 0) return { side: -gap.side as SideOfBall, index: 0 };
  return { side: gap.side, index: Math.min(index, gapLetters.length - 1) };
}

const at = (lateralYards: number, depthYards: number): PathPoint => ({
  lateralYards,
  depthYards,
});

/** Aimed at a gap, and on through it past the line. */
function through(
  field: DefensiveField,
  gap: { readonly side: SideOfBall; readonly index: number },
  past = PENETRATION_YARDS,
): PathPoint[] {
  const lateral = gapLateralYards(field, gap.side, gap.index);
  return [at(lateral, 0), at(lateral, -past)];
}

/** A blitz through the named gap on his side of the ball. */
export function gapBlitzPoints(
  stance: Coordinate,
  field: DefensiveField,
  index: number,
): PathPoint[] {
  return through(field, {
    side: sideOfBall(field, stance.lateralYards),
    index,
  });
}

/** A rush through the gap his alignment owns. */
export function rushPoints(
  stance: Coordinate,
  field: DefensiveField,
): PathPoint[] {
  return through(field, ownGapOf(field, stance));
}

/**
 * A contain rush: up the field outside everything on his side, then turned
 * back in at the quarterback so he cannot get out.
 */
export function containPoints(
  stance: Coordinate,
  field: DefensiveField,
): PathPoint[] {
  const side = sideOfBall(field, stance.lateralYards);
  const edge = gapLateralYards(field, side, gapLetters.length - 1) + side * 0.5;
  const wide =
    side > 0
      ? Math.max(edge, stance.lateralYards)
      : Math.min(edge, stance.lateralYards);
  return [
    at(wide, -STEP_YARDS),
    at(wide - side * STEP_YARDS, field.quarterback.depthYards + 2),
  ];
}

/** A slant or angle one gap over, inside or out. */
export function slantPoints(
  stance: Coordinate,
  field: DefensiveField,
  step: -1 | 1,
): PathPoint[] {
  return through(field, gapBeside(ownGapOf(field, stance), step), STEP_YARDS);
}

/**
 * A man going second in a game: he jabs up the field, then loops back
 * behind the man who went first and comes through the gap he left.
 */
function loopPoints(
  stance: Coordinate,
  field: DefensiveField,
  step: -1 | 1,
): PathPoint[] {
  const gap = gapBeside(ownGapOf(field, stance), step);
  const lateral = gapLateralYards(field, gap.side, gap.index);
  const jab = at(
    stance.lateralYards,
    Math.max(stance.depthYards - STEP_YARDS / 2, STEP_YARDS / 3),
  );
  return [
    jab,
    {
      ...at(lateral, 0),
      control: at(
        (stance.lateralYards + lateral) / 2,
        stance.depthYards + 0.75,
      ),
    },
    at(lateral, -STEP_YARDS),
  ];
}

/**
 * The men beside this one on the front, on his side of the ball: the one
 * outside him and the one inside him, when there are.
 */
function neighboursOf(
  field: DefensiveField,
  stance: Coordinate,
): { readonly outside?: Coordinate; readonly inside?: Coordinate } {
  const side = sideOfBall(field, stance.lateralYards);
  const out = (position: Coordinate) =>
    (position.lateralYards - field.ballLateralYards) * side;
  const mine = out(stance);
  const same = field.front.filter(
    (position) =>
      sideOfBall(field, position.lateralYards) === side &&
      (position.lateralYards !== stance.lateralYards ||
        position.depthYards !== stance.depthYards),
  );
  const outside = same
    .filter((position) => out(position) > mine)
    .sort((left, right) => out(left) - out(right))[0];
  const inside = same
    .filter((position) => out(position) <= mine)
    .sort((left, right) => out(right) - out(left))[0];
  return {
    ...(outside ? { outside } : {}),
    ...(inside ? { inside } : {}),
  };
}

/**
 * A two-man game between an end and the tackle inside him. The outside man
 * of the pair plays the end, whatever his letter. In T-E the tackle goes
 * first, outside into the end's gap, and the end loops inside into the
 * tackle's; in E-T the end crashes inside and the tackle loops out.
 */
export function twistPoints(
  stance: Coordinate,
  field: DefensiveField,
  game: "TE" | "ET",
): PathPoint[] {
  const end = neighboursOf(field, stance).outside === undefined;
  if (game === "TE") {
    return end ? loopPoints(stance, field, -1) : slantPoints(stance, field, 1);
  }
  return end ? slantPoints(stance, field, -1) : loopPoints(stance, field, 1);
}

/** The man a twist is played with: the tackle for an end, the end for a tackle. */
export function twistPartnerOf(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
  playerId: string,
): Player | undefined {
  const field = defensiveFieldOf(play);
  const player = play.players.find(({ id }) => id === playerId);
  if (!player || !isOnDefensiveFront(player.position, field)) return undefined;
  const { outside, inside } = neighboursOf(field, player.position);
  const partner = outside ?? inside;
  if (!partner) return undefined;
  return play.players.find(
    (other) =>
      other.unit === "defense" &&
      other.id !== playerId &&
      other.position.lateralYards === partner.lateralYards &&
      other.position.depthYards === partner.depthYards,
  );
}

/**
 * Spill: he wrong-arms the kick-out block, going under it and flat down the
 * line so the ball has to bounce outside.
 */
export function spillPoints(
  stance: Coordinate,
  field: DefensiveField,
): PathPoint[] {
  const inward = -sideOfBall(field, stance.lateralYards);
  return [
    at(stance.lateralYards + inward, 0),
    at(stance.lateralYards + inward * 2.5, -PENETRATION_YARDS),
  ];
}

/** Squeeze: he closes the gap inside him down, and holds there. */
export function squeezePoints(
  stance: Coordinate,
  field: DefensiveField,
): PathPoint[] {
  const inward = -sideOfBall(field, stance.lateralYards);
  return [at(stance.lateralYards + inward * STEP_YARDS, 0.5)];
}

/** Held so a bubble this wide stays between the sidelines. */
function inside(field: DefensiveField, lateral: number, radius: number) {
  const limit = field.halfWidthYards - radius - SIDELINE_MARGIN_YARDS;
  return Math.max(-limit, Math.min(limit, lateral));
}

/** A hook: over the ball for a man over it, else out over the tackle on his side. */
export function hookLandmark(
  stance: Coordinate,
  field: DefensiveField,
): PathPoint {
  const off = stance.lateralYards - field.ballLateralYards;
  const lateral =
    Math.abs(off) <= MIDDLE_HOOK_REACH_YARDS
      ? field.ballLateralYards
      : field.ballLateralYards + Math.sign(off) * HOOK_LATERAL_YARDS;
  return at(lateral, UNDERNEATH_LANDMARK_YARDS);
}

/** Curl/flat: between the hash and the numbers on his side. */
export function curlFlatLandmark(
  stance: Coordinate,
  field: DefensiveField,
  radiusLateralYards: number,
): PathPoint {
  const side = sideOfBall(field, stance.lateralYards);
  return at(
    inside(
      field,
      field.ballLateralYards + side * CURL_FLAT_LATERAL_YARDS,
      radiusLateralYards,
    ),
    UNDERNEATH_LANDMARK_YARDS,
  );
}

/** A robber sits in the hole in the middle, under the deep safety. */
export function robberLandmark(field: DefensiveField): PathPoint {
  return at(field.ballLateralYards, ROBBER_LANDMARK_YARDS);
}

/** A spy sits over the quarterback, five to seven yards off the ball. */
export function spyLandmark(field: DefensiveField): PathPoint {
  return at(field.quarterback.lateralYards, SPY_LANDMARK_YARDS);
}

/**
 * What a man on the front is given when a call puts him on without a line
 * of his own: the outside man on each side keeps contain, and everyone
 * inside him rushes his gap.
 */
export function frontCallFor(
  stance: Coordinate,
  field: DefensiveField,
): "contain" | "rush" {
  return neighboursOf(field, stance).outside === undefined ? "contain" : "rush";
}
