import type {
  Coordinate,
  MovementPath,
  PathPoint,
  PlayDocument,
} from "./schema";

/**
 * The original's canvas is deliberately anisotropic: it draws a full 53 1/3
 * yard field across a 976 pixel span while showing depth at 12 pixels per
 * yard, so roughly 50 yards of depth fit in a readable frame. Reading a
 * lateral pixel span with the depth scale — the two are 1.525 apart —
 * overstates every crossfield distance, which is exactly the defect recorded
 * against the prototype as finding #3.
 */
export const LEGACY_FIELD_GEOMETRY = Object.freeze({
  /** 976 pixels spanning the 160-foot field width. */
  lateralPixelsPerYard: 976 / (160 / 3),
  depthPixelsPerYard: 12,
  lineOfScrimmageY: 430,
  midfieldX: 500,
  viewWidth: 1000,
  viewHeight: 620,
});

/** Converts a lateral pixel span — a width or radius, not a position. */
export function legacyLateralSpanToYards(pixels: number): number {
  return pixels / LEGACY_FIELD_GEOMETRY.lateralPixelsPerYard;
}

/** Converts a depth pixel span — a height or radius, not a position. */
export function legacyDepthSpanToYards(pixels: number): number {
  return pixels / LEGACY_FIELD_GEOMETRY.depthPixelsPerYard;
}

export function legacyCanvasToYards(point: {
  x: number;
  y: number;
}): Coordinate {
  return {
    lateralYards: legacyLateralSpanToYards(
      point.x - LEGACY_FIELD_GEOMETRY.midfieldX,
    ),
    depthYards: legacyDepthSpanToYards(
      LEGACY_FIELD_GEOMETRY.lineOfScrimmageY - point.y,
    ),
  };
}

export function yardsToLegacyCanvas(point: Coordinate): {
  x: number;
  y: number;
} {
  return {
    x:
      LEGACY_FIELD_GEOMETRY.midfieldX +
      point.lateralYards * LEGACY_FIELD_GEOMETRY.lateralPixelsPerYard,
    y:
      LEGACY_FIELD_GEOMETRY.lineOfScrimmageY -
      point.depthYards * LEGACY_FIELD_GEOMETRY.depthPixelsPerYard,
  };
}

export type ZoneCoverageType = "deep" | "curl" | "hook" | "flat" | "spy";

/**
 * Where a defender's drop ends tells you the level of his coverage. The
 * thresholds are the original's, read on the correct axis: its 70, 88, and
 * 210 canvas pixels are lateral spans, so they convert at the lateral scale.
 */
const DEEP_RADIUS_YARDS = legacyLateralSpanToYards(88);
const SPY_LATERAL_YARDS = legacyLateralSpanToYards(70);
const FLAT_LATERAL_YARDS = legacyLateralSpanToYards(210);

export function classifyZoneCoverage(
  endpoint: Coordinate,
  radiusLateralYards = 0,
): ZoneCoverageType {
  const lateral = Math.abs(endpoint.lateralYards);
  if (radiusLateralYards >= DEEP_RADIUS_YARDS || endpoint.depthYards >= 13) {
    return "deep";
  }
  if (endpoint.depthYards <= 2 && lateral <= SPY_LATERAL_YARDS) return "spy";
  if (lateral >= FLAT_LATERAL_YARDS) return "flat";
  return endpoint.depthYards >= 8 ? "curl" : "hook";
}

/**
 * A zone drop that has never been sized still owns an area: the original
 * draws an 11-pixel bubble at the drop's end until the Coach drags it out.
 */
export const DEFAULT_ZONE_COVERAGE_RADII = Object.freeze({
  radiusLateralYards: legacyLateralSpanToYards(11),
  radiusDepthYards: legacyDepthSpanToYards(11),
});

export function mirrorCoordinate(point: Coordinate): Coordinate {
  return { lateralYards: -point.lateralYards, depthYards: point.depthYards };
}

function mirrorPathPoint(point: PathPoint): PathPoint {
  return {
    ...point,
    ...mirrorCoordinate(point),
    ...(point.control ? { control: mirrorCoordinate(point.control) } : {}),
  };
}

export function mirrorPlayGeometry(play: PlayDocument): PlayDocument {
  return {
    ...play,
    players: play.players.map((player) => ({
      ...player,
      position: mirrorCoordinate(player.position),
    })),
    paths: play.paths.map((path) => ({
      ...path,
      points: path.points.map(mirrorPathPoint),
      branches: path.branches.map((branch) => ({
        ...branch,
        points: branch.points.map(mirrorPathPoint),
      })),
    })),
    labels: play.labels.map((label) => ({
      ...label,
      position: mirrorCoordinate(label.position),
      ...(label.leader
        ? {
            leader: {
              ...label.leader,
              endpoint: mirrorCoordinate(label.leader.endpoint),
            },
          }
        : {}),
      ...(label.binding
        ? {
            binding: {
              ...label.binding,
              offset: mirrorCoordinate(label.binding.offset),
            },
          }
        : {}),
    })),
  };
}

export function distance(left: Coordinate, right: Coordinate): number {
  return Math.hypot(
    right.lateralYards - left.lateralYards,
    right.depthYards - left.depthYards,
  );
}

export interface PathGeometry {
  readonly points: readonly Coordinate[];
  readonly cumulativeYards: readonly number[];
  readonly lengthYards: number;
}

const CURVE_SAMPLE_YARDS = 0.5;
const MIN_CURVE_SAMPLES = 8;
const MAX_CURVE_SAMPLES = 256;

function quadraticPoint(
  start: Coordinate,
  control: Coordinate,
  end: Coordinate,
  progress: number,
): Coordinate {
  const remaining = 1 - progress;
  return {
    lateralYards:
      remaining * remaining * start.lateralYards +
      2 * remaining * progress * control.lateralYards +
      progress * progress * end.lateralYards,
    depthYards:
      remaining * remaining * start.depthYards +
      2 * remaining * progress * control.depthYards +
      progress * progress * end.depthYards,
  };
}

export function buildPathGeometry(
  path: Pick<MovementPath, "points">,
): PathGeometry {
  const first = path.points[0];
  if (!first) throw new Error("A movement path needs at least one point.");

  const points: Coordinate[] = [];
  const cumulativeYards: number[] = [];
  const push = (point: Coordinate) => {
    const previous = points.at(-1);
    const cumulative = cumulativeYards.at(-1) ?? 0;
    points.push({
      lateralYards: point.lateralYards,
      depthYards: point.depthYards,
    });
    cumulativeYards.push(
      previous === undefined ? 0 : cumulative + distance(previous, point),
    );
  };

  push(first);
  for (let index = 1; index < path.points.length; index += 1) {
    const start = path.points[index - 1]!;
    const end = path.points[index]!;
    if (!end.control) {
      push(end);
      continue;
    }

    const controlPolygonLength =
      distance(start, end.control) + distance(end.control, end);
    const samples = Math.min(
      MAX_CURVE_SAMPLES,
      Math.max(
        MIN_CURVE_SAMPLES,
        Math.round(controlPolygonLength / CURVE_SAMPLE_YARDS),
      ),
    );
    for (let sample = 1; sample <= samples; sample += 1) {
      push(quadraticPoint(start, end.control, end, sample / samples));
    }
  }

  return {
    points,
    cumulativeYards,
    lengthYards: cumulativeYards.at(-1) ?? 0,
  };
}

export function pathLength(path: Pick<MovementPath, "points">): number {
  return buildPathGeometry(path).lengthYards;
}

export function pointAtDistance(
  path: Pick<MovementPath, "points">,
  requestedDistance: number,
): Coordinate {
  return pointAtGeometryDistance(buildPathGeometry(path), requestedDistance);
}

export function pointAtGeometryDistance(
  geometry: PathGeometry,
  requestedDistance: number,
): Coordinate {
  const first = geometry.points[0]!;
  const last = geometry.points.at(-1)!;
  if (requestedDistance <= 0) return first;
  if (requestedDistance >= geometry.lengthYards) return last;

  let low = 0;
  let high = geometry.points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (geometry.cumulativeYards[middle]! <= requestedDistance) low = middle;
    else high = middle;
  }

  const start = geometry.points[low]!;
  const end = geometry.points[high]!;
  const span = geometry.cumulativeYards[high]! - geometry.cumulativeYards[low]!;
  const ratio =
    span === 0
      ? 0
      : (requestedDistance - geometry.cumulativeYards[low]!) / span;
  return {
    lateralYards:
      start.lateralYards + (end.lateralYards - start.lateralYards) * ratio,
    depthYards: start.depthYards + (end.depthYards - start.depthYards) * ratio,
  };
}
