import {
  assignRoles,
  assignmentForPath,
  defensivePlayers,
  defensivePositions,
  lineKindNames,
  manCallName,
  offensivePlayers,
  offensivePositions,
  quickCallName,
  type PlayDocument,
  type Player,
} from "@chalk/domain";

/**
 * The idle inspector's roster: the play's own men, grouped the way a coach
 * reads a call sheet — skill, backs and line on offense; front, linebackers
 * and secondary on defense (ADR 0010's position groups) — each with the one
 * line that says what he is asked to do. What each man plays, and which
 * group he belongs in, is read off where he stands (ADR 0066), the same
 * reading the printed pages use. Shadow men are the other unit's and never
 * appear here.
 */
export type RosterGroupId =
  "skill" | "backs" | "line" | "front" | "linebackers" | "secondary";

export interface RosterRow {
  readonly player: Player;
  /** His letter, or nothing when he has none. */
  readonly letter: string;
  /**
   * What his symbol says in the roster and on his chip: his letter, or for
   * an unlettered man the spot he plays — LT, C, RB — so no row is blank.
   */
  readonly mark: string;
  /** What he plays, said the way the Coach would: Receiver, Tailback, Mike. */
  readonly role: string;
  /**
   * What he is asked to do: the Coach's own assignment words if he wrote any,
   * else the call his line was drawn as, else the kind of line it is.
   */
  readonly summary?: string;
  /**
   * His words have no line under them: the Coach's own instruction for the
   * man himself (ADR 0011), or what a Play stored before ADR 0064 kept when
   * its route was cleared. The row says so, so nobody reads them as a route
   * that is drawn (issue #153).
   */
  readonly textOnly?: true;
  /** What the row says while he has nothing yet. */
  readonly nothingYet: string;
  readonly group: RosterGroupId;
}

export interface RosterGroup {
  readonly id: RosterGroupId;
  readonly name: string;
  readonly rows: readonly RosterRow[];
}

export interface Roster {
  readonly groups: readonly RosterGroup[];
  /** Every man in roster order, for stepping through the unit. */
  readonly rows: readonly RosterRow[];
  /**
   * Men with something to do: a line drawn, or words of their own. A call's
   * name never counts without its line — it goes with the line (ADR 0064) —
   * so what a cleared concept left behind cannot inflate the count; the men
   * on words alone are told apart in `textOnly` (issue #153).
   */
  readonly assigned: number;
  /** Of the assigned, the men whose words have no line under them. */
  readonly textOnly: number;
  readonly total: number;
}

const GROUP_NAMES: Readonly<Record<RosterGroupId, string>> = {
  skill: "Skill",
  backs: "Backs",
  line: "Line",
  front: "Front",
  linebackers: "Linebackers",
  secondary: "Secondary",
};

const KIND_NOTHING: Readonly<Record<RosterGroupId, string>> = {
  skill: "No route yet",
  backs: "No route yet",
  line: "No block yet",
  front: "No assignment yet",
  linebackers: "No assignment yet",
  secondary: "No assignment yet",
};

/**
 * The one line that says what a man does. His first line that is not a
 * motion leads — a motion is how he gets there, not what he is asked for —
 * and a motion counts only when it is all he has. It says, in order: the
 * Coach's assignment words on that line, the man he has when it is a man
 * call, the call it was drawn as, the tag under the man, and only then what
 * kind of line it is.
 */
export function assignmentSummary(
  play: PlayDocument,
  player: Player,
): string | undefined {
  const lines = play.paths.filter(({ playerId }) => playerId === player.id);
  const line =
    lines.find(({ kind }) => kind !== "motion" && kind !== "ball") ?? lines[0];
  if (!line) {
    const words = play.assignments.find(
      ({ playerId }) => playerId === player.id,
    )?.text;
    return words?.trim() || undefined;
  }
  const words = assignmentForPath(play, line.id)?.text.trim();
  // The call is the domain's word for it, the same one the field and every
  // printed table use, so a Drive reads Drive here too (issue #156).
  return (
    words ||
    manCallName(play, line) ||
    quickCallName(line) ||
    tagWords(player.sublabel) ||
    lineKindNames[line.kind]
  );
}

/**
 * The tag under a man — FLAT, CHECK SLOW — is the Coach's own word for what
 * he runs, printed in capitals on the field. The roster says it the way the
 * rest of the panel talks: Flat, Check slow.
 */
function tagWords(tag: string): string | undefined {
  const words = tag.trim();
  if (!words) return undefined;
  const lower = words.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const byLateral = (left: Player, right: Player) =>
  left.position.lateralYards - right.position.lateralYards;

/** The quarterback leads the backs; everyone else reads left to right. */
const byRosterOrder = (left: RosterRow, right: RosterRow) => {
  if (left.group === "backs" && right.group === "backs") {
    const quarterback = (row: RosterRow) =>
      row.role === "Quarterback" ? 0 : 1;
    const lead = quarterback(left) - quarterback(right);
    if (lead !== 0) return lead;
  }
  return byLateral(left.player, right.player);
};

function offenseRows(play: PlayDocument): readonly RosterRow[] {
  const men = offensivePlayers(play);
  const roles = assignRoles(men);
  const positions = offensivePositions(men);
  return men.map((player, index) =>
    row(
      play,
      player,
      positions[index]!.group,
      positions[index]!.name,
      roles[index] ?? "",
    ),
  );
}

function defenseRows(play: PlayDocument): readonly RosterRow[] {
  const positions = defensivePositions(play);
  return defensivePlayers(play).map((player, index) =>
    row(play, player, positions[index]!.group, positions[index]!.name, ""),
  );
}

function row(
  play: PlayDocument,
  player: Player,
  group: RosterGroupId,
  role: string,
  code: string,
): RosterRow {
  const summary = assignmentSummary(play, player);
  const drawn = play.paths.some(({ playerId }) => playerId === player.id);
  const letter = player.label.trim();
  return {
    player,
    letter,
    mark: letter || code || "·",
    role,
    ...(summary === undefined ? {} : { summary }),
    ...(summary !== undefined && !drawn ? { textOnly: true as const } : {}),
    nothingYet: KIND_NOTHING[group],
    group,
  };
}

const OFFENSE_ORDER: readonly RosterGroupId[] = ["skill", "backs", "line"];
const DEFENSE_ORDER: readonly RosterGroupId[] = [
  "front",
  "linebackers",
  "secondary",
];

/** The play's own unit, grouped and ordered left to right within each group. */
export function rosterFor(play: PlayDocument): Roster {
  const defense = play.unit === "defense";
  const all = defense ? defenseRows(play) : offenseRows(play);
  const order = defense ? DEFENSE_ORDER : OFFENSE_ORDER;
  const groups = order.flatMap((id) => {
    const rows = all.filter((entry) => entry.group === id).sort(byRosterOrder);
    return rows.length ? [{ id, name: GROUP_NAMES[id], rows }] : [];
  });
  const rows = groups.flatMap((group) => group.rows);
  return {
    groups,
    rows,
    assigned: rows.filter(({ summary }) => summary !== undefined).length,
    textOnly: rows.filter(({ textOnly }) => textOnly).length,
    total: rows.length,
  };
}
