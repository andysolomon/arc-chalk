import type { Formation } from "./schema";

/**
 * The words a Coach filters a book by, read off what a set already says
 * about itself. Nothing here is stored: a set's group is its name's first
 * word, its personnel is the label it carries, and the package is that same
 * label said the way a coordinator says it — "3 WR" for 11 personnel.
 */

/** The hand a set's name ends in, which is not part of what it is called from. */
const HAND = /\s+(left|right)$/i;

/**
 * What a set is called from — Gun, Pistol, I-Form, Empty, Strong — which is
 * the first word of its name once the hand is taken off. A Coach who saved
 * "Trey Right" gets a Trey group of his own.
 */
export function formationGroupOf(formation: Pick<Formation, "name">): string {
  const base = formation.name.trim().replace(HAND, "").trim();
  return base.split(/\s+/)[0] || formation.name;
}

/** A two-digit personnel label: backs, then tight ends. */
const PERSONNEL_DIGITS = /^(\d)(\d)$/;

/** The men on the field in a two-digit label, or nothing for a named one. */
export function personnelCounts(
  label: string,
):
  | { readonly rb: number; readonly te: number; readonly wr: number }
  | undefined {
  const match = PERSONNEL_DIGITS.exec(label.trim());
  if (!match) return undefined;
  const rb = Number(match[1]);
  const te = Number(match[2]);
  return { rb, te, wr: Math.max(0, 5 - rb - te) };
}

/**
 * `(11) 1 RB, 1 TE, 3 WR` for a two-digit label; a named package — Goal
 * Line, Nickel — is already what it is.
 */
export function describePersonnel(label: string): string {
  const counts = personnelCounts(label);
  if (!counts) return label;
  return `(${label.trim()}) ${counts.rb} RB, ${counts.te} TE, ${counts.wr} WR`;
}

/**
 * The offensive package a personnel label puts on the field, in the words a
 * coordinator calls it by: what is unusual about the grouping. Two or more
 * tight ends is a tight-end package, two or more backs a back package, and
 * otherwise the receivers count.
 */
export function offensivePackageOf(label: string): string {
  const counts = personnelCounts(label);
  if (!counts) return label;
  if (counts.te >= 2) return `${counts.te} TE`;
  if (counts.rb >= 2) return `${counts.rb} RB`;
  return `${counts.wr} WR`;
}

/**
 * The defensive personnel a front puts on the field. Nickel and Dime say it
 * in their name; every other front is the base defense.
 */
export function defensivePersonnelOf(front: string): string {
  const name = front.trim().toLowerCase();
  if (name === "nickel") return "Nickel";
  if (name === "dime") return "Dime";
  return "Base";
}
