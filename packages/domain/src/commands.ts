import * as z from "zod/mini";

import { canonicalStringify } from "./canonical";
import { mirrorPlayGeometry } from "./geometry";
import {
  assignmentSchema,
  conceptSourceSchema,
  coordinateSchema,
  entityIdSchema,
  formationSourceSchema,
  fieldProfileSchema,
  movementPathSchema,
  nameSchema,
  playDocumentSchema,
  playTypeReferenceSchema,
  playUnitSchema,
  playerSchema,
  textLabelSchema,
  type Assignment,
  type PlayDocument,
} from "./schema";

/**
 * A Coach edit is stored as a semantic command rather than a Play snapshot, so
 * undo history stays small enough to persist and stays readable across
 * releases.
 */
export class PlayCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayCommandError";
  }
}

const insertIndexSchema = z.number().check(z.int(), z.nonnegative());

function insertionSchema<Item extends z.ZodMiniType>(item: Item) {
  return z.array(z.object({ index: insertIndexSchema, item }));
}

const setPlayNameSchema = z.object({
  kind: z.literal("set-play-name"),
  name: nameSchema,
});
const setNotesSchema = z.object({
  kind: z.literal("set-notes"),
  notes: z.string(),
});
const setTagsSchema = z.object({
  kind: z.literal("set-tags"),
  tags: z.array(z.string()),
});
const setPersonnelLabelSchema = z.object({
  kind: z.literal("set-personnel-label"),
  personnelLabel: z.optional(z.string()),
});
const setPlayTypeSchema = z.object({
  kind: z.literal("set-play-type"),
  playType: z.optional(playTypeReferenceSchema),
});
const setUnitSchema = z.object({
  kind: z.literal("set-unit"),
  unit: playUnitSchema,
});
const setFieldProfileSchema = z.object({
  kind: z.literal("set-field-profile"),
  fieldProfile: fieldProfileSchema,
});
const setConceptSourceSchema = z.object({
  kind: z.literal("set-concept-source"),
  conceptSource: z.optional(conceptSourceSchema),
});
const setFormationSourceSchema = z.object({
  kind: z.literal("set-formation-source"),
  formationSource: z.optional(formationSourceSchema),
});
const insertPlayersSchema = z.object({
  kind: z.literal("insert-players"),
  players: insertionSchema(playerSchema),
});
const removePlayersSchema = z.object({
  kind: z.literal("remove-players"),
  playerIds: z.array(entityIdSchema),
});
const movePlayersSchema = z.object({
  kind: z.literal("move-players"),
  moves: z.array(
    z.object({ playerId: entityIdSchema, position: coordinateSchema }),
  ),
});
const updatePlayerSchema = z.object({
  kind: z.literal("update-player"),
  player: playerSchema,
});
const insertPathsSchema = z.object({
  kind: z.literal("insert-paths"),
  paths: insertionSchema(movementPathSchema),
});
const removePathsSchema = z.object({
  kind: z.literal("remove-paths"),
  pathIds: z.array(entityIdSchema),
});
const updatePathSchema = z.object({
  kind: z.literal("update-path"),
  path: movementPathSchema,
});
const insertLabelsSchema = z.object({
  kind: z.literal("insert-labels"),
  labels: insertionSchema(textLabelSchema),
});
const removeLabelsSchema = z.object({
  kind: z.literal("remove-labels"),
  labelIds: z.array(entityIdSchema),
});
const updateLabelSchema = z.object({
  kind: z.literal("update-label"),
  label: textLabelSchema,
});
const insertAssignmentsSchema = z.object({
  kind: z.literal("insert-assignments"),
  assignments: insertionSchema(assignmentSchema),
});
const removeAssignmentsSchema = z.object({
  kind: z.literal("remove-assignments"),
  assignmentIds: z.array(entityIdSchema),
});
const updateAssignmentSchema = z.object({
  kind: z.literal("update-assignment"),
  assignment: assignmentSchema,
});
const mirrorPlaySchema = z.object({ kind: z.literal("mirror-play") });

const primitivePlayCommandSchemas = [
  setPlayNameSchema,
  setNotesSchema,
  setTagsSchema,
  setPersonnelLabelSchema,
  setPlayTypeSchema,
  setUnitSchema,
  setFieldProfileSchema,
  setConceptSourceSchema,
  setFormationSourceSchema,
  insertPlayersSchema,
  removePlayersSchema,
  movePlayersSchema,
  updatePlayerSchema,
  insertPathsSchema,
  removePathsSchema,
  updatePathSchema,
  insertLabelsSchema,
  removeLabelsSchema,
  updateLabelSchema,
  insertAssignmentsSchema,
  removeAssignmentsSchema,
  updateAssignmentSchema,
  mirrorPlaySchema,
] as const;

export const primitivePlayCommandSchema = z.discriminatedUnion(
  "kind",
  primitivePlayCommandSchemas,
);

/**
 * One Coach gesture — a multi-selection drag, a paste, a delete with its
 * dependents — is one batch, so it undoes as one step.
 */
export const batchPlayCommandSchema = z.object({
  kind: z.literal("batch"),
  label: z.optional(nameSchema),
  commands: z.array(primitivePlayCommandSchema),
});

export const playCommandSchema = z.discriminatedUnion("kind", [
  ...primitivePlayCommandSchemas,
  batchPlayCommandSchema,
]);

export type PrimitivePlayCommand = z.infer<typeof primitivePlayCommandSchema>;
export type BatchPlayCommand = z.infer<typeof batchPlayCommandSchema>;
export type PlayCommand = z.infer<typeof playCommandSchema>;

export type PlayLayer = "players" | "paths" | "labels" | "assignments";

interface Insertion<Item> {
  readonly index: number;
  readonly item: Item;
}

function insertAll<Item>(
  items: readonly Item[],
  insertions: readonly Insertion<Item>[],
  layer: PlayLayer,
): Item[] {
  const next = [...items];
  for (const { index, item } of [...insertions].sort(
    (left, right) => left.index - right.index,
  )) {
    if (index > next.length) {
      throw new PlayCommandError(
        `Cannot insert into ${layer} at index ${index}.`,
      );
    }
    next.splice(index, 0, item);
  }
  return next;
}

function requireAll<Item extends { readonly id: string }>(
  items: readonly Item[],
  ids: readonly string[],
  layer: PlayLayer,
): void {
  const present = new Set(items.map(({ id }) => id));
  for (const id of ids) {
    if (!present.has(id)) {
      throw new PlayCommandError(`Play ${layer} do not contain ${id}.`);
    }
  }
}

function removalInsertions<Item extends { readonly id: string }>(
  items: readonly Item[],
  ids: readonly string[],
): Insertion<Item>[] {
  const removing = new Set(ids);
  return items.flatMap((item, index) =>
    removing.has(item.id) ? [{ index, item }] : [],
  );
}

function removeAll<Item extends { readonly id: string }>(
  items: readonly Item[],
  ids: readonly string[],
  layer: PlayLayer,
): Item[] {
  requireAll(items, ids, layer);
  const removing = new Set(ids);
  return items.filter(({ id }) => !removing.has(id));
}

function replaceOne<Item extends { readonly id: string }>(
  items: readonly Item[],
  replacement: Item,
  layer: PlayLayer,
): { readonly items: Item[]; readonly previous: Item } {
  const previous = items.find(({ id }) => id === replacement.id);
  if (!previous) {
    throw new PlayCommandError(
      `Play ${layer} do not contain ${replacement.id}.`,
    );
  }
  return {
    items: items.map((item) =>
      item.id === replacement.id ? replacement : item,
    ),
    previous,
  };
}

/** Clearing an optional field drops the key so canonical hashes stay stable. */
function withOptional<Key extends string, Value>(
  play: PlayDocument,
  key: Key,
  value: Value | undefined,
): PlayDocument {
  const rest: Record<string, unknown> = { ...play };
  delete rest[key];
  return (value === undefined
    ? rest
    : { ...rest, [key]: value }) as unknown as PlayDocument;
}

interface PrimitiveStep {
  readonly document: PlayDocument;
  readonly inverse: PrimitivePlayCommand;
}

function applyPrimitive(
  play: PlayDocument,
  command: PrimitivePlayCommand,
): PrimitiveStep {
  switch (command.kind) {
    case "set-play-name":
      return {
        document: { ...play, name: command.name },
        inverse: { kind: "set-play-name", name: play.name },
      };
    case "set-notes":
      return {
        document: { ...play, notes: command.notes },
        inverse: { kind: "set-notes", notes: play.notes },
      };
    case "set-tags":
      return {
        document: { ...play, tags: [...command.tags] },
        inverse: { kind: "set-tags", tags: [...play.tags] },
      };
    case "set-personnel-label":
      return {
        document: withOptional(play, "personnelLabel", command.personnelLabel),
        inverse: {
          kind: "set-personnel-label",
          ...(play.personnelLabel === undefined
            ? {}
            : { personnelLabel: play.personnelLabel }),
        },
      };
    case "set-play-type":
      return {
        document: withOptional(play, "playType", command.playType),
        inverse: {
          kind: "set-play-type",
          ...(play.playType === undefined ? {} : { playType: play.playType }),
        },
      };
    case "set-unit":
      return {
        document: { ...play, unit: command.unit },
        inverse: { kind: "set-unit", unit: play.unit },
      };
    case "set-field-profile":
      return {
        document: { ...play, fieldProfile: command.fieldProfile },
        inverse: { kind: "set-field-profile", fieldProfile: play.fieldProfile },
      };
    case "set-concept-source":
      return {
        document: withOptional(play, "conceptSource", command.conceptSource),
        inverse: {
          kind: "set-concept-source",
          ...(play.conceptSource === undefined
            ? {}
            : { conceptSource: play.conceptSource }),
        },
      };
    case "set-formation-source":
      return {
        document: withOptional(
          play,
          "formationSource",
          command.formationSource,
        ),
        inverse: {
          kind: "set-formation-source",
          ...(play.formationSource === undefined
            ? {}
            : { formationSource: play.formationSource }),
        },
      };
    case "insert-players":
      return {
        document: {
          ...play,
          players: insertAll(play.players, command.players, "players"),
        },
        inverse: {
          kind: "remove-players",
          playerIds: command.players.map(({ item }) => item.id),
        },
      };
    case "remove-players":
      return {
        document: {
          ...play,
          players: removeAll(play.players, command.playerIds, "players"),
        },
        inverse: {
          kind: "insert-players",
          players: removalInsertions(play.players, command.playerIds),
        },
      };
    case "move-players": {
      requireAll(
        play.players,
        command.moves.map(({ playerId }) => playerId),
        "players",
      );
      const positions = new Map(
        command.moves.map(({ playerId, position }) => [playerId, position]),
      );
      const movedIds = new Set(positions.keys());
      return {
        document: {
          ...play,
          players: play.players.map((player) => {
            const position = positions.get(player.id);
            return position ? { ...player, position } : player;
          }),
        },
        inverse: {
          kind: "move-players",
          moves: play.players.flatMap((player) =>
            movedIds.has(player.id)
              ? [{ playerId: player.id, position: player.position }]
              : [],
          ),
        },
      };
    }
    case "update-player": {
      const { items, previous } = replaceOne(
        play.players,
        command.player,
        "players",
      );
      return {
        document: { ...play, players: items },
        inverse: { kind: "update-player", player: previous },
      };
    }
    case "insert-paths":
      return {
        document: {
          ...play,
          paths: insertAll(play.paths, command.paths, "paths"),
        },
        inverse: {
          kind: "remove-paths",
          pathIds: command.paths.map(({ item }) => item.id),
        },
      };
    case "remove-paths":
      return {
        document: {
          ...play,
          paths: removeAll(play.paths, command.pathIds, "paths"),
        },
        inverse: {
          kind: "insert-paths",
          paths: removalInsertions(play.paths, command.pathIds),
        },
      };
    case "update-path": {
      const { items, previous } = replaceOne(play.paths, command.path, "paths");
      return {
        document: { ...play, paths: items },
        inverse: { kind: "update-path", path: previous },
      };
    }
    case "insert-labels":
      return {
        document: {
          ...play,
          labels: insertAll(play.labels, command.labels, "labels"),
        },
        inverse: {
          kind: "remove-labels",
          labelIds: command.labels.map(({ item }) => item.id),
        },
      };
    case "remove-labels":
      return {
        document: {
          ...play,
          labels: removeAll(play.labels, command.labelIds, "labels"),
        },
        inverse: {
          kind: "insert-labels",
          labels: removalInsertions(play.labels, command.labelIds),
        },
      };
    case "update-label": {
      const { items, previous } = replaceOne(
        play.labels,
        command.label,
        "labels",
      );
      return {
        document: { ...play, labels: items },
        inverse: { kind: "update-label", label: previous },
      };
    }
    case "insert-assignments":
      return {
        document: {
          ...play,
          assignments: insertAll(
            play.assignments,
            command.assignments,
            "assignments",
          ),
        },
        inverse: {
          kind: "remove-assignments",
          assignmentIds: command.assignments.map(({ item }) => item.id),
        },
      };
    case "remove-assignments":
      return {
        document: {
          ...play,
          assignments: removeAll(
            play.assignments,
            command.assignmentIds,
            "assignments",
          ),
        },
        inverse: {
          kind: "insert-assignments",
          assignments: removalInsertions(
            play.assignments,
            command.assignmentIds,
          ),
        },
      };
    case "update-assignment": {
      const { items, previous } = replaceOne(
        play.assignments,
        command.assignment,
        "assignments",
      );
      return {
        document: { ...play, assignments: items },
        inverse: { kind: "update-assignment", assignment: previous },
      };
    }
    case "mirror-play":
      return {
        document: mirrorPlayGeometry(play),
        inverse: { kind: "mirror-play" },
      };
  }
}

export interface PlayCommandStep {
  readonly document: PlayDocument;
  readonly inverse: PlayCommand;
}

/**
 * Applies one command and returns the inverse computed against the Play as it
 * stood before the edit, so a single traversal produces both undo directions.
 * Intermediate batch states are not validated; only the finished Play is.
 */
export function applyPlayCommandWithInverse(
  play: PlayDocument,
  command: PlayCommand,
): PlayCommandStep {
  if (command.kind !== "batch") {
    const step = applyPrimitive(play, command);
    return {
      document: playDocumentSchema.parse(step.document),
      inverse: step.inverse,
    };
  }

  let document = play;
  const inverses: PrimitivePlayCommand[] = [];
  for (const primitive of command.commands) {
    const step = applyPrimitive(document, primitive);
    document = step.document;
    inverses.unshift(step.inverse);
  }
  return {
    document: playDocumentSchema.parse(document),
    inverse: {
      kind: "batch",
      ...(command.label === undefined ? {} : { label: command.label }),
      commands: inverses,
    },
  };
}

export function applyPlayCommand(
  play: PlayDocument,
  command: PlayCommand,
): PlayDocument {
  return applyPlayCommandWithInverse(play, command).document;
}

export function invertPlayCommand(
  play: PlayDocument,
  command: PlayCommand,
): PlayCommand {
  return applyPlayCommandWithInverse(play, command).inverse;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** Names the edit the way the Coach would describe it in an Undo control. */
export function describePlayCommand(command: PlayCommand): string {
  switch (command.kind) {
    case "set-play-name":
      return "Rename Play";
    case "set-notes":
      return "Edit Play notes";
    case "set-tags":
      return "Edit Play tags";
    case "set-personnel-label":
      return "Edit Personnel Label";
    case "set-play-type":
      return "Change Play Type";
    case "set-unit":
      return "Change unit";
    case "set-field-profile":
      return "Change Field Profile";
    case "set-concept-source":
      return "Change Concept source";
    case "set-formation-source":
      return "Change Formation source";
    case "insert-players":
      return plural(command.players.length, "Add Player", "Add Players");
    case "remove-players":
      return plural(
        command.playerIds.length,
        "Delete Player",
        "Delete Players",
      );
    case "move-players":
      return plural(command.moves.length, "Move Player", "Move Players");
    case "update-player":
      return "Edit Player";
    case "insert-paths":
      return plural(command.paths.length, "Add route", "Add routes");
    case "remove-paths":
      return plural(command.pathIds.length, "Delete route", "Delete routes");
    case "update-path":
      return "Edit route";
    case "insert-labels":
      return plural(command.labels.length, "Add label", "Add labels");
    case "remove-labels":
      return plural(command.labelIds.length, "Delete label", "Delete labels");
    case "update-label":
      return "Edit label";
    case "insert-assignments":
      return plural(
        command.assignments.length,
        "Add Assignment",
        "Add Assignments",
      );
    case "remove-assignments":
      return plural(
        command.assignmentIds.length,
        "Delete Assignment",
        "Delete Assignments",
      );
    case "update-assignment":
      return "Edit Assignment";
    case "mirror-play":
      return "Mirror Play";
    case "batch":
      return command.label ?? "Edit Play";
  }
}

/**
 * Consecutive edits to one text field coalesce into a single undo entry. Only
 * whole-value overwrites carry a key, because merging them keeps the latest
 * forward command and the earliest inverse.
 */
export function playCommandCoalesceKey(
  command: PlayCommand,
): string | undefined {
  switch (command.kind) {
    case "set-play-name":
      return "play-name";
    case "set-notes":
      return "play-notes";
    case "set-personnel-label":
      return "personnel-label";
    case "update-player":
      return `player:${command.player.id}`;
    case "update-path":
      return `path:${command.path.id}`;
    case "update-label":
      return `label:${command.label.id}`;
    case "update-assignment":
      return `assignment:${command.assignment.id}`;
    default:
      return undefined;
  }
}

function actionTargets(action: Assignment["actions"][number]): {
  readonly pathId?: string;
  readonly playerId?: string;
} {
  const target = "target" in action ? action.target : undefined;
  const pathId =
    action.kind === "movement"
      ? action.pathId
      : target?.kind === "path"
        ? target.pathId
        : undefined;
  return {
    ...(pathId === undefined ? {} : { pathId }),
    ...(target?.kind === "player" ? { playerId: target.playerId } : {}),
  };
}

/**
 * Removing Players or routes leaves other Assignments pointing at them. Those
 * Assignments lose only the actions that dangle, and disappear entirely when
 * nothing the Coach wrote is left.
 */
function dependentCleanup(
  play: PlayDocument,
  removedPlayerIds: ReadonlySet<string>,
  removedPathIds: ReadonlySet<string>,
): PrimitivePlayCommand[] {
  const labelIds = play.labels
    .filter(({ binding }) => binding && removedPathIds.has(binding.pathId))
    .map(({ id }) => id);

  const assignmentIds: string[] = [];
  const updates: Assignment[] = [];
  for (const assignment of play.assignments) {
    if (removedPlayerIds.has(assignment.playerId)) {
      assignmentIds.push(assignment.id);
      continue;
    }
    const actions = assignment.actions.filter((action) => {
      const { pathId, playerId } = actionTargets(action);
      return !(
        (pathId !== undefined && removedPathIds.has(pathId)) ||
        (playerId !== undefined && removedPlayerIds.has(playerId))
      );
    });
    if (actions.length === assignment.actions.length) continue;
    if (actions.length === 0 && assignment.text.trim().length === 0) {
      assignmentIds.push(assignment.id);
    } else {
      updates.push({ ...assignment, actions });
    }
  }

  const boundSlots = play.formationSource?.slotBindings ?? [];
  const keptSlots = boundSlots.filter(
    ({ playerId }) => !removedPlayerIds.has(playerId),
  );
  const formationSource =
    play.formationSource && keptSlots.length !== boundSlots.length
      ? [
          {
            kind: "set-formation-source" as const,
            formationSource: {
              ...play.formationSource,
              slotBindings: keptSlots,
            },
          },
        ]
      : [];

  return [
    ...formationSource,
    ...(labelIds.length > 0
      ? [{ kind: "remove-labels" as const, labelIds }]
      : []),
    ...updates.map((assignment) => ({
      kind: "update-assignment" as const,
      assignment,
    })),
    ...(assignmentIds.length > 0
      ? [{ kind: "remove-assignments" as const, assignmentIds }]
      : []),
    ...(removedPathIds.size > 0
      ? [{ kind: "remove-paths" as const, pathIds: [...removedPathIds] }]
      : []),
    ...(removedPlayerIds.size > 0
      ? [{ kind: "remove-players" as const, playerIds: [...removedPlayerIds] }]
      : []),
  ];
}

/**
 * Deleting Players also deletes the routes, Assignments, and bound labels that
 * depend on them, as one undoable step.
 */
export function deletePlayersCommand(
  play: PlayDocument,
  playerIds: readonly string[],
): BatchPlayCommand {
  requireAll(play.players, playerIds, "players");
  const removedPlayerIds = new Set(playerIds);
  const removedPathIds = new Set(
    play.paths
      .filter(({ playerId }) => removedPlayerIds.has(playerId))
      .map(({ id }) => id),
  );
  return {
    kind: "batch",
    label: plural(playerIds.length, "Delete Player", "Delete Players"),
    commands: dependentCleanup(play, removedPlayerIds, removedPathIds),
  };
}

/** Deleting routes also releases the labels and Assignment actions on them. */
export function deletePathsCommand(
  play: PlayDocument,
  pathIds: readonly string[],
): BatchPlayCommand {
  requireAll(play.paths, pathIds, "paths");
  return {
    kind: "batch",
    label: plural(pathIds.length, "Delete route", "Delete routes"),
    commands: dependentCleanup(play, new Set(), new Set(pathIds)),
  };
}

const layerLabels: Record<PlayLayer, string> = {
  players: "Clear Players",
  paths: "Clear routes",
  labels: "Clear labels",
  assignments: "Clear Assignments",
};

/** An absent optional field is only equal to another absent one. */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalStringify(left) === canonicalStringify(right);
}

interface LayerOps<Item extends { readonly id: string }> {
  readonly remove: (ids: string[]) => PrimitivePlayCommand;
  readonly insert: (insertions: Insertion<Item>[]) => PrimitivePlayCommand;
  readonly update: (item: Item) => PrimitivePlayCommand;
}

/**
 * Expresses one layer's difference. When the items both Plays keep no longer
 * appear in the same relative order, the layer is replaced wholesale rather
 * than guessing at a move script.
 */
function diffLayer<Item extends { readonly id: string }>(
  from: readonly Item[],
  to: readonly Item[],
  ops: LayerOps<Item>,
): PrimitivePlayCommand[] {
  const fromById = new Map(from.map((item) => [item.id, item]));
  const toIds = new Set(to.map(({ id }) => id));
  const keptFrom = from.filter(({ id }) => toIds.has(id)).map(({ id }) => id);
  const keptTo = to.filter(({ id }) => fromById.has(id)).map(({ id }) => id);
  const insertionsFor = (items: readonly Item[]): Insertion<Item>[] =>
    items.map((item) => ({ index: to.indexOf(item), item }));

  if (!sameValue(keptFrom, keptTo)) {
    return [
      ...(from.length > 0 ? [ops.remove(from.map(({ id }) => id))] : []),
      ...(to.length > 0 ? [ops.insert(insertionsFor(to))] : []),
    ];
  }

  const removed = from.filter(({ id }) => !toIds.has(id)).map(({ id }) => id);
  const added = to.filter(({ id }) => !fromById.has(id));
  const changed = to.filter((item) => {
    const previous = fromById.get(item.id);
    return previous !== undefined && !sameValue(previous, item);
  });

  return [
    ...(removed.length > 0 ? [ops.remove(removed)] : []),
    ...changed.map((item) => ops.update(item)),
    ...(added.length > 0 ? [ops.insert(insertionsFor(added))] : []),
  ];
}

/**
 * Expresses the whole difference between two versions of one Play as ordinary
 * commands, so restoring a named version or an immutable revision lands as a
 * single undoable entry instead of an out-of-band document replacement.
 */
export function diffPlayDocuments(
  from: PlayDocument,
  to: PlayDocument,
  label?: string,
): BatchPlayCommand {
  if (from.id !== to.id || from.playbookId !== to.playbookId) {
    throw new PlayCommandError(
      "Only two versions of the same Play can be compared.",
    );
  }

  const commands: PrimitivePlayCommand[] = [];
  if (from.name !== to.name)
    commands.push({ kind: "set-play-name", name: to.name });
  if (from.unit !== to.unit) commands.push({ kind: "set-unit", unit: to.unit });
  if (from.notes !== to.notes)
    commands.push({ kind: "set-notes", notes: to.notes });
  if (!sameValue(from.tags, to.tags)) {
    commands.push({ kind: "set-tags", tags: [...to.tags] });
  }
  if (!sameValue(from.personnelLabel, to.personnelLabel)) {
    commands.push({
      kind: "set-personnel-label",
      ...(to.personnelLabel === undefined
        ? {}
        : { personnelLabel: to.personnelLabel }),
    });
  }
  if (!sameValue(from.playType, to.playType)) {
    commands.push({
      kind: "set-play-type",
      ...(to.playType === undefined ? {} : { playType: to.playType }),
    });
  }
  if (!sameValue(from.fieldProfile, to.fieldProfile)) {
    commands.push({ kind: "set-field-profile", fieldProfile: to.fieldProfile });
  }
  if (!sameValue(from.conceptSource, to.conceptSource)) {
    commands.push({
      kind: "set-concept-source",
      ...(to.conceptSource === undefined
        ? {}
        : { conceptSource: to.conceptSource }),
    });
  }
  if (!sameValue(from.formationSource, to.formationSource)) {
    commands.push({
      kind: "set-formation-source",
      ...(to.formationSource === undefined
        ? {}
        : { formationSource: to.formationSource }),
    });
  }

  // Only the finished Play is validated, so each layer's difference is
  // independent and the batch undoes as one step.
  commands.push(
    ...diffLayer(from.assignments, to.assignments, {
      remove: (assignmentIds) => ({
        kind: "remove-assignments",
        assignmentIds,
      }),
      insert: (assignments) => ({ kind: "insert-assignments", assignments }),
      update: (assignment) => ({ kind: "update-assignment", assignment }),
    }),
    ...diffLayer(from.labels, to.labels, {
      remove: (labelIds) => ({ kind: "remove-labels", labelIds }),
      insert: (labels) => ({ kind: "insert-labels", labels }),
      update: (label) => ({ kind: "update-label", label }),
    }),
    ...diffLayer(from.paths, to.paths, {
      remove: (pathIds) => ({ kind: "remove-paths", pathIds }),
      insert: (paths) => ({ kind: "insert-paths", paths }),
      update: (path) => ({ kind: "update-path", path }),
    }),
    ...diffLayer(from.players, to.players, {
      remove: (playerIds) => ({ kind: "remove-players", playerIds }),
      insert: (players) => ({ kind: "insert-players", players }),
      update: (player) => ({ kind: "update-player", player }),
    }),
  );

  return {
    kind: "batch",
    ...(label === undefined ? {} : { label }),
    commands,
  };
}

/** Clearing one layer is an ordinary undoable transaction, not a reset. */
export function clearPlayLayerCommand(
  play: PlayDocument,
  layer: PlayLayer,
): BatchPlayCommand {
  const label = layerLabels[layer];
  switch (layer) {
    case "players":
      return {
        ...deletePlayersCommand(
          play,
          play.players.map(({ id }) => id),
        ),
        label,
      };
    case "paths":
      return {
        ...deletePathsCommand(
          play,
          play.paths.map(({ id }) => id),
        ),
        label,
      };
    case "labels":
      return {
        kind: "batch",
        label,
        commands: [
          { kind: "remove-labels", labelIds: play.labels.map(({ id }) => id) },
        ],
      };
    case "assignments":
      return {
        kind: "batch",
        label,
        commands: [
          {
            kind: "remove-assignments",
            assignmentIds: play.assignments.map(({ id }) => id),
          },
        ],
      };
  }
}
