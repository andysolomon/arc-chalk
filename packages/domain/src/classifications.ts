import {
  playTypeDefinitionSchema,
  type LegacyPlayType,
  type PlayTypeDefinition,
  type PlayTypeReference,
} from "./schema";

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
