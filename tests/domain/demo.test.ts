import {
  DEMO_HOLD_MS,
  demoCursor,
  demoHandoffPlay,
  demoItemOpacity,
  demoPanelRowOn,
  demoPlayLabel,
  demoTour,
  demoTours,
  gotoDemoStep,
  startDemo,
  tickDemo,
  toggleDemoPlay,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

describe("demo tours", () => {
  it("ships the original's five sequences, Tools being Stick — Thunder", () => {
    expect(demoTours.map(({ id, tab }) => [id, tab])).toEqual([
      ["tools", "Tool tour"],
      ["quick", "Quick routes"],
      ["block", "Blocking"],
      ["air", "7-on-7 · no line"],
      ["defense", "Defense"],
    ]);
    const tools = demoTour("tools");
    expect(tools.steps).toHaveLength(9);
    expect(tools.steps[0]?.title).toBe("Player tool");
    expect(tools.play.name).toBe("Stick — Thunder");
    expect(tools.play.id).toBe("play-8lkpvgj");
    expect(demoTour("defense").steps).toHaveLength(5);
    expect(demoTour("defense").play.name).toBe("Cover 3 — Fire Zone");
  });

  it("opens a demo as a new Play, not the one that was already open", () => {
    const tools = demoTour("tools");
    const defense = demoTour("defense");
    const opened = demoHandoffPlay(defense, {
      id: "play_from_demo",
      playbookId: tools.play.playbookId,
    });

    expect(opened.id).toBe("play_from_demo");
    expect(opened.id).not.toBe(tools.play.id);
    expect(opened.name).toBe("Cover 3 — Fire Zone");
    expect(opened.playbookId).toBe(tools.play.playbookId);
    expect(tools.play.id).toBe("play-8lkpvgj");
    expect(tools.play.name).toBe("Stick — Thunder");
  });
});

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

  it("walks the ghost cursor along the step's clicks", () => {
    const start = { ...startDemo("tools", 0), playing: false, progress: 0 };
    expect(demoCursor(tour, start)).toEqual({ x: 316, y: 452 });
    const end = { ...start, progress: 1 };
    // The original caps eased progress at 0.999 so the cursor never quite
    // sits on the last click.
    expect(demoCursor(tour, end)?.x).toBeCloseTo(884.984);
    expect(demoCursor(tour, end)?.y).toBe(452);
  });

  it("labels Pause, Play, and Replay the way the original does", () => {
    const playing = startDemo("tools", 0);
    expect(demoPlayLabel(playing, tour)).toBe("Pause");
    expect(demoPlayLabel({ ...playing, playing: false }, tour)).toBe("Play");
    const last = gotoDemoStep(playing, tour, tour.steps.length - 1, 0, false);
    expect(demoPlayLabel({ ...last, progress: 1 }, tour)).toBe("Replay");
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

  it("Play from a paused step jumps to the end, as the original's now-dur does", () => {
    const paused = { ...startDemo("tools", 0), playing: false, progress: 0.2 };
    const resumed = toggleDemoPlay(paused, tour, 10_000);
    expect(resumed.playing).toBe(true);
    expect(tickDemo(resumed, tour, 10_000).progress).toBe(1);
  });

  it("reveals inspector rows as the step progresses", () => {
    const first = tour.steps[0]!;
    expect(demoPanelRowOn(first, 0, 0)).toBe(false);
    expect(demoPanelRowOn(first, 1, 0)).toBe(true);
    expect(demoPanelRowOn(first, 1, 2)).toBe(true);
  });
});
