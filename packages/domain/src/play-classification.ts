import { createStableId } from "./canonical";
import type { PlayCommand } from "./commands";
import {
  playTypeDefinitionSchema,
  type Concept,
  type Formation,
  type PlayDocument,
  type PlayTypeDefinition,
  type PlayTypeReference,
  type PlayUnit,
  type Playbook,
} from "./schema";

/**
 * How a Play is classified, and how every surface says it. The Coach reads
 * the same words on the header pill, a library card, a filter chip, a call
 * sheet column, and a printed page: the Unit he authored for, and — when he
 * chose one — the Type inside it. Formation, personnel, concept, and
 * situation are separate metadata and never fold into this.
 */
export interface PlayClassification {
  readonly unit: PlayUnit;
  readonly playType?: PlayTypeReference;
}

export interface PlayUnitChoice {
  readonly id: PlayUnit;
  readonly name: string;
}

/**
 * The two units, in the order the original listed them. A Play is one or
 * the other from the moment it is started and never moves (ADR 0053); the
 * special-teams play the original also offered is set aside for now.
 */
export const playUnits: readonly PlayUnitChoice[] = Object.freeze([
  { id: "offense", name: "Offense" },
  { id: "defense", name: "Defense" },
]);

/** The unit whose men stand across the ball from this one. */
export function opposingUnit(unit: PlayUnit): PlayUnit {
  return unit === "defense" ? "offense" : "defense";
}

/** A Play may stay at its Unit; this is what that reads as. */
export const UNCLASSIFIED_PLAY_TYPE_NAME = "Unclassified";

/** The separator between a Unit and its Type wherever the two print together. */
export const CLASSIFICATION_SEPARATOR = " · ";

export function unitName(unit: PlayUnit): string {
  return playUnits.find((choice) => choice.id === unit)?.name ?? unit;
}

/** `Defense · Coverage`, or `Defense` alone when the Coach chose no Type. */
export function formatClassification(play: PlayClassification): string {
  const unit = unitName(play.unit);
  return play.playType
    ? `${unit}${CLASSIFICATION_SEPARATOR}${play.playType.name}`
    : unit;
}

/** The Type the Coach chose, or the honest word for none. */
export function playTypeName(play: PlayClassification): string {
  return play.playType?.name ?? UNCLASSIFIED_PLAY_TYPE_NAME;
}

/** The live Types a Unit offers, in the Coach's order. */
export function playTypesForUnit(
  playTypes: readonly PlayTypeDefinition[],
  unit: PlayUnit,
): readonly PlayTypeDefinition[] {
  return playTypes
    .filter((definition) => definition.unit === unit && !definition.archived)
    .sort(
      (left, right) =>
        left.order - right.order || left.name.localeCompare(right.name),
    );
}

/**
 * Whether a Type belongs to a Unit. An archived Type still belongs — a Play
 * that already carries it keeps it — but is not offered for new choices.
 */
export function playTypeBelongsToUnit(
  playTypes: readonly PlayTypeDefinition[],
  playType: PlayTypeReference | undefined,
  unit: PlayUnit,
): boolean {
  if (!playType) return true;
  const definition = playTypes.find(({ id }) => id === playType.id);
  // A Type the Playbook no longer defines — an import from elsewhere — is
  // judged by the reference alone, which carries no Unit, so it is kept.
  if (!definition) return true;
  return definition.unit === unit;
}

export type AddPlayTypeResult =
  | {
      readonly ok: true;
      readonly playbook: Playbook;
      readonly playType: PlayTypeDefinition;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * A Type the Coach defines himself, in the same model the built-ins use. The
 * name is unique within its Unit — `Pressure` on defense and a coach-made
 * `Pressure` on special teams can coexist — and an archived Type of the same
 * name comes back rather than being duplicated.
 */
export function addCoachPlayType(
  playbook: Playbook,
  input: {
    readonly name: string;
    readonly unit: PlayUnit;
    readonly id?: string;
  },
): AddPlayTypeResult {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, reason: "Give the type a name first." };
  const existing = playbook.playTypes.find(
    (definition) =>
      definition.unit === input.unit &&
      definition.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing && !existing.archived) {
    return {
      ok: false,
      reason: `${unitName(input.unit)} already has a ${existing.name} type.`,
    };
  }
  const order =
    playbook.playTypes.reduce(
      (highest, definition) => Math.max(highest, definition.order),
      -1,
    ) + 1;
  const playType: PlayTypeDefinition = existing
    ? { ...existing, archived: false }
    : playTypeDefinitionSchema.parse({
        id: input.id ?? createStableId("play_type"),
        name,
        unit: input.unit,
        order,
        archived: false,
      });
  return {
    ok: true,
    playType,
    playbook: {
      ...playbook,
      playTypes: existing
        ? playbook.playTypes.map((definition) =>
            definition.id === existing.id ? playType : definition,
          )
        : [...playbook.playTypes, playType],
    },
  };
}

/**
 * Retires a Type from the Coach's choices. Plays that already carry it keep
 * their reference — the name snapshot on each Play still reads correctly —
 * so nothing is silently reclassified. Built-in Types can be archived too;
 * a Coach who never calls anything an RPO need not see the word.
 */
export function archivePlayType(
  playbook: Playbook,
  playTypeId: string,
): Playbook {
  return {
    ...playbook,
    playTypes: playbook.playTypes.map((definition) =>
      definition.id === playTypeId
        ? { ...definition, archived: true }
        : definition,
    ),
  };
}

export interface ReclassifyContext {
  readonly playTypes: readonly PlayTypeDefinition[];
  readonly concepts?: readonly Concept[];
  readonly formations?: readonly Formation[];
}

/** What a reclassification would let go of, named so the Coach can decide. */
export interface ReclassifyDrops {
  readonly playType?: string;
  readonly concept?: string;
  readonly formation?: string;
}

export interface ReclassifyPlan {
  readonly command: PlayCommand;
  readonly drops: ReclassifyDrops;
  /** True when the plan touches anything beyond the Unit and Type. */
  readonly needsConfirmation: boolean;
}

/**
 * The command that changes a Play's Unit and Type, and the honest account of
 * what else has to give. A Type from another Unit, a Concept of another
 * Unit, or a Formation of another Unit cannot stay referenced once the Play
 * moves — the Playbook envelope refuses the mismatch — so the plan clears
 * exactly those pointers, names each one, and leaves every man, line and
 * label on the field. Undo restores all of it in one step.
 *
 * The editor no longer offers a Unit change (ADR 0053): a Play is started as
 * offense or defense and stays so. The Unit half of this remains for the
 * places that reconcile two versions of one Play — restoring a version,
 * pushing a family — and for a Playbook read from elsewhere.
 *
 * Returns undefined when nothing would change.
 */
export function reclassifyPlay(
  play: PlayDocument,
  next: PlayClassification,
  context: ReclassifyContext,
): ReclassifyPlan | undefined {
  const commands: Extract<PlayCommand, { kind: "batch" }>["commands"] = [];
  const drops: {
    playType?: string;
    concept?: string;
    formation?: string;
  } = {};
  const unitChanges = next.unit !== play.unit;
  if (unitChanges) commands.push({ kind: "set-unit", unit: next.unit });

  const requested = next.playType;
  const requestedFits = playTypeBelongsToUnit(
    context.playTypes,
    requested,
    next.unit,
  );
  const target = requestedFits ? requested : undefined;
  if (!requestedFits && requested) drops.playType = requested.name;
  const typeChanges =
    (target?.id ?? undefined) !== (play.playType?.id ?? undefined) ||
    (target?.name ?? undefined) !== (play.playType?.name ?? undefined);
  if (typeChanges) {
    commands.push({
      kind: "set-play-type",
      ...(target === undefined ? {} : { playType: target }),
    });
    if (play.playType && target === undefined && !drops.playType) {
      drops.playType = play.playType.name;
    }
  }

  if (unitChanges && play.conceptSource) {
    const concept = context.concepts?.find(
      ({ id }) => id === play.conceptSource?.conceptId,
    );
    if (!concept || concept.unit !== next.unit) {
      commands.push({ kind: "set-concept-source" });
      drops.concept = concept?.name ?? "its concept";
    }
  }
  if (unitChanges && play.formationSource) {
    const formation = context.formations?.find(
      ({ id }) => id === play.formationSource?.formationId,
    );
    if (!formation || formation.unit !== next.unit) {
      commands.push({ kind: "set-formation-source" });
      drops.formation = formation?.name ?? "its formation";
    }
  }

  if (commands.length === 0) return undefined;
  const command: PlayCommand =
    commands.length === 1
      ? commands[0]!
      : {
          kind: "batch",
          label: unitChanges ? "Change unit" : "Change Play Type",
          commands,
        };
  return {
    command,
    drops,
    needsConfirmation: Boolean(
      drops.concept || drops.formation || (unitChanges && drops.playType),
    ),
  };
}

/** One sentence for the confirmation, in the Coach's words. */
export function describeReclassifyDrops(
  drops: ReclassifyDrops,
  unit: PlayUnit,
): string {
  const parts = [
    drops.playType ? `the ${drops.playType} type` : undefined,
    drops.concept ? `the ${drops.concept} concept link` : undefined,
    drops.formation ? `the ${drops.formation} formation link` : undefined,
  ].filter((part): part is string => part !== undefined);
  if (parts.length === 0) return "";
  const list =
    parts.length === 1
      ? parts[0]!
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
  return `Moving to ${unitName(unit)} drops ${list}. The diagram stays.`;
}
