/**
 * One animation-frame paint loop for editor interaction. Pointer events may
 * arrive faster than the display; this coalesces them onto the next frame so
 * the field updates affected SVG nodes once per vsync instead of cloning the
 * Play or rebuilding the React tree on every move (ADR 0002, ADR 0015).
 */

/** 60 FPS is a 16.67 ms frame. The +1 ms slack is rounding, not a dropped frame. */
export const FRAME_BUDGET_MS = 1000 / 60 + 1;

/** p95 input-to-paint on a Coach device, matching the local-save budget. */
export const INPUT_TO_PAINT_BUDGET_MS = 50;

export interface PaintClock {
  readonly now: () => number;
  readonly requestAnimationFrame: (callback: (time: number) => void) => number;
  readonly cancelAnimationFrame: (handle: number) => void;
}

export interface PaintLoopSample {
  readonly frames: number;
  readonly frameIntervalsMs: readonly number[];
  readonly inputToPaintMs: readonly number[];
  readonly fps: number;
  readonly p95FrameMs: number;
  readonly p95InputToPaintMs: number;
  readonly sustainedFps: boolean;
  readonly inputToPaintWithinBudget: boolean;
}

export interface PaintLoop {
  /** Keeps the latest work and runs it once on the next animation frame. */
  schedule(inputAtMs: number, paint: () => void): void;
  /** Runs pending work immediately. Pointer-up uses this so the last move lands. */
  flush(): void;
  cancel(): void;
  sample(): PaintLoopSample;
  reset(): void;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const rank = Math.min(
    values.length - 1,
    Math.max(0, Math.ceil((p / 100) * values.length) - 1),
  );
  return [...values].sort((left, right) => left - right)[rank]!;
}

export function classifyFrameBudget(
  frameMs: number,
  budgetMs: number = FRAME_BUDGET_MS,
): boolean {
  return frameMs <= budgetMs;
}

export function classifyInputToPaint(
  durationMs: number,
  budgetMs: number = INPUT_TO_PAINT_BUDGET_MS,
): boolean {
  return durationMs <= budgetMs;
}

export function summarizePaintSamples(
  frameIntervalsMs: readonly number[],
  inputToPaintMs: readonly number[],
): PaintLoopSample {
  const meanInterval =
    frameIntervalsMs.length === 0
      ? 0
      : frameIntervalsMs.reduce((sum, value) => sum + value, 0) /
        frameIntervalsMs.length;
  const p95FrameMs = percentile(frameIntervalsMs, 95);
  const p95InputToPaintMs = percentile(inputToPaintMs, 95);
  return {
    frames: frameIntervalsMs.length,
    frameIntervalsMs,
    inputToPaintMs,
    fps: meanInterval === 0 ? 0 : 1000 / meanInterval,
    p95FrameMs,
    p95InputToPaintMs,
    sustainedFps: classifyFrameBudget(p95FrameMs),
    inputToPaintWithinBudget: classifyInputToPaint(p95InputToPaintMs),
  };
}

export function createPaintLoop(clock: PaintClock): PaintLoop {
  let handle = 0;
  let pending:
    { readonly inputAtMs: number; readonly paint: () => void } | undefined;
  let lastFrameAtMs: number | undefined;
  const frameIntervalsMs: number[] = [];
  const inputToPaintMs: number[] = [];

  const run = (): void => {
    handle = 0;
    const work = pending;
    pending = undefined;
    if (!work) return;
    const now = clock.now();
    if (lastFrameAtMs !== undefined) {
      frameIntervalsMs.push(now - lastFrameAtMs);
    }
    lastFrameAtMs = now;
    work.paint();
    inputToPaintMs.push(Math.max(0, clock.now() - work.inputAtMs));
  };

  return {
    schedule(inputAtMs, paint) {
      pending = { inputAtMs, paint };
      if (handle !== 0) return;
      handle = clock.requestAnimationFrame(() => run());
    },
    flush() {
      if (handle !== 0) {
        clock.cancelAnimationFrame(handle);
        handle = 0;
      }
      if (pending) run();
    },
    cancel() {
      if (handle !== 0) {
        clock.cancelAnimationFrame(handle);
        handle = 0;
      }
      pending = undefined;
    },
    sample() {
      return summarizePaintSamples(frameIntervalsMs, inputToPaintMs);
    },
    reset() {
      this.cancel();
      lastFrameAtMs = undefined;
      frameIntervalsMs.length = 0;
      inputToPaintMs.length = 0;
    },
  };
}

/**
 * A snapshot store the live overlay subscribes to. Notifying it re-renders
 * only that overlay, not the shell that owns the committed scene.
 */
export function createLiveSnapshotStore<T>(initial: T): {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => T;
  readonly notify: (next: T) => void;
} {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    notify(next) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
}
