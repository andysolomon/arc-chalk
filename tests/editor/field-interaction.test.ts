import {
  applyPlayCommand,
  canonicalStringify,
  clearPlayLayerCommand,
  deletePlayersCommand,
  playCommandCoalesceKey,
  type Coordinate,
  type PlayCommand,
  type PlayDocument,
} from "@chalk/domain";
import {
  applyLabelRoleCommand,
  buildMoveCommand,
  fieldHitOptions,
  fieldInteraction,
  gesturePreviewCommand,
  hitTestField,
  idleFieldInteraction,
  insertedEntityIds,
  pruneFieldSelection,
  setLabelAppearanceCommand,
  setLabelTextCommand,
  setRouteKindCommand,
  setRouteStyleCommand,
  straightenRouteCommand,
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
    expect(
      hitTestField(scene, x, screenScale, fieldHitOptions())?.item,
    ).toEqual(player("x"));
  });

  it("hits a route along its stroke", () => {
    // Midway down Z's vertical stem.
    const point = { lateralYards: 21.092896175, depthYards: 5 };
    const hit = hitTestField(scene, point, screenScale, fieldHitOptions());
    expect(hit?.item).toEqual(path("rz"));
    // Z's stem is the main line, not the branch he splits off deeper.
    expect(hit?.branchIndex).toBeUndefined();
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
      hitTestField(scene, offset, screenScale, fieldHitOptions("touch"))?.item,
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
        wasSingle: false,
        start: { lateralYards: 0, depthYards: 0 },
      },
    };
    const pruned = pruneFieldSelection(model, stickThunderPlay);
    expect(pruned.selection).toEqual([player("q")]);
    expect(pruned.gesture.kind).toBe("idle");
  });

  it("keeps a selection on something whose commit has not landed yet", () => {
    // A Player, route, or note the Coach just made is absent from the
    // document for the instant before its save arrives. Pruning it then
    // would deselect it the moment it appeared.
    const model: FieldInteractionModel = {
      selection: [label("label_new")],
      gesture: { kind: "idle" },
    };
    expect(pruneFieldSelection(model, stickThunderPlay).selection).toEqual([]);
    expect(
      pruneFieldSelection(model, stickThunderPlay, new Set(["label_new"]))
        .selection,
    ).toEqual([label("label_new")]);
  });

  it("names every entity a command brings into existence", () => {
    const context = contextFor(stickThunderPlay, {
      tool: "text",
      createId: () => "label_fresh",
    });
    const created = fieldInteraction(
      idleFieldInteraction,
      down({ lateralYards: 4, depthYards: 4 }),
      context,
    );
    expect(insertedEntityIds(created.command!)).toEqual(["label_fresh"]);
    // An edit creates nothing, so nothing is held pending.
    expect(
      insertedEntityIds(setLabelTextCommand(stickThunderPlay, "l2", "x")!),
    ).toEqual([]);
  });

  it("keeps the line and break the Coach narrowed to across an edit", () => {
    // Restyling the very segment he picked out must not un-pick it, or he
    // cannot make two changes to the same piece in a row. The ghost forces
    // the rebuild: without something to drop, pruning returns the model
    // untouched and proves nothing about what a rebuild carries over.
    const model: FieldInteractionModel = {
      selection: [path("rx"), player("ghost")],
      gesture: { kind: "idle" },
      selectedBranchIndex: 0,
      selectedSegmentIndex: 2,
      selectedNodeIndex: 1,
    };
    const pruned = pruneFieldSelection(model, stickThunderPlay);
    expect(pruned.selection).toEqual([path("rx")]);
    expect(pruned.selectedSegmentIndex).toBe(2);
    expect(pruned.selectedBranchIndex).toBe(0);
    expect(pruned.selectedNodeIndex).toBe(1);
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

describe("field interaction route handles", () => {
  const handleContext = (overrides: Partial<FieldInteractionContext> = {}) =>
    contextFor(stickThunderPlay, {
      snap: { enabled: false, grid: "off" },
      ...overrides,
    });
  const pathOf = (document: PlayDocument, id: string) =>
    document.paths.find((candidate) => candidate.id === id)!;
  const handleDown = (
    handle: Parameters<typeof fieldInteraction>[1] extends never
      ? never
      : {
          kind: "node" | "control" | "zone";
          pathId: string;
          pointIndex?: number;
        },
    point: Coordinate,
  ): FieldInteractionEvent =>
    ({
      type: "handle-down",
      handle,
      input: { point, pointerId: 1 },
    }) as FieldInteractionEvent;

  it("drags a break and commits one update for the route", () => {
    const context = handleContext();
    const original = pathOf(stickThunderPlay, "rx");
    const target = { lateralYards: -18, depthYards: 7 };

    const session = run(context, [
      handleDown(
        { kind: "node", pathId: "rx", pointIndex: 1 },
        original.points[1]!,
      ),
      move(target),
      up(target),
    ]);

    expect(session.commands).toHaveLength(1);
    expect(session.commands[0]).toMatchObject({
      kind: "batch",
      label: "Move route break",
    });
    const after = pathOf(
      applyPlayCommand(stickThunderPlay, session.commands[0]!),
      "rx",
    );
    expect(after.points[1]!.lateralYards).toBeCloseTo(target.lateralYards, 6);
    expect(after.points[1]!.depthYards).toBeCloseTo(target.depthYards, 6);
    // Only the dragged break moved.
    expect(after.points[0]).toEqual(original.points[0]);
    expect(after.points[2]).toEqual(original.points[2]);
  });

  it("selects a break on press and commits nothing without a drag", () => {
    const context = handleContext();
    const original = pathOf(stickThunderPlay, "rx");
    const session = run(context, [
      handleDown(
        { kind: "node", pathId: "rx", pointIndex: 2 },
        original.points[2]!,
      ),
      up(original.points[2]!),
    ]);
    expect(session.commands).toHaveLength(0);
    expect(session.model.selectedNodeIndex).toBe(2);
    expect(session.model.selection).toEqual([path("rx")]);
  });

  it("carries a curved segment's bend along with the break it belongs to", () => {
    const curved = {
      ...stickThunderPlay,
      paths: stickThunderPlay.paths.map((candidate) =>
        candidate.id === "rx"
          ? {
              ...candidate,
              points: candidate.points.map((point, index) =>
                index === 1
                  ? { ...point, control: { lateralYards: -14, depthYards: 3 } }
                  : point,
              ),
            }
          : candidate,
      ),
    };
    const context = handleContext({ document: curved });
    const start = pathOf(curved, "rx").points[1]!;
    const target = {
      lateralYards: start.lateralYards + 2,
      depthYards: start.depthYards + 1,
    };

    const session = run(context, [
      handleDown({ kind: "node", pathId: "rx", pointIndex: 1 }, start),
      move(target),
      up(target),
    ]);
    const after = pathOf(applyPlayCommand(curved, session.commands[0]!), "rx");
    expect(after.points[1]!.control!.lateralYards).toBeCloseTo(-14 + 2, 6);
    expect(after.points[1]!.control!.depthYards).toBeCloseTo(3 + 1, 6);
  });

  it("bends a segment with the curve handle and straightens it back", () => {
    const context = handleContext();
    const original = pathOf(stickThunderPlay, "rx");
    const start = original.points[0]!;
    const end = original.points[1]!;
    const midpoint = {
      lateralYards: (start.lateralYards + end.lateralYards) / 2,
      depthYards: (start.depthYards + end.depthYards) / 2,
    };
    const pulled = {
      lateralYards: midpoint.lateralYards + 3,
      depthYards: midpoint.depthYards + 3,
    };

    const bent = run(context, [
      handleDown({ kind: "control", pathId: "rx", pointIndex: 1 }, midpoint),
      move(pulled),
      up(pulled),
    ]);
    expect(bent.commands[0]).toMatchObject({ label: "Curve segment" });
    const curvedPlay = applyPlayCommand(stickThunderPlay, bent.commands[0]!);
    const control = pathOf(curvedPlay, "rx").points[1]!.control!;
    expect(control.lateralYards).toBeCloseTo(
      2 * pulled.lateralYards - midpoint.lateralYards,
      6,
    );

    // Dropping the handle back on the chord's midpoint straightens it again.
    const straightened = run(handleContext({ document: curvedPlay }), [
      handleDown({ kind: "control", pathId: "rx", pointIndex: 1 }, pulled),
      move(midpoint),
      up(midpoint),
    ]);
    const straightPlay = applyPlayCommand(
      curvedPlay,
      straightened.commands[0]!,
    );
    expect(pathOf(straightPlay, "rx").points[1]!.control).toBeUndefined();
  });

  it("sizes a zone within the original's bounds and reads out its width", () => {
    const drop = {
      ...stickThunderPlay,
      paths: [
        {
          id: "drop",
          kind: "zone" as const,
          playerId: "q",
          points: [
            { lateralYards: 0, depthYards: 0 },
            { lateralYards: 0, depthYards: 10 },
          ],
          branches: [],
          style: {
            line: "dashed" as const,
            ending: "bubble" as const,
            color: "blue" as const,
          },
        },
      ],
    };
    const context = handleContext({ document: drop });

    const sized = run(context, [
      handleDown(
        { kind: "zone", pathId: "drop" },
        { lateralYards: 3, depthYards: 13 },
      ),
      move({ lateralYards: 5, depthYards: 14 }),
    ]);
    const gesture = sized.model.gesture;
    expect(gesture.kind).toBe("handle");
    if (gesture.kind !== "handle") return;
    expect(gesture.readout?.text).toBe("10 yds wide");

    const committed = run(
      context,
      [up({ lateralYards: 5, depthYards: 14 })],
      sized.model,
    );
    const after = pathOf(
      applyPlayCommand(drop, committed.commands[0]!),
      "drop",
    );
    expect(after.coverageArea!.radiusLateralYards).toBeCloseTo(5, 6);
    expect(after.coverageArea!.radiusDepthYards).toBeCloseTo(4, 6);

    // A drag far past the original's ceiling is held at it.
    const huge = run(context, [
      handleDown(
        { kind: "zone", pathId: "drop" },
        { lateralYards: 3, depthYards: 13 },
      ),
      move({ lateralYards: 40, depthYards: 40 }),
      up({ lateralYards: 40, depthYards: 40 }),
    ]);
    const capped = pathOf(applyPlayCommand(drop, huge.commands[0]!), "drop");
    expect(capped.coverageArea!.radiusLateralYards).toBeLessThan(13);
    expect(capped.coverageArea!.radiusDepthYards).toBeLessThan(13);
  });

  it("inserts a break into the segment the Coach double-clicked", () => {
    const context = handleContext();
    const original = pathOf(stickThunderPlay, "rz");
    // Midway along Z's vertical stem, which is his first segment.
    const point = { lateralYards: 21.09, depthYards: 6 };

    const session = run(context, [
      { type: "insert-node", pathId: "rz", point },
    ]);
    expect(session.commands).toHaveLength(1);
    expect(session.commands[0]).toMatchObject({ label: "Add route break" });

    const after = pathOf(
      applyPlayCommand(stickThunderPlay, session.commands[0]!),
      "rz",
    );
    expect(after.points).toHaveLength(original.points.length + 1);
    expect(after.points[1]!.lateralYards).toBeCloseTo(point.lateralYards, 6);
    expect(session.model.selectedNodeIndex).toBe(1);
    expect(session.model.selection).toEqual([path("rz")]);
  });

  it("inserts into the later segment when that is the one clicked", () => {
    const context = handleContext();
    const original = pathOf(stickThunderPlay, "rx");
    // Halfway along X's second segment, well clear of the first.
    const second = original.points[1]!;
    const third = original.points[2]!;
    const point = {
      lateralYards: (second.lateralYards + third.lateralYards) / 2,
      depthYards: (second.depthYards + third.depthYards) / 2,
    };

    const session = run(context, [
      { type: "insert-node", pathId: "rx", point },
    ]);
    const after = pathOf(
      applyPlayCommand(stickThunderPlay, session.commands[0]!),
      "rx",
    );
    // The new break lands between the two it was drawn between, leaving the
    // first segment's own break where it was.
    expect(after.points).toHaveLength(original.points.length + 1);
    expect(after.points[1]).toEqual(second);
    expect(after.points[2]!.lateralYards).toBeCloseTo(point.lateralYards, 6);
    expect(after.points[3]).toEqual(third);
    expect(session.model.selectedNodeIndex).toBe(2);
  });

  it("snaps a dragged break to landmarks and reads out its depth", () => {
    const context = contextFor(stickThunderPlay);
    const original = pathOf(stickThunderPlay, "rx");
    // Just off the line of scrimmage and the ball. The start node is used
    // because it has no break before it: a later one would first be
    // constrained to 45 degrees from its neighbour, which is the original's
    // order and would land it somewhere else entirely.
    const loose = { lateralYards: 0.1, depthYards: 0.1 };

    const session = run(context, [
      handleDown(
        { kind: "node", pathId: "rx", pointIndex: 0 },
        original.points[0]!,
      ),
      move(loose),
    ]);
    const gesture = session.model.gesture;
    expect(gesture.kind).toBe("handle");
    if (gesture.kind !== "handle") return;
    expect(gesture.guides.map(({ source }) => source).sort()).toEqual([
      "ball",
      "line-of-scrimmage",
    ]);
    expect(gesture.readout?.text).toContain("0 yds");
    const update = gesture.update;
    expect(update.kind).toBe("update-path");
    if (update.kind !== "update-path") return;
    expect(update.path.points[0]).toMatchObject({
      lateralYards: 0,
      depthYards: 0,
    });
  });

  it("previews exactly what the release will commit", () => {
    const context = handleContext();
    const original = pathOf(stickThunderPlay, "rx");
    const target = { lateralYards: -18, depthYards: 7 };
    const session = run(context, [
      handleDown(
        { kind: "node", pathId: "rx", pointIndex: 1 },
        original.points[1]!,
      ),
      move(target),
    ]);
    const preview = gesturePreviewCommand(session.model, stickThunderPlay);
    const done = run(context, [up(target)], session.model);
    expect(canonicalStringify(preview)).toBe(
      canonicalStringify(done.commands[0]),
    );
  });

  it("ignores a handle press while a route is being drawn", () => {
    const context = handleContext({ tool: "route" });
    const y = positionOf(stickThunderPlay, "y");
    const drawing = run(context, [down(y)]);
    const session = run(
      context,
      [handleDown({ kind: "node", pathId: "rx", pointIndex: 1 }, y)],
      drawing.model,
    );
    expect(session.model.gesture.kind).toBe("idle");
    expect(session.model.drawing).toBeDefined();
  });
});

describe("field interaction labels", () => {
  const labelContext = (overrides: Partial<FieldInteractionContext> = {}) =>
    contextFor(stickThunderPlay, {
      tool: "text",
      snap: { enabled: false, grid: "off" },
      createId: (prefix) => `${prefix}_new`,
      ...overrides,
    });
  const labelOf = (document: PlayDocument, id: string) =>
    document.labels.find((candidate) => candidate.id === id)!;

  it("writes a new note where the Coach pressed and asks for it to be typed", () => {
    const context = labelContext();
    const spot = { lateralYards: 6, depthYards: 9 };

    const result = fieldInteraction(idleFieldInteraction, down(spot), context);
    expect(result.command).toBeDefined();
    expect(result.editingLabelId).toBe("label_new");
    // The Coach is handed the select tool so the note is his to move.
    expect(result.requestedTool).toBe("select");
    expect(result.model.selection).toEqual([label("label_new")]);

    const after = applyPlayCommand(stickThunderPlay, result.command!);
    const written = labelOf(after, "label_new");
    expect(written.position).toEqual(spot);
    expect(written.text).toBe("5 Yds");
    expect(written.size).toBe(13);
    expect(written.box).toBe("none");
    expect(written.unit).toBeUndefined();
  });

  it("gives the note to the defense when a defender was selected", () => {
    const withDefender = {
      ...stickThunderPlay,
      players: [
        ...stickThunderPlay.players,
        {
          ...stickThunderPlay.players[0]!,
          id: "mike",
          unit: "defense" as const,
          position: { lateralYards: 0, depthYards: 5 },
        },
      ],
    };
    const context = labelContext({ document: withDefender });
    const result = fieldInteraction(
      { selection: [player("mike")], gesture: { kind: "idle" } },
      down({ lateralYards: 2, depthYards: 12 }),
      context,
    );
    const after = applyPlayCommand(withDefender, result.command!);
    // Position is never the tell — depth notes live downfield too.
    expect(labelOf(after, "label_new").unit).toBe("defense");
  });

  it("retypes a label and leaves everything else alone", () => {
    const command = setLabelTextCommand(stickThunderPlay, "l2", "3 Yds")!;
    const after = applyPlayCommand(stickThunderPlay, command);
    expect(labelOf(after, "l2").text).toBe("3 Yds");
    expect({ ...labelOf(after, "l2"), text: "" }).toEqual({
      ...labelOf(stickThunderPlay, "l2"),
      text: "",
    });
    // Retyping the same words is not an edit.
    expect(
      setLabelTextCommand(
        stickThunderPlay,
        "l2",
        labelOf(stickThunderPlay, "l2").text,
      ),
    ).toBeUndefined();
  });

  it("coalesces consecutive retyping into one undo entry", () => {
    // The command carries the key the EditorStore coalesces on, so the
    // Coach's keystrokes land as a single entry until he moves on.
    const command = setLabelTextCommand(stickThunderPlay, "l2", "3")!;
    expect(playCommandCoalesceKey(command)).toBe("label:l2");
  });

  it("applies a meaning as a whole look", () => {
    const command = applyLabelRoleCommand(stickThunderPlay, "l2", "alert")!;
    const after = labelOf(applyPlayCommand(stickThunderPlay, command), "l2");
    expect(after).toMatchObject({
      role: "alert",
      color: "red",
      box: "outline",
      boxColor: "red",
      size: 12,
      caps: true,
      mono: false,
    });
  });

  it("changes one part of a label's appearance at a time", () => {
    const sized = setLabelAppearanceCommand(stickThunderPlay, "l2", {
      size: 17,
    })!;
    expect(labelOf(applyPlayCommand(stickThunderPlay, sized), "l2").size).toBe(
      17,
    );

    // Setting what is already set is not an edit.
    expect(
      setLabelAppearanceCommand(stickThunderPlay, "l2", { size: 11 }),
    ).toBeUndefined();
  });

  it("drops the unit key when a note goes back to the offense", () => {
    const toDefense = setLabelAppearanceCommand(stickThunderPlay, "l2", {
      unit: "defense",
    })!;
    const defensive = applyPlayCommand(stickThunderPlay, toDefense);
    expect(labelOf(defensive, "l2").unit).toBe("defense");

    const back = setLabelAppearanceCommand(defensive, "l2", {
      unit: "offense",
    })!;
    const offensive = applyPlayCommand(defensive, back);
    // Belonging to the offense is the absence of a unit, so the key goes
    // rather than storing a value the canonical form would keep.
    expect("unit" in labelOf(offensive, "l2")).toBe(false);
    expect(canonicalStringify(labelOf(offensive, "l2"))).toBe(
      canonicalStringify(labelOf(stickThunderPlay, "l2")),
    );
  });

  it("drags a leader to point at what the note is about", () => {
    const withLeader = applyPlayCommand(stickThunderPlay, {
      kind: "update-label",
      label: {
        ...labelOf(stickThunderPlay, "l2"),
        leader: {
          line: "solid",
          endpoint: { lateralYards: -12, depthYards: 2 },
        },
      },
    });
    const context = labelContext({ document: withLeader, tool: "select" });
    const target = { lateralYards: -9, depthYards: 4 };

    const session = run(context, [
      {
        type: "handle-down",
        handle: { kind: "leader", labelId: "l2" },
        input: { point: { lateralYards: -12, depthYards: 2 }, pointerId: 1 },
      },
      move(target),
      up(target),
    ]);
    expect(session.commands).toHaveLength(1);
    expect(session.commands[0]).toMatchObject({
      label: "Point the leader line",
    });
    expect(session.model.selection).toEqual([label("l2")]);
    const after = labelOf(
      applyPlayCommand(withLeader, session.commands[0]!),
      "l2",
    );
    expect(after.leader!.endpoint.lateralYards).toBeCloseTo(-9, 6);
    expect(after.leader!.endpoint.depthYards).toBeCloseTo(4, 6);
  });

  it("commits nothing when a leader is pressed but not dragged", () => {
    const withLeader = applyPlayCommand(stickThunderPlay, {
      kind: "update-label",
      label: {
        ...labelOf(stickThunderPlay, "l2"),
        leader: {
          line: "solid",
          endpoint: { lateralYards: -12, depthYards: 2 },
        },
      },
    });
    const context = labelContext({ document: withLeader, tool: "select" });
    const session = run(context, [
      {
        type: "handle-down",
        handle: { kind: "leader", labelId: "l2" },
        input: { point: { lateralYards: -12, depthYards: 2 }, pointerId: 1 },
      },
      up({ lateralYards: -12, depthYards: 2 }),
    ]);
    expect(session.commands).toHaveLength(0);
  });

  it("deletes the selected note without touching the rest of the Play", () => {
    const context = labelContext({ tool: "select" });
    const session = run(context, [{ type: "delete" }], {
      selection: [label("l2")],
      gesture: { kind: "idle" },
    });
    const after = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    expect(after.labels).toHaveLength(stickThunderPlay.labels.length - 1);
    expect(after.labels.some(({ id }) => id === "l2")).toBe(false);
    expect(after.players).toEqual(stickThunderPlay.players);
    expect(after.paths).toEqual(stickThunderPlay.paths);
  });
});

describe("field interaction copy, paste, and mirror", () => {
  const clipContext = (overrides: Partial<FieldInteractionContext> = {}) => {
    let next = 0;
    return contextFor(stickThunderPlay, {
      snap: { enabled: false, grid: "off" },
      createId: (prefix) => `${prefix}_${(next += 1)}`,
      ...overrides,
    });
  };
  const pathOf = (document: PlayDocument, id: string) =>
    document.paths.find((candidate) => candidate.id === id)!;

  it("copies nothing when nothing is picked, and pastes nothing without a copy", () => {
    const context = clipContext();
    const empty = run(context, [{ type: "copy" }, { type: "paste" }]);
    expect(empty.commands).toHaveLength(0);
    expect(empty.model.clipboard).toBeUndefined();
  });

  it("pastes a Player and his route as new entities clear of the originals", () => {
    const context = clipContext();
    const session = run(context, [{ type: "copy" }, { type: "paste" }], {
      selection: [player("x"), path("rx")],
      gesture: { kind: "idle" },
    });

    expect(session.commands).toHaveLength(1);
    expect(session.commands[0]).toMatchObject({
      kind: "batch",
      label: "Paste",
    });
    const after = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    expect(after.players).toHaveLength(stickThunderPlay.players.length + 1);
    expect(after.paths).toHaveLength(stickThunderPlay.paths.length + 1);

    // The originals are untouched.
    expect(positionOf(after, "x")).toEqual(positionOf(stickThunderPlay, "x"));
    expect(pathOf(after, "rx")).toEqual(pathOf(stickThunderPlay, "rx"));

    // The copy is offset, and its route runs from the copied man.
    const copiedPlayer = after.players.at(-1)!;
    const copiedPath = after.paths.at(-1)!;
    expect(copiedPlayer.id).not.toBe("x");
    expect(copiedPath.playerId).toBe(copiedPlayer.id);
    expect(copiedPlayer.position.lateralYards).toBeGreaterThan(
      positionOf(stickThunderPlay, "x").lateralYards,
    );
    expect(copiedPlayer.position.depthYards).toBeLessThan(
      positionOf(stickThunderPlay, "x").depthYards,
    );
    // Everything the copy is made of moved by the same amount.
    const shift =
      copiedPlayer.position.lateralYards -
      positionOf(stickThunderPlay, "x").lateralYards;
    copiedPath.points.forEach((point, index) => {
      expect(point.lateralYards).toBeCloseTo(
        pathOf(stickThunderPlay, "rx").points[index]!.lateralYards + shift,
        6,
      );
    });
    expect(session.model.selection).toEqual([
      { kind: "player", id: copiedPlayer.id },
      { kind: "path", id: copiedPath.id },
    ]);
  });

  it("keeps a route attached to its man when he was left behind", () => {
    const context = clipContext();
    const session = run(context, [{ type: "copy" }, { type: "paste" }], {
      selection: [path("rx")],
      gesture: { kind: "idle" },
    });
    const after = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    // The schema has no way to say "attached to nobody", so the copy runs
    // from the same man rather than becoming an orphan.
    expect(after.paths.at(-1)!.playerId).toBe("x");
    expect(after.players).toHaveLength(stickThunderPlay.players.length);
  });

  it("rebinds a copied note to the copied route, and frees one left behind", () => {
    const bound = applyPlayCommand(stickThunderPlay, {
      kind: "update-label",
      label: {
        ...stickThunderPlay.labels.find(({ id }) => id === "l2")!,
        binding: {
          pathId: "rx",
          segmentIndex: 1,
          progress: 0.5,
          offset: { lateralYards: 1, depthYards: 0 },
        },
      },
    });

    const together = run(
      clipContext({ document: bound }),
      [{ type: "copy" }, { type: "paste" }],
      {
        selection: [path("rx"), label("l2")],
        gesture: { kind: "idle" },
      },
    );
    const withBoth = applyPlayCommand(bound, together.commands[0]!);
    const copiedPath = withBoth.paths.at(-1)!;
    expect(withBoth.labels.at(-1)!.binding?.pathId).toBe(copiedPath.id);

    const alone = run(
      clipContext({ document: bound }),
      [{ type: "copy" }, { type: "paste" }],
      { selection: [label("l2")], gesture: { kind: "idle" } },
    );
    const labelOnly = applyPlayCommand(bound, alone.commands[0]!);
    // Nothing to ride, so the copy keeps its words and is placed by hand.
    expect(labelOnly.labels.at(-1)!.binding).toBeUndefined();
    expect(labelOnly.labels.at(-1)!.text).toBe(
      bound.labels.find(({ id }) => id === "l2")!.text,
    );
  });

  it("pastes the same copy twice without the two landing on each other", () => {
    const context = clipContext();
    const copied = run(context, [{ type: "copy" }], {
      selection: [player("q")],
      gesture: { kind: "idle" },
    });
    const first = run(context, [{ type: "paste" }], copied.model);
    const once = applyPlayCommand(stickThunderPlay, first.commands[0]!);
    const second = run(
      contextFor(once, {
        snap: { enabled: false, grid: "off" },
        createId: (prefix) => `${prefix}_again`,
      }),
      [{ type: "paste" }],
      first.model.clipboard
        ? { ...first.model, clipboard: first.model.clipboard }
        : first.model,
    );
    const twice = applyPlayCommand(once, second.commands[0]!);
    expect(twice.players).toHaveLength(stickThunderPlay.players.length + 2);
    // Both copies come from the same clipboard, so they land together —
    // matching the original, which offsets from the source every time.
    expect(twice.players.at(-1)!.position).toEqual(
      twice.players.at(-2)!.position,
    );
  });

  it("duplicates without reading or disturbing the clipboard", () => {
    const context = clipContext();
    const copied = run(context, [{ type: "copy" }], {
      selection: [player("q")],
      gesture: { kind: "idle" },
    });
    const duplicated = run(context, [{ type: "duplicate" }], {
      ...copied.model,
      selection: [player("h")],
    });
    const after = applyPlayCommand(stickThunderPlay, duplicated.commands[0]!);
    // H was duplicated, not the Quarterback that sits on the clipboard.
    expect(after.players.at(-1)!.label).toBe("H");
    expect(duplicated.model.clipboard).toEqual(copied.model.clipboard);
  });

  it("mirrors the whole Play when nothing is picked", () => {
    const context = clipContext();
    const session = run(context, [{ type: "mirror" }]);
    expect(session.commands[0]).toEqual({ kind: "mirror-play" });

    const mirrored = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    expect(positionOf(mirrored, "z").lateralYards).toBeCloseTo(
      -positionOf(stickThunderPlay, "z").lateralYards,
      9,
    );
    // Mirroring twice is the Play exactly as it was (ADR 0034).
    const back = applyPlayCommand(mirrored, { kind: "mirror-play" });
    expect(canonicalStringify(back)).toBe(canonicalStringify(stickThunderPlay));
  });

  it("mirrors only what is picked, carrying each man's routes with him", () => {
    const context = clipContext();
    const session = run(context, [{ type: "mirror" }], {
      selection: [player("x")],
      gesture: { kind: "idle" },
    });
    expect(session.commands[0]).toMatchObject({ label: "Mirror selection" });

    const after = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    expect(positionOf(after, "x").lateralYards).toBeCloseTo(
      -positionOf(stickThunderPlay, "x").lateralYards,
      9,
    );
    // X's route came with him; nobody else moved.
    expect(pathOf(after, "rx").points[2]!.lateralYards).toBeCloseTo(
      -pathOf(stickThunderPlay, "rx").points[2]!.lateralYards,
      9,
    );
    expect(positionOf(after, "z")).toEqual(positionOf(stickThunderPlay, "z"));
    expect(pathOf(after, "rz")).toEqual(pathOf(stickThunderPlay, "rz"));
  });

  it("reflects a note's leader and a bound note's offset", () => {
    const decorated = applyPlayCommand(stickThunderPlay, {
      kind: "batch",
      commands: [
        {
          kind: "update-label",
          label: {
            ...stickThunderPlay.labels.find(({ id }) => id === "l1")!,
            leader: {
              line: "solid",
              endpoint: { lateralYards: -8, depthYards: 3 },
            },
          },
        },
        {
          kind: "update-label",
          label: {
            ...stickThunderPlay.labels.find(({ id }) => id === "l2")!,
            binding: {
              pathId: "rx",
              segmentIndex: 1,
              progress: 0.5,
              offset: { lateralYards: 2, depthYards: 1 },
            },
          },
        },
      ],
    });
    const context = clipContext({ document: decorated });
    const session = run(context, [{ type: "mirror" }], {
      selection: [label("l1"), label("l2")],
      gesture: { kind: "idle" },
    });
    const after = applyPlayCommand(decorated, session.commands[0]!);
    const one = after.labels.find(({ id }) => id === "l1")!;
    const two = after.labels.find(({ id }) => id === "l2")!;
    expect(one.leader!.endpoint.lateralYards).toBeCloseTo(8, 9);
    expect(one.leader!.endpoint.depthYards).toBeCloseTo(3, 9);
    // A bound note rides its route, so only its offset reflects.
    expect(two.binding!.offset.lateralYards).toBeCloseTo(-2, 9);
    expect(two.binding!.offset.depthYards).toBeCloseTo(1, 9);
  });

  it("mirrors nothing on an empty Play", () => {
    const empty = applyPlayCommand(
      stickThunderPlay,
      clearPlayLayerCommand(stickThunderPlay, "players"),
    );
    const cleared = applyPlayCommand(
      empty,
      clearPlayLayerCommand(empty, "labels"),
    );
    const session = run(clipContext({ document: cleared }), [
      { type: "mirror" },
    ]);
    expect(session.commands).toHaveLength(0);
  });
});

describe("field interaction branch and segment selection", () => {
  const routeContext = (overrides: Partial<FieldInteractionContext> = {}) =>
    contextFor(stickThunderPlay, {
      snap: { enabled: false, grid: "off" },
      ...overrides,
    });
  const pathOf = (document: PlayDocument, id: string) =>
    document.paths.find((candidate) => candidate.id === id)!;
  /** A point on the segment between two breaks of a route's main line. */
  const midOfSegment = (document: PlayDocument, id: string, index: number) => {
    const points = pathOf(document, id).points;
    return {
      lateralYards:
        (points[index - 1]!.lateralYards + points[index]!.lateralYards) / 2,
      depthYards:
        (points[index - 1]!.depthYards + points[index]!.depthYards) / 2,
    };
  };

  it("selects the whole route first, and a segment only on a second click", () => {
    const context = routeContext();
    const onSecond = midOfSegment(stickThunderPlay, "rx", 2);

    const first = run(context, [down(onSecond), up(onSecond)]);
    expect(first.model.selection).toEqual([path("rx")]);
    // The first click picks the route entire, as the original did.
    expect(first.model.selectedSegmentIndex).toBeUndefined();

    const second = run(context, [down(onSecond), up(onSecond)], first.model);
    expect(second.model.selectedSegmentIndex).toBe(2);
    expect(second.model.selection).toEqual([path("rx")]);
    expect(second.commands).toHaveLength(0);
  });

  it("picks out the segment the Coach clicked, not always the same one", () => {
    const context = routeContext();
    const onFirst = midOfSegment(stickThunderPlay, "rx", 1);
    const selected = run(context, [down(onFirst), up(onFirst)]);
    const narrowed = run(context, [down(onFirst), up(onFirst)], selected.model);
    expect(narrowed.model.selectedSegmentIndex).toBe(1);
  });

  it("selects a branch when the Coach clicks the line he split off", () => {
    const context = routeContext();
    // Z's branch runs from his stem's break out to the deep corner.
    const branch = pathOf(stickThunderPlay, "rz").branches[0]!;
    const from = pathOf(stickThunderPlay, "rz").points[branch.fromIndex]!;
    const end = branch.points[0]!;
    const onBranch = {
      lateralYards: (from.lateralYards + end.lateralYards) / 2,
      depthYards: (from.depthYards + end.depthYards) / 2,
    };

    const selected = run(context, [down(onBranch), up(onBranch)]);
    expect(selected.model.selection).toEqual([path("rz")]);
    expect(selected.model.selectedBranchIndex).toBeUndefined();

    const onBranchLine = run(
      context,
      [down(onBranch), up(onBranch)],
      selected.model,
    );
    expect(onBranchLine.model.selectedBranchIndex).toBe(0);
    // A branch is a whole line, so no one segment of it is picked out.
    expect(onBranchLine.model.selectedSegmentIndex).toBeUndefined();
  });

  it("forgets the line and break when the Coach picks something else", () => {
    const context = routeContext();
    const onSecond = midOfSegment(stickThunderPlay, "rx", 2);
    const narrowed = run(
      context,
      [down(onSecond), up(onSecond), down(onSecond), up(onSecond)],
      idleFieldInteraction,
    );
    expect(narrowed.model.selectedSegmentIndex).toBe(2);

    const q = positionOf(stickThunderPlay, "q");
    const elsewhere = run(context, [down(q), up(q)], narrowed.model);
    expect(elsewhere.model.selection).toEqual([player("q")]);
    expect(elsewhere.model.selectedSegmentIndex).toBeUndefined();
    expect(elsewhere.model.selectedBranchIndex).toBeUndefined();
  });

  it("drags a break of the selected branch, leaving the main line alone", () => {
    const context = routeContext();
    const before = pathOf(stickThunderPlay, "rz");
    const target = { lateralYards: 18, depthYards: 20 };

    const session = run(context, [
      {
        type: "handle-down",
        handle: {
          kind: "node",
          pathId: "rz",
          pointIndex: 0,
          branchIndex: 0,
        },
        input: { point: before.branches[0]!.points[0]!, pointerId: 1 },
      },
      move(target),
      up(target),
    ]);

    expect(session.commands).toHaveLength(1);
    const after = pathOf(
      applyPlayCommand(stickThunderPlay, session.commands[0]!),
      "rz",
    );
    expect(after.branches[0]!.points[0]!.lateralYards).toBeCloseTo(
      target.lateralYards,
      6,
    );
    // The branch is still the branch: one break, not a copy of the stem.
    // Without this the edit could read the main line and write it back into
    // the branch, which moves the right number and destroys the shape.
    expect(after.branches[0]!.points).toHaveLength(
      before.branches[0]!.points.length,
    );
    // The stem the branch grows from did not move.
    expect(after.points).toEqual(before.points);
  });

  it("measures a branch's first break from where it was split off", () => {
    const context = contextFor(stickThunderPlay, {
      snap: { enabled: true, grid: "off" },
    });
    const before = pathOf(stickThunderPlay, "rz");
    const from = before.points[before.branches[0]!.fromIndex]!;
    // Straight downfield of the split, which is a 45 degree family member
    // only when measured from the split rather than from the route's start.
    const target = {
      lateralYards: from.lateralYards + 0.4,
      depthYards: from.depthYards + 6,
    };

    const session = run(context, [
      {
        type: "handle-down",
        handle: { kind: "node", pathId: "rz", pointIndex: 0, branchIndex: 0 },
        input: { point: before.branches[0]!.points[0]!, pointerId: 1 },
      },
      move(target),
    ]);
    const gesture = session.model.gesture;
    expect(gesture.kind).toBe("handle");
    if (gesture.kind !== "handle") return;
    const update = gesture.update;
    if (update.kind !== "update-path") throw new Error("expected a path edit");
    expect(update.path.branches[0]!.points[0]!.lateralYards).toBeCloseTo(
      from.lateralYards,
      6,
    );
  });

  it("bends a branch segment against the break it grows from", () => {
    const context = routeContext();
    const before = pathOf(stickThunderPlay, "rz");
    const from = before.points[before.branches[0]!.fromIndex]!;
    const end = before.branches[0]!.points[0]!;
    const midpoint = {
      lateralYards: (from.lateralYards + end.lateralYards) / 2,
      depthYards: (from.depthYards + end.depthYards) / 2,
    };
    const pulled = {
      lateralYards: midpoint.lateralYards + 4,
      depthYards: midpoint.depthYards,
    };

    const session = run(context, [
      {
        type: "handle-down",
        handle: {
          kind: "control",
          pathId: "rz",
          pointIndex: 0,
          branchIndex: 0,
        },
        input: { point: midpoint, pointerId: 1 },
      },
      move(pulled),
      up(pulled),
    ]);
    const after = pathOf(
      applyPlayCommand(stickThunderPlay, session.commands[0]!),
      "rz",
    );
    expect(after.branches[0]!.points[0]!.control).toBeDefined();
    expect(after.branches[0]!.points).toHaveLength(
      before.branches[0]!.points.length,
    );
    expect(after.points).toEqual(before.points);
  });
});

describe("route styling", () => {
  const pathOf = (document: PlayDocument, id: string) =>
    document.paths.find((candidate) => candidate.id === id)!;

  it("restyles the whole line when nothing is picked out", () => {
    const command = setRouteStyleCommand(
      stickThunderPlay,
      "rx",
      {},
      {
        line: "dashed",
      },
    )!;
    const after = pathOf(applyPlayCommand(stickThunderPlay, command), "rx");
    expect(after.style.line).toBe("dashed");
    expect(after.style.ending).toBe(
      pathOf(stickThunderPlay, "rx").style.ending,
    );
  });

  it("dots one leg of an otherwise solid route", () => {
    const command = setRouteStyleCommand(
      stickThunderPlay,
      "rx",
      { segmentIndex: 2 },
      { line: "dotted" },
    )!;
    const after = pathOf(applyPlayCommand(stickThunderPlay, command), "rx");
    // The line itself is untouched; only the picked leg carries an override.
    expect(after.style.line).toBe("solid");
    expect(after.points[2]!.segmentStyle?.line).toBe("dotted");
    expect(after.points[1]!.segmentStyle).toBeUndefined();
  });

  it("clears the piecemeal overrides when the whole line is restyled", () => {
    const dotted = applyPlayCommand(
      stickThunderPlay,
      setRouteStyleCommand(
        stickThunderPlay,
        "rx",
        { segmentIndex: 2 },
        { line: "dotted" },
      )!,
    );
    expect(pathOf(dotted, "rx").points[2]!.segmentStyle).toBeDefined();

    const whole = applyPlayCommand(
      dotted,
      setRouteStyleCommand(dotted, "rx", {}, { line: "dashed" })!,
    );
    // The line reads as one thing again rather than as a dashed line with a
    // dotted leg the Coach can no longer see the reason for.
    expect(pathOf(whole, "rx").style.line).toBe("dashed");
    expect(pathOf(whole, "rx").points[2]!.segmentStyle).toBeUndefined();
  });

  it("takes a colour to the whole line even with a segment picked out", () => {
    const command = setRouteStyleCommand(
      stickThunderPlay,
      "rx",
      { segmentIndex: 2 },
      { color: "red" },
    )!;
    const after = pathOf(applyPlayCommand(stickThunderPlay, command), "rx");
    // The contract has no per-segment colour, and neither did the original.
    expect(after.style.color).toBe("red");
    expect(after.points[2]!.segmentStyle).toBeUndefined();
  });

  it("restyles a branch without touching the line it grows from", () => {
    const command = setRouteStyleCommand(
      stickThunderPlay,
      "rz",
      { branchIndex: 0 },
      { line: "dashed", ending: "square" },
    )!;
    const after = pathOf(applyPlayCommand(stickThunderPlay, command), "rz");
    expect(after.branches[0]!.style.line).toBe("dashed");
    expect(after.branches[0]!.style.ending).toBe("square");
    expect(after.style).toEqual(pathOf(stickThunderPlay, "rz").style);
  });

  it("gives a line the look of the kind it becomes", () => {
    const asBlock = pathOf(
      applyPlayCommand(
        stickThunderPlay,
        setRouteKindCommand(stickThunderPlay, "rx", "block")!,
      ),
      "rx",
    );
    expect(asBlock.kind).toBe("block");
    expect(asBlock.style).toMatchObject({ line: "solid", ending: "bar" });

    // Back to a route: the bar only made sense as a block, so it goes.
    const backToRoute = pathOf(
      applyPlayCommand(
        {
          ...stickThunderPlay,
          paths: [asBlock, ...stickThunderPlay.paths.slice(1)],
        },
        setRouteKindCommand(
          {
            ...stickThunderPlay,
            paths: [asBlock, ...stickThunderPlay.paths.slice(1)],
          },
          "rx",
          "route",
        )!,
      ),
      "rx",
    );
    expect(backToRoute.style.ending).toBe("arrow");

    // A blitz is red and a stunt runs on chevrons, whatever came before.
    const blitz = pathOf(
      applyPlayCommand(
        stickThunderPlay,
        setRouteKindCommand(stickThunderPlay, "rx", "blitz")!,
      ),
      "rx",
    );
    expect(blitz.style).toMatchObject({ color: "red", ending: "arrow" });
  });

  it("keeps what the Coach chose when the new kind does not contradict it", () => {
    // A block ending in a dot is unusual but his to make; turning it back
    // into a route has no reason to take the dot away.
    const asBlock = applyPlayCommand(
      stickThunderPlay,
      setRouteKindCommand(stickThunderPlay, "rx", "block")!,
    );
    const dotted = applyPlayCommand(
      asBlock,
      setRouteStyleCommand(asBlock, "rx", {}, { ending: "dot" })!,
    );
    const backToRoute = pathOf(
      applyPlayCommand(dotted, setRouteKindCommand(dotted, "rx", "route")!),
      "rx",
    );
    expect(backToRoute.style.ending).toBe("dot");

    // Motion takes the line and the ending but leaves his colour alone.
    const red = applyPlayCommand(
      stickThunderPlay,
      setRouteStyleCommand(stickThunderPlay, "rx", {}, { color: "red" })!,
    );
    const motion = pathOf(
      applyPlayCommand(red, setRouteKindCommand(red, "rx", "motion")!),
      "rx",
    );
    expect(motion.style).toMatchObject({
      line: "zigzag",
      ending: "arrow",
      color: "red",
    });
  });

  it("straightens only the line the Coach is working on", () => {
    const bent = applyPlayCommand(stickThunderPlay, {
      kind: "update-path",
      path: {
        ...pathOf(stickThunderPlay, "rz"),
        points: pathOf(stickThunderPlay, "rz").points.map((point, index) =>
          index === 1
            ? { ...point, control: { lateralYards: 20, depthYards: 6 } }
            : point,
        ),
        branches: pathOf(stickThunderPlay, "rz").branches.map((branch) => ({
          ...branch,
          points: branch.points.map((point) => ({
            ...point,
            control: { lateralYards: 22, depthYards: 15 },
          })),
        })),
      },
    });

    const mainOnly = pathOf(
      applyPlayCommand(bent, straightenRouteCommand(bent, "rz")!),
      "rz",
    );
    expect(mainOnly.points[1]!.control).toBeUndefined();
    // The branch keeps its bend: it was not what he was working on.
    expect(mainOnly.branches[0]!.points[0]!.control).toBeDefined();

    const branchOnly = pathOf(
      applyPlayCommand(
        bent,
        straightenRouteCommand(bent, "rz", { branchIndex: 0 })!,
      ),
      "rz",
    );
    expect(branchOnly.branches[0]!.points[0]!.control).toBeUndefined();
    expect(branchOnly.points[1]!.control).toBeDefined();
  });

  it("declines edits that would change nothing", () => {
    expect(
      setRouteStyleCommand(stickThunderPlay, "rx", {}, { line: "solid" }),
    ).toBeUndefined();
    expect(straightenRouteCommand(stickThunderPlay, "rx")).toBeUndefined();
    expect(
      setRouteKindCommand(stickThunderPlay, "rx", "route"),
    ).toBeUndefined();
    expect(
      setRouteStyleCommand(stickThunderPlay, "missing", {}, {}),
    ).toBeUndefined();
  });
});
