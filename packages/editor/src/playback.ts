/**
 * Integer-millisecond playback clock. Wall time selects an absolute timeline
 * time; it never accumulates frame-to-frame deltas, so a pause, a dropped
 * frame, or a speed change cannot rewrite a scene sampled at the same time
 * (ADR 0028).
 */

export const PLAYBACK_RATES = [0.5, 1, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export interface PlaybackSnapshot {
  readonly timeMs: number;
  readonly playing: boolean;
  readonly rate: PlaybackRate;
}

export interface PlaybackClock extends PlaybackSnapshot {
  readonly originWallMs?: number;
  readonly originTimeMs?: number;
}

export interface PlaybackBounds {
  readonly startMs: number;
  readonly endMs: number;
}

function clampTime(timeMs: number, bounds: PlaybackBounds): number {
  return Math.max(bounds.startMs, Math.min(bounds.endMs, Math.round(timeMs)));
}

export function idlePlayback(startMs = 0): PlaybackClock {
  return { timeMs: startMs, playing: false, rate: 1 };
}

export function playPlayback(
  clock: PlaybackClock,
  nowMs: number,
  bounds: PlaybackBounds,
  options: { readonly reducedMotion?: boolean } = {},
): PlaybackClock {
  const from =
    clock.timeMs >= bounds.endMs - 20 ? bounds.startMs : clock.timeMs;
  if (options.reducedMotion) {
    return { timeMs: bounds.endMs, playing: false, rate: clock.rate };
  }
  return {
    timeMs: from,
    playing: true,
    rate: clock.rate,
    originWallMs: nowMs,
    originTimeMs: from,
  };
}

export function pausePlayback(clock: PlaybackClock): PlaybackClock {
  return { timeMs: clock.timeMs, playing: false, rate: clock.rate };
}

export function togglePlayback(
  clock: PlaybackClock,
  nowMs: number,
  bounds: PlaybackBounds,
  options: { readonly reducedMotion?: boolean } = {},
): PlaybackClock {
  return clock.playing
    ? pausePlayback(clock)
    : playPlayback(clock, nowMs, bounds, options);
}

export function seekPlayback(
  clock: PlaybackClock,
  timeMs: number,
  bounds: PlaybackBounds,
): PlaybackClock {
  return {
    timeMs: clampTime(timeMs, bounds),
    playing: false,
    rate: clock.rate,
  };
}

export function resetPlayback(
  clock: PlaybackClock,
  startMs: number,
): PlaybackClock {
  return { timeMs: startMs, playing: false, rate: clock.rate };
}

export function setPlaybackRate(
  clock: PlaybackClock,
  rate: PlaybackRate,
  nowMs: number,
): PlaybackClock {
  if (!clock.playing) return { ...clock, rate };
  return {
    ...clock,
    rate,
    originWallMs: nowMs,
    originTimeMs: clock.timeMs,
  };
}

/**
 * Absolute time from the wall clock, not a running sum of frame deltas.
 */
export function tickPlayback(
  clock: PlaybackClock,
  nowMs: number,
  bounds: PlaybackBounds,
): PlaybackClock {
  if (!clock.playing || clock.originWallMs === undefined) return clock;
  const originTimeMs = clock.originTimeMs ?? clock.timeMs;
  const elapsedMs = (nowMs - clock.originWallMs) * clock.rate;
  const timeMs = Math.round(originTimeMs + elapsedMs);
  if (timeMs >= bounds.endMs) {
    return { timeMs: bounds.endMs, playing: false, rate: clock.rate };
  }
  if (timeMs === clock.timeMs) return clock;
  return { ...clock, timeMs };
}

export function clampPlaybackTime(
  timeMs: number,
  bounds: PlaybackBounds,
): number {
  return clampTime(timeMs, bounds);
}
