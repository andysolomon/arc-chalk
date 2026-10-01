import { isLineman } from "./classifications";
import { ballLateralYards } from "./formations";
import type { Player } from "./schema";

/**
 * Who is on the line of scrimmage and who is a back (ADR 0073). The one
 * formation rule every eleven-man code shares is that no more than four men
 * may be in the backfield: the NFL and the NCAA say it as at least seven on
 * the line, high school as at least five on the line with no more than four
 * backs. With eleven on offense those come to the same thing — seven on the
 * line. There is no most: eight or nine on the line is legal.
 *
 * A man is on the line when he stands level with the snapper, as a rulebook
 * reads it off the snapper's waist. A diagram has no waists, so level is half
 * a yard: the shipped sets draw their receivers a third of a yard under the
 * linemen and mean them on it, and a slot a step off the ball is a yard back.
 */

export const MAX_BACKS = 4;
export const PLAYERS_PER_SIDE = 11;
/** What eleven men and four backs leave on the line. */
export const MIN_ON_THE_LINE = PLAYERS_PER_SIDE - MAX_BACKS;
/** How far under the snapper a man can stand and still be on the line. */
export const ON_THE_LINE_TOLERANCE_YARDS = 0.5;
/** Where a man a step off the line stands, under the snapper. */
export const OFF_THE_LINE_YARDS = 1;

type Placed = Pick<Player, "id" | "unit" | "label" | "position" | "symbol">;

export interface ScrimmageLine {
  /** The man over the ball, whose depth the line is measured from. */
  readonly snapperId: string;
  readonly depthYards: number;
  /** Ids of the men on the line, left to right. */
  readonly onTheLine: readonly string[];
  /** Ids of the men in the backfield, left to right. */
  readonly backs: readonly string[];
  readonly offenseCount: number;
  /** No more than four backs; with eleven men, at least seven on the line. */
  readonly legal: boolean;
}

/**
 * The man over the ball: the lineman nearest it, or — when nobody stands
 * where a lineman does — the one drawn as the center. Without either there
 * is no line to be on, as in seven-on-seven.
 */
export function snapperOf<T extends Placed>(
  players: readonly T[],
): T | undefined {
  const offense = players.filter(({ unit }) => unit !== "defense");
  if (offense.length === 0) return undefined;
  const ball = ballLateralYards(offense);
  const nearest = offense
    .filter(isLineman)
    .sort(
      (left, right) =>
        Math.abs(left.position.lateralYards - ball) -
          Math.abs(right.position.lateralYards - ball) ||
        right.position.depthYards - left.position.depthYards ||
        left.id.localeCompare(right.id),
    )[0];
  return nearest ?? offense.find(({ symbol }) => symbol === "square");
}

/** Whether a man standing this deep is on a line this deep. */
export function isOnTheLine(
  depthYards: number,
  lineDepthYards: number,
): boolean {
  return depthYards >= lineDepthYards - ON_THE_LINE_TOLERANCE_YARDS - 1e-9;
}

/**
 * The offense's line as it stands: who is on it, who is a back, and whether
 * that is a legal formation. Undefined when there is no offensive line.
 */
export function scrimmageLine(
  players: readonly Placed[],
): ScrimmageLine | undefined {
  const snapper = snapperOf(players);
  if (!snapper) return undefined;
  const depthYards = snapper.position.depthYards;
  const offense = players
    .filter(({ unit }) => unit !== "defense")
    .sort(
      (left, right) =>
        left.position.lateralYards - right.position.lateralYards ||
        left.id.localeCompare(right.id),
    );
  const onTheLine: string[] = [];
  const backs: string[] = [];
  for (const player of offense) {
    (isOnTheLine(player.position.depthYards, depthYards)
      ? onTheLine
      : backs
    ).push(player.id);
  }
  return {
    snapperId: snapper.id,
    depthYards,
    onTheLine,
    backs,
    offenseCount: offense.length,
    legal: backs.length <= MAX_BACKS,
  };
}
