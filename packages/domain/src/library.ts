import { createStableId } from "./canonical";
import { playDocumentSchema } from "./schema";
import type {
  Concept,
  FieldProfile,
  PlayDocument,
  PlayTypeReference,
  PlayUnit,
} from "./schema";

/** The original composes a variation as `concept — distinguishing name`. */
export const VARIATION_NAME_SEPARATOR = " — ";

export type LibraryEditScope = "play" | "concept" | "pick";

export interface LibraryPlayMember {
  readonly playId: string;
  readonly name: string;
  readonly unit: PlayUnit;
  readonly playTypeName?: string;
  readonly conceptId?: string;
  readonly tags: readonly string[];
  readonly updatedAtMs: number;
}

export interface LibraryPlayRow {
  readonly playId: string;
  readonly name: string;
  readonly label: string;
  readonly isHead: boolean;
  readonly playTypeName?: string;
  readonly tags: readonly string[];
}

export interface LibraryConceptRow {
  readonly key: string;
  readonly conceptId?: string;
  readonly name: string;
  readonly notes: string;
  readonly tags: readonly string[];
  readonly playTypeName?: string;
  readonly head: LibraryPlayRow;
  readonly variations: readonly LibraryPlayRow[];
}

export function composedPlayName(
  conceptName: string,
  variantName: string,
): string {
  return `${conceptName}${VARIATION_NAME_SEPARATOR}${variantName}`;
}

export function variantNameFrom(conceptName: string, playName: string): string {
  const prefix = composedPlayName(conceptName, "");
  return playName.startsWith(prefix) ? playName.slice(prefix.length) : playName;
}

export function isConceptHeadName(
  conceptName: string,
  playName: string,
): boolean {
  return playName === conceptName;
}

export function emptyPlayDocument(input: {
  readonly playbookId: string;
  readonly fieldProfile: FieldProfile;
  readonly id?: string;
  readonly name?: string;
  readonly unit?: PlayUnit;
  readonly playType?: PlayTypeReference;
}): PlayDocument {
  return playDocumentSchema.parse({
    schemaVersion: 3,
    id: input.id ?? createStableId("play"),
    playbookId: input.playbookId,
    name: input.name?.trim() || "Untitled play",
    unit: input.unit ?? "offense",
    ...(input.playType === undefined ? {} : { playType: input.playType }),
    tags: [],
    notes: "",
    fieldProfile: structuredClone(input.fieldProfile),
    players: [],
    assignments: [],
    paths: [],
    labels: [],
  });
}

export function copyPlayDocument(
  play: PlayDocument,
  patch: {
    readonly id: string;
    readonly name?: string;
    /** Pass `null` to detach; omit to keep the source Concept pointer. */
    readonly conceptSource?: PlayDocument["conceptSource"] | null;
  },
): PlayDocument {
  const next: PlayDocument = {
    ...structuredClone(play),
    id: patch.id,
    ...(patch.name === undefined ? {} : { name: patch.name }),
  };
  if (patch.conceptSource === undefined) {
    return playDocumentSchema.parse(next);
  }
  if (patch.conceptSource === null) {
    const rest = { ...next };
    delete rest.conceptSource;
    return playDocumentSchema.parse(rest);
  }
  return playDocumentSchema.parse({
    ...next,
    conceptSource: patch.conceptSource,
  });
}

/**
 * A Play becomes its own concept: it keeps the composed name it was going by
 * and drops the Concept pointer so siblings are unaffected.
 */
export function detachPlayFromConcept(play: PlayDocument): PlayDocument {
  const rest = { ...play };
  delete rest.conceptSource;
  return playDocumentSchema.parse(rest);
}

export function attachPlayToConcept(
  play: PlayDocument,
  concept: Concept,
  variantName?: string,
): PlayDocument {
  const name =
    variantName === undefined
      ? concept.name
      : composedPlayName(concept.name, variantName);
  return playDocumentSchema.parse({
    ...play,
    name,
    conceptSource: { conceptId: concept.id, revision: concept.revision },
  });
}

export function conceptFromPlay(
  play: PlayDocument,
  conceptId: string,
): Concept {
  return {
    schemaVersion: 1,
    id: conceptId,
    playbookId: play.playbookId,
    revision: 1,
    name: play.name.includes(VARIATION_NAME_SEPARATOR)
      ? play.name.slice(0, play.name.indexOf(VARIATION_NAME_SEPARATOR))
      : play.name,
    unit: play.unit,
    notes: play.notes,
    tags: [...play.tags],
  };
}

export function createVariationPlay(input: {
  readonly source: PlayDocument;
  readonly concept: Concept;
  readonly variantName: string;
  readonly playId?: string;
}): PlayDocument {
  const variantName = input.variantName.trim();
  const copied = copyPlayDocument(input.source, {
    id: input.playId ?? createStableId("play"),
    name: composedPlayName(input.concept.name, variantName),
    conceptSource: {
      conceptId: input.concept.id,
      revision: input.concept.revision,
    },
  });
  return playDocumentSchema.parse({
    ...copied,
    tags: [],
    notes: "",
  });
}

export function renamePlayInFamily(
  play: PlayDocument,
  concept: Concept | undefined,
  nextName: string,
): PlayDocument {
  const trimmed = nextName.trim();
  if (!trimmed) return play;
  if (!concept || play.conceptSource?.conceptId !== concept.id) {
    return play.name === trimmed ? play : { ...play, name: trimmed };
  }
  if (isConceptHeadName(concept.name, play.name)) {
    return play.name === trimmed ? play : { ...play, name: trimmed };
  }
  const variantName = variantNameFrom(concept.name, trimmed);
  const composed = composedPlayName(concept.name, variantName);
  return play.name === composed ? play : { ...play, name: composed };
}

/**
 * Deleting a concept does not delete the plays under it — they become
 * concepts of their own, the way the original promoted them.
 */
export function promoteVariationsOnConceptDelete(
  deletedPlayId: string,
  deletedConceptId: string | undefined,
  plays: readonly PlayDocument[],
): readonly PlayDocument[] {
  return plays.flatMap((play) => {
    if (play.id === deletedPlayId) return [];
    if (
      deletedConceptId &&
      play.conceptSource?.conceptId === deletedConceptId
    ) {
      return [detachPlayFromConcept(play)];
    }
    return [play];
  });
}

export function familyOf(
  playId: string,
  members: readonly LibraryPlayMember[],
): readonly LibraryPlayMember[] {
  const current = members.find((member) => member.playId === playId);
  if (!current) return [];
  if (!current.conceptId) return [current];
  return members.filter((member) => member.conceptId === current.conceptId);
}

export function presentVariationLine(
  playId: string,
  members: readonly LibraryPlayMember[],
  concepts: readonly Concept[],
): string {
  const family = familyOf(playId, members);
  if (family.length < 2) return "";
  const index = Math.max(
    0,
    family.findIndex((member) => member.playId === playId),
  );
  const current = family[index];
  if (!current) return "";
  const concept = concepts.find(({ id }) => id === current.conceptId);
  const label = concept
    ? variantNameFrom(concept.name, current.name)
    : current.name;
  return `${index + 1} / ${family.length}  ·  ${label.toUpperCase()}`;
}

export function buildLibraryTree(
  members: readonly LibraryPlayMember[],
  concepts: readonly Concept[],
): readonly LibraryConceptRow[] {
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const grouped = new Map<string, LibraryPlayMember[]>();
  const standalone: LibraryPlayMember[] = [];

  for (const member of members) {
    if (member.conceptId && conceptById.has(member.conceptId)) {
      const list = grouped.get(member.conceptId) ?? [];
      list.push(member);
      grouped.set(member.conceptId, list);
    } else {
      standalone.push(member);
    }
  }

  const rows: Array<{
    readonly row: LibraryConceptRow;
    readonly updatedAtMs: number;
  }> = [];
  for (const [conceptId, plays] of grouped) {
    const concept = conceptById.get(conceptId);
    if (!concept) continue;
    const headMember =
      plays.find((play) => isConceptHeadName(concept.name, play.name)) ??
      plays[0];
    if (!headMember) continue;
    const variations = plays.filter(
      (play) => play.playId !== headMember.playId,
    );
    rows.push({
      updatedAtMs: Math.max(...plays.map((play) => play.updatedAtMs)),
      row: {
        key: conceptId,
        conceptId,
        name: concept.name,
        notes: concept.notes,
        tags: concept.tags,
        ...(headMember.playTypeName === undefined
          ? {}
          : { playTypeName: headMember.playTypeName }),
        head: toRow(headMember, concept.name, true),
        variations: variations.map((play) => toRow(play, concept.name, false)),
      },
    });
  }

  for (const play of standalone) {
    rows.push({
      updatedAtMs: play.updatedAtMs,
      row: {
        key: play.playId,
        name: play.name,
        notes: "",
        tags: play.tags,
        ...(play.playTypeName === undefined
          ? {}
          : { playTypeName: play.playTypeName }),
        head: toRow(play, play.name, true),
        variations: [],
      },
    });
  }

  return rows
    .sort(
      (left, right) =>
        right.updatedAtMs - left.updatedAtMs ||
        left.row.name.localeCompare(right.row.name),
    )
    .map(({ row }) => row);
}

function toRow(
  member: LibraryPlayMember,
  conceptName: string,
  isHead: boolean,
): LibraryPlayRow {
  return {
    playId: member.playId,
    name: member.name,
    label: isHead ? member.name : variantNameFrom(conceptName, member.name),
    isHead,
    ...(member.playTypeName === undefined
      ? {}
      : { playTypeName: member.playTypeName }),
    tags: member.tags,
  };
}

export function libraryScopeTargets(
  scope: LibraryEditScope,
  currentPlayId: string,
  family: readonly LibraryPlayMember[],
  pickIds: readonly string[],
): readonly LibraryPlayMember[] {
  if (scope === "play") return [];
  const siblings = family.filter((member) => member.playId !== currentPlayId);
  if (scope === "pick") {
    const picked = new Set(pickIds);
    return siblings.filter((member) => picked.has(member.playId));
  }
  return siblings;
}

/**
 * What a broadcast actually carries, in the Coach's words. Notes live on the
 * concept and are shared regardless; formation, personnel and each
 * version's name stay its own.
 */
export const LIBRARY_BROADCAST_CARRIES =
  "Routes and assignments travel — not formation, personnel or the name.";

export function libraryScopeHint(
  scope: LibraryEditScope,
  targetCount: number,
  familySize: number,
  hasOpenPlay: boolean,
): string {
  if (scope === "play") {
    return familySize < 2
      ? "Every change stays in the play you have open."
      : "Every change stays in this play. After a route edit you can send it to the other versions.";
  }
  if (!hasOpenPlay) return "Open a play from the library first.";
  if (familySize < 2) {
    return "Nothing to broadcast to yet — add a variation first.";
  }
  if (targetCount === 0) {
    return "Tap a dot to pick which versions this lands on.";
  }
  return (
    `Landing on ${targetCount + 1} of ${familySize} versions. ` +
    LIBRARY_BROADCAST_CARRIES
  );
}

/** A short badge for the inspector headings: "All 5" or "3 of 5". */
export function libraryScopeBadge(
  scope: LibraryEditScope,
  targetCount: number,
  familySize: number,
): string | undefined {
  if (scope === "play" || targetCount === 0) return undefined;
  return targetCount + 1 === familySize
    ? `All ${familySize}`
    : `${targetCount + 1} of ${familySize}`;
}

/**
 * Toggling a sibling's dot in the tree. The three scopes are one set of
 * targets seen from different angles: none, some, or every sibling.
 */
export function libraryScopeAfterToggle(
  scope: LibraryEditScope,
  pickIds: readonly string[],
  siblingIds: readonly string[],
  playId: string,
): { readonly scope: LibraryEditScope; readonly pickIds: readonly string[] } {
  if (!siblingIds.includes(playId)) return { scope, pickIds };
  const lit = new Set(
    scope === "concept" ? siblingIds : scope === "pick" ? pickIds : [],
  );
  if (lit.has(playId)) lit.delete(playId);
  else lit.add(playId);
  const next = siblingIds.filter((id) => lit.has(id));
  if (next.length === 0) return { scope: "play", pickIds: [] };
  if (next.length === siblingIds.length)
    return { scope: "concept", pickIds: next };
  return { scope: "pick", pickIds: next };
}

export function libraryDisclosureDefault(
  conceptId: string,
  openPlayConceptId: string | undefined,
  stored: Readonly<Record<string, boolean>>,
): boolean {
  if (stored[conceptId] !== undefined) return stored[conceptId] === true;
  return openPlayConceptId === conceptId;
}
