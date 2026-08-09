import {
  applyPlayCommand,
  canonicalStringify,
  deletePlayersCommand,
  type Coordinate,
  type PlayCommand,
  type PlayDocument,
} from "@chalk/domain";
import {
  buildMoveCommand,
  fieldHitOptions,
  fieldInteraction,
  gesturePreviewCommand,
  hitTestField,
  idleFieldInteraction,
  pruneFieldSelection,
  type FieldInteractionContext,
  type FieldInteractionEvent,
  type FieldInteractionModel,
} from "@chalk/editor";
import { buildRenderScene, createSvgProjection } from "@chalk/render";
import { stickThunderPlay } from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

/**
 * The machine is exercised the way the shell drives it: yard-space pointer
 * input against the seeded Play. Expectations are the original prototype's
 * gesture grammar — thresholds, click semantics, marquee membership — plus
 * the keyboard alternatives ADR 0016 adds.
 */

const projection = createSvgProjection(stickThunderPlay.fieldProfile);
const screenScale = {
  lateralPixelsPerYard: projection.lateralPixelsPerYard,
  depthPixelsPerYard: projection.depthPixelsPerYard,
};

function contextFor(
  document: PlayDocument,
  overrides: Partial<FieldInteractionContext> = {},
): FieldInteractionContext {
  return {
    document,
    scene: buildRenderScene(document),
    screenScale,
    snap: { enabled: true, grid: "off" },
    tool: "select",
    ...overrides,
  };
}

const player = (id: string) => ({ kind: "player", id }) as const;
const path = (id: string) => ({ kind: "path", id }) as const;
const label = (id: string) => ({ kind: "label", id }) as const;

function positionOf(document: PlayDocument, id: string): Coordinate {
  const found = document.players.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No player ${id}`);
  return found.position;
}

interface Session {
  model: FieldInteractionModel;
  commands: PlayCommand[];
}

function run(
  context: FieldInteractionContext,
  events: readonly FieldInteractionEvent[],
  initial: FieldInteractionModel = idleFieldInteraction,
): Session {
  let model = initial;
  const commands: PlayCommand[] = [];
  for (const event of events) {
    const result = fieldInteraction(model, event, context);
    model = result.model;
    if (result.command) commands.push(result.command);
  }
  return { model, commands };
}

const down = (
  point: Coordinate,
  extra: { shiftKey?: boolean; pointerId?: number; button?: number } = {},
): FieldInteractionEvent => ({
  type: "pointer-down",
  input: { point, pointerId: extra.pointerId ?? 1, ...extra },
});
const move = (point: Coordinate, pointerId = 1): FieldInteractionEvent => ({
  type: "pointer-move",
  input: { point, pointerId },
});
const up = (point: Coordinate, pointerId = 1): FieldInteractionEvent => ({
  type: "pointer-up",
  input: { point, pointerId },
});

describe("field interaction selection", () => {
  it("selects on click and clears on a click in the grass", () => {
    const context = contextFor(stickThunderPlay);
    const q = positionOf(stickThunderPlay, "q");

    const clicked = run(context, [down(q), up(q)]);
    expect(clicked.model.selection).toEqual([player("q")]);
    expect(clicked.commands).toHaveLength(0);

    const grass = { lateralYards: 15, depthYards: -8 };
    const cleared = run(context, [down(grass), up(grass)], clicked.model);
    expect(cleared.model.selection).toEqual([]);
  });

  it("toggles membership with Shift on the press alone", () => {
    const context = contextFor(stickThunderPlay);
    const q = positionOf(stickThunderPlay, "q");
    const h = positionOf(stickThunderPlay, "h");

    const both = run(context, [
      down(q),
      up(q),
      down(h, { shiftKey: true }),
      up(h),
    ]);
    expect(both.model.selection).toEqual([player("q"), player("h")]);

    const removed = run(
      context,
      [down(q, { shiftKey: true }), up(q)],
      both.model,
    );
    expect(removed.model.selection).toEqual([player("h")]);
  });

  it("narrows a multi-selection to the clicked item on release", () => {
    const context = contextFor(stickThunderPlay);
    const q = positionOf(stickThunderPlay, "q");
    const all = run(context, [{ type: "select-all" }]);
    expect(all.model.selection.length).toBe(
      stickThunderPlay.players.length +
        stickThunderPlay.paths.length +
        stickThunderPlay.labels.length,
    );

    const narrowed = run(context, [down(q), up(q)], all.model);
    expect(narrowed.model.selection).toEqual([player("q")]);
  });

  it("keeps a Shift click in the grass from clearing the selection", () => {
    const context = contextFor(stickThunderPlay);
    const q = positionOf(stickThunderPlay, "q");
    const grass = { lateralYards: 15, depthYards: -8 };
    const kept = run(context, [
      down(q),
      up(q),
      down(grass, { shiftKey: true }),
      up(grass),
    ]);
    expect(kept.model.selection).toEqual([player("q")]);
  });
});

describe("field interaction dragging", () => {
  it("does not become a drag inside the two-pixel threshold", () => {
    const context = contextFor(stickThunderPlay);
    const q = positionOf(stickThunderPlay, "q");
    const nearby = {
      lateralYards: q.lateralYards + 1 / screenScale.lateralPixelsPerYard,
      depthYards: q.depthYards,
    };
    const session = run(context, [down(q), move(nearby), up(nearby)]);
    expect(session.commands).toHaveLength(0);
    expect(session.model.gesture.kind).toBe("idle");
  });

  it("commits one batch that carries a Player and his attached route", () => {
    const context = contextFor(stickThunderPlay, {
      snap: { enabled: false, grid: "off" },
    });
    const x = positionOf(stickThunderPlay, "x");
    const target = {
      lateralYards: x.lateralYards + 2,
      depthYards: x.depthYards + 3,
    };

    const session = run(context, [down(x), move(target), up(target)]);
    expect(session.commands).toHaveLength(1);
    const command = session.commands[0]!;
    expect(command).toMatchObject({ kind: "batch", label: "Move Player" });

    const moved = applyPlayCommand(stickThunderPlay, command);
    const after = positionOf(moved, "x");
    expect(after.lateralYards).toBeCloseTo(x.lateralYards + 2, 6);
    expect(after.depthYards).toBeCloseTo(x.depthYards + 3, 6);

    const route = (document: PlayDocument) =>
      document.paths.find(({ id }) => id === "rx")!;
    route(stickThunderPlay).points.forEach((point, index) => {
      const movedPoint = route(moved).points[index]!;
      expect(movedPoint.lateralYards).toBeCloseTo(point.lateralYards + 2, 6);
      expect(movedPoint.depthYards).toBeCloseTo(point.depthYards + 3, 6);
    });
  });

  it("translates branch points when the route travels with its Player", () => {
    const context = contextFor(stickThunderPlay, {
      snap: { enabled: false, grid: "off" },
    });
    const z = positionOf(stickThunderPlay, "z");
    const target = {
      lateralYards: z.lateralYards - 3,
      depthYards: z.depthYards,
    };

    const session = run(context, [down(z), move(target), up(target)]);
    const moved = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    const before = stickThunderPlay.paths.find(({ id }) => id === "rz")!;
    const after = moved.paths.find(({ id }) => id === "rz")!;
    expect(after.branches[0]!.points[0]!.lateralYards).toBeCloseTo(
      before.branches[0]!.points[0]!.lateralYards - 3,
      6,
    );
  });

  it("snaps a lone Player landmark-first and reads out his depth", () => {
    const context = contextFor(stickThunderPlay);
    const q = positionOf(stickThunderPlay, "q");
    // Close to the ball laterally and to the two-yard mark in depth.
    const target = { lateralYards: 0.15, depthYards: -1.9 };

    const session = run(context, [down(q), move(target)]);
    const gesture = session.model.gesture;
    expect(gesture.kind).toBe("moving");
    if (gesture.kind !== "moving") return;
    expect(gesture.translation).toEqual({
      lateralYards: 0 - q.lateralYards,
      depthYards: -2 - q.depthYards,
    });
    expect(gesture.guides.map(({ source }) => source).sort()).toEqual([
      "ball",
      "yard-mark",
    ]);
    expect(gesture.readout?.text).toBe("-2 yds");

    const done = run(context, [up(target)], session.model);
    const moved = applyPlayCommand(stickThunderPlay, done.commands[0]!);
    expect(positionOf(moved, "q")).toEqual({ lateralYards: 0, depthYards: -2 });
  });

  it("moves a group raw, without snapping, as one undo step", () => {
    const context = contextFor(stickThunderPlay);
    const marqueeSession = run(context, [
      down({ lateralYards: -5, depthYards: -1 }),
      move({ lateralYards: 5, depthYards: -2 }),
      up({ lateralYards: 5, depthYards: -2 }),
    ]);
    expect(marqueeSession.model.selection).toEqual(
      ["ol0", "ol1", "ol2", "ol3", "ol4"].map(player),
    );

    const start = positionOf(stickThunderPlay, "ol2");
    const target = {
      lateralYards: start.lateralYards + 0.15,
      depthYards: start.depthYards - 1.9,
    };
    const dragged = run(
      context,
      [down(start), move(target), up(target)],
      marqueeSession.model,
    );
    expect(dragged.commands).toHaveLength(1);
    expect(dragged.commands[0]).toMatchObject({
      kind: "batch",
      label: "Move Players",
    });
    const moved = applyPlayCommand(stickThunderPlay, dragged.commands[0]!);
    // Raw translation: the group keeps its shape instead of snapping.
    expect(positionOf(moved, "ol0").lateralYards).toBeCloseTo(
      positionOf(stickThunderPlay, "ol0").lateralYards + 0.15,
      6,
    );
    expect(positionOf(moved, "ol0").depthYards).toBeCloseTo(
      positionOf(stickThunderPlay, "ol0").depthYards - 1.9,
      6,
    );
  });

  it("previews exactly the document the release will commit", () => {
    const context = contextFor(stickThunderPlay);
    const q = positionOf(stickThunderPlay, "q");
    const target = { lateralYards: 0.15, depthYards: -1.9 };
    const session = run(context, [down(q), move(target)]);

    const preview = gesturePreviewCommand(session.model, stickThunderPlay);
    const done = run(context, [up(target)], session.model);
    expect(canonicalStringify(preview)).toBe(
      canonicalStringify(done.commands[0]),
    );
  });

  it("commits nothing when the drag returns to its start", () => {
    const context = contextFor(stickThunderPlay, {
      snap: { enabled: false, grid: "off" },
    });
    const q = positionOf(stickThunderPlay, "q");
    const away = { lateralYards: q.lateralYards + 2, depthYards: q.depthYards };
    const session = run(context, [down(q), move(away), move(q), up(q)]);
    expect(session.commands).toHaveLength(0);
  });

  it("abandons the gesture on cancel or Escape without committing", () => {
    const context = contextFor(stickThunderPlay, {
      snap: { enabled: false, grid: "off" },
    });
    const q = positionOf(stickThunderPlay, "q");
    const away = { lateralYards: q.lateralYards + 4, depthYards: q.depthYards };

    const cancelled = run(context, [
      down(q),
      move(away),
      { type: "pointer-cancel" },
    ]);
    expect(cancelled.commands).toHaveLength(0);
    expect(cancelled.model.gesture.kind).toBe("idle");

    const escaped = run(context, [down(q), move(away), { type: "escape" }]);
    expect(escaped.commands).toHaveLength(0);
    expect(escaped.model.gesture.kind).toBe("idle");
    // Escape with no gesture in flight clears the selection instead.
    const clearedSelection = run(context, [{ type: "escape" }], escaped.model);
    expect(clearedSelection.model.selection).toEqual([]);
  });

  it("ignores a second pointer while a gesture is in flight", () => {
    const context = contextFor(stickThunderPlay, {
      snap: { enabled: false, grid: "off" },
    });
    const q = positionOf(stickThunderPlay, "q");
    const h = positionOf(stickThunderPlay, "h");
    const away = { lateralYards: q.lateralYards + 4, depthYards: q.depthYards };

    const session = run(context, [
      down(q),
      down(h, { pointerId: 2 }),
      move(away),
      up({ lateralYards: 0, depthYards: 0 }, 2),
      up(away),
    ]);
    expect(session.commands).toHaveLength(1);
    const moved = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    expect(positionOf(moved, "q").lateralYards).toBeCloseTo(
      q.lateralYards + 4,
      6,
    );
    expect(positionOf(moved, "h")).toEqual(h);
  });
});

describe("field interaction marquee", () => {
  it("selects routes by their points and stays out of Player-only rectangles", () => {
    const context = contextFor(stickThunderPlay);
    // Around the deep break of Z's route, well away from Z himself.
    const session = run(context, [
      down({ lateralYards: 20, depthYards: 10 }),
      move({ lateralYards: 22.5, depthYards: 12 }),
      up({ lateralYards: 22.5, depthYards: 12 }),
    ]);
    expect(session.model.selection).toContainEqual(path("rz"));
    expect(
      session.model.selection.filter(({ kind }) => kind === "player"),
    ).toHaveLength(0);
  });

  it("adds to the selection when Shift holds the marquee", () => {
    const context = contextFor(stickThunderPlay);
    const q = positionOf(stickThunderPlay, "q");
    const withQ = run(context, [down(q), up(q)]);
    const session = run(
      context,
      [
        down({ lateralYards: -5, depthYards: -1 }, { shiftKey: true }),
        move({ lateralYards: 5, depthYards: -2 }),
        up({ lateralYards: 5, depthYards: -2 }),
      ],
      withQ.model,
    );
    expect(session.model.selection).toEqual([
      player("q"),
      ...["ol0", "ol1", "ol2", "ol3", "ol4"].map(player),
    ]);
  });
});

describe("field interaction keyboard", () => {
  it("deletes a mixed selection with its dependents as one batch", () => {
    const context = contextFor(stickThunderPlay);
    const session = run(context, [{ type: "delete" }], {
      selection: [player("x"), label("l1")],
      gesture: { kind: "idle" },
    });
    expect(session.commands).toHaveLength(1);
    expect(session.model.selection).toEqual([]);

    const after = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    expect(after.players.some(({ id }) => id === "x")).toBe(false);
    // X's route leaves with him even though it was never selected.
    expect(after.paths.some(({ id }) => id === "rx")).toBe(false);
    expect(after.labels.some(({ id }) => id === "l1")).toBe(false);
    expect(after.players).toHaveLength(stickThunderPlay.players.length - 1);
  });

  it("nudges the selection by the requested step, one command per press", () => {
    const context = contextFor(stickThunderPlay);
    const q = positionOf(stickThunderPlay, "q");
    const session = run(
      context,
      [
        { type: "nudge", lateralYards: 0.5, depthYards: 0 },
        { type: "nudge", lateralYards: 0.5, depthYards: 0 },
      ],
      { selection: [player("q")], gesture: { kind: "idle" } },
    );
    expect(session.commands).toHaveLength(2);
    const once = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    expect(positionOf(once, "q").lateralYards).toBeCloseTo(
      q.lateralYards + 0.5,
      6,
    );
  });

  it("does nothing on delete or nudge with nothing selected", () => {
    const context = contextFor(stickThunderPlay);
    const session = run(context, [
      { type: "delete" },
      { type: "nudge", lateralYards: 0.5, depthYards: 0 },
    ]);
    expect(session.commands).toHaveLength(0);
  });
});

describe("field interaction tools", () => {
  it("places a new Player exactly where the Coach pressed", () => {
    const context = contextFor(stickThunderPlay, {
      tool: "player",
      createId: (prefix) => `${prefix}_test`,
    });
    const spot = { lateralYards: 5, depthYards: 5 };
    const session = run(context, [down(spot)]);
    expect(session.commands).toHaveLength(1);
    expect(session.model.selection).toEqual([player("player_test")]);

    const after = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    const added = after.players.find(({ id }) => id === "player_test")!;
    expect(added.position).toEqual(spot);
    expect(added.unit).toBe(stickThunderPlay.unit);
    expect(added.symbol).toBe("circle");
  });

  it("moves an existing Player under the Player tool instead of stacking a new one", () => {
    const context = contextFor(stickThunderPlay, {
      tool: "player",
      snap: { enabled: false, grid: "off" },
    });
    const q = positionOf(stickThunderPlay, "q");
    const target = {
      lateralYards: q.lateralYards + 3,
      depthYards: q.depthYards,
    };
    const session = run(context, [down(q), move(target), up(target)]);
    expect(session.commands).toHaveLength(1);
    expect(session.commands[0]).toMatchObject({ label: "Move Player" });
  });
});

describe("field hit testing", () => {
  const scene = buildRenderScene(stickThunderPlay);

  it("resolves the topmost layer: Players above labels above routes", () => {
    // X stands on his own route's first point.
    const x = positionOf(stickThunderPlay, "x");
    expect(hitTestField(scene, x, screenScale, fieldHitOptions())).toEqual(
      player("x"),
    );
  });

  it("hits a route along its stroke", () => {
    // Midway down Z's vertical stem.
    const point = { lateralYards: 21.092896175, depthYards: 5 };
    expect(hitTestField(scene, point, screenScale, fieldHitOptions())).toEqual(
      path("rz"),
    );
  });

  it("widens targets for touch to keep them at 44 CSS pixels", () => {
    const q = positionOf(stickThunderPlay, "q");
    const offset = {
      lateralYards: q.lateralYards + 20 / screenScale.lateralPixelsPerYard,
      depthYards: q.depthYards,
    };
    expect(
      hitTestField(scene, offset, screenScale, fieldHitOptions()),
    ).toBeUndefined();
    expect(
      hitTestField(scene, offset, screenScale, fieldHitOptions("touch")),
    ).toEqual(player("q"));
  });

  it("selects on a touch press that a mouse press would miss", () => {
    const context = contextFor(stickThunderPlay);
    const q = positionOf(stickThunderPlay, "q");
    const offset = {
      lateralYards: q.lateralYards + 20 / screenScale.lateralPixelsPerYard,
      depthYards: q.depthYards,
    };
    const session = run(context, [
      {
        type: "pointer-down",
        input: { point: offset, pointerId: 1, pointerType: "touch" },
      },
      up(offset),
    ]);
    expect(session.model.selection).toEqual([player("q")]);
  });
});

describe("field selection pruning", () => {
  it("drops what an undo removed and abandons a gesture it invalidated", () => {
    const model: FieldInteractionModel = {
      selection: [player("q"), player("ghost")],
      gesture: {
        kind: "pressing",
        pointerId: 1,
        items: [player("ghost")],
        clickItem: player("ghost"),
        wasMulti: false,
        start: { lateralYards: 0, depthYards: 0 },
      },
    };
    const pruned = pruneFieldSelection(model, stickThunderPlay);
    expect(pruned.selection).toEqual([player("q")]);
    expect(pruned.gesture.kind).toBe("idle");
  });

  it("returns the same model when nothing changed", () => {
    const model: FieldInteractionModel = {
      selection: [player("q")],
      gesture: { kind: "idle" },
    };
    expect(pruneFieldSelection(model, stickThunderPlay)).toBe(model);
  });
});

describe("move command builder", () => {
  it("moves a route selected alongside its own Player exactly once", () => {
    const command = buildMoveCommand(
      stickThunderPlay,
      [player("x"), path("rx")],
      { lateralYards: 1, depthYards: 0 },
    );
    const updates =
      command?.kind === "batch"
        ? command.commands.filter(
            (candidate) =>
              candidate.kind === "update-path" && candidate.path.id === "rx",
          )
        : [];
    expect(updates).toHaveLength(1);
  });

  it("returns nothing for a zero translation", () => {
    expect(
      buildMoveCommand(stickThunderPlay, [player("q")], {
        lateralYards: 0,
        depthYards: 0,
      }),
    ).toBeUndefined();
  });
});

describe("field interaction drawing", () => {
  const drawingContext = (overrides: Partial<FieldInteractionContext> = {}) =>
    contextFor(stickThunderPlay, {
      tool: "route",
      snap: { enabled: false, grid: "off" },
      createId: (prefix) => `${prefix}_drawn`,
      ...overrides,
    });

  it("starts a route on the Player it was pressed on, not on the grass", () => {
    const context = drawingContext();
    const y = positionOf(stickThunderPlay, "y");

    const started = run(context, [down(y)]);
    expect(started.model.drawing).toMatchObject({
      kind: "route",
      playerId: "y",
      points: [{ lateralYards: y.lateralYards, depthYards: y.depthYards }],
    });
    expect(started.commands).toHaveLength(0);

    // The schema requires a Player on every path, so grass draws nothing.
    const onGrass = run(context, [down({ lateralYards: 18, depthYards: 14 })]);
    expect(onGrass.model.drawing).toBeUndefined();
    expect(onGrass.commands).toHaveLength(0);
  });

  it("commits one route with the breaks the Coach clicked", () => {
    const context = drawingContext();
    const y = positionOf(stickThunderPlay, "y");
    const first = {
      lateralYards: y.lateralYards,
      depthYards: y.depthYards + 6,
    };
    const second = {
      lateralYards: y.lateralYards - 5,
      depthYards: y.depthYards + 6,
    };

    const session = run(context, [
      down(y),
      move(first),
      down(first),
      up(first),
      move(second),
      down(second),
      up(second),
      { type: "finish-drawing" },
    ]);

    expect(session.commands).toHaveLength(1);
    expect(session.commands[0]).toMatchObject({
      kind: "batch",
      label: "Draw route",
    });
    expect(session.model.drawing).toBeUndefined();
    expect(session.model.selection).toEqual([path("path_drawn")]);

    const after = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    const drawn = after.paths.find(({ id }) => id === "path_drawn")!;
    expect(drawn.playerId).toBe("y");
    expect(drawn.kind).toBe("route");
    expect(drawn.points).toHaveLength(3);
    expect(drawn.points[0]).toMatchObject({
      lateralYards: y.lateralYards,
      depthYards: y.depthYards,
    });
    // Coordinates carry the machine's 9-digit rounding, which keeps
    // canonical hashes stable across platforms.
    expect(drawn.points.at(-1)!.lateralYards).toBeCloseTo(
      second.lateralYards,
      6,
    );
    expect(drawn.points.at(-1)!.depthYards).toBeCloseTo(second.depthYards, 6);
  });

  it("gives each kind the original's defaults and dots a second route", () => {
    const y = positionOf(stickThunderPlay, "y");
    const breakPoint = {
      lateralYards: y.lateralYards + 4,
      depthYards: y.depthYards + 4,
    };
    const drawWith = (kind: "route" | "motion" | "block" | "zone") => {
      const session = run(drawingContext({ tool: kind }), [
        down(y),
        move(breakPoint),
        down(breakPoint),
        up(breakPoint),
        { type: "finish-drawing" },
      ]);
      const after = applyPlayCommand(stickThunderPlay, session.commands[0]!);
      return after.paths.find(({ id }) => id === "path_drawn")!;
    };

    expect(drawWith("motion").style).toMatchObject({
      line: "zigzag",
      ending: "arrow",
      color: "ink",
    });
    expect(drawWith("block").style).toMatchObject({
      line: "solid",
      ending: "bar",
    });
    expect(drawWith("zone").style).toMatchObject({
      line: "dashed",
      ending: "bubble",
      color: "blue",
    });
    // Y already runs a route, so his second one arrives as a dotted alternate.
    const second = drawWith("route");
    expect(second.style.line).toBe("dotted");
    expect(second.variant).toBe("alternate");

    // The Quarterback has no route, so his first stays solid and primary.
    const q = positionOf(stickThunderPlay, "q");
    const qBreak = {
      lateralYards: q.lateralYards,
      depthYards: q.depthYards - 4,
    };
    const qSession = run(drawingContext(), [
      down(q),
      move(qBreak),
      down(qBreak),
      up(qBreak),
      { type: "finish-drawing" },
    ]);
    const qRoute = applyPlayCommand(
      stickThunderPlay,
      qSession.commands[0]!,
    ).paths.find(({ id }) => id === "path_drawn")!;
    expect(qRoute.style.line).toBe("solid");
    expect(qRoute.variant).toBeUndefined();
  });

  it("constrains breaks to 45 degrees while snap is on, and Shift frees them", () => {
    const y = positionOf(stickThunderPlay, "y");
    // Well off any 45° ray from Y.
    const loose = {
      lateralYards: y.lateralYards + 1,
      depthYards: y.depthYards + 8,
    };

    const snapped = run(contextFor(stickThunderPlay, { tool: "route" }), [
      down(y),
      move(loose),
    ]);
    const cursor = snapped.model.drawing!.cursor;
    // A 45° family member: straight up, so no lateral drift at all.
    expect(cursor.lateralYards).toBeCloseTo(y.lateralYards, 6);
    expect(cursor.depthYards).toBeGreaterThan(y.depthYards);

    const free = run(contextFor(stickThunderPlay, { tool: "route" }), [
      down(y),
      {
        type: "pointer-move",
        input: { point: loose, pointerId: 1, shiftKey: true },
      },
    ]);
    expect(free.model.drawing!.cursor.lateralYards).toBeCloseTo(
      loose.lateralYards,
      6,
    );
    expect(free.model.drawing!.cursor.depthYards).toBeCloseTo(
      loose.depthYards,
      6,
    );
  });

  it("drops a break that lands on the last one", () => {
    const context = drawingContext();
    const y = positionOf(stickThunderPlay, "y");
    const nudge = {
      lateralYards: y.lateralYards + 1 / screenScale.lateralPixelsPerYard,
      depthYards: y.depthYards,
    };
    const session = run(context, [down(y), move(nudge), down(nudge)]);
    expect(session.model.drawing!.points).toHaveLength(1);
  });

  it("bends the last segment when the pointer is held and pulled away", () => {
    const context = drawingContext();
    const y = positionOf(stickThunderPlay, "y");
    const breakPoint = {
      lateralYards: y.lateralYards,
      depthYards: y.depthYards + 8,
    };
    const pull = {
      lateralYards: y.lateralYards + 4,
      depthYards: y.depthYards + 4,
    };

    const session = run(context, [
      down(y),
      move(breakPoint),
      down(breakPoint),
      move(pull),
    ]);
    const control = session.model.drawing!.points.at(-1)!.control;
    expect(control).toBeDefined();
    // Reflected across the chord midpoint, so the curve passes under the pointer.
    expect(control!.lateralYards).toBeCloseTo(
      2 * pull.lateralYards - (y.lateralYards + breakPoint.lateralYards) / 2,
      6,
    );

    const finished = run(context, [{ type: "finish-drawing" }], session.model);
    const drawn = applyPlayCommand(
      stickThunderPlay,
      finished.commands[0]!,
    ).paths.find(({ id }) => id === "path_drawn")!;
    expect(drawn.points.at(-1)!.control).toBeDefined();
  });

  it("sets an exact depth from typed digits and backspaces them first", () => {
    const context = drawingContext();
    const y = positionOf(stickThunderPlay, "y");
    const loose = {
      lateralYards: y.lateralYards + 3,
      depthYards: y.depthYards + 3,
    };

    const typed = run(context, [
      down(y),
      move(loose),
      { type: "depth-digit", digit: "1" },
      { type: "depth-digit", digit: "2" },
    ]);
    expect(typed.model.drawing!.cursor.depthYards).toBe(12);

    // Backspace trims the buffer before it touches the route.
    const trimmed = run(context, [{ type: "delete" }], typed.model);
    expect(trimmed.model.drawing!.depthBuffer).toBe("1");
    expect(trimmed.commands).toHaveLength(0);

    const placed = run(context, [down(loose)], typed.model);
    expect(placed.model.drawing!.points.at(-1)!.depthYards).toBe(12);
    expect(placed.model.drawing!.depthBuffer).toBe("");
  });

  it("keeps a route inside the sidelines and the drawn frame", () => {
    const context = drawingContext({
      depthWindow: { minDepthYards: -15, maxDepthYards: 30 },
    });
    const y = positionOf(stickThunderPlay, "y");
    const halfWidth = stickThunderPlay.fieldProfile.widthYards / 2;

    const session = run(context, [
      down(y),
      move({ lateralYards: 90, depthYards: 90 }),
    ]);
    const cursor = session.model.drawing!.cursor;
    expect(cursor.lateralYards).toBeLessThanOrEqual(halfWidth);
    expect(cursor.depthYards).toBeLessThanOrEqual(30);
  });

  it("steps Escape and Backspace back through the drawing before the Play", () => {
    const context = drawingContext();
    const y = positionOf(stickThunderPlay, "y");
    const one = { lateralYards: y.lateralYards, depthYards: y.depthYards + 5 };
    const two = { lateralYards: y.lateralYards, depthYards: y.depthYards + 10 };
    const twoBreaks = run(context, [
      down(y),
      move(one),
      down(one),
      up(one),
      move(two),
      down(two),
      up(two),
    ]);
    expect(twoBreaks.model.drawing!.points).toHaveLength(3);

    const backspaced = run(context, [{ type: "delete" }], twoBreaks.model);
    expect(backspaced.model.drawing!.points).toHaveLength(2);
    expect(backspaced.commands).toHaveLength(0);

    const escaped = run(context, [{ type: "escape" }], backspaced.model);
    expect(escaped.model.drawing).toBeUndefined();
    expect(escaped.commands).toHaveLength(0);
  });

  it("commits nothing for a route that never left its Player", () => {
    const context = drawingContext();
    const y = positionOf(stickThunderPlay, "y");
    const session = run(context, [down(y), { type: "finish-drawing" }]);
    expect(session.commands).toHaveLength(0);
    expect(session.model.drawing).toBeUndefined();
  });

  it("hands the select tool back when a route is finished", () => {
    const context = drawingContext();
    const y = positionOf(stickThunderPlay, "y");
    const breakPoint = {
      lateralYards: y.lateralYards,
      depthYards: y.depthYards + 6,
    };
    let model = idleFieldInteraction;
    let requestedTool: string | undefined;
    for (const event of [
      down(y),
      move(breakPoint),
      down(breakPoint),
      up(breakPoint),
      { type: "finish-drawing" } as FieldInteractionEvent,
    ]) {
      const result = fieldInteraction(model, event, context);
      model = result.model;
      requestedTool = result.requestedTool ?? requestedTool;
    }
    expect(requestedTool).toBe("select");
  });

  it("starts a route from the blue dot without the route tool", () => {
    const context = contextFor(stickThunderPlay, {
      createId: (prefix) => `${prefix}_drawn`,
    });
    const session = run(context, [{ type: "start-route", playerId: "q" }]);
    expect(session.model.drawing).toMatchObject({
      kind: "route",
      playerId: "q",
    });
    expect(session.model.selection).toEqual([]);
  });

  it("abandons a drawing whose Player an undo removed", () => {
    const context = drawingContext();
    const y = positionOf(stickThunderPlay, "y");
    const started = run(context, [down(y)]);
    const without = applyPlayCommand(
      stickThunderPlay,
      deletePlayersCommand(stickThunderPlay, ["y"]),
    );
    expect(pruneFieldSelection(started.model, without).drawing).toBeUndefined();
    expect(
      pruneFieldSelection(started.model, stickThunderPlay).drawing,
    ).toBeDefined();
  });
});
