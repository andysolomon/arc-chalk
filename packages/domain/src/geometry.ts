import type { Coordinate, MovementPath, PlayDocument } from "./schema";

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

export function mirrorPlayGeometry(play: PlayDocument): PlayDocument {
  return {
    ...play,
    players: play.players.map((player) => ({
      ...player,
      position: mirrorCoordinate(player.position),
    })),
    paths: play.paths.map((path) => ({
      ...path,
      points: path.points.map((point) => ({
        ...mirrorCoordinate(point),
        ...(point.control ? { control: mirrorCoordinate(point.control) } : {}),
        ...(point.tick === undefined ? {} : { tick: point.tick }),
      })),
      branches: path.branches.map((branch) => ({
        ...branch,
        points: branch.points.map((point) => ({
          ...mirrorCoordinate(point),
          ...(point.control
            ? { control: mirrorCoordinate(point.control) }
            : {}),
          ...(point.tick === undefined ? {} : { tick: point.tick }),
        })),
      })),
    })),
    labels: play.labels.map((label) => ({
      ...label,
      position: mirrorCoordinate(label.position),
    })),
  };
}

export function distance(left: Coordinate, right: Coordinate): number {
  return Math.hypot(
    right.lateralYards - left.lateralYards,
    right.depthYards - left.depthYards,
  );
}

export function pathLength(path: Pick<MovementPath, "points">): number {
  return path.points
    .slice(1)
    .reduce(
      (total, point, index) => total + distance(path.points[index]!, point),
      0,
    );
}

export function pointAtDistance(
  path: Pick<MovementPath, "points">,
  requestedDistance: number,
): Coordinate {
  const first = path.points[0];
  if (!first) throw new Error("A movement path needs at least one point.");
  if (requestedDistance <= 0)
    return { lateralYards: first.lateralYards, depthYards: first.depthYards };

  let remaining = requestedDistance;
  for (let index = 1; index < path.points.length; index += 1) {
    const start = path.points[index - 1]!;
    const end = path.points[index]!;
    const segmentLength = distance(start, end);
    if (remaining <= segmentLength || index === path.points.length - 1) {
      const ratio =
        segmentLength === 0 ? 0 : Math.min(1, remaining / segmentLength);
      return {
        lateralYards:
          start.lateralYards + (end.lateralYards - start.lateralYards) * ratio,
        depthYards:
          start.depthYards + (end.depthYards - start.depthYards) * ratio,
      };
    }
    remaining -= segmentLength;
  }

  const last = path.points.at(-1)!;
  return { lateralYards: last.lateralYards, depthYards: last.depthYards };
}
