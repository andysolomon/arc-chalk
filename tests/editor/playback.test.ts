import {
  idlePlayback,
  playPlayback,
  setPlaybackRate,
  tickPlayback,
} from "@chalk/editor";
import { describe, expect, it } from "vitest";

const bounds = { startMs: -1000, endMs: 3000 };

describe("playback clock", () => {
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
});
