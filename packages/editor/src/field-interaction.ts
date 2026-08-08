import {
  applyPlayCommand,
  deletePathsCommand,
  deletePlayersCommand,
  type Coordinate,
  type MovementPath,
  type PathPoint,
  type PlayCommand,
  type PlayDocument,
  type PrimitivePlayCommand,
  type TextLabel,
} from "@chalk/domain";
import type { RenderScene } from "@chalk/render";

import {
  snapPosition,
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
    };

export interface FieldMoveReadout {
  readonly position: Coordinate;
  readonly text: string;
}

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
    };

export interface FieldInteractionModel {
  readonly selection: readonly FieldItemRef[];
  readonly gesture: FieldGesture;
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
  readonly tool: "select" | "player";
  readonly createId?: (prefix: string) => string;
}

export interface FieldInteractionResult {
  readonly model: FieldInteractionModel;
  /** At most one command, produced only when a gesture completes. */
  readonly command?: PlayCommand;
}

export const idleFieldInteraction: FieldInteractionModel = {
  selection: [],
  gesture: { kind: "idle" },
};

/**
 * The original's gesture grammar in canvas pixels: 2 px before a press
 * becomes a drag, 3 px before a press on grass becomes a marquee.
 */
const MOVE_THRESHOLD_PX = 2;
const MARQUEE_THRESHOLD_PX = 3;

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
// The machine
// ---------------------------------------------------------------------------

function withGesture(
  model: FieldInteractionModel,
  gesture: FieldGesture,
): FieldInteractionModel {
  return { ...model, gesture };
}

function withSelection(
  selection: readonly FieldItemRef[],
): FieldInteractionModel {
  return { selection, gesture: { kind: "idle" } };
}

function pointerDown(
  model: FieldInteractionModel,
  input: FieldPointerInput,
  context: FieldInteractionContext,
): FieldInteractionResult {
  // One gesture at a time; a second finger neither pans nor breaks the first.
  if (model.gesture.kind !== "idle") return { model };
  if (input.button !== undefined && input.button !== 0) return { model };

  const hit = hitTestField(
    context.scene,
    input.point,
    context.screenScale,
    fieldHitOptions(input.pointerType),
  );

  if (hit) {
    if (input.shiftKey) {
      // Shift settles membership on the press itself; no drag follows.
      return {
        model: withSelection(
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

  if (context.tool === "player") {
    // The original places the new man exactly where the Coach pressed.
    const createId = context.createId ?? ((prefix: string) => `${prefix}_new`);
    const id = createId("player");
    return {
      model: withSelection([{ kind: "player", id }]),
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
  const gesture = model.gesture;
  if (gesture.kind === "idle") return { model };
  if (gesture.pointerId !== input.pointerId) return { model };

  if (gesture.kind === "pressing") {
    // A press that never moved is a click. On a multi-selection it narrows to
    // the item under the pointer, exactly as the original did.
    return {
      model: gesture.wasMulti
        ? withSelection([gesture.clickItem])
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

  if (!gesture.active) {
    // A click on empty grass clears the selection; with Shift held it keeps it.
    return {
      model: gesture.additive
        ? withGesture(model, { kind: "idle" })
        : withSelection([]),
    };
  }
  const hits = marqueeHits(context.scene, gesture.anchor, gesture.corner);
  const selection = gesture.additive
    ? [
        ...model.selection,
        ...hits.filter((hit) => !isSelected(model.selection, hit)),
      ]
    : hits;
  return { model: withSelection(selection) };
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
      // committed mid-gesture, so dropping the gesture is a clean revert.
      return { model: withGesture(model, { kind: "idle" }) };
    case "escape": {
      if (model.gesture.kind !== "idle") {
        return { model: withGesture(model, { kind: "idle" }) };
      }
      return model.selection.length > 0
        ? { model: withSelection([]) }
        : { model };
    }
    case "delete": {
      if (model.selection.length === 0) return { model };
      const command = buildDeleteCommand(context.document, model.selection);
      return {
        model: withSelection([]),
        ...(command === undefined ? {} : { command }),
      };
    }
    case "select-all":
      return {
        model: withSelection([
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
  }
}

/**
 * The transient preview is the commit builder run early: what the Coach sees
 * mid-drag is exactly the document the release would produce.
 */
export function gesturePreviewCommand(
  model: FieldInteractionModel,
  document: PlayDocument,
): PlayCommand | undefined {
  if (model.gesture.kind !== "moving") return undefined;
  return buildMoveCommand(
    document,
    model.gesture.items,
    model.gesture.translation,
  );
}

/**
 * After an undo, redo, or restore the document may no longer contain what was
 * selected. Selection quietly narrows to what still exists, and any in-flight
 * gesture that references a vanished item is abandoned.
 */
export function pruneFieldSelection(
  model: FieldInteractionModel,
  document: PlayDocument,
): FieldInteractionModel {
  const exists = (item: FieldItemRef): boolean => {
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
  if (
    selection.length === model.selection.length &&
    gesture === model.gesture
  ) {
    return model;
  }
  return { selection, gesture };
}
