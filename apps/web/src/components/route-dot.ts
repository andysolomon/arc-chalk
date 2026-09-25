import { fieldHitOptions } from "@chalk/editor";

function frameScale(zoom: number): number {
  return Number.isFinite(zoom) && zoom > 0.05 ? zoom : 1;
}

/**
 * How far from his center a press still takes hold of a man, in frame units:
 * the reach the field gives him, measured at the same zoom, so the draw
 * handle never takes a press the field would have given to the man.
 */
export function routeDotBodyRadius(zoom: number, pointerType?: string): number {
  return fieldHitOptions(pointerType).playerRadiusPx / frameScale(zoom);
}

/**
 * The draw handle, in frame units, sized so it stays a finger target on a
 * phone and a precise one with a mouse. The visible dot sits above the symbol
 * and outside the man's own reach, so a finger on him moves him; the hit
 * circle around it is what a thumb actually lands on.
 */
export function routeDotGeometry(
  zoom: number,
  precise: boolean,
): {
  readonly visualRadius: number;
  readonly hitRadius: number;
  readonly cy: number;
} {
  const scale = frameScale(zoom);
  const visualRadius = 7 / scale;
  const bodyRadius = routeDotBodyRadius(zoom, precise ? "mouse" : "touch");
  return {
    visualRadius,
    hitRadius: (precise ? 14 : 22) / scale,
    cy: -Math.max(20 + visualRadius, bodyRadius + visualRadius),
  };
}

/**
 * Whether this press on the draw handle should start a route. A press within
 * the man's own reach never does — a finger that lands a little high on him
 * still moves him. The mark itself does, even when a defender is standing
 * near it. A press within another man's reach is his to select or move.
 * Anywhere else inside the touch target is open grass and starts the route.
 */
export function routeDotPressStartsRoute(
  localX: number,
  localY: number,
  handle: {
    readonly cy: number;
    readonly visualRadius: number;
    /** A man's reach, in the same frame units as the press. */
    readonly bodyRadius: number;
  },
  playerId: string,
  players: readonly {
    readonly id: string;
    readonly position: { readonly x: number; readonly y: number };
  }[],
): boolean {
  if (Math.hypot(localX, localY) <= handle.bodyRadius) return false;
  if (Math.hypot(localX, localY - handle.cy) <= handle.visualRadius + 4) {
    return true;
  }
  const self = players.find((candidate) => candidate.id === playerId);
  if (!self) return true;
  for (const other of players) {
    if (other.id === playerId) continue;
    const dx = localX - (other.position.x - self.position.x);
    const dy = localY - (other.position.y - self.position.y);
    if (Math.hypot(dx, dy) <= handle.bodyRadius) return false;
  }
  return true;
}
