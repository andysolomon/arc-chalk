import {
  applyPlayCommand,
  canonicalStringify,
  classifyZoneCoverage,
  labelRolePresets,
  NEW_LABEL_DEFAULTS,
  deletePathsCommand,
  deletePlayersCommand,
  legacyDepthSpanToYards,
  legacyLateralSpanToYards,
  type Coordinate,
  type LabelRole,
  type MovementPath,
  type PathPoint,
  type PathStyle,
  type PlayCommand,
  type PlayDocument,
  type PrimitivePlayCommand,
  type TextLabel,
} from "@chalk/domain";
import type { RenderScene } from "@chalk/render";

import {
  snapPosition,
  snapRouteEndpoint,
  type AxisSnapGuide,
  type SnapScreenScale,
  type SnapSettings,
} from "./smart-snapping";

/**
 * One state machine turns pointer and keyboard input from any modality into
 * the same selection changes and PlayCommands (ADR 0016). It works entirely in
 * yard space: the shell converts client pixels through the SVG projection
 * before dispatching, so mouse, touch, and Pencil cannot disagree about where
 * a Player landed. Nothing here touches the EditorStore — a gesture previews
 * out of this model and commits exactly one command when it completes, which
 * is what keeps one drag equal to one undo entry (ADR 0012).
 */

export interface FieldItemRef {
  readonly kind: "player" | "path" | "label";
  readonly id: string;
}

export interface FieldPointerInput {
  /** Pointer location in yard space, already unprojected by the shell. */
  readonly point: Coordinate;
  readonly pointerId: number;
  readonly shiftKey?: boolean;
  readonly button?: number;
  /** "touch" widens hit targets to the 44 CSS px minimum (ADR 0016). */
  readonly pointerType?: string;
}

export type FieldInteractionEvent =
  | { readonly type: "pointer-down"; readonly input: FieldPointerInput }
  | { readonly type: "pointer-move"; readonly input: FieldPointerInput }
  | { readonly type: "pointer-up"; readonly input: FieldPointerInput }
  | { readonly type: "pointer-cancel" }
  | { readonly type: "escape" }
  | { readonly type: "delete" }
  | { readonly type: "select-all" }
  | {
      readonly type: "nudge";
      readonly lateralYards: number;
      readonly depthYards: number;
    }
  | {
      /** The blue dot above a Player: start drawing his route right there. */
      readonly type: "start-route";
      readonly playerId: string;
    }
  | { readonly type: "finish-drawing" }
  | {
      /** A typed digit sets the exact depth of the next break. */
      readonly type: "depth-digit";
      readonly digit: string;
    }
  | {
      readonly type: "handle-down";
      readonly handle: FieldHandleRef;
      readonly input: FieldPointerInput;
    }
  | {
      /** Double-clicking a route adds a break where the Coach pointed. */
      readonly type: "insert-node";
      readonly pathId: string;
      readonly point: Coordinate;
    };

export interface FieldMoveReadout {
  readonly position: Coordinate;
  readonly text: string;
}

/**
 * A handle on the selected route. Handles are drawn by the shell at a
 * constant screen size (ADR 0016), so the shell names the one that was
 * pressed rather than the machine hit-testing pixels it cannot see.
 */
export type FieldHandleRef =
  | {
      readonly kind: "node";
      readonly pathId: string;
      readonly pointIndex: number;
    }
  | {
      readonly kind: "control";
      readonly pathId: string;
      readonly pointIndex: number;
    }
  | { readonly kind: "zone"; readonly pathId: string }
  | { readonly kind: "leader"; readonly labelId: string };

export type FieldGesture =
  | { readonly kind: "idle" }
  | {
      /** Pressed on an item; not a drag until the pointer clears 2 px. */
      readonly kind: "pressing";
      readonly pointerId: number;
      readonly items: readonly FieldItemRef[];
      readonly clickItem: FieldItemRef;
      readonly wasMulti: boolean;
      readonly start: Coordinate;
    }
  | {
      readonly kind: "moving";
      readonly pointerId: number;
      readonly items: readonly FieldItemRef[];
      readonly start: Coordinate;
      /** What the commit will apply — snapped when one Player is moving. */
      readonly translation: Coordinate;
      readonly guides: readonly AxisSnapGuide[];
      readonly readout?: FieldMoveReadout;
    }
  | {
      readonly kind: "marquee";
      readonly pointerId: number;
      readonly anchor: Coordinate;
      readonly corner: Coordinate;
      readonly additive: boolean;
      /** False until the pointer clears 3 px, so a click is not a marquee. */
      readonly active: boolean;
    }
  | {
      /** Dragging a node, curve, or zone handle on the selected route. */
      readonly kind: "handle";
      readonly pointerId: number;
      readonly handle: FieldHandleRef;
      /** The edit as it stands — exactly what a release would commit. */
      readonly update: PrimitivePlayCommand;
      readonly guides: readonly AxisSnapGuide[];
      readonly readout?: FieldMoveReadout;
      readonly moved: boolean;
    };

export type FieldDrawingKind = "route" | "motion" | "block" | "zone";

/**
 * An in-progress route. Drawing spans several presses — start on a Player,
 * click each break, finish on Enter or a double click — so it lives beside
 * the single-pointer gesture rather than inside it. Nothing is committed
 * until the finish produces one insert command.
 */
export interface FieldDrawingState {
  readonly kind: FieldDrawingKind;
  readonly playerId: string;
  readonly points: readonly PathPoint[];
  /** The 45°-constrained preview endpoint the dashed line runs to. */
  readonly cursor: Coordinate;
  /** Typed digits waiting to become the next break's exact depth. */
  readonly depthBuffer: string;
  /** True while the pointer is held after placing a break — dragging bends it. */
  readonly pointerDown: boolean;
}

export interface FieldInteractionModel {
  readonly selection: readonly FieldItemRef[];
  readonly gesture: FieldGesture;
  readonly drawing?: FieldDrawingState;
  /** Which break of the selected route the Coach last touched. */
  readonly selectedNodeIndex?: number;
}

export interface FieldInteractionContext {
  readonly document: PlayDocument;
  /**
   * The same scene the shell is rendering. Hit testing reads it instead of
   * the document so a label bound to a route is hit where it is drawn.
   */
  readonly scene: RenderScene;
  readonly screenScale: SnapScreenScale;
  readonly snap: SnapSettings;
  readonly tool: "select" | "player" | "text" | FieldDrawingKind;
  /** The drawn frame's depth extents, so a route cannot leave the page. */
  readonly depthWindow?: {
    readonly minDepthYards: number;
    readonly maxDepthYards: number;
  };
  readonly createId?: (prefix: string) => string;
}

export interface FieldInteractionResult {
  readonly model: FieldInteractionModel;
  /** At most one command, produced only when a gesture completes. */
  readonly command?: PlayCommand;
  /** Finishing a route hands the Coach back the select tool. */
  readonly requestedTool?: "select";
  /** A label the Coach should be typing into the moment it appears. */
  readonly editingLabelId?: string;
}

export const idleFieldInteraction: FieldInteractionModel = {
  selection: [],
  gesture: { kind: "idle" },
};

/**
 * The original's gesture grammar in canvas pixels: 2 px before a press
 * becomes a drag, 3 px before a press on grass becomes a marquee, breaks at
 * least 4 px apart, and a held pointer bends the segment past 7 px.
 */
const MOVE_THRESHOLD_PX = 2;
const MARQUEE_THRESHOLD_PX = 3;
const DRAW_POINT_MIN_PX = 4;
const DRAW_CURVE_THRESHOLD_PX = 7;

export interface FieldHitOptions {
  /** The original's Player hit circle is 17 px around the symbol. */
  readonly playerRadiusPx: number;
  readonly pathTolerancePx: number;
  readonly labelPaddingPx: number;
}

/**
 * Touch targets must reach 44 CSS px (ADR 0016). The editor SVG renders at
 * most 1:1 CSS px per viewBox px, so a 22 px radius guarantees the minimum
 * while mouse and Pencil keep the original's precise 17 px circle.
 */
export function fieldHitOptions(pointerType?: string): FieldHitOptions {
  const coarse = pointerType === "touch";
  return {
    playerRadiusPx: coarse ? 22 : 17,
    pathTolerancePx: coarse ? 14 : 8,
    labelPaddingPx: coarse ? 6 : 0,
  };
}

const PRECISION_DIGITS = 9;

function rounded(value: number): number {
  const result = Number(value.toFixed(PRECISION_DIGITS));
  return Object.is(result, -0) ? 0 : result;
}

function coordinate(lateralYards: number, depthYards: number): Coordinate {
  return {
    lateralYards: rounded(lateralYards),
    depthYards: rounded(depthYards),
  };
}

function screenDistancePx(
  from: Coordinate,
  to: Coordinate,
  scale: SnapScreenScale,
): number {
  return Math.hypot(
    (to.lateralYards - from.lateralYards) * scale.lateralPixelsPerYard,
    (to.depthYards - from.depthYards) * scale.depthPixelsPerYard,
  );
}

function sameItem(left: FieldItemRef, right: FieldItemRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function isSelected(
  selection: readonly FieldItemRef[],
  item: FieldItemRef,
): boolean {
  return selection.some((candidate) => sameItem(candidate, item));
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

function pathSegmentPoints(
  start: Coordinate,
  end: PathPoint,
): readonly Coordinate[] {
  if (!end.control) return [start, end];
  // Flatten the quadratic the way the eye reads it: near enough that a click
  // on the drawn curve lands within tolerance of a sample chord.
  const samples: Coordinate[] = [];
  for (let step = 0; step <= 12; step += 1) {
    const t = step / 12;
    const remaining = 1 - t;
    samples.push({
      lateralYards:
        remaining * remaining * start.lateralYards +
        2 * remaining * t * end.control.lateralYards +
        t * t * end.lateralYards,
      depthYards:
        remaining * remaining * start.depthYards +
        2 * remaining * t * end.control.depthYards +
        t * t * end.depthYards,
    });
  }
  return samples;
}

function distanceToSegmentPx(
  point: Coordinate,
  start: Coordinate,
  end: Coordinate,
  scale: SnapScreenScale,
): number {
  const px = (value: Coordinate) => ({
    x: value.lateralYards * scale.lateralPixelsPerYard,
    y: value.depthYards * scale.depthPixelsPerYard,
  });
  const p = px(point);
  const a = px(start);
  const b = px(end);
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lengthSquared = vx * vx + vy * vy || 1;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lengthSquared),
  );
  return Math.hypot(a.x + t * vx - p.x, a.y + t * vy - p.y);
}

function distanceToPathPx(
  path: RenderScene["paths"][number],
  point: Coordinate,
  scale: SnapScreenScale,
): number {
  let nearest = Number.POSITIVE_INFINITY;
  const walk = (start: Coordinate, points: readonly PathPoint[]): void => {
    let previous = start;
    for (const next of points) {
      const samples = pathSegmentPoints(previous, next);
      for (let index = 1; index < samples.length; index += 1) {
        nearest = Math.min(
          nearest,
          distanceToSegmentPx(
            point,
            samples[index - 1]!,
            samples[index]!,
            scale,
          ),
        );
      }
      previous = next;
    }
  };
  const [first, ...rest] = path.points;
  if (!first) return nearest;
  walk(first, rest);
  for (const branch of path.branches) {
    const from = path.points[branch.fromIndex];
    if (from) walk(from, branch.points);
  }
  return nearest;
}

function labelHit(
  label: RenderScene["labels"][number],
  point: Coordinate,
  scale: SnapScreenScale,
  paddingPx: number,
): boolean {
  // The original's label hit box: text width estimated from glyph count,
  // baseline at the anchor, a little air above and below.
  const text = label.caps ? label.text.toUpperCase() : label.text;
  const widthPx = Math.max(20, text.length * label.size * 0.6) + 14;
  const dxPx =
    (point.lateralYards - label.position.lateralYards) *
    scale.lateralPixelsPerYard;
  // Screen y grows as depth shrinks, so the sign flips.
  const dyPx =
    (label.position.depthYards - point.depthYards) * scale.depthPixelsPerYard;
  return (
    Math.abs(dxPx) <= widthPx / 2 + paddingPx &&
    dyPx >= -(label.size + 4) - paddingPx &&
    dyPx <= 6 + paddingPx
  );
}

/**
 * Resolves what a pointer landed on, topmost layer first: Players draw over
 * labels, labels over routes — the same stacking the original resolved
 * through the DOM.
 */
export function hitTestField(
  scene: RenderScene,
  point: Coordinate,
  scale: SnapScreenScale,
  options: FieldHitOptions,
): FieldItemRef | undefined {
  for (const player of [...scene.players].reverse()) {
    if (
      screenDistancePx(player.position, point, scale) <= options.playerRadiusPx
    ) {
      return { kind: "player", id: player.id };
    }
  }
  for (const label of [...scene.labels].reverse()) {
    if (labelHit(label, point, scale, options.labelPaddingPx)) {
      return { kind: "label", id: label.id };
    }
  }
  for (const path of [...scene.paths].reverse()) {
    if (distanceToPathPx(path, point, scale) <= options.pathTolerancePx) {
      return { kind: "path", id: path.id };
    }
  }
  return undefined;
}

/**
 * Marquee containment, exactly as the original counted it: Players by their
 * center, routes by any main-line point, labels by their drawn anchor.
 */
function marqueeHits(
  scene: RenderScene,
  anchor: Coordinate,
  corner: Coordinate,
): FieldItemRef[] {
  const lateralMin = Math.min(anchor.lateralYards, corner.lateralYards);
  const lateralMax = Math.max(anchor.lateralYards, corner.lateralYards);
  const depthMin = Math.min(anchor.depthYards, corner.depthYards);
  const depthMax = Math.max(anchor.depthYards, corner.depthYards);
  const inside = ({ lateralYards, depthYards }: Coordinate): boolean =>
    lateralYards >= lateralMin &&
    lateralYards <= lateralMax &&
    depthYards >= depthMin &&
    depthYards <= depthMax;

  return [
    ...scene.players
      .filter(({ position }) => inside(position))
      .map(({ id }) => ({ kind: "player", id }) as const),
    ...scene.paths
      .filter(({ points }) => points.some((point) => inside(point)))
      .map(({ id }) => ({ kind: "path", id }) as const),
    ...scene.labels
      .filter(({ position }) => inside(position))
      .map(({ id }) => ({ kind: "label", id }) as const),
  ];
}

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
function buildDeleteCommand(
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

interface MovePreview {
  readonly translation: Coordinate;
  readonly guides: readonly AxisSnapGuide[];
  readonly readout?: FieldMoveReadout;
}

/**
 * A lone Player snaps landmark-first (ADR 0035) and reports his depth the way
 * the original's readout did. A group keeps its shape and moves raw.
 */
function movePreview(
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

// ---------------------------------------------------------------------------
// Handles on the selected route
// ---------------------------------------------------------------------------

/**
 * The original's zone bounds, converted on the axis each one belongs to: a
 * drop is between 12 and 230 lateral pixels wide and 9 to 150 deep.
 */
const ZONE_LATERAL_YARDS = Object.freeze({
  min: legacyLateralSpanToYards(12),
  max: legacyLateralSpanToYards(230),
});
const ZONE_DEPTH_YARDS = Object.freeze({
  min: legacyDepthSpanToYards(9),
  max: legacyDepthSpanToYards(150),
});

/** Inside this many pixels of the chord's midpoint, a curve straightens. */
const CONTROL_STRAIGHTEN_PX = 5;

function formatYardDistance(value: number): string {
  return `${Math.round(Math.abs(value) * 10) / 10}`;
}

/**
 * What the original's readout says about a break: its depth, and how far it
 * has worked out from or in toward where the route began.
 */
function nodeReadoutText(
  points: readonly PathPoint[],
  pointIndex: number,
): string {
  const point = points[pointIndex]!;
  const parts = [`${formatYardDistance(point.depthYards)} yds`];
  const origin = points[0]!;
  if (pointIndex > 0) {
    const lateral = Math.abs(point.lateralYards - origin.lateralYards);
    if (lateral >= 0.5) {
      const away = Math.abs(point.lateralYards) > Math.abs(origin.lateralYards);
      parts.push(`${formatYardDistance(lateral)} ${away ? "out" : "in"}`);
    }
  }
  return parts.join(" · ");
}

interface HandleEdit {
  readonly update: PrimitivePlayCommand;
  readonly guides: readonly AxisSnapGuide[];
  readonly readout?: FieldMoveReadout;
}

const updatePath = (path: MovementPath): PrimitivePlayCommand => ({
  kind: "update-path",
  path,
});

/**
 * Dragging a break constrains it to 45 degrees from the break before it, then
 * lets football landmarks claim it — the original's order, so an angle the
 * Coach set is not undone by a landmark and a landmark still wins ties.
 */
function dragNode(
  context: FieldInteractionContext,
  path: MovementPath,
  pointIndex: number,
  point: Coordinate,
  shiftKey: boolean | undefined,
): HandleEdit {
  const original = path.points[pointIndex];
  if (!original) return { update: updatePath(path), guides: [] };
  const previous = path.points[pointIndex - 1];
  const constrain = context.snap.enabled !== (shiftKey === true);
  const angled =
    constrain && previous
      ? snapRouteEndpoint({
          origin: coordinate(previous.lateralYards, previous.depthYards),
          point,
          mode: "constrain",
          screenScale: context.screenScale,
        }).point
      : point;
  const snapped = snapPosition({
    point: angled,
    fieldProfile: context.document.fieldProfile,
    references: context.document.players.map(({ id, position, label }) => ({
      id,
      kind: "player" as const,
      position,
      ...(label.trim() === "" ? {} : { label }),
    })),
    screenScale: context.screenScale,
    settings: context.snap,
  });
  const landed = clampToField(snapped.point, context);
  const shift = coordinate(
    landed.lateralYards - original.lateralYards,
    landed.depthYards - original.depthYards,
  );
  const points = [...path.points];
  points[pointIndex] = {
    ...original,
    lateralYards: landed.lateralYards,
    depthYards: landed.depthYards,
    // A curved segment keeps its bend: the control travels with its break.
    ...(original.control === undefined
      ? {}
      : {
          control: coordinate(
            original.control.lateralYards + shift.lateralYards,
            original.control.depthYards + shift.depthYards,
          ),
        }),
  };
  return {
    update: updatePath({ ...path, points }),
    guides: snapped.guides,
    readout: { position: landed, text: nodeReadoutText(points, pointIndex) },
  };
}

/**
 * The curve handle rides the middle of its segment. Dragging it bends the
 * segment through the pointer; releasing it back onto the chord's midpoint
 * straightens the segment again, which is the only way back to a straight
 * line once one is bent.
 */
function dragControl(
  context: FieldInteractionContext,
  path: MovementPath,
  pointIndex: number,
  point: Coordinate,
): HandleEdit {
  const end = path.points[pointIndex];
  const start = path.points[pointIndex - 1];
  if (!end || !start) return { update: updatePath(path), guides: [] };
  const midpoint = coordinate(
    (start.lateralYards + end.lateralYards) / 2,
    (start.depthYards + end.depthYards) / 2,
  );
  const points = [...path.points];
  if (
    screenDistancePx(point, midpoint, context.screenScale) <
    CONTROL_STRAIGHTEN_PX
  ) {
    // The key is dropped rather than cleared, so a straightened segment
    // hashes identically to one that was never bent.
    const straight = { ...end };
    delete straight.control;
    points[pointIndex] = straight;
  } else {
    points[pointIndex] = {
      ...end,
      control: coordinate(
        2 * point.lateralYards - midpoint.lateralYards,
        2 * point.depthYards - midpoint.depthYards,
      ),
    };
  }
  return { update: updatePath({ ...path, points }), guides: [] };
}

/** The zone corner sizes the area a defender owns, within the original's bounds. */
function dragZone(path: MovementPath, point: Coordinate): HandleEdit {
  const center = path.points.at(-1);
  if (!center) return { update: updatePath(path), guides: [] };
  const radiusLateralYards = Math.min(
    ZONE_LATERAL_YARDS.max,
    Math.max(
      ZONE_LATERAL_YARDS.min,
      Math.abs(point.lateralYards - center.lateralYards),
    ),
  );
  const radiusDepthYards = Math.min(
    ZONE_DEPTH_YARDS.max,
    Math.max(
      ZONE_DEPTH_YARDS.min,
      Math.abs(point.depthYards - center.depthYards),
    ),
  );
  return {
    update: updatePath({
      ...path,
      coverageArea: {
        type:
          path.coverageArea?.type ??
          classifyZoneCoverage(center, radiusLateralYards),
        radiusLateralYards,
        radiusDepthYards,
      },
    }),
    guides: [],
    readout: {
      position: coordinate(
        center.lateralYards,
        center.depthYards + radiusDepthYards,
      ),
      text: `${formatYardDistance(radiusLateralYards * 2)} yds wide`,
    },
  };
}

/** The leader line points from a label at whatever it is talking about. */
function dragLeader(
  context: FieldInteractionContext,
  label: TextLabel,
  point: Coordinate,
): HandleEdit {
  const endpoint = clampToField(point, context);
  return {
    update: {
      kind: "update-label",
      label: {
        ...label,
        leader: { line: label.leader?.line ?? "solid", endpoint },
      },
    },
    guides: [],
  };
}

function editHandle(
  context: FieldInteractionContext,
  handle: FieldHandleRef,
  point: Coordinate,
  shiftKey: boolean | undefined,
): HandleEdit | undefined {
  if (handle.kind === "leader") {
    const label = context.document.labels.find(
      ({ id }) => id === handle.labelId,
    );
    return label ? dragLeader(context, label, point) : undefined;
  }
  const path = context.document.paths.find(({ id }) => id === handle.pathId);
  if (!path) return undefined;
  switch (handle.kind) {
    case "node":
      return dragNode(context, path, handle.pointIndex, point, shiftKey);
    case "control":
      return dragControl(context, path, handle.pointIndex, point);
    case "zone":
      return dragZone(path, point);
  }
}

const handleLabels: Record<FieldHandleRef["kind"], string> = {
  leader: "Point the leader line",
  node: "Move route break",
  control: "Curve segment",
  zone: "Size zone",
};

/** Finds the segment a point sits nearest, the way the original did. */
export function nearestSegmentIndex(
  path: Pick<MovementPath, "points">,
  point: Coordinate,
  scale: SnapScreenScale,
): number {
  let best = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.points.length; index += 1) {
    const samples = pathSegmentPoints(
      path.points[index - 1]!,
      path.points[index]!,
    );
    for (let sample = 1; sample < samples.length; sample += 1) {
      const distance = distanceToSegmentPx(
        point,
        samples[sample - 1]!,
        samples[sample]!,
        scale,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * The original clamps to the sidelines and the drawn frame's depth. Rounding
 * happens first and clamping last, because rounding a clamped value can carry
 * it back across the boundary it was just held inside.
 */
function clampToField(
  point: Coordinate,
  context: FieldInteractionContext,
): Coordinate {
  const halfWidth = context.document.fieldProfile.widthYards / 2;
  const depthWindow = context.depthWindow;
  const rough = coordinate(point.lateralYards, point.depthYards);
  return {
    lateralYards: Math.max(-halfWidth, Math.min(halfWidth, rough.lateralYards)),
    depthYards: depthWindow
      ? Math.max(
          depthWindow.minDepthYards,
          Math.min(depthWindow.maxDepthYards, rough.depthYards),
        )
      : rough.depthYards,
  };
}

/**
 * Where the next break would land: constrained to grass-true 45° increments
 * from the last one while snap is on (Shift inverts), then clamped, then
 * overridden in depth by any digits the Coach has typed.
 */
function drawTarget(
  drawing: FieldDrawingState,
  point: Coordinate,
  shiftKey: boolean | undefined,
  context: FieldInteractionContext,
): Coordinate {
  const last = drawing.points.at(-1)!;
  const constrain = context.snap.enabled !== (shiftKey === true);
  const snapped = constrain
    ? snapRouteEndpoint({
        origin: coordinate(last.lateralYards, last.depthYards),
        point,
        mode: "constrain",
        screenScale: context.screenScale,
      }).point
    : point;
  const clamped = clampToField(snapped, context);
  const typedDepth = Number.parseFloat(drawing.depthBuffer);
  if (drawing.depthBuffer !== "" && !Number.isNaN(typedDepth)) {
    return clampToField(coordinate(clamped.lateralYards, typedDepth), context);
  }
  return clamped;
}

function addDrawPoint(
  model: FieldInteractionModel,
  drawing: FieldDrawingState,
  input: FieldPointerInput,
  context: FieldInteractionContext,
): FieldInteractionModel {
  const target = drawTarget(drawing, input.point, input.shiftKey, context);
  const last = drawing.points.at(-1)!;
  if (screenDistancePx(last, target, context.screenScale) < DRAW_POINT_MIN_PX) {
    return model;
  }
  return {
    ...model,
    drawing: {
      ...drawing,
      points: [
        ...drawing.points,
        { lateralYards: target.lateralYards, depthYards: target.depthYards },
      ],
      cursor: target,
      depthBuffer: "",
      pointerDown: true,
    },
  };
}

/**
 * Holding the pointer after placing a break and pulling away bends the
 * segment through the pointer: the control point is the pointer's reflection
 * across the chord's midpoint, so the curve passes under the Coach's finger.
 */
function bendLastSegment(
  drawing: FieldDrawingState,
  point: Coordinate,
): FieldDrawingState {
  const points = [...drawing.points];
  const end = points.at(-1)!;
  const start = points.at(-2)!;
  const midLateral = (start.lateralYards + end.lateralYards) / 2;
  const midDepth = (start.depthYards + end.depthYards) / 2;
  points[points.length - 1] = {
    ...end,
    control: coordinate(
      2 * point.lateralYards - midLateral,
      2 * point.depthYards - midDepth,
    ),
  };
  return { ...drawing, points };
}

const drawingStyles: Record<FieldDrawingKind, PathStyle> = {
  route: { line: "solid", ending: "arrow", color: "ink" },
  motion: { line: "zigzag", ending: "arrow", color: "ink" },
  block: { line: "solid", ending: "bar", color: "ink" },
  zone: { line: "dashed", ending: "bubble", color: "blue" },
};

const drawingLabels: Record<FieldDrawingKind, string> = {
  route: "Draw route",
  motion: "Draw motion",
  block: "Draw block",
  zone: "Draw zone drop",
};

/** Abandons an in-progress route, leaving the committed Play untouched. */
function clearDrawing(model: FieldInteractionModel): FieldInteractionModel {
  return { selection: model.selection, gesture: { kind: "idle" } };
}

function startDrawing(
  kind: FieldDrawingKind,
  playerId: string,
  context: FieldInteractionContext,
): FieldInteractionModel | undefined {
  const player = context.document.players.find(({ id }) => id === playerId);
  if (!player) return undefined;
  return {
    selection: [],
    gesture: { kind: "idle" },
    drawing: {
      kind,
      playerId,
      points: [
        {
          lateralYards: player.position.lateralYards,
          depthYards: player.position.depthYards,
        },
      ],
      cursor: player.position,
      depthBuffer: "",
      pointerDown: false,
    },
  };
}

/**
 * One finished route is one insert. Kind defaults are the original's, and a
 * second route on the same man arrives dotted as his alternate.
 */
function buildDrawCommand(
  context: FieldInteractionContext,
  drawing: FieldDrawingState,
  pathId: string,
): PlayCommand | undefined {
  const points = drawing.points.filter((point, index, all) => {
    if (index === 0) return true;
    return (
      screenDistancePx(all[index - 1]!, point, context.screenScale) >=
      DRAW_POINT_MIN_PX
    );
  });
  if (points.length < 2) return undefined;

  const sibling =
    drawing.kind === "route" &&
    context.document.paths.some(
      (path) => path.playerId === drawing.playerId && path.kind === "route",
    );
  const style = drawingStyles[drawing.kind];
  return {
    kind: "batch",
    label: drawingLabels[drawing.kind],
    commands: [
      {
        kind: "insert-paths",
        paths: [
          {
            index: context.document.paths.length,
            item: {
              id: pathId,
              kind: drawing.kind,
              playerId: drawing.playerId,
              points,
              branches: [],
              style: {
                line: sibling ? "dotted" : style.line,
                ending: style.ending,
                color: style.color,
              },
              ...(sibling ? { variant: "alternate" } : {}),
            },
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

function withGesture(
  model: FieldInteractionModel,
  gesture: FieldGesture,
): FieldInteractionModel {
  return { ...model, gesture };
}

function withSelection(
  model: FieldInteractionModel,
  selection: readonly FieldItemRef[],
): FieldInteractionModel {
  return { ...model, selection, gesture: { kind: "idle" } };
}

function pointerDown(
  model: FieldInteractionModel,
  input: FieldPointerInput,
  context: FieldInteractionContext,
): FieldInteractionResult {
  // One gesture at a time; a second finger neither pans nor breaks the first.
  if (model.gesture.kind !== "idle") return { model };
  if (input.button !== undefined && input.button !== 0) return { model };

  // Mid-drawing, every press places the next break — even over a Player.
  if (model.drawing) {
    return { model: addDrawPoint(model, model.drawing, input, context) };
  }

  const hit = hitTestField(
    context.scene,
    input.point,
    context.screenScale,
    fieldHitOptions(input.pointerType),
  );

  if (
    context.tool === "route" ||
    context.tool === "motion" ||
    context.tool === "block" ||
    context.tool === "zone"
  ) {
    // The original also starts unattached routes from grass; the production
    // schema still requires a Player on every path, so until a schema
    // revision admits unattached routes, grass presses draw nothing.
    if (hit?.kind !== "player") return { model };
    return {
      model: startDrawing(context.tool, hit.id, context) ?? model,
    };
  }

  if (hit) {
    if (input.shiftKey) {
      // Shift settles membership on the press itself; no drag follows.
      return {
        model: withSelection(
          model,
          isSelected(model.selection, hit)
            ? model.selection.filter((item) => !sameItem(item, hit))
            : [...model.selection, hit],
        ),
      };
    }
    const already = isSelected(model.selection, hit);
    const wasMulti = already && model.selection.length > 1;
    const items = wasMulti ? model.selection : [hit];
    return {
      model: {
        selection: already ? model.selection : [hit],
        gesture: {
          kind: "pressing",
          pointerId: input.pointerId,
          items,
          clickItem: hit,
          wasMulti,
          start: input.point,
        },
      },
    };
  }

  if (context.tool === "text") {
    const createId = context.createId ?? ((prefix: string) => `${prefix}_new`);
    const id = createId("label");
    // A new note belongs to whichever unit the Coach was working on: the
    // side of the selected Player, not where on the field he pressed —
    // depth notes and progression numbers live downfield too.
    const selectedPlayer = context.document.players.find((player) =>
      model.selection.some(
        (item) => item.kind === "player" && item.id === player.id,
      ),
    );
    return {
      model: withSelection(model, [{ kind: "label", id }]),
      command: {
        kind: "batch",
        label: "Add label",
        commands: [
          {
            kind: "insert-labels",
            labels: [
              {
                index: context.document.labels.length,
                item: {
                  id,
                  position: coordinate(
                    input.point.lateralYards,
                    input.point.depthYards,
                  ),
                  ...NEW_LABEL_DEFAULTS,
                  ...(selectedPlayer?.unit === "defense"
                    ? { unit: "defense" as const }
                    : {}),
                },
              },
            ],
          },
        ],
      },
      requestedTool: "select",
      editingLabelId: id,
    };
  }

  if (context.tool === "player") {
    // The original places the new man exactly where the Coach pressed.
    const createId = context.createId ?? ((prefix: string) => `${prefix}_new`);
    const id = createId("player");
    return {
      model: withSelection(model, [{ kind: "player", id }]),
      command: {
        kind: "batch",
        label: "Add Player",
        commands: [
          {
            kind: "insert-players",
            players: [
              {
                index: context.document.players.length,
                item: {
                  id,
                  unit: context.document.unit,
                  position: coordinate(
                    input.point.lateralYards,
                    input.point.depthYards,
                  ),
                  symbol: "circle",
                  label: "",
                  sublabel: "",
                  fill: "none",
                  color: "ink",
                },
              },
            ],
          },
        ],
      },
    };
  }

  return {
    model: withGesture(model, {
      kind: "marquee",
      pointerId: input.pointerId,
      anchor: input.point,
      corner: input.point,
      additive: input.shiftKey === true,
      active: false,
    }),
  };
}

function pointerMove(
  model: FieldInteractionModel,
  input: FieldPointerInput,
  context: FieldInteractionContext,
): FieldInteractionResult {
  const drawing = model.drawing;
  if (drawing && model.gesture.kind === "idle") {
    const last = drawing.points.at(-1)!;
    if (
      drawing.pointerDown &&
      drawing.points.length > 1 &&
      screenDistancePx(last, input.point, context.screenScale) >
        DRAW_CURVE_THRESHOLD_PX
    ) {
      return {
        model: { ...model, drawing: bendLastSegment(drawing, input.point) },
      };
    }
    return {
      model: {
        ...model,
        drawing: {
          ...drawing,
          cursor: drawTarget(drawing, input.point, input.shiftKey, context),
        },
      },
    };
  }

  const gesture = model.gesture;
  if (gesture.kind === "idle") return { model };
  if (gesture.pointerId !== input.pointerId) return { model };

  if (gesture.kind === "pressing") {
    if (
      screenDistancePx(gesture.start, input.point, context.screenScale) <
      MOVE_THRESHOLD_PX
    ) {
      return { model };
    }
    const preview = movePreview(
      context,
      gesture.items,
      gesture.start,
      input.point,
    );
    return {
      model: withGesture(model, {
        kind: "moving",
        pointerId: gesture.pointerId,
        items: gesture.items,
        start: gesture.start,
        ...preview,
      }),
    };
  }

  if (gesture.kind === "moving") {
    const preview = movePreview(
      context,
      gesture.items,
      gesture.start,
      input.point,
    );
    return {
      model: withGesture(model, { ...gesture, ...preview }),
    };
  }

  if (gesture.kind === "handle") {
    const edit = editHandle(
      context,
      gesture.handle,
      input.point,
      input.shiftKey,
    );
    if (!edit) return { model };
    return {
      model: withGesture(model, { ...gesture, ...edit, moved: true }),
    };
  }

  const active =
    gesture.active ||
    screenDistancePx(gesture.anchor, input.point, context.screenScale) >
      MARQUEE_THRESHOLD_PX;
  return {
    model: withGesture(model, { ...gesture, corner: input.point, active }),
  };
}

function pointerUp(
  model: FieldInteractionModel,
  input: FieldPointerInput,
  context: FieldInteractionContext,
): FieldInteractionResult {
  if (model.drawing?.pointerDown) {
    // Releasing keeps the drawing alive; the next press places the next break.
    return {
      model: { ...model, drawing: { ...model.drawing, pointerDown: false } },
    };
  }

  const gesture = model.gesture;
  if (gesture.kind === "idle") return { model };
  if (gesture.pointerId !== input.pointerId) return { model };

  if (gesture.kind === "pressing") {
    // A press that never moved is a click. On a multi-selection it narrows to
    // the item under the pointer, exactly as the original did.
    return {
      model: gesture.wasMulti
        ? withSelection(model, [gesture.clickItem])
        : withGesture(model, { kind: "idle" }),
    };
  }

  if (gesture.kind === "moving") {
    const command = buildMoveCommand(
      context.document,
      gesture.items,
      gesture.translation,
    );
    return {
      model: withGesture(model, { kind: "idle" }),
      ...(command === undefined ? {} : { command }),
    };
  }

  if (gesture.kind === "handle") {
    // A handle pressed but never dragged only selected its break.
    return {
      model: withGesture(model, { kind: "idle" }),
      ...(gesture.moved
        ? {
            command: {
              kind: "batch",
              label: handleLabels[gesture.handle.kind],
              commands: [gesture.update],
            } satisfies PlayCommand,
          }
        : {}),
    };
  }

  if (!gesture.active) {
    // A click on empty grass clears the selection; with Shift held it keeps it.
    return {
      model: gesture.additive
        ? withGesture(model, { kind: "idle" })
        : withSelection(model, []),
    };
  }
  const hits = marqueeHits(context.scene, gesture.anchor, gesture.corner);
  const selection = gesture.additive
    ? [
        ...model.selection,
        ...hits.filter((hit) => !isSelected(model.selection, hit)),
      ]
    : hits;
  return { model: withSelection(model, selection) };
}

export function fieldInteraction(
  model: FieldInteractionModel,
  event: FieldInteractionEvent,
  context: FieldInteractionContext,
): FieldInteractionResult {
  switch (event.type) {
    case "pointer-down":
      return pointerDown(model, event.input, context);
    case "pointer-move":
      return pointerMove(model, event.input, context);
    case "pointer-up":
      return pointerUp(model, event.input, context);
    case "pointer-cancel":
      // The platform took the pointer (palm, system gesture). Nothing was
      // committed mid-gesture, so dropping the gesture is a clean revert; a
      // drawing survives — only its held pointer is released.
      return {
        model: {
          ...withGesture(model, { kind: "idle" }),
          ...(model.drawing === undefined
            ? {}
            : { drawing: { ...model.drawing, pointerDown: false } }),
        },
      };
    case "escape": {
      // Escape steps outward: the drawing, then the gesture, then the
      // selection — the original's ladder.
      if (model.drawing) {
        return { model: clearDrawing(model) };
      }
      if (model.gesture.kind !== "idle") {
        return { model: withGesture(model, { kind: "idle" }) };
      }
      return model.selection.length > 0
        ? { model: withSelection(model, []) }
        : { model };
    }
    case "delete": {
      const drawing = model.drawing;
      if (drawing) {
        // Backspace edits the drawing before it deletes anything: the typed
        // depth first, then the last break, then the drawing itself.
        if (drawing.depthBuffer !== "") {
          return {
            model: {
              ...model,
              drawing: {
                ...drawing,
                depthBuffer: drawing.depthBuffer.slice(0, -1),
              },
            },
          };
        }
        if (drawing.points.length > 1) {
          return {
            model: {
              ...model,
              drawing: { ...drawing, points: drawing.points.slice(0, -1) },
            },
          };
        }
        return { model: clearDrawing(model) };
      }
      if (model.selection.length === 0) return { model };
      const command = buildDeleteCommand(context.document, model.selection);
      return {
        model: withSelection(model, []),
        ...(command === undefined ? {} : { command }),
      };
    }
    case "select-all":
      return {
        model: withSelection(model, [
          ...context.document.players.map(
            ({ id }) => ({ kind: "player", id }) as const,
          ),
          ...context.document.paths.map(
            ({ id }) => ({ kind: "path", id }) as const,
          ),
          ...context.document.labels.map(
            ({ id }) => ({ kind: "label", id }) as const,
          ),
        ]),
      };
    case "nudge": {
      // The original had no keyboard nudge; ADR 0016 requires a keyboard
      // alternative to dragging, so each press is its own small, undoable move.
      if (model.selection.length === 0) return { model };
      const command = buildMoveCommand(
        context.document,
        model.selection,
        coordinate(event.lateralYards, event.depthYards),
      );
      return { model, ...(command === undefined ? {} : { command }) };
    }
    case "start-route": {
      if (model.drawing || model.gesture.kind !== "idle") return { model };
      const started = startDrawing("route", event.playerId, context);
      return { model: started ?? model };
    }
    case "finish-drawing": {
      const drawing = model.drawing;
      if (!drawing) return { model };
      const createId =
        context.createId ?? ((prefix: string) => `${prefix}_new`);
      const pathId = createId("path");
      const command = buildDrawCommand(context, drawing, pathId);
      if (command === undefined) return { model: clearDrawing(model) };
      return {
        model: {
          selection: [{ kind: "path", id: pathId }],
          gesture: { kind: "idle" },
        },
        command,
        requestedTool: "select",
      };
    }
    case "handle-down": {
      if (model.drawing || model.gesture.kind !== "idle") return { model };
      const handle = event.handle;
      // A leader is seeded from where it already points, so a press that
      // never moves leaves it exactly where it was.
      const seedPoint =
        handle.kind === "leader"
          ? (context.document.labels.find(({ id }) => id === handle.labelId)
              ?.leader?.endpoint ?? event.input.point)
          : event.input.point;
      const seed = editHandle(context, handle, seedPoint, event.input.shiftKey);
      if (!seed) return { model };
      const owner: FieldItemRef =
        handle.kind === "leader"
          ? { kind: "label", id: handle.labelId }
          : { kind: "path", id: handle.pathId };
      return {
        model: {
          ...model,
          // The route or label stays selected; a node press picks its break.
          selection: [owner],
          ...(handle.kind === "node"
            ? { selectedNodeIndex: handle.pointIndex }
            : {}),
          gesture: {
            kind: "handle",
            pointerId: event.input.pointerId,
            handle,
            update: seed.update,
            guides: [],
            moved: false,
          },
        },
      };
    }
    case "insert-node": {
      const path = context.document.paths.find(({ id }) => id === event.pathId);
      if (!path || path.points.length < 2) return { model };
      const index = nearestSegmentIndex(path, event.point, context.screenScale);
      const points = [...path.points];
      points.splice(index, 0, {
        lateralYards: coordinate(
          event.point.lateralYards,
          event.point.depthYards,
        ).lateralYards,
        depthYards: coordinate(event.point.lateralYards, event.point.depthYards)
          .depthYards,
      });
      return {
        model: {
          ...model,
          selection: [{ kind: "path", id: path.id }],
          selectedNodeIndex: index,
          gesture: { kind: "idle" },
        },
        command: {
          kind: "batch",
          label: "Add route break",
          commands: [{ kind: "update-path", path: { ...path, points } }],
        },
      };
    }
    case "depth-digit": {
      const drawing = model.drawing;
      if (!drawing || !/^[0-9.]$/.test(event.digit)) return { model };
      const depthBuffer = drawing.depthBuffer + event.digit;
      const typed = Number.parseFloat(depthBuffer);
      return {
        model: {
          ...model,
          drawing: {
            ...drawing,
            depthBuffer,
            cursor: Number.isNaN(typed)
              ? drawing.cursor
              : clampToField(
                  coordinate(drawing.cursor.lateralYards, typed),
                  context,
                ),
          },
        },
      };
    }
  }
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

/**
 * The transient preview is the commit builder run early: what the Coach sees
 * mid-drag is exactly the document the release would produce.
 */
export function gesturePreviewCommand(
  model: FieldInteractionModel,
  document: PlayDocument,
): PlayCommand | undefined {
  if (model.gesture.kind === "moving") {
    return buildMoveCommand(
      document,
      model.gesture.items,
      model.gesture.translation,
    );
  }
  if (model.gesture.kind === "handle" && model.gesture.moved) {
    return {
      kind: "batch",
      label: handleLabels[model.gesture.handle.kind],
      commands: [model.gesture.update],
    };
  }
  return undefined;
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

/**
 * After an undo, redo, or restore the document may no longer contain what was
 * selected. Selection quietly narrows to what still exists, and any in-flight
 * gesture that references a vanished item is abandoned.
 *
 * `pendingIds` are entities a command has created but whose commit has not
 * landed yet. Without them a Player, route, or note would be deselected in
 * the instant between the Coach making it and the save arriving — absent
 * because it is still on its way, not because an undo took it.
 */
export function pruneFieldSelection(
  model: FieldInteractionModel,
  document: PlayDocument,
  pendingIds: ReadonlySet<string> = new Set(),
): FieldInteractionModel {
  const exists = (item: FieldItemRef): boolean => {
    if (pendingIds.has(item.id)) return true;
    switch (item.kind) {
      case "player":
        return document.players.some(({ id }) => id === item.id);
      case "path":
        return document.paths.some(({ id }) => id === item.id);
      case "label":
        return document.labels.some(({ id }) => id === item.id);
    }
  };
  const selection = model.selection.filter(exists);
  const gestureItems =
    model.gesture.kind === "pressing" || model.gesture.kind === "moving"
      ? model.gesture.items
      : [];
  const gesture: FieldGesture = gestureItems.every(exists)
    ? model.gesture
    : { kind: "idle" };
  // A route being drawn from a Player an undo removed has nothing to attach
  // to, so it is abandoned rather than left pointing at a ghost.
  const drawing =
    model.drawing && exists({ kind: "player", id: model.drawing.playerId })
      ? model.drawing
      : undefined;
  if (
    selection.length === model.selection.length &&
    gesture === model.gesture &&
    drawing === model.drawing
  ) {
    return model;
  }
  return {
    selection,
    gesture,
    ...(drawing === undefined ? {} : { drawing }),
  };
}
