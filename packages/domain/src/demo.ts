import { createStableId } from "./canonical";
import { playDocumentSchema, type PlayDocument } from "./schema";

/**
 * The original's five guided sequences. Tools is Stick — Thunder; the others
 * are the Plays the original built only for the tour.
 */
export const demoTourIds = [
  "tools",
  "quick",
  "block",
  "air",
  "defense",
] as const;
export type DemoTourId = (typeof demoTourIds)[number];

export const demoToolIds = [
  "select",
  "player",
  "route",
  "motion",
  "block",
  "zone",
  "text",
] as const;
export type DemoToolId = (typeof demoToolIds)[number];

export const demoToolShortcuts: Readonly<Record<DemoToolId, string>> =
  Object.freeze({
    select: "V",
    player: "P",
    route: "R",
    motion: "M",
    block: "B",
    zone: "Z",
    text: "T",
  });

/** How long the original holds a finished step before advancing. */
export const DEMO_HOLD_MS = 2200;

export interface DemoStep {
  readonly title: string;
  readonly tool: DemoToolId;
  readonly keys: string;
  readonly durationMs: number;
  readonly itemIds: readonly string[];
  readonly clicks: readonly (readonly [number, number])[];
  readonly panel: string;
  readonly rows: readonly (readonly [string, string])[];
  readonly caption: string;
}

export interface DemoTour {
  readonly id: DemoTourId;
  readonly tab: string;
  readonly playName: string;
  readonly category: string;
  readonly play: PlayDocument;
  readonly steps: readonly DemoStep[];
  readonly stepOf: Readonly<Record<string, number>>;
}

export interface DemoPlayback {
  readonly tourId: DemoTourId;
  readonly stepIndex: number;
  readonly progress: number;
  readonly playing: boolean;
  readonly startedAtMs: number;
}

export function demoEase(progress: number): number {
  return progress * progress * (3 - 2 * progress);
}

export function demoStepOf(
  steps: readonly DemoStep[],
): Readonly<Record<string, number>> {
  const stepOf: Record<string, number> = {};
  steps.forEach((step, index) => {
    for (const id of step.itemIds) stepOf[id] = index;
  });
  return stepOf;
}

export function startDemo(tourId: DemoTourId, nowMs: number): DemoPlayback {
  return {
    tourId,
    stepIndex: 0,
    progress: 0,
    playing: true,
    startedAtMs: nowMs,
  };
}

export function gotoDemoStep(
  playback: DemoPlayback,
  tour: DemoTour,
  stepIndex: number,
  nowMs: number,
  playing = playback.playing,
): DemoPlayback {
  const last = tour.steps.length - 1;
  return {
    ...playback,
    tourId: tour.id,
    stepIndex: Math.max(0, Math.min(last, stepIndex)),
    progress: 0,
    playing,
    startedAtMs: nowMs,
  };
}

/**
 * Pause stops the cursor. Play from a finished last step starts over. Play
 * from anywhere else jumps to the end of the current step, which is what the
 * original's `demoStart = now - dur` does.
 */
export function toggleDemoPlay(
  playback: DemoPlayback,
  tour: DemoTour,
  nowMs: number,
): DemoPlayback {
  if (playback.playing) return { ...playback, playing: false };
  const last = tour.steps.length - 1;
  if (playback.stepIndex >= last && playback.progress >= 1) {
    return gotoDemoStep(playback, tour, 0, nowMs, true);
  }
  const duration = tour.steps[playback.stepIndex]?.durationMs ?? 1600;
  return { ...playback, playing: true, startedAtMs: nowMs - duration };
}

export function tickDemo(
  playback: DemoPlayback,
  tour: DemoTour,
  nowMs: number,
): DemoPlayback {
  if (!playback.playing) return playback;
  const step = tour.steps[playback.stepIndex] ?? tour.steps[0];
  if (!step) return { ...playback, playing: false };
  const elapsed = nowMs - playback.startedAtMs;
  const progress = Math.min(1, elapsed / step.durationMs);
  if (elapsed > step.durationMs + DEMO_HOLD_MS) {
    if (playback.stepIndex >= tour.steps.length - 1) {
      return { ...playback, playing: false, progress: 1 };
    }
    return gotoDemoStep(playback, tour, playback.stepIndex + 1, nowMs, true);
  }
  if (Math.abs(progress - playback.progress) <= 0.004) return playback;
  return { ...playback, progress };
}

export function demoPlayLabel(
  playback: DemoPlayback,
  tour: DemoTour,
): "Pause" | "Play" | "Replay" {
  if (playback.playing) return "Pause";
  if (playback.stepIndex >= tour.steps.length - 1 && playback.progress >= 1) {
    return "Replay";
  }
  return "Play";
}

/**
 * An item listed on a later step stays hidden until that step; one listed on
 * an earlier step stays. Anything the tour never names is always on the
 * field — the original's `stepOf` misses it, so `vis` returns 1.
 */
export function demoItemOpacity(
  tour: DemoTour,
  playback: DemoPlayback,
  itemId: string,
): number {
  const listed = tour.stepOf[itemId];
  if (listed === undefined) return 1;
  if (listed < playback.stepIndex) return 1;
  if (listed > playback.stepIndex) return 0;
  const step = tour.steps[playback.stepIndex];
  if (!step) return 0;
  const count = Math.max(1, step.itemIds.length);
  const index = step.itemIds.indexOf(itemId);
  return Math.max(0, Math.min(1, demoEase(playback.progress) * count - index));
}

export function demoCursor(
  tour: DemoTour,
  playback: DemoPlayback,
): { readonly x: number; readonly y: number } | undefined {
  const clicks = tour.steps[playback.stepIndex]?.clicks ?? [];
  if (clicks.length === 0) return undefined;
  const ease = demoEase(playback.progress);
  const segments = Math.max(1, clicks.length - 1);
  const along = Math.min(0.999, ease) * segments;
  const index = Math.floor(along);
  const t = along - index;
  const from = clicks[Math.min(index, clicks.length - 1)]!;
  const to = clicks[Math.min(index + 1, clicks.length - 1)]!;
  return {
    x: from[0] + (to[0] - from[0]) * t,
    y: from[1] + (to[1] - from[1]) * t,
  };
}

export function demoPulses(
  tour: DemoTour,
  playback: DemoPlayback,
): readonly {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly opacity: number;
}[] {
  const clicks = tour.steps[playback.stepIndex]?.clicks ?? [];
  if (clicks.length === 0) return [];
  const ease = demoEase(playback.progress);
  const segments = Math.max(1, clicks.length - 1);
  return clicks.flatMap((click, index) => {
    const at = index / segments;
    const delta = ease - at;
    if (delta < 0 || delta >= 0.22) return [];
    const k = delta / 0.22;
    return [
      {
        x: click[0],
        y: click[1],
        r: 8 + 22 * k,
        opacity: 0.55 * (1 - k),
      },
    ];
  });
}

export function demoPanelRowOn(
  step: DemoStep,
  progress: number,
  rowIndex: number,
): boolean {
  return progress > Math.min(0.85, (rowIndex + 1) / (step.rows.length + 1));
}

export const DEMO_STATUS_HINT =
  "◀ ▶ step through · space: play / pause · every step maps to a real tool";

export const DEMO_HEADER_TITLE = "Drawing tools — guided tour";

/**
 * The Play the Coach gets when he opens the tour in the editor. A new
 * identity, always — saving it must not rewrite the Play that was open
 * before the demo (parity-matrix B1).
 */
export function demoHandoffPlay(
  tour: DemoTour,
  identity: { readonly id?: string; readonly playbookId: string },
): PlayDocument {
  return playDocumentSchema.parse({
    ...tour.play,
    id: identity.id ?? createStableId("play"),
    playbookId: identity.playbookId,
  });
}
