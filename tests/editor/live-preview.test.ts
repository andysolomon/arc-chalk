import {
  affectedLiveEntities,
  idleFieldInteraction,
  livePaintCanHold,
  type FieldInteractionModel,
  type FieldItemRef,
} from "@chalk/editor";
import { stickThunderPlay } from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

const player = (id: string): FieldItemRef => ({ kind: "player", id });

const idle = idleFieldInteraction;

function moving(
  items: readonly FieldItemRef[],
  translation = { lateralYards: 1, depthYards: 0 },
): FieldInteractionModel {
  return {
    ...idle,
    selection: items,
    gesture: {
      kind: "moving",
      pointerId: 1,
      items,
      start: { lateralYards: 0, depthYards: 0 },
      translation,
      guides: [],
    },
  };
}

describe("affectedLiveEntities", () => {
  it("takes a moving Player's routes with him and leaves everyone else", () => {
    const affected = affectedLiveEntities(stickThunderPlay, [player("x")]);

    expect(affected.playerIds).toEqual(["x"]);
    expect(affected.pathIds).toEqual(["rx"]);
    expect(affected.labelIds).toEqual([]);
    expect(affected.playerIds).not.toContain("q");
    expect(affected.pathIds).not.toContain("rz");
  });

  it("includes a bound note when the route it rides is moving", () => {
    const bound = {
      ...stickThunderPlay,
      labels: [
        ...stickThunderPlay.labels,
        {
          id: "note-on-rx",
          position: { lateralYards: 0, depthYards: 8 },
          text: "Sit",
          color: "ink" as const,
          size: 12,
          box: "none" as const,
          boxColor: "ink" as const,
          binding: {
            pathId: "rx",
            segmentIndex: 1,
            progress: 0.5,
            offset: { lateralYards: 1, depthYards: 0 },
          },
        },
      ],
    };

    expect(affectedLiveEntities(bound, [player("x")]).labelIds).toEqual([
      "note-on-rx",
    ]);
    expect(affectedLiveEntities(bound, [player("z")]).labelIds).toEqual([]);
  });
});

describe("livePaintCanHold", () => {
  it("does not hold a release, a selection change, or a new drawing break", () => {
    const drag = moving([player("x")]);
    expect(livePaintCanHold(drag, idle)).toBe(false);
    expect(livePaintCanHold(drag, moving([player("z")]))).toBe(false);

    const drawing: FieldInteractionModel = {
      ...idle,
      drawing: {
        kind: "route",
        playerId: "q",
        mode: "breaks",
        points: [{ lateralYards: 0, depthYards: -2 }],
        cursor: { lateralYards: 0, depthYards: 4 },
        depthBuffer: "",
        pointerDown: false,
      },
    };
    const nextBreak: FieldInteractionModel = {
      ...drawing,
      drawing: {
        ...drawing.drawing!,
        points: [
          { lateralYards: 0, depthYards: -2 },
          { lateralYards: 0, depthYards: 8 },
        ],
      },
    };
    expect(livePaintCanHold(drawing, nextBreak)).toBe(false);
    expect(livePaintCanHold(drawing, drawing)).toBe(true);

    // A free stroke's traced points arrive every frame and paint live; the
    // Coach switching how he draws is the shell's business.
    const tracing: FieldInteractionModel = {
      ...drawing,
      drawing: {
        ...drawing.drawing!,
        mode: "free",
        points: [
          { lateralYards: 0, depthYards: -2 },
          { lateralYards: 0.4, depthYards: 1, traced: true },
          { lateralYards: 0.8, depthYards: 4, traced: true },
        ],
        pointerDown: true,
      },
    };
    const free: FieldInteractionModel = {
      ...drawing,
      drawing: { ...drawing.drawing!, mode: "free" },
    };
    expect(livePaintCanHold(free, tracing)).toBe(true);
    expect(livePaintCanHold(drawing, free)).toBe(false);
  });
});
