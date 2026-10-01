import { isLineman } from "./classifications";
import { defensiveFieldOf, isOnDefensiveFront } from "./defensive-field";
import { assignRoles } from "./formations";
import { coverableReceivers, defenderKind } from "./man-coverage";
import type { PlayDocument, Player } from "./schema";

/**
 * What a man plays, read off where he stands (issue #154, ADR 0066). A
 * letter that names a position keeps it: X and Z are receivers, Y a tight
 * end, Q the quarterback, E an end, W the Will, C a corner. The letters that
 * do not — the backs' F and H, a defender's N, S and $, and no letter at
 * all — are read off the stance and the men around him: an H in the
 * backfield is a back, and among two backs the deeper one is the tailback;
 * an N on the ball is the nose and off it the nickel; an S eighteen yards
 * deep is the strong safety, not the Sam. The roster, the Player panel and
 * the printed pages all read the one derivation, so nobody is a slot on one
 * and a back on the other.
 */

export type OffensiveGroup = "skill" | "backs" | "line";

export interface OffensivePosition {
  readonly group: OffensiveGroup;
  /** Said the way a Coach says it: Tailback, Slot, Tight end, Guard. */
  readonly name: string;
}

export type DefensiveGroup = "front" | "linebackers" | "secondary";

export interface DefensivePosition {
  readonly group: DefensiveGroup;
  /** Nose, End, Mike, Corner, Strong safety, Nickel. */
  readonly name: string;
}

/** The words the offensive letters that name a position give. */
const OFFENSE_ROLE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  QB: "Quarterback",
  X: "Receiver",
  Z: "Receiver",
  TE: "Tight end",
  LT: "Tackle",
  LG: "Guard",
  C: "Center",
  RG: "Guard",
  RT: "Tackle",
});

/** The word for where a man stands when his letter leaves it to the field. */
const RECEIVER_WORDS = Object.freeze({
  wide: "Receiver",
  slot: "Slot",
  tight: "Tight end",
  back: "Back",
});

/** One back has to stand this much deeper than the next to be the tailback. */
const BACK_DEPTH_STEP_YARDS = 1;

/**
 * What the backs are called among themselves: with one back he is the
 * Back; with more, the deepest is the Tailback and the shallowest the
 * Fullback when each stands clear of the next by a yard, and backs level
 * with each other — split backs, the halfbacks of a wishbone — are Backs.
 */
function backWords(backs: readonly Player[]): Map<string, string> {
  const words = new Map<string, string>(
    backs.map(({ id }) => [id, RECEIVER_WORDS.back]),
  );
  if (backs.length < 2) return words;
  const byDepth = [...backs].sort(
    (left, right) => left.position.depthYards - right.position.depthYards,
  );
  const deepest = byDepth[0]!;
  const nextDeepest = byDepth[1]!;
  if (
    deepest.position.depthYards <=
    nextDeepest.position.depthYards - BACK_DEPTH_STEP_YARDS
  ) {
    words.set(deepest.id, "Tailback");
  }
  const shallowest = byDepth.at(-1)!;
  const nextShallowest = byDepth.at(-2)!;
  if (
    shallowest.position.depthYards >=
    nextShallowest.position.depthYards + BACK_DEPTH_STEP_YARDS
  ) {
    words.set(shallowest.id, "Fullback");
  }
  return words;
}

/**
 * What each man of the offense plays, in the order given. The line is the
 * line; the quarterback and whoever stands in the backfield are the backs;
 * everyone else is a skill man. The word is his letter's where it names a
 * position, else the spot he is standing in.
 */
export function offensivePositions(
  offense: readonly Player[],
): readonly OffensivePosition[] {
  const roles = assignRoles(offense);
  const standing = new Map(
    coverableReceivers({ players: [...offense] }).map((receiver) => [
      receiver.player.id,
      receiver.kind,
    ]),
  );
  const backs = offense.filter(({ id }) => standing.get(id) === "back");
  const back = backWords(backs);
  return offense.map((player, index) => {
    const role = roles[index] ?? "";
    if (isLineman(player) || ["LT", "LG", "C", "RG", "RT"].includes(role)) {
      return { group: "line", name: OFFENSE_ROLE_WORDS[role] ?? "Line" };
    }
    if (role === "QB") {
      return { group: "backs", name: OFFENSE_ROLE_WORDS[role]! };
    }
    const kind = standing.get(player.id);
    const group: OffensiveGroup = kind === "back" ? "backs" : "skill";
    const lettered = OFFENSE_ROLE_WORDS[role];
    if (lettered) return { group, name: lettered };
    if (kind === "back") return { group, name: back.get(player.id)! };
    return { group, name: kind ? RECEIVER_WORDS[kind] : "Skill" };
  });
}

/** The words the defensive letters that name a position give. */
const DEFENSE_LETTER_WORDS: Readonly<Record<string, string>> = Object.freeze({
  E: "End",
  DE: "End",
  T: "Tackle",
  DT: "Tackle",
  NT: "Nose",
  NG: "Nose",
  W: "Will",
  WLB: "Will",
  WILL: "Will",
  M: "Mike",
  MLB: "Mike",
  MIKE: "Mike",
  SLB: "Sam",
  SAM: "Sam",
  B: "Backer",
  LB: "Linebacker",
  ILB: "Linebacker",
  OLB: "Linebacker",
  C: "Corner",
  CB: "Corner",
  LC: "Corner",
  RC: "Corner",
  LCB: "Corner",
  RCB: "Corner",
  BC: "Corner",
  FC: "Corner",
  F: "Free safety",
  FS: "Free safety",
  SS: "Strong safety",
  K: "Safety",
  NB: "Nickel",
  NI: "Nickel",
  NCB: "Nickel",
  STAR: "Nickel",
  D: "Dime",
  DB: "Defensive back",
});

/** A man within this of the ball across is over it. */
const OVER_THE_BALL_YARDS = 1;

/**
 * What each defender plays, in the order the defense stands in the Play.
 * His level is his kind (ADR 0060): a lineman is on the front, a backer at
 * the second level, and a corner, nickel or safety in the secondary. An
 * unlettered man on the front — within the front's depth and reach of the
 * ball — is on it whatever his depth reads as. His word is his letter's
 * where it names a position; the rest is read off the field:
 *
 * - on the front, a man over the ball is the Nose, the outside man on each
 *   side an End, and anyone between a Tackle — an N is the Nose only there;
 * - an S in the box is the Sam, and deep the Strong safety;
 * - a $ is the Strong safety unless the defense already has one, in which
 *   case he is the fifth defensive back, the Nickel;
 * - an unlettered second-level man is a Linebacker, and an unlettered man
 *   in the secondary a Corner on the numbers, a Safety deep, a Nickel over
 *   the slot.
 */
export function defensivePositions(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
): readonly DefensivePosition[] {
  const field = defensiveFieldOf(play);
  const ball = field.ballLateralYards;
  const defense = play.players.filter(({ unit }) => unit === "defense");
  const kinds = defense.map((player) => {
    const kind = defenderKind(player, ball);
    return player.label.trim() === "" &&
      isOnDefensiveFront(player.position, field)
      ? "lineman"
      : kind;
  });
  const front = defense.filter((_, index) => kinds[index] === "lineman");
  const outermost = (player: Player, side: -1 | 1) =>
    !front.some(
      (other) =>
        other !== player &&
        Math.sign(other.position.lateralYards - ball) === side &&
        side * (other.position.lateralYards - ball) >
          side * (player.position.lateralYards - ball),
    );
  const strongSafetyLettered = defense.some((player, index) => {
    const letter = player.label.trim().toUpperCase();
    return letter === "SS" || (letter === "S" && kinds[index] === "safety");
  });

  return defense.map((player, index) => {
    const kind = kinds[index]!;
    const letter = player.label.trim().toUpperCase();
    const group: DefensiveGroup =
      kind === "lineman"
        ? "front"
        : kind === "backer"
          ? "linebackers"
          : "secondary";
    const lettered = DEFENSE_LETTER_WORDS[letter];
    if (lettered) return { group, name: lettered };
    const off = player.position.lateralYards - ball;
    switch (kind) {
      case "lineman":
        if (Math.abs(off) <= OVER_THE_BALL_YARDS)
          return { group, name: "Nose" };
        return {
          group,
          name: outermost(player, off < 0 ? -1 : 1) ? "End" : "Tackle",
        };
      case "backer":
        return { group, name: letter === "S" ? "Sam" : "Linebacker" };
      case "safety":
        if (letter === "S") return { group, name: "Strong safety" };
        if (letter === "$") {
          return {
            group,
            name: strongSafetyLettered ? "Nickel" : "Strong safety",
          };
        }
        return { group, name: "Safety" };
      case "corner":
        return { group, name: "Corner" };
      case "nickel":
        return { group, name: "Nickel" };
    }
  });
}
