import {
  applyPlayCommand,
  canonicalStringify,
  deletePathsCommand,
  deletePlayersCommand,
  labelRolePresets,
  type Coordinate,
  type LabelRole,
  type MovementPath,
  type PathPoint,
  type PlayCommand,
  type PlayDocument,
  type PrimitivePlayCommand,
  type TextLabel,
} from "@chalk/domain";

import { snapPosition, type AxisSnapGuide } from "../smart-snapping";
import { coordinate, rounded } from "./geometry";
import type {
  FieldInteractionContext,
  FieldItemRef,
  FieldMoveReadout,
} from "./model";

/**
 * Every Coach edit as a semantic command. A gesture previews by running one
 * of these early and commits by running the same one again, which is what
 * keeps one gesture equal to one undo entry (ADR 0012).
 */

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

function translatePoint(point: PathPoint, translation: Coordinate): PathPoint {
  return {
    ...point,
    lateralYards: rounded(point.lateralYards + translation.lateralYards),
    depthYards: rounded(point.depthYards + translation.depthYards),
    ...(point.control === undefined
      ? {}
      : {
          control: coordinate(
            point.control.lateralYards + translation.lateralYards,
            point.control.depthYards + translation.depthYards,
          ),
        }),
  };
}

function translatePath(
  path: MovementPath,
  translation: Coordinate,
): MovementPath {
  return {
    ...path,
    points: path.points.map((point) => translatePoint(point, translation)),
    branches: path.branches.map((branch) => ({
      ...branch,
      points: branch.points.map((point) => translatePoint(point, translation)),
    })),
  };
}

function translateLabel(label: TextLabel, translation: Coordinate): TextLabel {
  // A bound label keeps riding its route; moving it adjusts the offset the
  // binding already applies. The leader endpoint travels with the label.
  const moved = label.binding
    ? {
        ...label,
        binding: {
          ...label.binding,
          offset: coordinate(
            label.binding.offset.lateralYards + translation.lateralYards,
            label.binding.offset.depthYards + translation.depthYards,
          ),
        },
      }
    : {
        ...label,
        position: coordinate(
          label.position.lateralYards + translation.lateralYards,
          label.position.depthYards + translation.depthYards,
        ),
      };
  return moved.leader
    ? {
        ...moved,
        leader: {
          ...moved.leader,
          endpoint: coordinate(
            moved.leader.endpoint.lateralYards + translation.lateralYards,
            moved.leader.endpoint.depthYards + translation.depthYards,
          ),
        },
      }
    : moved;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function selectionLabel(verb: string, items: readonly FieldItemRef[]): string {
  const kinds = new Set(items.map(({ kind }) => kind));
  if (kinds.size > 1) return `${verb} selection`;
  const count = items.length;
  if (kinds.has("player"))
    return plural(count, `${verb} Player`, `${verb} Players`);
  if (kinds.has("path"))
    return plural(count, `${verb} route`, `${verb} routes`);
  return plural(count, `${verb} label`, `${verb} labels`);
}

/**
 * One completed move — however many items it carried — becomes one batch.
 * Routes attached to a moving Player travel with him, the way the original
 * dragged them as a unit.
 */
export function buildMoveCommand(
  document: PlayDocument,
  items: readonly FieldItemRef[],
  translation: Coordinate,
): PlayCommand | undefined {
  if (
    rounded(translation.lateralYards) === 0 &&
    rounded(translation.depthYards) === 0
  ) {
    return undefined;
  }
  const playerIds = new Set(
    items.filter(({ kind }) => kind === "player").map(({ id }) => id),
  );
  const pathIds = new Set(
    items.filter(({ kind }) => kind === "path").map(({ id }) => id),
  );
  const labelIds = new Set(
    items.filter(({ kind }) => kind === "label").map(({ id }) => id),
  );

  const commands: PrimitivePlayCommand[] = [];
  const moves = document.players
    .filter(({ id }) => playerIds.has(id))
    .map(({ id, position }) => ({
      playerId: id,
      position: coordinate(
        position.lateralYards + translation.lateralYards,
        position.depthYards + translation.depthYards,
      ),
    }));
  if (moves.length > 0) commands.push({ kind: "move-players", moves });

  for (const path of document.paths) {
    // Attachment wins: a route selected alongside its own Player still moves
    // exactly once.
    if (playerIds.has(path.playerId) || pathIds.has(path.id)) {
      commands.push({
        kind: "update-path",
        path: translatePath(path, translation),
      });
    }
  }
  for (const label of document.labels) {
    if (labelIds.has(label.id)) {
      commands.push({
        kind: "update-label",
        label: translateLabel(label, translation),
      });
    }
  }
  if (commands.length === 0) return undefined;
  return {
    kind: "batch",
    label: selectionLabel("Move", items),
    commands,
  };
}

/**
 * Deleting a mixed selection composes the domain's dependent cleanup: Players
 * take their routes and bound labels, routes take theirs, and what remains is
 * removed directly — one batch, one undo step.
 */
export function buildDeleteCommand(
  document: PlayDocument,
  selection: readonly FieldItemRef[],
): PlayCommand | undefined {
  const playerIds = selection
    .filter(({ kind }) => kind === "player")
    .map(({ id }) => id)
    .filter((id) => document.players.some((player) => player.id === id));
  const pathIds = selection
    .filter(({ kind }) => kind === "path")
    .map(({ id }) => id);
  const labelIds = selection
    .filter(({ kind }) => kind === "label")
    .map(({ id }) => id);

  const commands: PrimitivePlayCommand[] = [];
  let working = document;
  if (playerIds.length > 0) {
    const batch = deletePlayersCommand(working, playerIds);
    commands.push(...batch.commands);
    working = applyPlayCommand(working, batch);
  }
  const remainingPaths = pathIds.filter((id) =>
    working.paths.some((path) => path.id === id),
  );
  if (remainingPaths.length > 0) {
    const batch = deletePathsCommand(working, remainingPaths);
    commands.push(...batch.commands);
    working = applyPlayCommand(working, batch);
  }
  const remainingLabels = labelIds.filter((id) =>
    working.labels.some((label) => label.id === id),
  );
  if (remainingLabels.length > 0) {
    commands.push({ kind: "remove-labels", labelIds: remainingLabels });
  }
  if (commands.length === 0) return undefined;
  return {
    kind: "batch",
    label: selectionLabel("Delete", selection),
    commands,
  };
}

function formatYards(value: number): string {
  return `${Math.round(value * 10) / 10}`;
}

export interface MovePreview {
  readonly translation: Coordinate;
  readonly guides: readonly AxisSnapGuide[];
  readonly readout?: FieldMoveReadout;
}

/**
 * A lone Player snaps landmark-first (ADR 0035) and reports his depth the way
 * the original's readout did. A group keeps its shape and moves raw.
 */
export function movePreview(
  context: FieldInteractionContext,
  items: readonly FieldItemRef[],
  start: Coordinate,
  point: Coordinate,
): MovePreview {
  const raw = coordinate(
    point.lateralYards - start.lateralYards,
    point.depthYards - start.depthYards,
  );
  const only = items.length === 1 ? items[0] : undefined;
  if (only?.kind !== "player") return { translation: raw, guides: [] };
  const player = context.document.players.find(({ id }) => id === only.id);
  if (!player) return { translation: raw, guides: [] };

  const result = snapPosition({
    point: coordinate(
      player.position.lateralYards + raw.lateralYards,
      player.position.depthYards + raw.depthYards,
    ),
    fieldProfile: context.document.fieldProfile,
    references: context.document.players
      .filter(({ id }) => id !== player.id)
      .map(({ id, position, label }) => ({
        id,
        kind: "player" as const,
        position,
        ...(label.trim() === "" ? {} : { label }),
      })),
    screenScale: context.screenScale,
    settings: context.snap,
  });
  return {
    translation: coordinate(
      result.point.lateralYards - player.position.lateralYards,
      result.point.depthYards - player.position.depthYards,
    ),
    guides: result.guides,
    readout: {
      position: result.point,
      text: `${formatYards(result.point.depthYards)} yds`,
    },
  };
}
/**
 * Retyping a label is one edit the Coach makes over several keystrokes, so
 * it carries a coalesce key and lands as a single undo entry until he moves
 * on (ADR 0012). Every other label change is its own entry.
 */
export function setLabelTextCommand(
  document: PlayDocument,
  labelId: string,
  text: string,
): PlayCommand | undefined {
  const label = document.labels.find(({ id }) => id === labelId);
  if (!label || label.text === text) return undefined;
  return { kind: "update-label", label: { ...label, text } };
}

export type LabelAppearance = Partial<
  Pick<
    TextLabel,
    "color" | "size" | "box" | "boxColor" | "caps" | "mono" | "unit"
  >
>;

export function setLabelAppearanceCommand(
  document: PlayDocument,
  labelId: string,
  appearance: LabelAppearance,
): PlayCommand | undefined {
  const label = document.labels.find(({ id }) => id === labelId);
  if (!label) return undefined;
  const next = { ...label, ...appearance };
  // "Belongs to the offense" is the absence of a unit, so clearing it has to
  // drop the key rather than store a value the canonical form would keep.
  if (appearance.unit === "offense") delete next.unit;
  if (canonicalStringify(next) === canonicalStringify(label)) return undefined;
  return { kind: "update-label", label: next };
}

/**
 * Picking a meaning sets the whole look with it: a Landmark reads like every
 * other Landmark on every card the Coach prints.
 */
export function applyLabelRoleCommand(
  document: PlayDocument,
  labelId: string,
  role: LabelRole,
): PlayCommand | undefined {
  const label = document.labels.find(({ id }) => id === labelId);
  if (!label) return undefined;
  const preset = labelRolePresets[role];
  return {
    kind: "update-label",
    label: {
      ...label,
      role,
      color: preset.color,
      box: preset.box,
      boxColor: preset.boxColor,
      size: preset.size,
      mono: preset.mono,
      caps: preset.caps,
    },
  };
}
/** Every id a command brings into existence. */
export function insertedEntityIds(command: PlayCommand): readonly string[] {
  const fromPrimitive = (primitive: PrimitivePlayCommand): string[] => {
    switch (primitive.kind) {
      case "insert-players":
        return primitive.players.map(({ item }) => item.id);
      case "insert-paths":
        return primitive.paths.map(({ item }) => item.id);
      case "insert-labels":
        return primitive.labels.map(({ item }) => item.id);
      default:
        return [];
    }
  };
  return command.kind === "batch"
    ? command.commands.flatMap(fromPrimitive)
    : fromPrimitive(command);
}
