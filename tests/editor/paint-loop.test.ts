import { summarizePaintSamples } from "@chalk/editor";
import { describe, expect, it } from "vitest";

describe("paint-loop budgets", () => {
  it("reports sustained FPS from p95 frame interval, not from a lucky mean", () => {
    const even = summarizePaintSamples(
      [16, 16, 16, 16, 16, 16, 16, 16, 16, 16],
      [12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
    );
    expect(even.fps).toBeCloseTo(62.5, 5);
    expect(even.sustainedFps).toBe(true);
    expect(even.inputToPaintWithinBudget).toBe(true);

    // Nine fast frames and one 40 ms hitch still average near 60, but p95
    // is the hitch — that is not sustaining 60 FPS.
    const hitch = summarizePaintSamples(
      [16, 16, 16, 16, 16, 16, 16, 16, 16, 40],
      [12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
    );
    expect(hitch.fps).toBeGreaterThan(50);
    expect(hitch.p95FrameMs).toBe(40);
    expect(hitch.sustainedFps).toBe(false);
  });
});
