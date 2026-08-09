import {
  playTypeDefinitionSchema,
  type Color,
  type LabelBox,
  type LabelRole,
  type LegacyPlayType,
  type PlayTypeDefinition,
  type PlayTypeReference,
} from "./schema";

/**
 * What each kind of label means on a Play, and how the original draws it. A
 * Coach picks the meaning — Landmark, Alert — and the appearance follows,
 * so the same idea reads the same way on every card he prints.
 */
export interface LabelRolePreset {
  readonly name: string;
  readonly color: Color;
  readonly box: LabelBox;
  readonly boxColor: Color;
  readonly size: number;
  readonly mono: boolean;
  readonly caps: boolean;
}

export const labelRolePresets: Readonly<Record<LabelRole, LabelRolePreset>> =
  Object.freeze({
    landmark: {
      name: "Landmark",
      color: "green",
      box: "none",
      boxColor: "yellow",
      size: 11,
      mono: true,
      caps: false,
    },
    assignment: {
      name: "Assignment",
      color: "ink",
      box: "none",
      boxColor: "yellow",
      size: 11,
      mono: true,
      caps: true,
    },
    progression: {
      name: "Progression",
      color: "blue",
      box: "circle",
      boxColor: "blue",
      size: 12,
      mono: false,
      caps: false,
    },
    adjustment: {
      name: "Adjustment",
      color: "ink",
      box: "fill",
      boxColor: "yellow",
      size: 11,
      mono: false,
      caps: true,
    },
    alert: {
      name: "Alert",
      color: "red",
      box: "outline",
      boxColor: "red",
      size: 12,
      mono: false,
      caps: true,
    },
    coaching: {
      name: "Coaching point",
      color: "ink",
      box: "outline",
      boxColor: "ink",
      size: 11,
      mono: false,
      caps: false,
    },
  });

/** The sizes the original offers, and the text it labels them with. */
export const labelSizeChoices = Object.freeze([
  { name: "S", size: 11 },
  { name: "M", size: 13 },
  { name: "L", size: 17 },
]);

/** A new label the Coach has not written yet, as the original creates it. */
export const NEW_LABEL_DEFAULTS: {
  readonly text: string;
  readonly color: Color;
  readonly size: number;
  readonly box: LabelBox;
  readonly boxColor: Color;
} = Object.freeze({
  text: "5 Yds",
  color: "ink",
  size: 13,
  box: "none",
  boxColor: "yellow",
});

const definition = (
  value: Omit<PlayTypeDefinition, "archived">,
): PlayTypeDefinition =>
  playTypeDefinitionSchema.parse({ ...value, archived: false });

export const builtInPlayTypeDefinitions = Object.freeze([
  definition({
    id: "play_type_run",
    name: "Run",
    unit: "offense",
    builtInKey: "run",
    order: 0,
  }),
  definition({
    id: "play_type_pass",
    name: "Pass",
    unit: "offense",
    builtInKey: "pass",
    order: 1,
  }),
  definition({
    id: "play_type_rpo",
    name: "RPO",
    unit: "offense",
    builtInKey: "rpo",
    order: 2,
  }),
  definition({
    id: "play_type_screen",
    name: "Screen",
    unit: "offense",
    builtInKey: "screen",
    order: 3,
  }),
  definition({
    id: "play_type_coverage",
    name: "Coverage",
    unit: "defense",
    builtInKey: "coverage",
    order: 4,
  }),
  definition({
    id: "play_type_pressure",
    name: "Pressure",
    unit: "defense",
    builtInKey: "pressure",
    order: 5,
  }),
  definition({
    id: "play_type_return",
    name: "Return",
    unit: "special-teams",
    builtInKey: "return",
    order: 6,
  }),
  definition({
    id: "play_type_punt",
    name: "Punt",
    unit: "special-teams",
    builtInKey: "punt",
    order: 7,
  }),
  definition({
    id: "play_type_field_goal",
    name: "Field Goal",
    unit: "special-teams",
    builtInKey: "field-goal",
    order: 8,
  }),
]);

const builtInByLegacyName = new Map(
  builtInPlayTypeDefinitions.map((value) => [value.name, value]),
);

export function legacyPlayTypeReference(
  value: LegacyPlayType,
): PlayTypeReference | undefined {
  const definition = builtInByLegacyName.get(value);
  if (!definition) return undefined;
  return { id: definition.id, name: definition.name };
}

export function playTypeReference(
  definition: PlayTypeDefinition,
): PlayTypeReference {
  return { id: definition.id, name: definition.name };
}
