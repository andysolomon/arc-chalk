import {
  playTypesForUnit,
  playUnits,
  type PlayTypeDefinition,
  type PlayUnit,
} from "@chalk/domain";
import type { PlaySearchProjection } from "@chalk/local-db";

/** The chip that finds Plays left at their Unit with no Type chosen. */
export const UNCLASSIFIED = "unclassified";

export interface TypeChip {
  readonly id: string;
  readonly name: string;
}

/**
 * The Type chips the browser offers: the Unit's live definitions — every
 * Unit's when none is chosen — plus any Type a stored Play still carries that
 * the Playbook no longer defines, so an imported Play stays findable. Unit
 * and Type are separate axes: Defense finds every defensive Play whether or
 * not it is a Coverage, and Coverage narrows within it.
 */
export function typeChipsFor(
  playTypes: readonly PlayTypeDefinition[],
  members: readonly PlaySearchProjection[],
  unit: "all" | PlayUnit,
): readonly TypeChip[] {
  const scoped =
    unit === "all"
      ? playUnits.flatMap((choice) => playTypesForUnit(playTypes, choice.id))
      : playTypesForUnit(playTypes, unit);
  const chips: TypeChip[] = scoped.map(({ id, name }) => ({ id, name }));
  const known = new Set(chips.map(({ id }) => id));
  for (const member of members) {
    if (unit !== "all" && member.unit !== unit) continue;
    if (!member.playTypeId || known.has(member.playTypeId)) continue;
    known.add(member.playTypeId);
    chips.push({
      id: member.playTypeId,
      name: member.playTypeName ?? member.playTypeId,
    });
  }
  return chips;
}
