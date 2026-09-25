import {
  idlePlayback,
  pausePlayback,
  playPlayback,
  resetPlayback,
  seekPlayback,
  setPlaybackRate,
  tickPlayback,
  togglePlayback,
} from "@chalk/editor";
import { describe, expect, it } from "vitest";

const bounds = { startMs: -1000, endMs: 3000 };

describe("playback clock", () => {
  it("selects absolute time from the wall clock instead of summing deltas", () => {
    const started = playPlayback(idlePlayback(-1000), 10_000, bounds);
    const mid = tickPlayback(started, 11_000, bounds);
    const later = tickPlayback(started, 12_000, bounds);
    expect(mid.timeMs).toBe(0);
    expect(later.timeMs).toBe(1000);
    expect(later.playing).toBe(true);
  });

  it("yields the same time from a seek as from uninterrupted playback", () => {
    const started = playPlayback(idlePlayback(0), 5_000, {
      startMs: 0,
      endMs: 2000,
    });
    const played = tickPlayback(started, 5_800, { startMs: 0, endMs: 2000 });
    const sought = seekPlayback(started, 800, { startMs: 0, endMs: 2000 });
    expect(played.timeMs).toBe(sought.timeMs);
    expect(sought.playing).toBe(false);
  });

  it("restarts from the start when play is pressed at the end", () => {
    const ended = { timeMs: 3000, playing: false, rate: 1 as const };
    const playing = playPlayback(ended, 1, bounds);
    expect(playing.timeMs).toBe(-1000);
    expect(playing.playing).toBe(true);
  });

  it("jumps to the end when reduced motion asks to play", () => {
    const next = playPlayback(idlePlayback(-1000), 1, bounds, {
      reducedMotion: true,
    });
    expect(next.playing).toBe(false);
    expect(next.timeMs).toBe(3000);
  });

  it("keeps the current time when speed changes mid-play", () => {
    const started = playPlayback(idlePlayback(0), 1000, {
      startMs: 0,
      endMs: 4000,
    });
    const moving = tickPlayback(started, 1500, { startMs: 0, endMs: 4000 });
    const faster = setPlaybackRate(moving, 2, 1500);
    const later = tickPlayback(faster, 2000, { startMs: 0, endMs: 4000 });
    expect(moving.timeMs).toBe(500);
    expect(later.timeMs).toBe(1500);
  });

  it("pauses, toggles, and resets without inventing time", () => {
    const started = playPlayback(idlePlayback(0), 0, {
      startMs: 0,
      endMs: 2000,
    });
    const paused = pausePlayback(
      tickPlayback(started, 400, { startMs: 0, endMs: 2000 }),
    );
    expect(paused.playing).toBe(false);
    expect(paused.timeMs).toBe(400);
    expect(
      togglePlayback(paused, 800, { startMs: 0, endMs: 2000 }).playing,
    ).toBe(true);
    expect(resetPlayback(paused, 0)).toEqual({
      timeMs: 0,
      playing: false,
      rate: 1,
    });
  });
});
