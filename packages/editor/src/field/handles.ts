import {
  classifyZoneCoverage,
  legacyDepthSpanToYards,
  legacyLateralSpanToYards,
  type Coordinate,
  type MovementPath,
  type PathPoint,
  type PrimitivePlayCommand,
  type TextLabel,
} from "@chalk/domain";

import {
  snapPosition,
  snapRouteEndpoint,
  type AxisSnapGuide,
} from "../smart-snapping";
import { clampToField, coordinate, screenDistancePx } from "./geometry";
import type {
  FieldHandleRef,
  FieldInteractionContext,
  FieldMoveReadout,
} from "./model";

/**
 * The handles on a selected route or note. They are drawn by the shell at a
 * constant screen size (ADR 0016), so nothing here hit-tests pixels; the
 * shell names the handle that was pressed and these rules edit it.
 */

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
  origin: PathPoint,
): string {
  const point = points[pointIndex]!;
  const parts = [`${formatYardDistance(point.depthYards)} yds`];
  if (pointIndex > 0) {
    const lateral = Math.abs(point.lateralYards - origin.lateralYards);
    if (lateral >= 0.5) {
      const away = Math.abs(point.lateralYards) > Math.abs(origin.lateralYards);
      parts.push(`${formatYardDistance(lateral)} ${away ? "out" : "in"}`);
    }
  }
  return parts.join(" · ");
}

/**
 * A route has more than one line: the main one, and a branch for each choice
 * the Coach drew off it. Handles edit whichever line is selected, so these
 * read and write that line rather than assuming the main one.
 */
export function lineOf(
  path: MovementPath,
  branchIndex?: number,
): readonly PathPoint[] {
  if (branchIndex === undefined) return path.points;
  return path.branches[branchIndex]?.points ?? path.points;
}

function withLine(
  path: MovementPath,
  branchIndex: number | undefined,
  points: PathPoint[],
): MovementPath {
  if (branchIndex === undefined) return { ...path, points };
  return {
    ...path,
    branches: path.branches.map((branch, index) =>
      index === branchIndex ? { ...branch, points } : branch,
    ),
  };
}

/**
 * What a break is measured from. A branch's first break runs from the point
 * on the main line it was split off at, not from nothing.
 */
function predecessorOf(
  path: MovementPath,
  branchIndex: number | undefined,
  pointIndex: number,
): PathPoint | undefined {
  if (pointIndex > 0) return lineOf(path, branchIndex)[pointIndex - 1];
  if (branchIndex === undefined) return undefined;
  const fromIndex = path.branches[branchIndex]?.fromIndex;
  return fromIndex === undefined ? undefined : path.points[fromIndex];
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
  branchIndex: number | undefined,
  pointIndex: number,
  point: Coordinate,
  shiftKey: boolean | undefined,
): HandleEdit {
  const line = lineOf(path, branchIndex);
  const original = line[pointIndex];
  if (!original) return { update: updatePath(path), guides: [] };
  const previous = predecessorOf(path, branchIndex, pointIndex);
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
  const points = [...line];
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
    update: updatePath(withLine(path, branchIndex, points)),
    guides: snapped.guides,
    readout: {
      position: landed,
      text: nodeReadoutText(
        points,
        pointIndex,
        predecessorOf(path, branchIndex, 0) ?? points[0]!,
      ),
    },
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
  branchIndex: number | undefined,
  pointIndex: number,
  point: Coordinate,
): HandleEdit {
  const line = lineOf(path, branchIndex);
  const end = line[pointIndex];
  const start = predecessorOf(path, branchIndex, pointIndex);
  if (!end || !start) return { update: updatePath(path), guides: [] };
  const midpoint = coordinate(
    (start.lateralYards + end.lateralYards) / 2,
    (start.depthYards + end.depthYards) / 2,
  );
  const points = [...line];
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
  return {
    update: updatePath(withLine(path, branchIndex, points)),
    guides: [],
  };
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

export function editHandle(
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
      return dragNode(
        context,
        path,
        handle.branchIndex,
        handle.pointIndex,
        point,
        shiftKey,
      );
    case "control":
      return dragControl(
        context,
        path,
        handle.branchIndex,
        handle.pointIndex,
        point,
      );
    case "zone":
      return dragZone(path, point);
  }
}

export const handleLabels: Record<FieldHandleRef["kind"], string> = {
  leader: "Point the leader line",
  node: "Move route break",
  control: "Curve segment",
  zone: "Size zone",
};
