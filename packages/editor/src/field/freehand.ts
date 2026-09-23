import type { Coordinate, PathPoint } from "@chalk/domain";

import type { SnapScreenScale } from "../smart-snapping";
import { coordinate } from "./geometry";

/**
 * Fitting a traced line. A hand on a whiteboard leaves jitter the Coach
 * never meant; the finish keeps the shape he drew and drops the tremor: the
 * stroke is thinned to the points that carry its shape, then a smooth curve
 * is run through the gentle bends while every real cut stays a sharp break.
 */

/** How far a traced point may sit from the fitted line before it matters. */
export const FREEHAND_TOLERANCE_PX = 2.5;

/** A turn sharper than this is a cut the Coach meant; gentler is a bend. */
export const FREEHAND_CORNER_DEGREES = 40;

interface Pixel {
  readonly x: number;
  readonly y: number;
}

function toPixels(point: Coordinate, scale: SnapScreenScale): Pixel {
  return {
    x: point.lateralYards * scale.lateralPixelsPerYard,
    y: point.depthYards * scale.depthPixelsPerYard,
  };
}

/** Perpendicular distance from a point to a segment, in pixels. */
function distanceToSegment(point: Pixel, start: Pixel, end: Pixel): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0)
    return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/**
 * Ramer–Douglas–Peucker: keeps the first and last points and every point
 * that strays from the line through its neighbours by more than the
 * tolerance, measured on screen so a tremor is a tremor at any zoom.
 */
export function simplifyStroke(
  points: readonly Coordinate[],
  scale: SnapScreenScale,
  tolerancePx: number = FREEHAND_TOLERANCE_PX,
): Coordinate[] {
  if (points.length <= 2) return [...points];
  const pixels = points.map((point) => toPixels(point, scale));
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const ranges: [number, number][] = [[0, points.length - 1]];
  while (ranges.length > 0) {
    const [first, last] = ranges.pop()!;
    let farthest = -1;
    let farthestDistance = 0;
    for (let index = first + 1; index < last; index += 1) {
      const distance = distanceToSegment(
        pixels[index]!,
        pixels[first]!,
        pixels[last]!,
      );
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = index;
      }
    }
    if (farthest === -1 || farthestDistance <= tolerancePx) continue;
    keep[farthest] = true;
    ranges.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, index) => keep[index]);
}

/** How far the line turns at a vertex, in degrees: 0 is straight on. */
export function turnDegrees(
  before: Coordinate,
  at: Coordinate,
  after: Coordinate,
  scale: SnapScreenScale,
): number {
  const from = toPixels(before, scale);
  const here = toPixels(at, scale);
  const to = toPixels(after, scale);
  const incoming = Math.atan2(here.y - from.y, here.x - from.x);
  const outgoing = Math.atan2(to.y - here.y, to.x - here.x);
  let turn = Math.abs(outgoing - incoming);
  if (turn > Math.PI) turn = 2 * Math.PI - turn;
  return (turn * 180) / Math.PI;
}

function midpoint(left: Coordinate, right: Coordinate): Coordinate {
  return coordinate(
    (left.lateralYards + right.lateralYards) / 2,
    (left.depthYards + right.depthYards) / 2,
  );
}

function plain(point: Coordinate): PathPoint {
  return coordinate(point.lateralYards, point.depthYards);
}

/**
 * Runs a smooth curve through the thinned stroke. Between one anchor and the
 * next — the ends, and every corner sharp enough to be a cut — the vertices
 * become the controls of quadratic segments that meet at their midpoints, so
 * the line bends where the hand bent and breaks where it cut. Returns the
 * points after the first, ready to follow whatever came before the stroke.
 */
export function smoothStroke(
  vertices: readonly Coordinate[],
  scale: SnapScreenScale,
  cornerDegrees: number = FREEHAND_CORNER_DEGREES,
): PathPoint[] {
  if (vertices.length < 2) return [];
  const anchors = [0];
  for (let index = 1; index < vertices.length - 1; index += 1) {
    if (
      turnDegrees(
        vertices[index - 1]!,
        vertices[index]!,
        vertices[index + 1]!,
        scale,
      ) >= cornerDegrees
    ) {
      anchors.push(index);
    }
  }
  anchors.push(vertices.length - 1);

  const fitted: PathPoint[] = [];
  for (let run = 0; run < anchors.length - 1; run += 1) {
    const from = anchors[run]!;
    const to = anchors[run + 1]!;
    const interior = to - from - 1;
    if (interior === 0) {
      fitted.push(plain(vertices[to]!));
      continue;
    }
    if (interior === 1) {
      fitted.push({
        ...plain(vertices[to]!),
        control: plain(vertices[from + 1]!),
      });
      continue;
    }
    for (let index = from + 1; index < to - 1; index += 1) {
      fitted.push({
        ...midpoint(vertices[index]!, vertices[index + 1]!),
        control: plain(vertices[index]!),
      });
    }
    fitted.push({ ...plain(vertices[to]!), control: plain(vertices[to - 1]!) });
  }
  return fitted;
}

/**
 * The points a traced stroke adds after its anchor — the break or stance it
 * set out from. The anchor itself is left where it is.
 */
export function fitFreehandStroke(
  anchor: Coordinate,
  traced: readonly Coordinate[],
  scale: SnapScreenScale,
): PathPoint[] {
  if (traced.length === 0) return [];
  return smoothStroke(simplifyStroke([anchor, ...traced], scale), scale);
}
