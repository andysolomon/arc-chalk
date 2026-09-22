import {
  DEFAULT_ZONE_COVERAGE_RADII,
  type Coordinate,
  type MovementPath,
  type PathPoint,
} from "@chalk/domain";
import type { RenderScene } from "@chalk/render";

import type { SnapScreenScale } from "../smart-snapping";
import type { FieldInteractionContext, FieldItemRef } from "./model";

/**
 * Yard-space measurement and hit testing. The shell converts client pixels
 * through the SVG projection before anything here sees them, so a Player is
 * hit at the same place whatever pointed at him.
 */

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

export function rounded(value: number): number {
  const result = Number(value.toFixed(PRECISION_DIGITS));
  return Object.is(result, -0) ? 0 : result;
}

export function coordinate(
  lateralYards: number,
  depthYards: number,
): Coordinate {
  return {
    lateralYards: rounded(lateralYards),
    depthYards: rounded(depthYards),
  };
}

export function screenDistancePx(
  from: Coordinate,
  to: Coordinate,
  scale: SnapScreenScale,
): number {
  return Math.hypot(
    (to.lateralYards - from.lateralYards) * scale.lateralPixelsPerYard,
    (to.depthYards - from.depthYards) * scale.depthPixelsPerYard,
  );
}

export function sameItem(left: FieldItemRef, right: FieldItemRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

export function isSelected(
  selection: readonly FieldItemRef[],
  item: FieldItemRef,
): boolean {
  return selection.some((candidate) => sameItem(candidate, item));
}
// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

export function pathSegmentPoints(
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

export function distanceToSegmentPx(
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

/**
 * How near a point falls to a route, and to which line of it: the main one,
 * or the branch a Coach split off. A route is one selectable thing, but its
 * branches are separately editable, so the hit has to say which was meant.
 */
function nearestLineOfPath(
  path: RenderScene["paths"][number],
  point: Coordinate,
  scale: SnapScreenScale,
): { readonly distancePx: number; readonly branchIndex?: number } {
  let nearest = Number.POSITIVE_INFINITY;
  let nearestBranch: number | undefined;
  let walking: number | undefined;
  const walk = (start: Coordinate, points: readonly PathPoint[]): void => {
    let previous = start;
    for (const next of points) {
      const samples = pathSegmentPoints(previous, next);
      for (let index = 1; index < samples.length; index += 1) {
        const distancePx = distanceToSegmentPx(
          point,
          samples[index - 1]!,
          samples[index]!,
          scale,
        );
        if (distancePx < nearest) {
          nearest = distancePx;
          nearestBranch = walking;
        }
      }
      previous = next;
    }
  };
  const [first, ...rest] = path.points;
  if (!first) return { distancePx: nearest };
  walk(first, rest);
  path.branches.forEach((branch, index) => {
    const from = path.points[branch.fromIndex];
    if (!from) return;
    walking = index;
    walk(from, branch.points);
  });
  return {
    distancePx: nearest,
    ...(nearestBranch === undefined ? {} : { branchIndex: nearestBranch }),
  };
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
 * What a pointer landed on. A route also reports which of its lines was
 * meant, because the whole route is what gets selected but only one line of
 * it is what gets edited.
 */
export interface FieldHit {
  readonly item: FieldItemRef;
  readonly branchIndex?: number;
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
): FieldHit | undefined {
  for (const player of [...scene.players].reverse()) {
    if (
      screenDistancePx(player.position, point, scale) <= options.playerRadiusPx
    ) {
      return { item: { kind: "player", id: player.id } };
    }
  }
  for (const label of [...scene.labels].reverse()) {
    if (labelHit(label, point, scale, options.labelPaddingPx)) {
      return { item: { kind: "label", id: label.id } };
    }
  }
  for (const path of [...scene.paths].reverse()) {
    const line = nearestLineOfPath(path, point, scale);
    if (line.distancePx <= options.pathTolerancePx) {
      return {
        item: { kind: "path", id: path.id },
        ...(line.branchIndex === undefined
          ? {}
          : { branchIndex: line.branchIndex }),
      };
    }
  }
  return undefined;
}

/**
 * Marquee containment, exactly as the original counted it: Players by their
 * center, routes by any main-line point, labels by their drawn anchor.
 */
export function marqueeHits(
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
// Drawing
// ---------------------------------------------------------------------------

/**
 * What holds a thing on the field: the sidelines, which the Play's own Field
 * Profile sets, and the drawn frame's depth, which only the shell knows.
 */
export type FieldBounds = Pick<
  FieldInteractionContext,
  "document" | "depthWindow"
>;

/**
 * The original clamps to the sidelines and the drawn frame's depth. Rounding
 * happens first and clamping last, because rounding a clamped value can carry
 * it back across the boundary it was just held inside.
 */
export function clampToField(
  point: Coordinate,
  bounds: FieldBounds,
  /** Room to keep from each edge: what a bubble around the point needs. */
  inset: { readonly lateralYards: number; readonly depthYards: number } = {
    lateralYards: 0,
    depthYards: 0,
  },
): Coordinate {
  const halfWidth = bounds.document.fieldProfile.widthYards / 2;
  const depthWindow = bounds.depthWindow;
  const rough = coordinate(point.lateralYards, point.depthYards);
  // An inset wider than the field itself leaves only the middle to stand on.
  const lateralReach = Math.max(0, halfWidth - inset.lateralYards);
  const lateralYards = Math.max(
    -lateralReach,
    Math.min(lateralReach, rough.lateralYards),
  );
  if (!depthWindow) return { lateralYards, depthYards: rough.depthYards };
  const middle = (depthWindow.minDepthYards + depthWindow.maxDepthYards) / 2;
  const floor = Math.min(depthWindow.minDepthYards + inset.depthYards, middle);
  const ceiling = Math.max(
    depthWindow.maxDepthYards - inset.depthYards,
    middle,
  );
  return {
    lateralYards,
    depthYards: Math.max(floor, Math.min(ceiling, rough.depthYards)),
  };
}

/**
 * The bubble a zone drop draws around its end, if it draws one: the area the
 * Coach sized, or the default one drawn until he does. Anything holding the
 * drop on the field has to hold the bubble too, since that is what he sees.
 */
export function zoneBubbleOf(
  path: Pick<MovementPath, "kind" | "style" | "coverageArea">,
): { readonly lateralYards: number; readonly depthYards: number } | undefined {
  if (path.kind !== "zone" || path.style.ending !== "bubble") return undefined;
  const area = path.coverageArea ?? DEFAULT_ZONE_COVERAGE_RADII;
  return {
    lateralYards: area.radiusLateralYards,
    depthYards: area.radiusDepthYards,
  };
}

/**
 * Every point that says where a line is: its breaks and bends on every one
 * of its lines, and the four edges of the bubble a zone drop draws.
 */
export function pathExtentPoints(
  path: Pick<
    MovementPath,
    "kind" | "style" | "coverageArea" | "points" | "branches"
  >,
): Coordinate[] {
  const points: Coordinate[] = [];
  for (const line of [path.points, ...path.branches.map((b) => b.points)]) {
    for (const point of line) {
      points.push(point);
      if (point.control) points.push(point.control);
    }
  }
  const bubble = zoneBubbleOf(path);
  const center = path.points.at(-1);
  if (bubble && center) {
    const { lateralYards, depthYards } = center;
    points.push(
      { lateralYards: lateralYards - bubble.lateralYards, depthYards },
      { lateralYards: lateralYards + bubble.lateralYards, depthYards },
      { lateralYards, depthYards: depthYards - bubble.depthYards },
      { lateralYards, depthYards: depthYards + bubble.depthYards },
    );
  }
  return points;
}

/**
 * How far a set of points may shift on one axis before its outermost one
 * crosses an edge. Something already past an edge is only ever brought back:
 * the shift toward the field stays open and the one further out is closed.
 * A set wider than the field itself may slide until one edge is on its line.
 */
function heldShift(
  shift: number,
  values: readonly number[],
  min: number,
  max: number,
): number {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const floor = min - low;
  const ceiling = max - high;
  return Math.max(
    Math.min(floor, ceiling),
    Math.min(Math.max(floor, ceiling), shift),
  );
}

/**
 * Holds a move so that nothing it carries leaves the field. Everything that
 * moves together — a man, his routes, the notes with him — is measured as
 * one, and the shift is cut back on each axis where the outermost point
 * would cross a sideline or the edge of the drawn frame. That is what keeps a
 * route on the paint when its man is dragged toward the sideline: he stops
 * where the far end of his route touches it.
 */
export function clampTranslationToField(
  points: readonly Coordinate[],
  translation: Coordinate,
  bounds: FieldBounds,
): Coordinate {
  const rough = coordinate(translation.lateralYards, translation.depthYards);
  if (points.length === 0) return rough;
  const halfWidth = bounds.document.fieldProfile.widthYards / 2;
  const depthWindow = bounds.depthWindow;
  return {
    lateralYards: heldShift(
      rough.lateralYards,
      points.map(({ lateralYards }) => lateralYards),
      -halfWidth,
      halfWidth,
    ),
    depthYards: depthWindow
      ? heldShift(
          rough.depthYards,
          points.map(({ depthYards }) => depthYards),
          depthWindow.minDepthYards,
          depthWindow.maxDepthYards,
        )
      : rough.depthYards,
  };
}
