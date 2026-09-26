import {
  describePersonnel,
  formationFamilies,
  formationGroupOf,
  type Concept,
  type Formation,
  type PlayUnit,
} from "@chalk/domain";
import type { PlaySearchProjection, PlaybookSummary } from "@chalk/local-db";

import { ANY, type FilterChoice } from "./filter-chip";
import { UNCLASSIFIED, typeChipsFor } from "./type-chips";

/**
 * Every way the book narrows, together. A chip left at `all` narrows
 * nothing; the Unit's two chips are the same switch as before, and Motion
 * asks for the Plays that carry a motion line or the ones that do not.
 */
export interface PlayFilterValues {
  readonly unit: "all" | PlayUnit;
  readonly playType: string;
  readonly playbookId: string;
  /** What the set is called from — Gun, Pistol, I-Form. */
  readonly formationGroup: string;
  /** The family of sets — Doubles, Trips, Bunch — by its key. */
  readonly set: string;
  /** One set exactly, by its id; set from the Formations page. */
  readonly formationId: string;
  readonly personnel: string;
  readonly conceptId: string;
  readonly tag: string;
  readonly motion: "all" | "with" | "without";
}

export const emptyPlayFilters: PlayFilterValues = Object.freeze({
  unit: ANY,
  playType: ANY,
  playbookId: ANY,
  formationGroup: ANY,
  set: ANY,
  formationId: ANY,
  personnel: ANY,
  conceptId: ANY,
  tag: ANY,
  motion: ANY,
});

/** Whether any chip is set, which is when Clear has something to do. */
export function playFiltersNarrow(values: PlayFilterValues): boolean {
  return (Object.keys(values) as (keyof PlayFilterValues)[]).some(
    (key) => values[key] !== ANY,
  );
}

/** What the filters read off a Play besides what its record already says. */
export interface PlayFacets {
  readonly formation?: Formation;
  readonly formationGroup?: string;
  readonly set?: string;
  readonly personnel?: string;
}

/**
 * The set a Play stands in and what follows from it. Personnel is the Play's
 * own label when the Coach gave one (ADR 0033), and otherwise the set's.
 */
export function playFacets(
  member: PlaySearchProjection,
  formationsById: ReadonlyMap<string, Formation>,
): PlayFacets {
  const formation = member.formationId
    ? formationsById.get(member.formationId)
    : undefined;
  const personnel = member.personnelLabel ?? formation?.personnelLabel;
  return {
    ...(formation
      ? {
          formation,
          formationGroup: formationGroupOf(formation),
          set: formation.family ?? "custom",
        }
      : {}),
    ...(personnel ? { personnel } : {}),
  };
}

export function matchesPlayFilters(
  member: PlaySearchProjection,
  values: PlayFilterValues,
  formationsById: ReadonlyMap<string, Formation>,
): boolean {
  if (values.unit !== ANY && member.unit !== values.unit) return false;
  if (values.playType !== ANY) {
    if (values.playType === UNCLASSIFIED) {
      if (member.playTypeId !== undefined) return false;
    } else if (member.playTypeId !== values.playType) return false;
  }
  if (values.playbookId !== ANY && member.playbookId !== values.playbookId) {
    return false;
  }
  if (values.conceptId !== ANY && member.conceptId !== values.conceptId) {
    return false;
  }
  if (values.tag !== ANY && !member.tags.includes(values.tag)) return false;
  if (values.motion !== ANY) {
    const carries = member.lineKinds?.includes("motion") ?? false;
    if (values.motion === "with" ? !carries : carries) return false;
  }
  if (
    values.formationGroup === ANY &&
    values.set === ANY &&
    values.formationId === ANY &&
    values.personnel === ANY
  ) {
    return true;
  }
  const facets = playFacets(member, formationsById);
  if (
    values.formationId !== ANY &&
    facets.formation?.id !== values.formationId
  ) {
    return false;
  }
  if (
    values.formationGroup !== ANY &&
    facets.formationGroup !== values.formationGroup
  ) {
    return false;
  }
  if (values.set !== ANY && facets.set !== values.set) return false;
  if (values.personnel !== ANY && facets.personnel !== values.personnel) {
    return false;
  }
  return true;
}

/** How many of these carry each value of one facet, in first-seen order. */
export function countBy<T>(
  items: readonly T[],
  facet: (item: T) => string | undefined,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = facet(item);
    if (value === undefined) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

const wordOrder = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** Choices from counted values, named by themselves, in word order. */
function choicesFromCounts(
  counts: ReadonlyMap<string, number>,
  name: (value: string) => string = (value) => value,
  detail?: (value: string) => string | undefined,
): readonly FilterChoice[] {
  return [...counts.entries()]
    .sort(([left], [right]) => wordOrder.compare(left, right))
    .map(([value, count]) => {
      const second = detail?.(value);
      return {
        value,
        name: name(value),
        ...(second ? { detail: second } : {}),
        count,
      };
    });
}

/**
 * Personnel reads as the label and, for a two-digit one, what it puts on the
 * field; the digits sort before the named packages.
 */
export function personnelChoices(
  counts: ReadonlyMap<string, number>,
): readonly FilterChoice[] {
  return choicesFromCounts(
    counts,
    (label) => label,
    (label) => {
      const described = describePersonnel(label);
      return described === label
        ? undefined
        : described.replace(/^\(.*?\)\s*/, "");
    },
  );
}

/** The set families that these Plays or Formations fall in, in the book's order. */
export function setChoices(
  counts: ReadonlyMap<string, number>,
): readonly FilterChoice[] {
  return formationFamilies.flatMap((family) => {
    const count = counts.get(family.key);
    return count
      ? [
          {
            value: family.key,
            name: family.shortName,
            detail: family.name,
            count,
          },
        ]
      : [];
  });
}

/** Everything the Plays page can be narrowed by, each counted over the book. */
export interface PlayFilterChoices {
  readonly playTypes: readonly FilterChoice[];
  readonly playbooks: readonly FilterChoice[];
  readonly formationGroups: readonly FilterChoice[];
  readonly sets: readonly FilterChoice[];
  readonly personnel: readonly FilterChoice[];
  readonly concepts: readonly FilterChoice[];
  readonly tags: readonly FilterChoice[];
  readonly motion: readonly FilterChoice[];
}

export function playFilterChoices({
  concepts,
  formationsById,
  members,
  playbooks,
  playTypes,
  unit,
}: {
  concepts: readonly Concept[];
  formationsById: ReadonlyMap<string, Formation>;
  members: readonly PlaySearchProjection[];
  playbooks: readonly PlaybookSummary[];
  playTypes: Parameters<typeof typeChipsFor>[0];
  unit: "all" | PlayUnit;
}): PlayFilterChoices {
  const inUnit = members.filter(
    (member) => unit === ANY || member.unit === unit,
  );
  const facets = inUnit.map((member) => playFacets(member, formationsById));
  const typeCounts = countBy(inUnit, (member) => member.playTypeId);
  const unclassified = inUnit.filter(
    (member) => member.playTypeId === undefined,
  ).length;
  const conceptNames = new Map(concepts.map(({ id, name }) => [id, name]));
  const bookNames = new Map(playbooks.map(({ id, name }) => [id, name]));
  const withMotion = inUnit.filter((member) =>
    member.lineKinds?.includes("motion"),
  ).length;
  return {
    playTypes: [
      ...typeChipsFor(playTypes, members, unit).map(({ id, name }) => ({
        value: id,
        name,
        count: typeCounts.get(id) ?? 0,
      })),
      { value: UNCLASSIFIED, name: "Unclassified", count: unclassified },
    ],
    playbooks: choicesFromCounts(
      countBy(inUnit, (member) => member.playbookId),
      (id) => bookNames.get(id) ?? "This playbook",
    ),
    formationGroups: choicesFromCounts(
      countBy(facets, (facet) => facet.formationGroup),
    ),
    sets: setChoices(countBy(facets, (facet) => facet.set)),
    personnel: personnelChoices(countBy(facets, (facet) => facet.personnel)),
    concepts: choicesFromCounts(
      countBy(inUnit, (member) => member.conceptId),
      (id) => conceptNames.get(id) ?? "Concept",
    ),
    tags: choicesFromCounts(
      countBy(
        inUnit.flatMap((member) => member.tags.map((tag) => ({ tag }))),
        ({ tag }) => tag,
      ),
    ),
    motion: [
      { value: "with", name: "With motion", count: withMotion },
      {
        value: "without",
        name: "No motion",
        count: inUnit.length - withMotion,
      },
    ],
  };
}
