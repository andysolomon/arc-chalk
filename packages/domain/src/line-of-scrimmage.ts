import { isLineLetter, isLineman } from "./classifications";
import { ballLateralYards } from "./formations";
import type { Player } from "./schema";

/**
 * Who is on the line of scrimmage, who is a back, who can catch a pass, and
 * whether the set is one the rules allow (ADR 0073, ADR 0081).
 *
 * The one formation rule every eleven-man code shares is that no more than
 * four men may be in the backfield: the NFL and the NCAA say it as at least
 * seven on the line, high school as at least five on the line with no more
 * than four backs. With eleven on offense those come to the same thing —
 * seven on the line. There is no most: eight or nine on the line is legal.
 *
 * Who may catch a pass is decided by where he stands, not by his letter: the
 * man at each end of the line and the backs are eligible, and every man on
 * the line between the two ends is not. A tight end or receiver standing on
 * the line inside another man on it is *covered* — he can block, but a pass
 * to him is illegal touching and a route is an ineligible man downfield.
 * The linemen are not called covered: they are between the ends by design.
 * A lineman is known by his letter here — none, or LT, LG, C, RG, RT — and
 * not by his depth, so a set drawn deeper than the shipped ones still reads
 * its unlettered men as the line.
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

/** A man on the line inside the end of it, and the end who covers him. */
export interface CoveredMan {
  readonly id: string;
  readonly byId: string;
}

/**
 * What is wrong with a formation, in the order a Coach would fix it: men
 * over the line, too many men, too many backs, then the covered receivers.
 */
export type LineFault =
  | { readonly kind: "across-the-line"; readonly playerIds: readonly string[] }
  | { readonly kind: "too-many-men"; readonly count: number }
  | { readonly kind: "too-many-backs"; readonly backs: number }
  | { readonly kind: "covered"; readonly men: readonly CoveredMan[] };

export interface ScrimmageLine {
  /** The man over the ball, whose depth the line is measured from. */
  readonly snapperId: string;
  readonly depthYards: number;
  /** Ids of the men on the line, left to right. */
  readonly onTheLine: readonly string[];
  /** Ids of the men in the backfield, left to right. */
  readonly backs: readonly string[];
  readonly offenseCount: number;
  /** Who may catch a pass: the man at each end of the line, and the backs. */
  readonly eligible: readonly string[];
  /** Lettered men on the line inside an end, each with the end covering him. */
  readonly covered: readonly CoveredMan[];
  /** Men of the offense standing past the ball, left to right. */
  readonly acrossTheLine: readonly string[];
  readonly faults: readonly LineFault[];
  /** Nothing wrong: no more than four backs, eleven men at most, everyone behind the ball, nobody covered. */
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

/** Whether a man of the offense standing this deep is past the ball. */
export function isAcrossTheLine(depthYards: number): boolean {
  return depthYards > 1e-9;
}

/**
 * The offense's line as it stands: who is on it, who is a back, who can
 * catch a pass, and whether that is a legal formation. Undefined when there
 * is no offensive line.
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
  const onTheLine: Placed[] = [];
  const backs: Placed[] = [];
  for (const player of offense) {
    (isOnTheLine(player.position.depthYards, depthYards)
      ? onTheLine
      : backs
    ).push(player);
  }

  // The ends of the line are eligible; a lettered man between them is covered
  // by the end on his side of the ball.
  const ball = ballLateralYards(offense);
  const leftEnd = onTheLine[0];
  const rightEnd = onTheLine.at(-1);
  const ends = new Set(
    [leftEnd, rightEnd].flatMap((end) => (end ? [end.id] : [])),
  );
  const covered: CoveredMan[] = onTheLine.flatMap((man) => {
    const letter = man.label.trim();
    if (ends.has(man.id) || letter === "" || isLineLetter(letter)) return [];
    const end = man.position.lateralYards < ball ? leftEnd : rightEnd;
    return end ? [{ id: man.id, byId: end.id }] : [];
  });
  const eligible = [
    ...onTheLine.filter(({ id }) => ends.has(id)),
    ...backs,
  ].map(({ id }) => id);
  const acrossTheLine = offense
    .filter(({ position }) => isAcrossTheLine(position.depthYards))
    .map(({ id }) => id);

  const faults: LineFault[] = [];
  if (acrossTheLine.length > 0) {
    faults.push({ kind: "across-the-line", playerIds: acrossTheLine });
  }
  if (offense.length > PLAYERS_PER_SIDE) {
    faults.push({ kind: "too-many-men", count: offense.length });
  }
  if (backs.length > MAX_BACKS) {
    faults.push({ kind: "too-many-backs", backs: backs.length });
  }
  if (covered.length > 0) faults.push({ kind: "covered", men: covered });

  return {
    snapperId: snapper.id,
    depthYards,
    onTheLine: onTheLine.map(({ id }) => id),
    backs: backs.map(({ id }) => id),
    offenseCount: offense.length,
    eligible,
    covered,
    acrossTheLine,
    faults,
    legal: faults.length === 0,
  };
}
