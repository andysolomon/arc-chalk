import {
  assignRoles,
  assignmentForPath,
  currentBallSpot,
  currentFormation,
  defensiveCallName,
  defensiveCallOf,
  defensivePersonnel,
  defensivePlayers,
  formatClassification,
  formationMeta,
  lineCallName,
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

function assignmentText(play: PlayDocument, path: MovementPath): string {
  return assignmentForPath(play, path.id)?.text.trim() ?? "";
}

/**
 * Who a row is about: his letter, else his position. A defense plays the
 * same letter twice — two corners, two ends — so a letter the defense has
 * one of on each side is told apart by the side he lines up on.
 */
function whoLabels(
  players: readonly Player[],
  roles?: readonly (string | undefined)[],
): readonly string[] {
  const base = players.map(
    (player, index) => player.label || roles?.[index] || "—",
  );
  const side = (player: Player) =>
    player.position.lateralYards < 0 ? "L" : "R";
  return players.map((player, index) => {
    const who = base[index]!;
    if (player.unit !== "defense" || who === "—") return who;
    const same = players.filter(
      (other, at) => other.unit === "defense" && base[at] === who,
    );
    const sides = new Set(same.map(side));
    return same.length > 1 && sides.size === same.length
      ? `${side(player)}${who}`
      : who;
  });
}

/** A defender this close to the ball is down on the line, and rushes. */
const DOWN_LINE_YARDS = 3;

/**
 * One row per man who has a line that is not a motion. His words are the
 * Assignment on his main line — the first one with wording, else the first —
 * falling back to his sublabel, then to what the line was drawn as: the quick
 * call it is, the zone, man or gap a defender has, a quarterback's drop. A
 * quarterback with no line of his own still has a job when the Play has a
 * progression, and a defender down on the line with none rushes.
 */
export function rowsFor(
  play: PlayDocument,
  players: readonly Player[],
  roles?: readonly (string | undefined)[],
): readonly CoachingRow[] {
  const rows: CoachingRow[] = [];
  const who = whoLabels(players, roles);
  const reads = progressionStrip(play);
  players.forEach((player, index) => {
    const role = roles?.[index] ?? "";
    const quarterback = role === "QB";
    const lines = play.paths.filter(
      (path) => path.playerId === player.id && path.kind !== "motion",
    );
    if (lines.length === 0) {
      const job =
        quarterback && reads
          ? `Read ${reads}`
          : player.unit === "defense" &&
              player.position.depthYards <= DOWN_LINE_YARDS
            ? "Rush"
            : "";
      if (job) {
        rows.push({
          playerId: player.id,
          role,
          who: who[index]!,
          assignment: job,
          conversion: "",
          note: "",
        });
      }
      return;
    }
    const main =
      lines.find((path) => assignmentText(play, path) !== "") ?? lines[0]!;
    const named = lineCallName(play, main, { role });
    rows.push({
      playerId: player.id,
      role,
      who: who[index]!,
      assignment:
        assignmentText(play, main) ||
        (player.sublabel ? player.sublabel.toUpperCase() : "") ||
        (named && quarterback && reads ? `${named}, read ${reads}` : named) ||
        "As drawn",
      conversion: main.conversion ?? "",
      note: main.coachingNote ?? "",
      ...(main.readOrder === undefined ? {} : { readOrder: main.readOrder }),
    });
  });
  return rows;
}

/**
 * The install-page table: the offense in football order, or the defense on
 * a defensive Play.
 */
export function playRows(play: PlayDocument): readonly CoachingRow[] {
  // A defensive Play is taught to the defense, in the order it was called.
  if (play.unit === "defense") return rowsFor(play, defensivePlayers(play));
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
  /** Empty for a defense, which has no strength of its own. */
  readonly strength: string;
  readonly hash: string;
}

/**
 * The bottom strip: personnel, formation, strength, hash. A defensive Play
 * reads its call instead — base, nickel or dime, and the call's name — and a
 * defense has no strength of its own to print, so it has none.
 *
 * Personnel is the Play's own label, else the set the Play is in — the same
 * words the editor's status bar and the Formations browser use for it —
 * else the count read off the men (issue #154).
 */
export function playMeta(
  play: PlayDocument,
  formations: readonly Formation[] = [],
): PlayMeta {
  if (play.unit === "defense") {
    const call = defensiveCallOf(play);
    return {
      personnel: call ? defensivePersonnel(call) : "",
      formation: defensiveCallName(play),
      strength: "",
      hash: currentBallSpot(play) ?? "middle",
    };
  }
  const offense = offensivePlayers(play);
  const formation = currentFormation(play, formations);
  const declared = play.personnelLabel ?? formation?.personnelLabel;
  const meta =
    offense.length > 0
      ? formationMeta(offense, {
          ...(declared === undefined ? {} : { personnelLabel: declared }),
        })
      : { personnelLabel: "—", strength: "—" };
  return {
    // An offense with nobody on the field has no count to give; it says
    // nothing rather than "—P" (issue #167).
    personnel: offense.length > 0 ? `${meta.personnelLabel}P` : "",
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

/**
 * The Plays in the order given, each with its Concept beside it and none
 * leading a group: a book read in the Coach's own sort (issue #156), where a
 * Concept's Plays may be pages apart and the contents names the Concept on
 * each row instead of heading them.
 */
export function conceptEntries(
  plays: readonly PlayDocument[],
  concepts: readonly Concept[] = [],
): readonly LibraryEntry[] {
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  return plays.map((play) => {
    const concept =
      play.conceptSource === undefined
        ? undefined
        : conceptById.get(play.conceptSource.conceptId);
    return {
      play,
      ...(concept === undefined ? {} : { concept }),
      leadsConcept: false,
    };
  });
}

/** The note at the top of an install page: the Concept's, else the Play's. */
export function conceptNote(entry: LibraryEntry): string {
  return (entry.concept?.notes ?? "").trim() || entry.play.notes.trim();
}

/**
 * The words a printed page uses for a Play's classification — `Defense ·
 * Coverage`, or `Defense` alone — the same words as the header pill and the
 * library card, so a sheet never files a Play under a category the editor
 * does not show.
 */
export function playCategory(play: PlayDocument): string {
  return formatClassification(play);
}

export interface CallSheetGroup {
  readonly name: string;
  readonly plays: readonly PlayDocument[];
}

/**
 * Grouped by situation tag when the library has them — a Play with no tags
 * borrows its Concept's — by Unit · Type when it does not, so an untagged
 * Cover 3 lands under Defense · Coverage rather than under Other. Tag groups
 * lead; classification fallbacks follow, as the original sorted them.
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
    return [playCategory(play)];
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
