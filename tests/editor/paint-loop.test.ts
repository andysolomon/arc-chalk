import {
  classifyFrameBudget,
  classifyInputToPaint,
  createLiveSnapshotStore,
  createPaintLoop,
  FRAME_BUDGET_MS,
  INPUT_TO_PAINT_BUDGET_MS,
  percentile,
  summarizePaintSamples,
} from "@chalk/editor";
import { describe, expect, it } from "vitest";

function fakeClock() {
  let now = 0;
  let nextHandle = 1;
  const pending = new Map<number, (time: number) => void>();
  return {
    now: () => now,
    requestAnimationFrame(callback: (time: number) => void) {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame(handle: number) {
      pending.delete(handle);
    },
    advance(ms: number) {
      now += ms;
      const due = [...pending.entries()];
      pending.clear();
      for (const [, callback] of due) callback(now);
    },
    pendingCount: () => pending.size,
  };
}

describe("paint-loop budgets", () => {
  it("classifies a 60 FPS frame and a 50 ms input-to-paint", () => {
    expect(classifyFrameBudget(16.67)).toBe(true);
    expect(classifyFrameBudget(FRAME_BUDGET_MS)).toBe(true);
    expect(classifyFrameBudget(FRAME_BUDGET_MS + 0.01)).toBe(false);
    expect(classifyInputToPaint(50)).toBe(true);
    expect(classifyInputToPaint(INPUT_TO_PAINT_BUDGET_MS + 0.01)).toBe(false);
  });

  it("takes the nearest-rank 95th percentile, not the mean", () => {
    const values = [10, 10, 10, 10, 10, 10, 10, 10, 10, 40];
    expect(percentile(values, 95)).toBe(40);
    expect(percentile(values, 50)).toBe(10);
    expect(percentile([], 95)).toBe(0);
  });

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

describe("createPaintLoop", () => {
  it("coalesces several schedules onto one animation frame", () => {
    const clock = fakeClock();
    const loop = createPaintLoop(clock);
    const paints: number[] = [];

    loop.schedule(0, () => paints.push(1));
    loop.schedule(1, () => paints.push(2));
    loop.schedule(2, () => paints.push(3));
    expect(clock.pendingCount()).toBe(1);
    expect(paints).toEqual([]);

    clock.advance(16);
    expect(paints).toEqual([3]);
    expect(loop.sample().frames).toBe(0);

    loop.schedule(16, () => paints.push(4));
    clock.advance(16);
    expect(paints).toEqual([3, 4]);
    expect(loop.sample().frames).toBe(1);
    expect(loop.sample().frameIntervalsMs).toEqual([16]);
  });

  it("records input-to-paint from the kept event, not from discarded ones", () => {
    const clock = fakeClock();
    const loop = createPaintLoop(clock);

    loop.schedule(0, () => undefined);
    loop.schedule(8, () => undefined);
    clock.advance(16);

    // The 0 ms event was replaced before the frame; the kept event waited 8.
    expect(loop.sample().inputToPaintMs).toEqual([8]);
  });

  it("flush runs pending work without waiting for the frame", () => {
    const clock = fakeClock();
    const loop = createPaintLoop(clock);
    let painted = false;
    loop.schedule(0, () => {
      painted = true;
    });
    loop.flush();
    expect(painted).toBe(true);
    expect(clock.pendingCount()).toBe(0);
  });
});

describe("createLiveSnapshotStore", () => {
  it("notifies subscribers with a new snapshot identity", () => {
    const first = { n: 1 };
    const store = createLiveSnapshotStore(first);
    const seen: number[] = [];
    const stop = store.subscribe(() => seen.push(store.getSnapshot().n));

    expect(store.getSnapshot()).toBe(first);
    store.notify({ n: 2 });
    expect(seen).toEqual([2]);
    stop();
    store.notify({ n: 3 });
    expect(seen).toEqual([2]);
  });
});
