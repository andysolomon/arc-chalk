import type {
  MovementPath,
  PlayDocument,
  PrimitivePlayCommand,
} from "@chalk/domain";

import type {
  FieldGesture,
  FieldInteractionModel,
  FieldItemRef,
} from "./field/model";

/**
 * Who has to move on screen for a live preview of this selection. Routes
 * attached to a moving Player travel with him; a bound note rides its route.
 * The committed Play is left alone — this is only which SVG nodes to patch.
 */
export function affectedLiveEntities(
  document: PlayDocument,
  items: readonly FieldItemRef[],
): {
  readonly playerIds: readonly string[];
  readonly pathIds: readonly string[];
  readonly labelIds: readonly string[];
} {
  const playerIds = new Set(
    items.filter(({ kind }) => kind === "player").map(({ id }) => id),
  );
  const pathIds = new Set(
    items.filter(({ kind }) => kind === "path").map(({ id }) => id),
  );
  const labelIds = new Set(
    items.filter(({ kind }) => kind === "label").map(({ id }) => id),
  );

  for (const path of document.paths) {
    if (playerIds.has(path.playerId)) pathIds.add(path.id);
  }
  for (const label of document.labels) {
    if (label.binding && pathIds.has(label.binding.pathId)) {
      labelIds.add(label.id);
    }
  }

  return {
    playerIds: [...playerIds],
    pathIds: [...pathIds],
    labelIds: [...labelIds],
  };
}

function sameRefs(
  left: readonly FieldItemRef[],
  right: readonly FieldItemRef[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (item, index) =>
      item.kind === right[index]?.kind && item.id === right[index]?.id,
  );
}

function drawingIdentity(model: FieldInteractionModel): string {
  const drawing = model.drawing;
  if (!drawing) return "";
  return `${drawing.kind}:${drawing.playerId}:${drawing.points.length}`;
}

const livePromotions: ReadonlySet<string> = new Set([
  "idle->pressing",
  "idle->marquee",
  "idle->handle",
  "pressing->moving",
  "pressing->marquee",
]);

/**
 * True when the next model can paint through the live SVG path without a
 * React commit of the committed scene. Selection changes, new drawing
 * breaks, and anything that produces a command still go through React.
 */
export function livePaintCanHold(
  previous: FieldInteractionModel,
  next: FieldInteractionModel,
): boolean {
  if (!sameRefs(previous.selection, next.selection)) return false;
  if (previous.selectedNodeIndex !== next.selectedNodeIndex) return false;
  if (previous.selectedSegmentIndex !== next.selectedSegmentIndex) {
    return false;
  }
  if (previous.selectedBranchIndex !== next.selectedBranchIndex) return false;
  if (drawingIdentity(previous) !== drawingIdentity(next)) return false;

  if (previous.gesture.kind !== next.gesture.kind) {
    if (!livePromotions.has(`${previous.gesture.kind}->${next.gesture.kind}`)) {
      return false;
    }
  }

  return (
    next.drawing !== undefined ||
    next.gesture.kind === "pressing" ||
    next.gesture.kind === "moving" ||
    next.gesture.kind === "handle" ||
    next.gesture.kind === "marquee"
  );
}

export function liveHandlePath(
  gesture: FieldGesture,
): MovementPath | undefined {
  if (gesture.kind !== "handle" || !gesture.moved) return undefined;
  return pathFromUpdate(gesture.update);
}

function pathFromUpdate(
  update: PrimitivePlayCommand,
): MovementPath | undefined {
  return update.kind === "update-path" ? update.path : undefined;
}
