import {
  assignRoles,
  assignmentForPath,
  currentBallSpot,
  currentFormation,
  formationMeta,
  offensivePlayers,
  type Concept,
  type Formation,
  type MovementPath,
  type PlayDocument,
  type Player,
} from "@chalk/domain";

/**
 * Every piece of paper a staff makes, driven by the same structured Play:
 * role decides the order, assignments come off the routes, and the diagram is
 * never redrawn by hand. These are the original's `playRows`, `progStrip`,
 * `playMeta` and `groupMembers`, read from the domain instead of the canvas.
 */

/** Football order — QB, backs, receivers, line — never document order. */
export const ROLE_ORDER: Readonly<Record<string, number>> = Object.freeze({
  QB: 0,
  RB: 1,
  F: 2,
  H: 3,
  X: 4,
  Z: 5,
  TE: 6,
  LT: 7,
  LG: 8,
  C: 9,
  RG: 10,
  RT: 11,
});

export const positionGroupIds = ["rec", "backs", "line", "qb", "def"] as const;
export type PositionGroupId = (typeof positionGroupIds)[number];

export interface PositionGroup {
  readonly id: PositionGroupId;
  readonly name: string;
  readonly roles?: readonly string[];
}

export const positionGroupCatalog: readonly PositionGroup[] = Object.freeze([
  { id: "rec", name: "Receivers", roles: ["X", "Z", "TE"] },
  { id: "backs", name: "Backs", roles: ["RB", "H"] },
  { id: "line", name: "Line", roles: ["LT", "LG", "C", "RG", "RT"] },
  { id: "qb", name: "QB", roles: ["QB"] },
  { id: "def", name: "Defense" },
]);

export function positionGroup(id: PositionGroupId): PositionGroup {
  return positionGroupCatalog.find((group) => group.id === id)!;
}

export interface CoachingRow {
  readonly playerId: string;
  readonly role: string;
  readonly who: string;
  readonly assignment: string;
  readonly conversion: string;
  readonly note: string;
  readonly readOrder?: number;
}

const KIND_WORDS: Readonly<Partial<Record<MovementPath["kind"], string>>> = {
  block: "Block",
  zone: "Zone drop",
  blitz: "Blitz",
  stunt: "Stunt",
};

function assignmentText(play: PlayDocument, path: MovementPath): string {
  return assignmentForPath(play, path.id)?.text.trim() ?? "";
}

/**
 * One row per man who has a line that is not a motion. His words are the
 * Assignment on his main line — the first one with wording, else the first —
 * falling back to his sublabel, then to what kind of line it is.
 */
export function rowsFor(
  play: PlayDocument,
  players: readonly Player[],
  roles?: readonly (string | undefined)[],
): readonly CoachingRow[] {
  const rows: CoachingRow[] = [];
  players.forEach((player, index) => {
    const lines = play.paths.filter(
      (path) => path.playerId === player.id && path.kind !== "motion",
    );
    if (lines.length === 0) return;
    const main =
      lines.find((path) => assignmentText(play, path) !== "") ?? lines[0]!;
    const role = roles?.[index] ?? "";
    rows.push({
      playerId: player.id,
      role,
      who: player.label || role || "—",
      assignment:
        assignmentText(play, main) ||
        (player.sublabel ? player.sublabel.toUpperCase() : "") ||
        KIND_WORDS[main.kind] ||
        "As drawn",
      conversion: main.conversion ?? "",
      note: main.coachingNote ?? "",
      ...(main.readOrder === undefined ? {} : { readOrder: main.readOrder }),
    });
  });
  return rows;
}

/** The install-page table: the offense, in football order. */
export function playRows(play: PlayDocument): readonly CoachingRow[] {
  const offense = offensivePlayers(play);
  const roles = assignRoles(offense);
  return [...rowsFor(play, offense, roles)].sort((left, right) => {
    const a = ROLE_ORDER[left.role] ?? 20;
    const b = ROLE_ORDER[right.role] ?? 20;
    return a - b;
  });
}

/**
 * `1 STICK → 2 FLAT → 3 DIG → CHECK`, as text. An unnumbered line whose
 * words say "check" closes the strip, the way the original's did.
 */
export function progressionStrip(play: PlayDocument): string {
  const who = (path: MovementPath): string =>
    play.players.find(({ id }) => id === path.playerId)?.label ?? "";
  const sequence = play.paths
    .filter((path) => path.readOrder !== undefined)
    .sort((a, b) => a.readOrder! - b.readOrder!)
    .map(
      (path) =>
        `${path.readOrder} ${(assignmentText(play, path) || who(path)).toUpperCase()}`,
    );
  if (sequence.length === 0) return "";
  if (
    play.paths.some(
      (path) =>
        path.readOrder === undefined &&
        /check/i.test(assignmentText(play, path)),
    )
  ) {
    sequence.push("CHECK");
  }
  return sequence.join("  →  ");
}

export interface PlayMeta {
  readonly personnel: string;
  readonly formation: string;
  readonly strength: string;
  readonly hash: string;
}

/** The bottom strip: personnel, formation, strength, hash. */
export function playMeta(
  play: PlayDocument,
  formations: readonly Formation[] = [],
): PlayMeta {
  const offense = offensivePlayers(play);
  const meta =
    offense.length > 0
      ? formationMeta(offense, {
          ...(play.personnelLabel === undefined
            ? {}
            : { personnelLabel: play.personnelLabel }),
        })
      : { personnelLabel: "—", strength: "—" };
  const formation = currentFormation(play, formations);
  return {
    personnel: `${meta.personnelLabel}P`,
    formation: formation?.name ?? "Custom alignment",
    strength: meta.strength,
    hash: currentBallSpot(play) ?? "middle",
  };
}

/** The men a position sheet is about. */
export function groupMembers(
  play: PlayDocument,
  groupId: PositionGroupId,
): readonly Player[] {
  if (groupId === "def") {
    return play.players.filter((player) => player.unit === "defense");
  }
  const offense = offensivePlayers(play);
  const roles = assignRoles(offense);
  const keep = positionGroup(groupId).roles ?? [];
  return offense.filter((_, index) => keep.includes(roles[index] ?? ""));
}

/** The group's own rows, in the order they stand in the document. */
export function groupRows(
  play: PlayDocument,
  groupId: PositionGroupId,
): readonly CoachingRow[] {
  const members = groupMembers(play, groupId);
  return rowsFor(
    play,
    members,
    groupId === "def" ? undefined : assignRoles(members),
  );
}

/**
 * The quiz's diagram: every assignment, read number and note off the field,
 * free labels reduced to landmarks. Reads and assignments are layers the
 * renderer drops; the labels are the Play's own, so they come off here.
 */
export function quizPlay(play: PlayDocument): PlayDocument {
  return {
    ...play,
    labels: play.labels.filter(
      (label) => label.role === undefined || label.role === "landmark",
    ),
  };
}

/** A Play with everything a coaching output reads beside it. */
export interface LibraryEntry {
  readonly play: PlayDocument;
  readonly concept?: Concept;
  /** The first Play of its Concept — the one the contents lists bold. */
  readonly leadsConcept: boolean;
}

/**
 * Library order, variations after their concept — the same order everywhere:
 * wristband picker, practice cards, playbook. Plays of one Concept stay
 * together in the order they were saved; a Play with no Concept stands alone.
 */
export function libraryOrder(
  plays: readonly PlayDocument[],
  concepts: readonly Concept[] = [],
): readonly LibraryEntry[] {
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const seen = new Set<string>();
  const out: LibraryEntry[] = [];
  for (const play of plays) {
    if (seen.has(play.id)) continue;
    const conceptId = play.conceptSource?.conceptId;
    if (conceptId === undefined) {
      seen.add(play.id);
      out.push({ play, leadsConcept: false });
      continue;
    }
    const family = plays.filter(
      (other) =>
        other.conceptSource?.conceptId === conceptId && !seen.has(other.id),
    );
    family.forEach((member, index) => {
      seen.add(member.id);
      out.push({
        play: member,
        ...(conceptById.has(conceptId)
          ? { concept: conceptById.get(conceptId) }
          : {}),
        leadsConcept: index === 0 && family.length > 1,
      });
    });
  }
  return out;
}

/** The note at the top of an install page: the Concept's, else the Play's. */
export function conceptNote(entry: LibraryEntry): string {
  return (entry.concept?.notes ?? "").trim() || entry.play.notes.trim();
}

export function playCategory(play: PlayDocument): string {
  return play.playType?.name ?? "";
}

export interface CallSheetGroup {
  readonly name: string;
  readonly plays: readonly PlayDocument[];
}

/**
 * Grouped by situation tag when the library has them — a Play with no tags
 * borrows its Concept's — by category when it does not. Tag groups lead;
 * category fallbacks follow, as the original sorted them.
 */
export function callSheetGroups(
  plays: readonly PlayDocument[],
  concepts: readonly Concept[] = [],
): readonly CallSheetGroup[] {
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const tagsOf = (play: PlayDocument): readonly string[] => {
    if (play.tags.length > 0) return play.tags;
    const concept = play.conceptSource
      ? conceptById.get(play.conceptSource.conceptId)
      : undefined;
    if (concept && concept.tags.length > 0) return concept.tags;
    return [playCategory(play) || "Other"];
  };
  const knownTags = new Set([
    ...plays.flatMap((play) => play.tags),
    ...concepts.flatMap((concept) => concept.tags),
  ]);
  const groups = new Map<string, PlayDocument[]>();
  for (const play of plays) {
    for (const tag of tagsOf(play)) {
      const list = groups.get(tag) ?? [];
      list.push(play);
      groups.set(tag, list);
    }
  }
  return [...groups.entries()]
    .map(([name, list]) => ({ name, plays: list }))
    .sort(
      (a, b) => Number(!knownTags.has(a.name)) - Number(!knownTags.has(b.name)),
    );
}
