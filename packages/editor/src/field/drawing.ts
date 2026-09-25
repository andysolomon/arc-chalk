import {
  DEFAULT_ZONE_COVERAGE_RADII,
  routeKindStyle,
  type Coordinate,
  type PathPoint,
  type PathStyle,
  type PlayCommand,
  type Player,
} from "@chalk/domain";

import { snapRouteEndpoint } from "../smart-snapping";
import { fitFreehandStroke, isStraightStroke } from "./freehand";
import {
  clampToField,
  coordinate,
  fieldHitOptions,
  screenDistancePx,
} from "./geometry";
import {
  DRAW_POINT_MIN_PX,
  TRACE_POINT_MIN_PX,
  type FieldDrawingKind,
  type FieldDrawingMode,
  type FieldDrawingPoint,
  type FieldDrawingState,
  type FieldInteractionContext,
  type FieldInteractionModel,
  type FieldInteractionResult,
  type FieldPointerInput,
} from "./model";

/**
 * Drawing a route: where the next break would land, how a held pointer bends
 * the segment behind it, how a traced stroke follows the pointer, and the one
 * insert a finished route commits.
 */

/**
 * Where a break being drawn may land. A zone drop's end will carry the
 * default bubble the moment it is finished, so it stops a radius short of
 * the edge and the bubble lands on the paint with it.
 */
export function holdDrawPoint(
  drawing: Pick<FieldDrawingState, "kind">,
  point: Coordinate,
  context: FieldInteractionContext,
): Coordinate {
  return clampToField(
    point,
    context,
    drawing.kind === "zone"
      ? {
          lateralYards: DEFAULT_ZONE_COVERAGE_RADII.radiusLateralYards,
          depthYards: DEFAULT_ZONE_COVERAGE_RADII.radiusDepthYards,
        }
      : undefined,
  );
}

/**
 * Where a drag that started on the blue dot is aiming. The dot sits upfield
 * of the man so a finger can find it; that offset is not the route. The line
 * leaves his stance along the direction the finger actually travelled, so a
 * drag to the flat, the backfield, or the sideline starts that way.
 */
export function routeDragAim(
  stance: Coordinate,
  press: Coordinate,
  pointer: Coordinate,
): Coordinate {
  return coordinate(
    stance.lateralYards + (pointer.lateralYards - press.lateralYards),
    stance.depthYards + (pointer.depthYards - press.depthYards),
  );
}

export /**
 * Where the next break would land: constrained to grass-true 45° increments
 * from the last one while snap is on (Shift inverts), then clamped, then
 * overridden in depth by any digits the Coach has typed. A traced line is
 * neither constrained nor given a depth — it goes where the hand goes.
 */
function drawTarget(
  drawing: FieldDrawingState,
  point: Coordinate,
  shiftKey: boolean | undefined,
  context: FieldInteractionContext,
): Coordinate {
  const last = drawing.points.at(-1)!;
  if (drawing.mode === "free") return holdDrawPoint(drawing, point, context);
  const constrain = context.snap.enabled !== (shiftKey === true);
  const snapped = constrain
    ? snapRouteEndpoint({
        origin: coordinate(last.lateralYards, last.depthYards),
        point,
        mode: "constrain",
        screenScale: context.screenScale,
      }).point
    : point;
  const clamped = holdDrawPoint(drawing, snapped, context);
  const typedDepth = Number.parseFloat(drawing.depthBuffer);
  if (drawing.depthBuffer !== "" && !Number.isNaN(typedDepth)) {
    return holdDrawPoint(
      drawing,
      coordinate(clamped.lateralYards, typedDepth),
      context,
    );
  }
  return clamped;
}

export function addDrawPoint(
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
 * A stroke under way: the pointer is held down and the line follows it.
 * Every point it passes is kept, marked as traced, so the finish can fit a
 * clean line through the stroke rather than through the hand's tremor. A
 * press that has not yet moved still holds the pointer, so the moves that
 * follow it trace. The first of them remembers where the stroke set out.
 */
export function traceDrawPoint(
  model: FieldInteractionModel,
  drawing: FieldDrawingState,
  point: Coordinate,
  context: FieldInteractionContext,
): FieldInteractionModel {
  const target = holdDrawPoint(drawing, point, context);
  const last = drawing.points.at(-1)!;
  const strokeFrom = drawing.strokeFrom ?? drawing.points.length - 1;
  if (
    screenDistancePx(last, target, context.screenScale) < TRACE_POINT_MIN_PX
  ) {
    return {
      ...model,
      drawing: {
        ...drawing,
        cursor: target,
        depthBuffer: "",
        pointerDown: true,
        strokeFrom,
      },
    };
  }
  return {
    ...model,
    drawing: {
      ...drawing,
      points: [
        ...drawing.points,
        {
          lateralYards: target.lateralYards,
          depthYards: target.depthYards,
          traced: true,
        },
      ],
      cursor: target,
      depthBuffer: "",
      pointerDown: true,
      strokeFrom,
    },
  };
}

/**
 * A press that takes hold of the pointer without marking the line: the
 * stroke is what the pointer does next, and it sets out from the end of the
 * line as it stands. A press that lifts where it landed was a tap, and a
 * tap is not a line.
 */
export function holdStroke(
  model: FieldInteractionModel,
  drawing: FieldDrawingState,
  point: Coordinate,
  context: FieldInteractionContext,
): FieldInteractionModel {
  return {
    ...model,
    drawing: {
      ...drawing,
      cursor: holdDrawPoint(drawing, point, context),
      depthBuffer: "",
      pointerDown: true,
      strokeFrom: drawing.points.length - 1,
    },
  };
}

/**
 * Whether a press while clicking breaks lands on the end of the line in
 * hand — his stance, before anything is drawn — close enough to pick the
 * line up and draw on from it by hand, as a pen goes back to where it left
 * off. The reach is a man's, so a finger finds it. A typed depth is waiting
 * for the next break, so with one typed the press places it instead.
 */
export function grabsLineEnd(
  drawing: FieldDrawingState,
  input: FieldPointerInput,
  context: FieldInteractionContext,
): boolean {
  if (drawing.mode !== "breaks" || drawing.depthBuffer !== "") return false;
  return (
    screenDistancePx(
      drawing.points.at(-1)!,
      input.point,
      context.screenScale,
    ) <= fieldHitOptions(input.pointerType).playerRadiusPx
  );
}

/**
 * A stroke lifted while the line is clicked in breaks. The line stays in
 * hand either way — the next press places the next break, and Done still
 * finishes it — and what the stroke leaves on it is what the hand did. A
 * stroke that bent keeps its shape, fitted at the finish like a free one.
 * One that ran straight is the break a click where it lifted would have
 * placed, snapped and clamped like one, so a quick pull off the dot still
 * lands a clean stem. A press that never moved was a click.
 */
export function liftStroke(
  model: FieldInteractionModel,
  drawing: FieldDrawingState,
  release: FieldPointerInput,
  context: FieldInteractionContext,
): FieldInteractionModel {
  const from = Math.min(
    drawing.strokeFrom ?? drawing.points.length - 1,
    drawing.points.length - 1,
  );
  const anchor = drawing.points[from]!;
  const stroke = drawing.points.slice(from + 1);
  const lifted: FieldDrawingState = {
    ...drawing,
    initialDrag: undefined,
    pointerDown: false,
    strokeFrom: undefined,
  };
  if (
    stroke.length > 0 &&
    !isStraightStroke(anchor, stroke, context.screenScale)
  ) {
    return { ...model, drawing: { ...lifted, cursor: stroke.at(-1)! } };
  }
  const unstroked: FieldDrawingState = {
    ...lifted,
    points: drawing.points.slice(0, from + 1),
    cursor: anchor,
  };
  const placed = addDrawPoint(
    { ...model, drawing: unstroked },
    unstroked,
    release,
    context,
  );
  return { ...placed, drawing: { ...placed.drawing!, pointerDown: false } };
}

/**
 * Whether the stroke under the held pointer has drawn anything yet. A press
 * that never moved has not, however much the line traced before it.
 */
export function hasTracedStroke(
  drawing: Pick<FieldDrawingState, "points" | "strokeFrom">,
): boolean {
  return (
    drawing.strokeFrom !== undefined &&
    drawing.points.length - 1 > drawing.strokeFrom
  );
}

/**
 * Takes the last stroke off the line in hand, the way Backspace takes the
 * last break: one traced run is one thing the Coach did, so it goes as one.
 */
export function dropLastStroke(drawing: FieldDrawingState): FieldDrawingState {
  const points = [...drawing.points];
  while (points.length > 1 && points.at(-1)!.traced) points.pop();
  return {
    ...drawing,
    points,
    cursor: points.at(-1)!,
    // A stroke still held sets out again from what is left of the line.
    ...(drawing.strokeFrom === undefined
      ? {}
      : { strokeFrom: Math.min(drawing.strokeFrom, points.length - 1) }),
  };
}

/**
 * Holding the pointer after placing a break and pulling away bends the
 * segment through the pointer: the control point is the pointer's reflection
 * across the chord's midpoint, so the curve passes under the Coach's finger.
 * The control is held on the field like the breaks are, which keeps the
 * whole arc inside the sidelines however far past them the finger goes.
 */
export function bendLastSegment(
  drawing: FieldDrawingState,
  point: Coordinate,
  context: FieldInteractionContext,
): FieldDrawingState {
  const points = [...drawing.points];
  const end = points.at(-1)!;
  const start = points.at(-2)!;
  const midLateral = (start.lateralYards + end.lateralYards) / 2;
  const midDepth = (start.depthYards + end.depthYards) / 2;
  points[points.length - 1] = {
    ...end,
    control: clampToField(
      coordinate(
        2 * point.lateralYards - midLateral,
        2 * point.depthYards - midDepth,
      ),
      context,
    ),
  };
  return { ...drawing, points };
}

/** A newly drawn line looks like the kind it is, from one shared source. */
const PLAIN_STYLE: PathStyle = {
  line: "solid",
  ending: "arrow",
  color: "ink",
};

const drawingLabels: Record<FieldDrawingKind, string> = {
  route: "Draw route",
  motion: "Draw motion",
  block: "Draw block",
  zone: "Draw zone drop",
  blitz: "Draw blitz path",
};

/**
 * The kind a tool draws from this man. Block on a defender is a blitz path —
 * solid red to an arrow — because a defender does not block; the rail's label
 * says the same thing (issue #65).
 */
export function drawingKindFor(
  tool: FieldDrawingKind,
  player: { readonly unit: Player["unit"] },
): FieldDrawingKind {
  return tool === "block" && player.unit === "defense" ? "blitz" : tool;
}

/** Abandons an in-progress route, leaving the committed Play untouched. */
export function clearDrawing(
  model: FieldInteractionModel,
): FieldInteractionModel {
  return { selection: model.selection, gesture: { kind: "idle" } };
}

export function startDrawing(
  kind: FieldDrawingKind,
  playerId: string,
  context: FieldInteractionContext,
  mode: FieldDrawingMode = "breaks",
): FieldInteractionModel | undefined {
  const player = context.document.players.find(({ id }) => id === playerId);
  if (!player) return undefined;
  return {
    selection: [],
    gesture: { kind: "idle" },
    drawing: {
      kind: drawingKindFor(kind, player),
      playerId,
      mode,
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
 * The line as it will be committed: clicked breaks exactly where they were
 * put, and each traced stroke fitted into a clean line from the break it
 * set out from. What was traced is the drawing's business, not the Play's.
 */
export function resolveDrawnPoints(
  drawing: Pick<FieldDrawingState, "points">,
  context: Pick<FieldInteractionContext, "screenScale">,
): PathPoint[] {
  const resolved: PathPoint[] = [];
  let stroke: FieldDrawingPoint[] = [];
  const fitStroke = (): void => {
    if (stroke.length === 0) return;
    resolved.push(
      ...fitFreehandStroke(resolved.at(-1)!, stroke, context.screenScale),
    );
    stroke = [];
  };
  for (const point of drawing.points) {
    if (point.traced && resolved.length > 0) {
      stroke.push(point);
      continue;
    }
    fitStroke();
    resolved.push({
      lateralYards: point.lateralYards,
      depthYards: point.depthYards,
      ...(point.control ? { control: point.control } : {}),
    });
  }
  fitStroke();
  return resolved;
}

/**
 * One finished route is one insert. Kind defaults are the original's, and a
 * second route on the same man arrives dotted as his alternate.
 */
export function buildDrawCommand(
  context: FieldInteractionContext,
  drawing: FieldDrawingState,
  pathId: string,
): PlayCommand | undefined {
  const points = resolveDrawnPoints(drawing, context).filter(
    (point, index, all) => {
      if (index === 0) return true;
      return (
        screenDistancePx(all[index - 1]!, point, context.screenScale) >=
        DRAW_POINT_MIN_PX
      );
    },
  );
  if (points.length < 2) return undefined;

  const sibling =
    drawing.kind === "route" &&
    context.document.paths.some(
      (path) => path.playerId === drawing.playerId && path.kind === "route",
    );
  const style = routeKindStyle(drawing.kind, PLAIN_STYLE);
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

/**
 * The finish: one insert for the line in hand, which then stands selected,
 * with the select tool handed back so it is the Coach's to adjust. A line
 * that never left its man commits nothing and is simply put down.
 */
export function finishDrawing(
  model: FieldInteractionModel,
  context: FieldInteractionContext,
): FieldInteractionResult {
  const drawing = model.drawing;
  if (!drawing) return { model };
  const createId = context.createId ?? ((prefix: string) => `${prefix}_new`);
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
