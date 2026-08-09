import type { Coordinate, PathStyle, PlayCommand } from "@chalk/domain";

import { snapRouteEndpoint } from "../smart-snapping";
import { clampToField, coordinate, screenDistancePx } from "./geometry";
import {
  DRAW_POINT_MIN_PX,
  type FieldDrawingKind,
  type FieldDrawingState,
  type FieldInteractionContext,
  type FieldInteractionModel,
  type FieldPointerInput,
} from "./model";

/**
 * Drawing a route: where the next break would land, how a held pointer bends
 * the segment behind it, and the one insert a finished route commits.
 */

export /**
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
 * Holding the pointer after placing a break and pulling away bends the
 * segment through the pointer: the control point is the pointer's reflection
 * across the chord's midpoint, so the curve passes under the Coach's finger.
 */
export function bendLastSegment(
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
export function clearDrawing(
  model: FieldInteractionModel,
): FieldInteractionModel {
  return { selection: model.selection, gesture: { kind: "idle" } };
}

export function startDrawing(
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
export function buildDrawCommand(
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
