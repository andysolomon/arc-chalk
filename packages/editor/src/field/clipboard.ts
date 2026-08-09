import {
  legacyDepthSpanToYards,
  legacyLateralSpanToYards,
  mirrorCoordinate,
  type Coordinate,
  type MovementPath,
  type PathPoint,
  type PlayCommand,
  type PlayDocument,
  type PrimitivePlayCommand,
  type TextLabel,
} from "@chalk/domain";

import { coordinate } from "./geometry";
import type { FieldClipboard, FieldItemRef } from "./model";

/** Copying, pasting, and reflecting what the Coach has picked. */

// ---------------------------------------------------------------------------
// Copy, paste, and mirror
// ---------------------------------------------------------------------------

/**
 * A paste lands clear of what it came from — the original's 26 canvas pixels
 * down and to the right, which is a different distance on each axis.
 */
const PASTE_OFFSET = Object.freeze({
  lateralYards: legacyLateralSpanToYards(26),
  depthYards: -legacyDepthSpanToYards(26),
});

export function copySelection(
  document: PlayDocument,
  selection: readonly FieldItemRef[],
): FieldClipboard | undefined {
  const ids = (kind: FieldItemRef["kind"]) =>
    new Set(selection.filter((item) => item.kind === kind).map(({ id }) => id));
  const playerIds = ids("player");
  const pathIds = ids("path");
  const labelIds = ids("label");
  const clipboard: FieldClipboard = {
    players: document.players.filter(({ id }) => playerIds.has(id)),
    paths: document.paths.filter(({ id }) => pathIds.has(id)),
    labels: document.labels.filter(({ id }) => labelIds.has(id)),
  };
  const total =
    clipboard.players.length + clipboard.paths.length + clipboard.labels.length;
  return total > 0 ? structuredClone(clipboard) : undefined;
}

interface PasteResult {
  readonly command: PlayCommand;
  readonly selection: readonly FieldItemRef[];
}

/**
 * Pasting makes new Players, routes, and notes rather than second references
 * to the old ones. A route follows its Player when both were copied; a note
 * bound to a copied route rebinds to the copy, and one bound to a route left
 * behind keeps its words but is placed by hand.
 */
export function buildPasteCommand(
  document: PlayDocument,
  clipboard: FieldClipboard,
  createId: (prefix: string) => string,
): PasteResult | undefined {
  const shift = (point: Coordinate): Coordinate =>
    coordinate(
      point.lateralYards + PASTE_OFFSET.lateralYards,
      point.depthYards + PASTE_OFFSET.depthYards,
    );
  const shiftPathPoint = (point: PathPoint): PathPoint => ({
    ...point,
    ...shift(point),
    ...(point.control === undefined ? {} : { control: shift(point.control) }),
  });

  const playerIdByOriginal = new Map<string, string>();
  const players = clipboard.players.map((player) => {
    const id = createId("player");
    playerIdByOriginal.set(player.id, id);
    return { ...player, id, position: shift(player.position) };
  });

  const pathIdByOriginal = new Map<string, string>();
  const paths = clipboard.paths.flatMap((path) => {
    // The schema requires a Player on every path. A route copied without the
    // man running it stays attached to him rather than becoming an orphan —
    // the original detaches it, which our contract has no way to express.
    const pastedPlayerId = playerIdByOriginal.get(path.playerId);
    const playerId = pastedPlayerId ?? path.playerId;
    // A Player pasted in this same batch will exist by the time the route
    // is inserted; one left behind has to still be on the field.
    if (
      pastedPlayerId === undefined &&
      !document.players.some(({ id }) => id === playerId)
    ) {
      return [];
    }
    const id = createId("path");
    pathIdByOriginal.set(path.id, id);
    return [
      {
        ...path,
        id,
        playerId,
        points: path.points.map(shiftPathPoint),
        branches: path.branches.map((branch) => ({
          ...branch,
          points: branch.points.map(shiftPathPoint),
        })),
      },
    ];
  });

  const labels = clipboard.labels.map((label) => {
    const id = createId("label");
    const boundTo = label.binding
      ? pathIdByOriginal.get(label.binding.pathId)
      : undefined;
    if (label.binding && boundTo) {
      return {
        ...label,
        id,
        binding: { ...label.binding, pathId: boundTo },
      };
    }
    // The key is dropped rather than cleared so the copy hashes like a note
    // that was never bound.
    const free = { ...label, id, position: shift(label.position) };
    delete free.binding;
    return free;
  });

  const commands: PrimitivePlayCommand[] = [];
  if (players.length > 0) {
    commands.push({
      kind: "insert-players",
      players: players.map((item, index) => ({
        index: document.players.length + index,
        item,
      })),
    });
  }
  if (paths.length > 0) {
    commands.push({
      kind: "insert-paths",
      paths: paths.map((item, index) => ({
        index: document.paths.length + index,
        item,
      })),
    });
  }
  if (labels.length > 0) {
    commands.push({
      kind: "insert-labels",
      labels: labels.map((item, index) => ({
        index: document.labels.length + index,
        item,
      })),
    });
  }
  if (commands.length === 0) return undefined;

  return {
    command: { kind: "batch", label: "Paste", commands },
    selection: [
      ...players.map(({ id }) => ({ kind: "player", id }) as const),
      ...paths.map(({ id }) => ({ kind: "path", id }) as const),
      ...labels.map(({ id }) => ({ kind: "label", id }) as const),
    ],
  };
}

function mirrorPathGeometry(path: MovementPath): MovementPath {
  const mirrorPoint = (point: PathPoint): PathPoint => ({
    ...point,
    ...mirrorCoordinate(point),
    ...(point.control === undefined
      ? {}
      : { control: mirrorCoordinate(point.control) }),
  });
  return {
    ...path,
    points: path.points.map(mirrorPoint),
    branches: path.branches.map((branch) => ({
      ...branch,
      points: branch.points.map(mirrorPoint),
    })),
  };
}

function mirrorLabelGeometry(label: TextLabel): TextLabel {
  // A bound note rides its route, so only the offset it sits at reflects.
  const placed = label.binding
    ? {
        ...label,
        binding: {
          ...label.binding,
          offset: mirrorCoordinate(label.binding.offset),
        },
      }
    : { ...label, position: mirrorCoordinate(label.position) };
  return placed.leader
    ? {
        ...placed,
        leader: {
          ...placed.leader,
          endpoint: mirrorCoordinate(placed.leader.endpoint),
        },
      }
    : placed;
}

/**
 * Mirroring the whole Play is the domain's own reflection (ADR 0034). A
 * selection reflects only what the Coach picked, with each Player's routes
 * following him the way they do when he is dragged.
 */
export function buildMirrorCommand(
  document: PlayDocument,
  selection: readonly FieldItemRef[],
): PlayCommand | undefined {
  if (selection.length === 0) {
    return document.players.length +
      document.paths.length +
      document.labels.length >
      0
      ? { kind: "mirror-play" }
      : undefined;
  }

  const playerIds = new Set(
    selection.filter(({ kind }) => kind === "player").map(({ id }) => id),
  );
  const pathIds = new Set(
    selection.filter(({ kind }) => kind === "path").map(({ id }) => id),
  );
  const labelIds = new Set(
    selection.filter(({ kind }) => kind === "label").map(({ id }) => id),
  );

  const commands: PrimitivePlayCommand[] = [];
  const moves = document.players
    .filter(({ id }) => playerIds.has(id))
    .map(({ id, position }) => ({
      playerId: id,
      position: mirrorCoordinate(position),
    }));
  if (moves.length > 0) commands.push({ kind: "move-players", moves });

  for (const path of document.paths) {
    if (playerIds.has(path.playerId) || pathIds.has(path.id)) {
      commands.push({ kind: "update-path", path: mirrorPathGeometry(path) });
    }
  }
  for (const label of document.labels) {
    if (labelIds.has(label.id)) {
      commands.push({
        kind: "update-label",
        label: mirrorLabelGeometry(label),
      });
    }
  }
  if (commands.length === 0) return undefined;
  return { kind: "batch", label: "Mirror selection", commands };
}
