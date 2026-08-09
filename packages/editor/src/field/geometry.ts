import type { Coordinate, MovementPath, PathPoint } from "@chalk/domain";
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
 * The original clamps to the sidelines and the drawn frame's depth. Rounding
 * happens first and clamping last, because rounding a clamped value can carry
 * it back across the boundary it was just held inside.
 */
export function clampToField(
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
