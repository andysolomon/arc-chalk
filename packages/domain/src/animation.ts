import { buildPathGeometry, pointAtGeometryDistance } from "./geometry";
import type { Coordinate, MovementPath } from "./schema";

export interface MovementFrame {
  readonly atMs: number;
  readonly phase: "waiting" | "moving" | "holding" | "complete";
  readonly progress: number;
  readonly position: Coordinate;
  readonly durationMs: number;
}

function durationForLength(
  path: MovementPath,
  lengthYards: number,
  baseSpeedYardsPerSecond: number,
): number {
  if (path.timing?.durationMs !== undefined) return path.timing.durationMs;
  const speed = baseSpeedYardsPerSecond * (path.timing?.speedMultiplier ?? 1);
  return Math.max(1, Math.round((lengthYards / speed) * 1000));
}

export function movementDurationMs(
  path: MovementPath,
  baseSpeedYardsPerSecond = 8,
): number {
  return durationForLength(
    path,
    buildPathGeometry(path).lengthYards,
    baseSpeedYardsPerSecond,
  );
}

export function evaluateMovement(
  path: MovementPath,
  atMs: number,
  baseSpeedYardsPerSecond = 8,
): MovementFrame {
  if (!Number.isInteger(atMs))
    throw new TypeError("Animation time must use integer milliseconds.");
  const delayMs = path.timing?.delayMs ?? 0;
  const holdMs = path.timing?.holdMs ?? 0;
  const geometry = buildPathGeometry(path);
  const durationMs = durationForLength(
    path,
    geometry.lengthYards,
    baseSpeedYardsPerSecond,
  );
  const movingMs = Math.max(0, Math.min(durationMs, atMs - delayMs));
  const progress = movingMs / durationMs;
  const position = pointAtGeometryDistance(
    geometry,
    geometry.lengthYards * progress,
  );
  const endMs = delayMs + durationMs;
  const phase =
    atMs < delayMs
      ? "waiting"
      : atMs < endMs
        ? "moving"
        : atMs < endMs + holdMs
          ? "holding"
          : "complete";

  return { atMs, phase, progress, position, durationMs };
}
