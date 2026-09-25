import {
  assignRoles,
  assignmentForPath,
  defensivePlayers,
  isLineman,
  lineKindNames,
  linePresetByKey,
  offensivePlayers,
  routePresetNames,
  yardsToLegacyCanvas,
  type MovementPath,
  type PlayDocument,
  type Player,
} from "@chalk/domain";

/**
 * The idle inspector's roster: the play's own men, grouped the way a coach
 * reads a call sheet — skill, backs and line on offense; front, linebackers
 * and secondary on defense (ADR 0010's position groups) — each with the one
 * line that says what he is asked to do. Shadow men are the other unit's
 * and never appear here.
 */
export type RosterGroupId =
  "skill" | "backs" | "line" | "front" | "linebackers" | "secondary";

export interface RosterRow {
  readonly player: Player;
  /** His letter, or nothing when he has none. */
  readonly letter: string;
  /** What he plays, said the way the Coach would: Receiver, Tight end, Mike. */
  readonly role: string;
  /**
   * What he is asked to do: the Coach's own assignment words if he wrote any,
   * else the call his line was drawn as, else the kind of line it is.
   */
  readonly summary?: string;
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
  /** Men with at least one line or assignment. */
  readonly assigned: number;
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

const OFFENSE_ROLE_NAMES: Readonly<Record<string, string>> = {
  QB: "Quarterback",
  RB: "Back",
  H: "Slot",
  TE: "Tight end",
  X: "Receiver",
  Z: "Receiver",
  LT: "Tackle",
  LG: "Guard",
  C: "Center",
  RG: "Guard",
  RT: "Tackle",
};

const DEFENSE_ROLE_NAMES: Readonly<Record<string, string>> = {
  E: "End",
  DE: "End",
  T: "Tackle",
  DT: "Tackle",
  N: "Nose",
  NT: "Nose",
  W: "Will",
  M: "Mike",
  S: "Sam",
  B: "Backer",
  LB: "Linebacker",
  C: "Corner",
  CB: "Corner",
  F: "Free safety",
  FS: "Free safety",
  SS: "Strong safety",
  $: "Nickel",
  N$: "Nickel",
  D: "Dime",
};

const DEFENSE_GROUP_BY_LABEL: Readonly<Record<string, RosterGroupId>> = {
  E: "front",
  DE: "front",
  T: "front",
  DT: "front",
  N: "front",
  NT: "front",
  W: "linebackers",
  M: "linebackers",
  S: "linebackers",
  B: "linebackers",
  LB: "linebackers",
  C: "secondary",
  CB: "secondary",
  F: "secondary",
  FS: "secondary",
  SS: "secondary",
  $: "secondary",
  N$: "secondary",
  D: "secondary",
};

/**
 * Where an unlettered defender stands decides his level: the original draws
 * the front at 404 on its canvas, linebackers around 340, and everyone
 * deeper or out on the numbers is the secondary.
 */
const FRONT_MAX_DEPTH_PX = 50;
const LINEBACKER_MAX_DEPTH_PX = 120;

function defenseGroupOf(player: Player): RosterGroupId {
  const byLabel = DEFENSE_GROUP_BY_LABEL[player.label.trim().toUpperCase()];
  if (byLabel) return byLabel;
  const { y } = yardsToLegacyCanvas(player.position);
  const depthPx = 430 - y;
  if (depthPx <= FRONT_MAX_DEPTH_PX) return "front";
  if (depthPx <= LINEBACKER_MAX_DEPTH_PX) return "linebackers";
  return "secondary";
}

const DEFENSE_GROUP_ROLE: Readonly<Record<string, string>> = {
  front: "Lineman",
  linebackers: "Linebacker",
  secondary: "Defensive back",
};

const KIND_NOTHING: Readonly<Record<RosterGroupId, string>> = {
  skill: "No route yet",
  backs: "No route yet",
  line: "No block yet",
  front: "No assignment yet",
  linebackers: "No assignment yet",
  secondary: "No assignment yet",
};

function presetName(path: MovementPath): string | undefined {
  if (path.preset === undefined) return undefined;
  if (path.kind === "route") {
    return routePresetNames.find(({ key }) => key === path.preset)?.name;
  }
  return linePresetByKey(path.preset)?.name;
}

/**
 * The one line that says what a man does. His first line that is not a
 * motion leads — a motion is how he gets there, not what he is asked for —
 * and a motion counts only when it is all he has.
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
  return words || presetName(line) || lineKindNames[line.kind];
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
  return men.map((player, index) => {
    const role = roles[index];
    const group: RosterGroupId = isLineman(player)
      ? "line"
      : role === "QB" || role === "RB"
        ? "backs"
        : "skill";
    return row(play, player, group, (role && OFFENSE_ROLE_NAMES[role]) || "");
  });
}

function defenseRows(play: PlayDocument): readonly RosterRow[] {
  return defensivePlayers(play).map((player) => {
    const group = defenseGroupOf(player);
    const role =
      DEFENSE_ROLE_NAMES[player.label.trim().toUpperCase()] ??
      DEFENSE_GROUP_ROLE[group]!;
    return row(play, player, group, role);
  });
}

function row(
  play: PlayDocument,
  player: Player,
  group: RosterGroupId,
  role: string,
): RosterRow {
  const summary = assignmentSummary(play, player);
  return {
    player,
    letter: player.label.trim(),
    role: role || (group === "line" ? "Line" : "Skill"),
    ...(summary === undefined ? {} : { summary }),
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
    total: rows.length,
  };
}
