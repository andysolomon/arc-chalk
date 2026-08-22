import { isLineman } from "./classifications";
import {
  buildPathGeometry,
  distance,
  legacyDepthSpanToYards,
  pointAtGeometryDistance,
  type PathGeometry,
} from "./geometry";
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

export function planPlay(play: PlayDocument): PlayAnimationPlan {
  const pre: PlannedMovement[] = [];
  const post: PlannedMovement[] = [];

  for (const path of play.paths) {
    if (path.points.length < 2) continue;
    const player = play.players.find(({ id }) => id === path.playerId);
    const timing = resolvePathTiming(path, player);
    const item: PlannedMovement = {
      path,
      playerId: path.playerId,
      kind: path.kind,
      geometry: buildPathGeometry(path),
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
  const items = [...motions, ...others];
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
    return interpolate(position, nextStart, amount);
  }
  return position;
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
  const trails = plan.items.flatMap((item) => {
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
