import { fieldHitOptions } from "@chalk/editor";

/**
 * Presses inside this radius of the symbol move the man. The draw handle
 * lives outside it, so a grab on his body is still a move.
 */
export const ROUTE_DOT_BODY_RADIUS = 18;

/** How far a finger reaches for a man, in screen pixels: what selects him. */
const FINGER_REACH_PX = fieldHitOptions("touch").playerRadiusPx;

/**
 * The draw handle, in frame units, sized so it stays a finger target on a
 * phone and a precise one with a mouse. The visible dot sits just above the
 * symbol; the hit circle around it is what a thumb actually lands on. On a
 * phone it sits outside a finger's reach for the man, so a finger that lands
 * a little high on him still moves him.
 */
export function routeDotGeometry(
  zoom: number,
  precise: boolean,
): {
  readonly visualRadius: number;
  readonly hitRadius: number;
  readonly cy: number;
  /** A finger's reach for a man, in frame units at this zoom. */
  readonly fingerReach: number;
} {
  const scale = Number.isFinite(zoom) && zoom > 0.05 ? zoom : 1;
  const visualRadius = 7 / scale;
  const fingerReach = FINGER_REACH_PX / scale;
  return {
    visualRadius,
    hitRadius: (precise ? 14 : FINGER_REACH_PX) / scale,
    cy: precise
      ? -(20 + visualRadius)
      : -Math.max(20 + visualRadius, fingerReach + visualRadius),
    fingerReach,
  };
}

/**
 * Whether this press on the draw handle should start a route. The mark itself
 * always does, even when a defender is standing near it. A press on a man's
 * body does not — that selects or moves him. Anywhere else inside the touch
 * target is open grass and starts the route.
 *
 * A finger is judged by reach and nearness instead, given its reach in frame
 * units. Anywhere within reach of the man the handle belongs to is his: a
 * finger that lands a little high on him moves him. On a phone the men stand
 * closer together than a fingertip is wide, and the mark can be drawn over
 * whoever lines up just ahead of him — the center, when the quarterback is
 * picked. Mark first, that man could not be tapped until the quarterback was
 * let go. So under a finger a press is another man's when it is nearer his
 * centre than the mark's, and within his reach; otherwise it is the mark's.
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
  fingerReach?: number,
): boolean {
  const fromMark = Math.hypot(localX, localY - handle.cy);
  if (fingerReach !== undefined) {
    const reach = Math.max(ROUTE_DOT_BODY_RADIUS, fingerReach);
    if (Math.hypot(localX, localY) <= reach) return false;
    const self = players.find((candidate) => candidate.id === playerId);
    const men = self
      ? players.map(({ position }) => ({
          x: position.x - self.position.x,
          y: position.y - self.position.y,
        }))
      : [{ x: 0, y: 0 }];
    return !men.some((man) => {
      const fromMan = Math.hypot(localX - man.x, localY - man.y);
      return fromMan < reach && fromMan < fromMark;
    });
  }
  if (fromMark <= handle.visualRadius + 4) {
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
