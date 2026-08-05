import type {
  Coordinate,
  MovementPath,
  PathPoint,
  PlayDocument,
} from "./schema";

export const LEGACY_FIELD_GEOMETRY = Object.freeze({
  pixelsPerYard: 12,
  lineOfScrimmageY: 430,
  midfieldX: 500,
  viewWidth: 1000,
  viewHeight: 620,
});

export function legacyCanvasToYards(point: {
  x: number;
  y: number;
}): Coordinate {
  return {
    lateralYards:
      (point.x - LEGACY_FIELD_GEOMETRY.midfieldX) /
      LEGACY_FIELD_GEOMETRY.pixelsPerYard,
    depthYards:
      (LEGACY_FIELD_GEOMETRY.lineOfScrimmageY - point.y) /
      LEGACY_FIELD_GEOMETRY.pixelsPerYard,
  };
}

export function yardsToLegacyCanvas(point: Coordinate): {
  x: number;
  y: number;
} {
  return {
    x:
      LEGACY_FIELD_GEOMETRY.midfieldX +
      point.lateralYards * LEGACY_FIELD_GEOMETRY.pixelsPerYard,
    y:
      LEGACY_FIELD_GEOMETRY.lineOfScrimmageY -
      point.depthYards * LEGACY_FIELD_GEOMETRY.pixelsPerYard,
  };
}

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
