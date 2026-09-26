import {
  DEMO_HOLD_MS,
  demoItemOpacity,
  demoTour,
  gotoDemoStep,
  startDemo,
  tickDemo,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

describe("demo playback", () => {
  const tour = demoTour("tools");

  it("hides the current step's items until the eased progress reaches them", () => {
    const playback = { ...startDemo("tools", 0), playing: false };
    const firstPlayer = tour.play.players[0]!.id;
    expect(demoItemOpacity(tour, playback, firstPlayer)).toBe(0);
    expect(demoItemOpacity(tour, playback, "rx")).toBe(0);

    const mid = { ...playback, progress: 1 };
    expect(demoItemOpacity(tour, mid, firstPlayer)).toBe(1);
    expect(demoItemOpacity(tour, mid, "rx")).toBe(0);

    const next = gotoDemoStep(playback, tour, 1, 0, false);
    expect(demoItemOpacity(tour, { ...next, progress: 1 }, firstPlayer)).toBe(
      1,
    );
    expect(demoItemOpacity(tour, { ...next, progress: 1 }, "rx")).toBe(1);
  });

  it("advances after the step duration plus the original's 2.2s hold", () => {
    const started = startDemo("tools", 0);
    const duration = tour.steps[0]!.durationMs;
    expect(tickDemo(started, tour, duration).stepIndex).toBe(0);
    expect(tickDemo(started, tour, duration).progress).toBe(1);
    const advanced = tickDemo(started, tour, duration + DEMO_HOLD_MS + 1);
    expect(advanced.stepIndex).toBe(1);
    expect(advanced.progress).toBe(0);
    expect(advanced.playing).toBe(true);
  });
});
