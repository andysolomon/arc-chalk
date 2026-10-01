import { isLineman } from "./classifications";
import {
  buildPathGeometry,
  LEGACY_FIELD_GEOMETRY,
  distance,
  legacyDepthSpanToYards,
  pointAtGeometryDistance,
  type PathGeometry,
} from "./geometry";
import { isManLine } from "./man-coverage";
import type { Coordinate, MovementPath, PlayDocument, Player } from "./schema";

/** One beat of the cadence. Delay in the inspector is counted in these. */
export const ANIMATION_BEAT_MS = 400;

/** Breath between the end of pre-snap motion and the snap. */
export const MOTION_GAP_MS = 250;

/** Grass yards a receiver covers in one second at speed 1×. */
export const BASE_SPEED_YARDS_PER_SECOND = 8;

/** Shortest a line is allowed to take, so a tap of the ball still reads. */
export const MIN_DURATION_MS = 120;

/** A Play with routes always holds the snap picture this long. */
export const POST_SNAP_FLOOR_MS = 800;

/** How far apart frames are in the numbered PNG sequence. */
export const FRAME_SEQUENCE_STEP_MS = 200;

/** The original caps the sequence so a long Play does not dump a hundred files. */
export const FRAME_SEQUENCE_MAX_FRAMES = 40;

/** Ghosted routes sit at this opacity so the still frame still reads as a diagram. */
export const GHOST_TRAIL_OPACITY = 0.18;

/**
 * A hitch sits down: the last stretch is short and turns back toward the
 * line. 52 original canvas pixels on the depth scale, read in yards so a
 * crossfield sit-down is not overstated.
 */
const HITCH_LENGTH_YARDS = legacyDepthSpanToYards(52);
const HITCH_TOWARD_LOS_YARDS = legacyDepthSpanToYards(4);

/**
 * Out of the backfield: more than 34 original canvas pixels behind the LOS
 * costs him a beat of footwork.
 */
const BACKFIELD_DELAY_YARDS = legacyDepthSpanToYards(34);

/**
 * Close the gap from where motion left him to where his next line starts
 * when the two are more than this far apart.
 */
const MOTION_CLOSE_YARDS = legacyDepthSpanToYards(12);

/**
 * Men are drawn 13 frame pixels in radius, so two touch at 26; a man going
 * round another before the snap leaves a little grass between them. Worked
 * in frame pixels because the field is not drawn to the same scale across
 * and down (geometry.ts), and it is the drawn men that must not overlap.
 */
const CLEARANCE_PX = 30;

/**
 * How far along his line either side of a man the way round starts to bend,
 * in multiples of how far it bends. Any narrower and the bend cuts into the
 * man it is going round.
 */
const DETOUR_REACH = 2.5;

/** The way round is bent through points this close together. */
const DETOUR_STEP_PX = 4;

export interface MovementFrame {
  readonly atMs: number;
  readonly phase: "waiting" | "moving" | "holding" | "complete";
  readonly progress: number;
  readonly position: Coordinate;
  readonly durationMs: number;
}

export interface ResolvedPathTiming {
  readonly delayMs: number;
  readonly holdMs: number;
  readonly speedMultiplier: number;
  readonly durationMs: number;
  readonly delayBeats: number;
  readonly holdSeconds: number;
}

export interface PlannedMovement {
  readonly path: MovementPath;
  readonly playerId: string;
  readonly kind: MovementPath["kind"];
  readonly geometry: PathGeometry;
  readonly startMs: number;
  readonly durationMs: number;
  readonly holdMs: number;
  readonly delayMs: number;
  readonly ball: boolean;
  /**
   * When a motion finishes off where his next line starts, the way he goes
   * back to it before the snap, round the men in his way.
   */
  readonly closeTo?: PathGeometry;
}

export interface PlayAnimationPlan {
  readonly items: readonly PlannedMovement[];
  readonly startMs: number;
  readonly snapMs: 0;
  readonly endMs: number;
  readonly hasMotion: boolean;
}

export interface PlayAnimationTrail {
  readonly pathId: string;
  readonly distanceYards: number;
  readonly points: readonly Coordinate[];
}

export interface PlayAnimationFrame {
  readonly atMs: number;
  readonly playerPositions: Readonly<Record<string, Coordinate>>;
  readonly trails: readonly PlayAnimationTrail[];
}

export interface PlayKeyFrame {
  readonly atMs: number;
  readonly name: "Snap" | "First break" | "Throw" | "Finish";
  readonly clock: string;
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
  baseSpeedYardsPerSecond = BASE_SPEED_YARDS_PER_SECOND,
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
  baseSpeedYardsPerSecond = BASE_SPEED_YARDS_PER_SECOND,
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

/**
 * Football, not physics: the line is slower than the split end, a drop is
 * slower than a route. Role and kind multiply the stored speed, they do not
 * replace it.
 */
export function paceMultiplier(
  path: Pick<MovementPath, "kind">,
  player: Pick<Player, "unit" | "label" | "position"> | undefined,
): number {
  if (path.kind === "ball") return 2.4;
  if (path.kind === "motion") return 0.95;
  if (path.kind === "block") return 0.55;
  if (path.kind === "zone") return 0.75;
  if (player && isLineman(player)) return 0.6;
  if (player?.unit === "defense") return 0.9;
  return 1;
}

export function isHitchSitDown(path: Pick<MovementPath, "points">): boolean {
  if (path.points.length < 3) return false;
  const previous = path.points.at(-2)!;
  const last = path.points.at(-1)!;
  return (
    distance(previous, last) < HITCH_LENGTH_YARDS &&
    previous.depthYards - last.depthYards > HITCH_TOWARD_LOS_YARDS
  );
}

export function defaultDelayBeats(
  path: Pick<MovementPath, "kind">,
  player: Pick<Player, "unit" | "label" | "position"> | undefined,
): number {
  if (!player || path.kind === "motion" || path.kind === "block") return 0;
  if (player.unit === "defense") return path.kind === "zone" ? 0.2 : 0;
  if (isLineman(player)) return 0;
  return player.position.depthYards < -BACKFIELD_DELAY_YARDS ? 0.5 : 0;
}

export function defaultHoldSeconds(
  path: Pick<MovementPath, "kind" | "points">,
): number {
  if (path.kind === "zone") return 0.8;
  return isHitchSitDown(path) ? 0.6 : 0;
}

function clampDelayBeats(value: number): number {
  return Math.max(0, Math.min(8, value));
}

function clampHoldSeconds(value: number): number {
  return Math.max(0, Math.min(8, value));
}

function clampSpeed(value: number): number {
  return Math.max(0.1, Math.min(3, value));
}

/**
 * What the inspector shows and what the plan uses. A stored value wins; an
 * unset one falls back to the role- and shape-aware default.
 */
export function resolvePathTiming(
  path: MovementPath,
  player: Player | undefined,
): ResolvedPathTiming {
  const speedMultiplier = clampSpeed(path.timing?.speedMultiplier ?? 1);
  const delayBeats = clampDelayBeats(
    path.timing
      ? path.timing.delayMs / ANIMATION_BEAT_MS
      : defaultDelayBeats(path, player),
  );
  const holdSeconds = clampHoldSeconds(
    path.timing ? path.timing.holdMs / 1000 : defaultHoldSeconds(path),
  );
  const geometry = buildPathGeometry(path);
  const speed =
    BASE_SPEED_YARDS_PER_SECOND *
    speedMultiplier *
    paceMultiplier(path, player);
  const durationMs =
    path.timing?.durationMs ??
    Math.max(
      MIN_DURATION_MS,
      Math.round((geometry.lengthYards / speed) * 1000),
    );
  return {
    delayMs: Math.round(delayBeats * ANIMATION_BEAT_MS),
    holdMs: Math.round(holdSeconds * 1000),
    speedMultiplier,
    durationMs,
    delayBeats,
    holdSeconds,
  };
}

interface FramePoint {
  readonly x: number;
  readonly y: number;
}

/** Yards to frame pixels, with depth growing toward the defense. */
function toFrame(point: Coordinate): FramePoint {
  return {
    x: point.lateralYards * LEGACY_FIELD_GEOMETRY.lateralPixelsPerYard,
    y: point.depthYards * LEGACY_FIELD_GEOMETRY.depthPixelsPerYard,
  };
}

function fromFrame(point: FramePoint): Coordinate {
  return {
    lateralYards: point.x / LEGACY_FIELD_GEOMETRY.lateralPixelsPerYard,
    depthYards: point.y / LEGACY_FIELD_GEOMETRY.depthPixelsPerYard,
  };
}

/** The share of `push` still owed `along` pixels from the man being cleared. */
function bend(along: number, push: number): number {
  const reach = DETOUR_REACH * Math.max(CLEARANCE_PX, Math.abs(push));
  const share = Math.abs(along) / reach;
  return share >= 1 ? 0 : (push * (1 + Math.cos(Math.PI * share))) / 2;
}

/** Eases a bend in from nothing at a line's ends, so he never jumps. */
function easeIn(along: number): number {
  const share = Math.max(0, Math.min(1, along / CLEARANCE_PX));
  return share * share * (3 - 2 * share);
}

function gapToSegment(
  point: FramePoint,
  from: FramePoint,
  to: FramePoint,
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  const share =
    length === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - from.x) * dx + (point.y - from.y) * dy) / length,
          ),
        );
  return Math.hypot(
    from.x + dx * share - point.x,
    from.y + dy * share - point.y,
  );
}

/** Whether a man stands closer to this line than two men may. */
function inTheWay(man: FramePoint, line: readonly FramePoint[]): boolean {
  return line.some(
    (point, index) =>
      index > 0 &&
      gapToSegment(man, line[index - 1]!, point) < CLEARANCE_PX - 0.5,
  );
}

/**
 * A line run before the snap, bent round the men in its way. He goes behind
 * each of them — away from the line of scrimmage, the way motion is run and
 * the only way past a lineman — by as much as clears him, and where two
 * men's bends overlap the larger wins rather than both being added. Going
 * round one man can bring him to another, the quarterback behind the line
 * say, and then he goes behind him too. The ends never move: he leaves his
 * stance and arrives where the line was drawn to. A line that comes near
 * nobody is returned as drawn.
 */
function clearPresnapLine(
  drawnYards: readonly Coordinate[],
  unit: Player["unit"] | undefined,
  others: readonly Coordinate[],
): readonly Coordinate[] {
  const drawn = drawnYards.map(toFrame);
  const men = others.map(toFrame);
  if (!men.some((man) => inTheWay(man, drawn))) return drawnYards;

  const points: FramePoint[] = [drawn[0]!];
  for (const [index, to] of drawn.entries()) {
    if (index === 0) continue;
    const from = drawn[index - 1]!;
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / DETOUR_STEP_PX),
    );
    for (let step = 1; step <= steps; step += 1) {
      points.push({
        x: from.x + ((to.x - from.x) * step) / steps,
        y: from.y + ((to.y - from.y) * step) / steps,
      });
    }
  }
  const along = [0];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    along.push(along[index - 1]! + Math.hypot(to.x - from.x, to.y - from.y));
  }
  const length = along.at(-1)!;
  const normals = points.map((_, index) => {
    const from = points[Math.max(0, index - 1)]!;
    const to = points[Math.min(points.length - 1, index + 1)]!;
    const size = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: -(to.y - from.y) / size, y: (to.x - from.x) / size };
  });
  const away = unit === "defense" ? 1 : -1;

  const owed = new Map<
    number,
    { readonly closest: number; readonly push: number }
  >();
  let cleared = points;
  for (let pass = 0; pass < men.length; pass += 1) {
    let more = false;
    for (const [index, man] of men.entries()) {
      if (owed.has(index) || !inTheWay(man, cleared)) continue;
      let closest = 0;
      for (let at = 1; at < points.length; at += 1) {
        if (
          Math.hypot(points[at]!.x - man.x, points[at]!.y - man.y) <
          Math.hypot(points[closest]!.x - man.x, points[closest]!.y - man.y)
        ) {
          closest = at;
        }
      }
      const normal = normals[closest]!;
      const behind = normal.y * away >= 0 ? 1 : -1;
      const apart =
        behind *
        ((points[closest]!.x - man.x) * normal.x +
          (points[closest]!.y - man.y) * normal.y);
      owed.set(index, {
        closest,
        push: behind * Math.max(0, CLEARANCE_PX - apart),
      });
      more = true;
    }
    if (!more) break;
    cleared = points.map((point, index) => {
      let outward = 0;
      let inward = 0;
      for (const { closest, push } of owed.values()) {
        const share = bend(along[index]! - along[closest]!, push);
        if (share > 0) outward = Math.max(outward, share);
        else inward = Math.min(inward, share);
      }
      const offset =
        (outward + inward) *
        easeIn(Math.min(along[index]!, length - along[index]!));
      const normal = normals[index]!;
      return {
        x: point.x + normal.x * offset,
        y: point.y + normal.y * offset,
      };
    });
  }
  return cleared.map(fromFrame);
}

/**
 * The line a defender in man walks before the snap, as his man's motion
 * carries him across: from his stance out to each side as far as the motion
 * goes, each cleared round the men in his way the way the motion is.
 */
interface PresnapWalk {
  readonly stance: Coordinate;
  readonly sides: readonly (readonly Coordinate[])[];
}

const presnapWalks = new WeakMap<
  PlayAnimationPlan,
  Map<string, PresnapWalk | undefined>
>();

function presnapWalk(
  play: PlayDocument,
  plan: PlayAnimationPlan,
  defender: Player,
  man: Player,
): PresnapWalk | undefined {
  let known = presnapWalks.get(plan);
  if (!known) {
    known = new Map();
    presnapWalks.set(plan, known);
  }
  if (known.has(defender.id)) return known.get(defender.id);
  const across = plan.items
    .filter(({ kind, playerId }) => kind === "motion" && playerId === man.id)
    .flatMap(({ geometry, closeTo }) =>
      [...geometry.points, ...(closeTo?.points ?? [])].map(
        ({ lateralYards }) => lateralYards - man.position.lateralYards,
      ),
    );
  const stance = defender.position;
  const others = play.players
    .filter(({ id }) => id !== defender.id)
    .map(({ position }) => position);
  const walk =
    across.length === 0
      ? undefined
      : {
          stance,
          sides: [Math.min(0, ...across), Math.max(0, ...across)]
            .filter((reach) => reach !== 0)
            .map((reach) =>
              clearPresnapLine(
                [
                  stance,
                  {
                    lateralYards: stance.lateralYards + reach,
                    depthYards: stance.depthYards,
                  },
                ],
                defender.unit,
                others,
              ),
            ),
        };
  known.set(defender.id, walk);
  return walk;
}

/**
 * How much deeper than his stance he stands having walked to `lateralYards`.
 * A walk is cleared in depth only, so each side runs one way across.
 */
function walkDepthAt(walk: PresnapWalk, lateralYards: number): number {
  const { stance } = walk;
  const toward = Math.sign(lateralYards - stance.lateralYards);
  const line = walk.sides.find(
    (side) =>
      Math.sign(side.at(-1)!.lateralYards - stance.lateralYards) === toward,
  );
  if (!line) return 0;
  for (let index = 1; index < line.length; index += 1) {
    const from = line[index - 1]!;
    const to = line[index]!;
    if (
      (lateralYards - from.lateralYards) * (lateralYards - to.lateralYards) >
      0
    ) {
      continue;
    }
    const span = to.lateralYards - from.lateralYards;
    const share = span === 0 ? 0 : (lateralYards - from.lateralYards) / span;
    return (
      from.depthYards +
      (to.depthYards - from.depthYards) * share -
      stance.depthYards
    );
  }
  return line.at(-1)!.depthYards - stance.depthYards;
}

/** A motion cleared round everyone else, who stands at his stance until the snap. */
function clearMotion(
  geometry: PathGeometry,
  playerId: string,
  unit: Player["unit"] | undefined,
  play: PlayDocument,
): PathGeometry {
  const cleared = clearPresnapLine(
    geometry.points,
    unit,
    play.players
      .filter(({ id }) => id !== playerId)
      .map(({ position }) => position),
  );
  return cleared === geometry.points
    ? geometry
    : buildPathGeometry({ points: [...cleared] });
}

export function planPlay(play: PlayDocument): PlayAnimationPlan {
  const pre: PlannedMovement[] = [];
  const post: PlannedMovement[] = [];

  for (const path of play.paths) {
    if (path.points.length < 2) continue;
    const player = play.players.find(({ id }) => id === path.playerId);
    const timing = resolvePathTiming(path, player);
    const geometry = buildPathGeometry(path);
    const item: PlannedMovement = {
      path,
      playerId: path.playerId,
      kind: path.kind,
      geometry:
        path.kind === "motion"
          ? clearMotion(geometry, path.playerId, player?.unit, play)
          : geometry,
      startMs: 0,
      durationMs: timing.durationMs,
      holdMs: timing.holdMs,
      delayMs: timing.delayMs,
      ball: path.kind === "ball",
    };
    (path.kind === "motion" ? pre : post).push(item);
  }

  const preDurMs = pre.reduce(
    (longest, item) => Math.max(longest, item.durationMs),
    0,
  );
  const snapOffsetMs = preDurMs > 0 ? preDurMs + MOTION_GAP_MS : 0;
  const startMs = -snapOffsetMs;

  const motions = pre.map((item) => ({
    ...item,
    // Longest motion starts at the timeline origin; shorter ones start later
    // so every motion finishes MOTION_GAP before the snap.
    startMs: startMs + Math.max(0, preDurMs - item.durationMs),
  }));
  const others = post.map((item) => ({
    ...item,
    startMs: item.delayMs,
  }));
  const items = [...motions, ...others].map((item) => {
    if (item.kind !== "motion") return item;
    const next = [...motions, ...others]
      .filter(
        ({ playerId, ball, startMs }) =>
          playerId === item.playerId && !ball && startMs > item.startMs,
      )
      .sort((left, right) => left.startMs - right.startMs)[0];
    const from = item.geometry.points.at(-1);
    const to = next?.geometry.points[0];
    if (!from || !to || distance(from, to) <= MOTION_CLOSE_YARDS) return item;
    return {
      ...item,
      closeTo: clearMotion(
        buildPathGeometry({ points: [from, to] }),
        item.playerId,
        play.players.find(({ id }) => id === item.playerId)?.unit,
        play,
      ),
    };
  });
  const endMs = Math.max(
    POST_SNAP_FLOOR_MS,
    ...items.map((item) => item.startMs + item.durationMs + item.holdMs),
  );

  return {
    items,
    startMs,
    snapMs: 0,
    endMs,
    hasMotion: snapOffsetMs > 0,
  };
}

export function playIsAnimatable(play: PlayDocument): boolean {
  return planPlay(play).items.length > 0;
}

function distanceAlong(item: PlannedMovement, atMs: number): number {
  const progress = Math.max(
    0,
    Math.min(1, (atMs - item.startMs) / item.durationMs),
  );
  return progress * item.geometry.lengthYards;
}

export function trailPoints(
  geometry: PathGeometry,
  distanceYards: number,
): Coordinate[] {
  if (distanceYards <= 0 || geometry.points.length === 0) {
    return geometry.points[0] ? [geometry.points[0]] : [];
  }
  const points: Coordinate[] = [];
  for (const [index, point] of geometry.points.entries()) {
    const cumulative = geometry.cumulativeYards[index] ?? 0;
    if (cumulative <= distanceYards) {
      points.push(point);
      continue;
    }
    points.push(pointAtGeometryDistance(geometry, distanceYards));
    break;
  }
  return points;
}

function interpolate(
  from: Coordinate,
  to: Coordinate,
  amount: number,
): Coordinate {
  return {
    lateralYards:
      from.lateralYards + (to.lateralYards - from.lateralYards) * amount,
    depthYards: from.depthYards + (to.depthYards - from.depthYards) * amount,
  };
}

/**
 * Where a man stands at an absolute time. Snap is 0; pre-snap motion uses
 * negative values. The line he is running is the last one that has started
 * — motion first, then his route — and a motion that finishes off his next
 * stance closes the gap instead of teleporting him back.
 */
export function playerPositionAt(
  plan: PlayAnimationPlan,
  player: Player,
  atMs: number,
): Coordinate {
  const mine = plan.items.filter(
    (item) => item.playerId === player.id && !item.ball,
  );
  if (mine.length === 0) return player.position;

  let active: PlannedMovement | undefined;
  for (const item of mine) {
    if (atMs >= item.startMs && (!active || item.startMs >= active.startMs)) {
      active = item;
    }
  }
  if (!active) {
    const first = mine.reduce((earliest, item) =>
      item.startMs < earliest.startMs ? item : earliest,
    );
    return first.geometry.points[0] ?? player.position;
  }

  const position = pointAtGeometryDistance(
    active.geometry,
    distanceAlong(active, atMs),
  );
  const next = mine
    .filter((item) => item.startMs > atMs)
    .sort((left, right) => left.startMs - right.startMs)[0];
  if (!next) return position;

  const nextStart = next.geometry.points[0];
  if (!nextStart) return position;
  const gap = distance(position, nextStart);
  const windowMs = Math.min(
    MOTION_GAP_MS,
    next.startMs - (active.startMs + active.durationMs),
  );
  if (
    gap > MOTION_CLOSE_YARDS &&
    windowMs > 10 &&
    atMs > next.startMs - windowMs
  ) {
    const amount = (atMs - (next.startMs - windowMs)) / windowMs;
    return active.closeTo
      ? pointAtGeometryDistance(
          active.closeTo,
          active.closeTo.lengthYards * amount,
        )
      : interpolate(position, nextStart, amount);
  }
  return position;
}

/** How far a defender in man trails his receiver, so both still read. */
export const MAN_SHADOW_YARDS = 2.2;

/**
 * A defender in man plays the receiver, not the line (ADR 0060). Before the
 * snap he walks across with any motion; once his line starts he closes on
 * his man and then stays with him wherever the route takes him, a symbol's
 * width off on the side he came from, until the play is over.
 */
function shadowTheirMen(
  play: PlayDocument,
  plan: PlayAnimationPlan,
  atMs: number,
  positions: Record<string, Coordinate>,
): void {
  for (const item of plan.items) {
    const { path } = item;
    const covers = path.covers;
    if (!covers || item.ball || !isManLine(path)) continue;
    const defender = play.players.find(({ id }) => id === path.playerId);
    const man = play.players.find(({ id }) => id === covers.playerId);
    const now = positions[covers.playerId];
    if (!defender || !man || !now || defender.unit !== "defense") continue;
    const stance = defender.position;
    const moved = {
      lateralYards: now.lateralYards - man.position.lateralYards,
      depthYards: now.depthYards - man.position.depthYards,
    };
    const across = stance.lateralYards - man.position.lateralYards;
    const down = stance.depthYards - man.position.depthYards;
    const apart = Math.hypot(across, down) || 1;
    const trail = Math.min(apart, MAN_SHADOW_YARDS);
    const onHim = {
      lateralYards: man.position.lateralYards + (across / apart) * trail,
      depthYards: man.position.depthYards + (down / apart) * trail,
    };
    const closing = Math.max(
      0,
      Math.min(1, (atMs - item.startMs) / item.durationMs),
    );
    // Before the snap only the motion across the field is followed, round
    // anyone standing in the way.
    const walk = presnapWalk(play, plan, defender, man);
    const walked = {
      lateralYards: moved.lateralYards,
      depthYards: walk
        ? walkDepthAt(walk, stance.lateralYards + moved.lateralYards)
        : 0,
    };
    positions[defender.id] = {
      lateralYards:
        interpolate(stance, onHim, closing).lateralYards +
        interpolate(walked, moved, closing).lateralYards,
      depthYards:
        interpolate(stance, onHim, closing).depthYards +
        interpolate(walked, moved, closing).depthYards,
    };
  }
}

export function evaluatePlayAt(
  play: PlayDocument,
  atMs: number,
  plan: PlayAnimationPlan = planPlay(play),
): PlayAnimationFrame {
  if (!Number.isInteger(atMs)) {
    throw new TypeError("Animation time must use integer milliseconds.");
  }
  const clamped = Math.max(plan.startMs, Math.min(plan.endMs, atMs));
  const playerPositions: Record<string, Coordinate> = {};
  for (const player of play.players) {
    playerPositions[player.id] = playerPositionAt(plan, player, clamped);
  }
  shadowTheirMen(play, plan, clamped, playerPositions);
  const trails = plan.items.flatMap((item) => {
    // A defender following his man has left his line behind; tracing it
    // would draw where he did not go.
    if (item.path.covers && isManLine(item.path)) return [];
    const distanceYards = distanceAlong(item, clamped);
    const points = trailPoints(item.geometry, distanceYards);
    if (points.length < 2) return [];
    return [{ pathId: item.path.id, distanceYards, points }];
  });
  return { atMs: clamped, playerPositions, trails };
}

/**
 * Time reads from the snap: pre-snap motion is negative, which is how a
 * coach counts it.
 */
export function formatPlaybackClock(atMs: number): string {
  const seconds = atMs / 1000;
  const minus = seconds < -0.049 ? "\u2212" : "";
  return `${minus}${Math.abs(seconds).toFixed(1)}s`;
}

export function formatPlaybackDuration(endMs: number): string {
  return `${(endMs / 1000).toFixed(1)}s`;
}

/**
 * Snap, first break, throw, finish — the four frames a coach actually
 * points at.
 */
export function playKeyFrames(
  play: PlayDocument,
  plan: PlayAnimationPlan = planPlay(play),
): readonly PlayKeyFrame[] {
  if (plan.items.length === 0) return [];

  const breaks: number[] = [];
  for (const item of plan.items) {
    if (item.path.kind === "motion" || item.path.points.length < 3) continue;
    const firstBreak = item.path.points[1];
    if (!firstBreak) continue;
    let along = 0;
    for (const [index, point] of item.geometry.points.entries()) {
      if (distance(point, firstBreak) < 0.15) {
        along = item.geometry.cumulativeYards[index] ?? 0;
        break;
      }
    }
    if (along > 0) {
      breaks.push(
        item.startMs +
          Math.round((along / item.geometry.lengthYards) * item.durationMs),
      );
    }
  }
  const firstBreakMs = breaks.length
    ? Math.min(...breaks)
    : Math.round(plan.endMs * 0.35);
  const read =
    plan.items.find((item) => item.path.readOrder === 1) ??
    [...plan.items]
      .filter((item) => item.kind !== "motion" && item.kind !== "block")
      .sort(
        (left, right) => right.geometry.lengthYards - left.geometry.lengthYards,
      )[0];
  const throwMs = read
    ? Math.min(plan.endMs, read.startMs + Math.round(read.durationMs * 0.82))
    : Math.round(plan.endMs * 0.7);
  const raw: ReadonlyArray<readonly [number, PlayKeyFrame["name"]]> = [
    [0, "Snap"],
    [firstBreakMs, "First break"],
    [Math.max(firstBreakMs + 100, throwMs), "Throw"],
    [plan.endMs, "Finish"],
  ];
  return raw.map(([atMs, name]) => {
    const clamped = Math.max(plan.startMs, Math.min(plan.endMs, atMs));
    return { atMs: clamped, name, clock: formatPlaybackClock(clamped) };
  });
}

export function frameSequenceTimes(plan: PlayAnimationPlan): readonly number[] {
  if (plan.items.length === 0) return [];
  const times: number[] = [];
  for (
    let atMs = plan.startMs;
    atMs <= plan.endMs && times.length < FRAME_SEQUENCE_MAX_FRAMES;
    atMs += FRAME_SEQUENCE_STEP_MS
  ) {
    times.push(Math.min(plan.endMs, atMs));
  }
  const last = times.at(-1);
  if (last !== plan.endMs && times.length < FRAME_SEQUENCE_MAX_FRAMES) {
    times.push(plan.endMs);
  }
  return times;
}

export function playbackShowsAnimation(
  timeMs: number,
  startMs: number,
  playing: boolean,
): boolean {
  return playing || timeMs !== startMs;
}
