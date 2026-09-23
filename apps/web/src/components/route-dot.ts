/**
 * Presses inside this radius of the symbol move the man. The draw handle
 * lives outside it, so a grab on his body is still a move.
 */
export const ROUTE_DOT_BODY_RADIUS = 18;

/**
 * The draw handle, in frame units, sized so it stays a finger target on a
 * phone and a precise one with a mouse. The visible dot sits just above the
 * symbol; the hit circle around it is what a thumb actually lands on.
 */
export function routeDotGeometry(
  zoom: number,
  precise: boolean,
): {
  readonly visualRadius: number;
  readonly hitRadius: number;
  readonly cy: number;
} {
  const scale = Number.isFinite(zoom) && zoom > 0.05 ? zoom : 1;
  const visualRadius = 7 / scale;
  return {
    visualRadius,
    hitRadius: (precise ? 14 : 22) / scale,
    cy: -(20 + visualRadius),
  };
}

/**
 * Whether this press on the draw handle should start a route. The mark itself
 * always does, even when a defender is standing near it. A press on a man's
 * body does not — that selects or moves him. Anywhere else inside the touch
 * target is open grass and starts the route.
 */
export function routeDotPressStartsRoute(
  localX: number,
  localY: number,
  handle: { readonly cy: number; readonly visualRadius: number },
  playerId: string,
  players: readonly {
    readonly id: string;
    readonly position: { readonly x: number; readonly y: number };
  }[],
): boolean {
  if (Math.hypot(localX, localY - handle.cy) <= handle.visualRadius + 4) {
    return true;
  }
  if (Math.hypot(localX, localY) < ROUTE_DOT_BODY_RADIUS) return false;
  const self = players.find((candidate) => candidate.id === playerId);
  if (!self) return true;
  for (const other of players) {
    if (other.id === playerId) continue;
    const dx = localX - (other.position.x - self.position.x);
    const dy = localY - (other.position.y - self.position.y);
    if (Math.hypot(dx, dy) < ROUTE_DOT_BODY_RADIUS) return false;
  }
  return true;
}
