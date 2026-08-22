import {
  affectedLiveEntities,
  idleFieldInteraction,
  liveHandlePath,
  livePaintCanHold,
  type FieldInteractionModel,
  type FieldItemRef,
} from "@chalk/editor";
import { stickThunderPlay } from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

const player = (id: string): FieldItemRef => ({ kind: "player", id });
const path = (id: string): FieldItemRef => ({ kind: "path", id });

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

  it("does not list a selected route twice when its Player is also moving", () => {
    const affected = affectedLiveEntities(stickThunderPlay, [
      player("x"),
      path("rx"),
    ]);
    expect(affected.pathIds).toEqual(["rx"]);
  });
});

describe("livePaintCanHold", () => {
  it("holds a drag that only updates the live translation", () => {
    const start = moving([player("x")], {
      lateralYards: 0.2,
      depthYards: 0,
    });
    const next = moving([player("x")], {
      lateralYards: 1.4,
      depthYards: -0.5,
    });
    expect(livePaintCanHold(start, next)).toBe(true);
  });

  it("holds the promotion from a still press into a move", () => {
    const pressing: FieldInteractionModel = {
      ...idle,
      selection: [player("x")],
      gesture: {
        kind: "pressing",
        pointerId: 1,
        items: [player("x")],
        clickItem: player("x"),
        wasMulti: false,
        wasSingle: true,
        start: { lateralYards: 0, depthYards: 0 },
      },
    };
    expect(livePaintCanHold(pressing, moving([player("x")]))).toBe(true);
  });

  it("does not hold a release, a selection change, or a new drawing break", () => {
    const drag = moving([player("x")]);
    expect(livePaintCanHold(drag, idle)).toBe(false);
    expect(livePaintCanHold(drag, moving([player("z")]))).toBe(false);

    const drawing: FieldInteractionModel = {
      ...idle,
      drawing: {
        kind: "route",
        playerId: "q",
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
  });

  it("lets go when the Coach finishes or abandons a drawing", () => {
    const drawing: FieldInteractionModel = {
      ...idle,
      drawing: {
        kind: "route",
        playerId: "q",
        points: [{ lateralYards: 0, depthYards: -2 }],
        cursor: { lateralYards: 0, depthYards: 4 },
        depthBuffer: "",
        pointerDown: false,
      },
    };
    expect(livePaintCanHold(drawing, idle)).toBe(false);
  });
});

describe("liveHandlePath", () => {
  it("reads the path a handle drag would commit", () => {
    const pathEntity = stickThunderPlay.paths.find(({ id }) => id === "rx")!;
    expect(
      liveHandlePath({
        kind: "handle",
        pointerId: 1,
        handle: { kind: "node", pathId: "rx", pointIndex: 1 },
        update: { kind: "update-path", path: pathEntity },
        guides: [],
        moved: true,
      })?.id,
    ).toBe("rx");
    expect(
      liveHandlePath({
        kind: "handle",
        pointerId: 1,
        handle: { kind: "node", pathId: "rx", pointIndex: 1 },
        update: { kind: "update-path", path: pathEntity },
        guides: [],
        moved: false,
      }),
    ).toBeUndefined();
  });
});

describe("livePaintCanHold does not treat every gesture as live", () => {
  it("lets go when the Coach asks for a click-narrow on release", () => {
    const pressing: FieldInteractionModel = {
      ...idle,
      selection: [player("x"), player("z")],
      gesture: {
        kind: "pressing",
        pointerId: 1,
        items: [player("x"), player("z")],
        clickItem: player("x"),
        wasMulti: true,
        wasSingle: false,
        start: { lateralYards: 0, depthYards: 0 },
      },
    };
    const narrowed: FieldInteractionModel = {
      ...idle,
      selection: [player("x")],
    };
    expect(livePaintCanHold(pressing, narrowed)).toBe(false);
  });
});
