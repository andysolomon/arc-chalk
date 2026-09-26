import {
  applyPlayCommand,
  assignmentForPath,
  canonicalStringify,
  DEFAULT_ZONE_COVERAGE_RADII,
  deletePlayersCommand,
  playCommandCoalesceKey,
  type Coordinate,
  type PlayCommand,
  type PlayDocument,
} from "@chalk/domain";
import {
  addAlternateRouteCommand,
  addRouteChoiceCommand,
  buildMoveCommand,
  flipPlayerLinesCommand,
  flipRouteCommand,
  removeRouteChoiceCommand,
  reorderSelectionCommand,
  fieldInteraction,
  gesturePreviewCommand,
  idleFieldInteraction,
  insertedEntityIds,
  pruneFieldSelection,
  setLabelAppearanceCommand,
  setLabelTextCommand,
  setRouteAssignmentCommand,
  setRouteCoachingTextCommand,
  setRouteKindCommand,
  setRouteReadCommand,
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
/** The inspector's Draw button, or the R M B Z keys, for one man. */
const start = (
  kind: "route" | "motion" | "block" | "zone",
  playerId: string,
): FieldInteractionEvent => ({ type: "start-drawing", kind, playerId });
const up = (point: Coordinate, pointerId = 1): FieldInteractionEvent => ({
  type: "pointer-up",
  input: { point, pointerId },
});

/** Stick Thunder with a Mike linebacker across from it. */
const withMike = applyPlayCommand(stickThunderPlay, {
  kind: "batch",
  label: "Add Player",
  commands: [
    {
      kind: "insert-players",
      players: [
        {
          index: stickThunderPlay.players.length,
          item: {
            id: "mike",
            unit: "defense",
            position: { lateralYards: 0, depthYards: 5 },
            symbol: "circle",
            label: "M",
            sublabel: "",
            fill: "none",
            color: "ink",
          },
        },
      ],
    },
  ],
});

describe("field interaction selection", () => {
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

  it("lets a finger wobble on a man and still have tapped him", () => {
    const context = contextFor(stickThunderPlay, {
      snap: { enabled: false, grid: "off" },
    });
    const q = positionOf(stickThunderPlay, "q");
    const across = (px: number) => ({
      lateralYards: q.lateralYards + px / screenScale.lateralPixelsPerYard,
      depthYards: q.depthYards,
    });
    const touch = (
      type: "pointer-down" | "pointer-move" | "pointer-up",
      point: Coordinate,
    ): FieldInteractionEvent => ({
      type,
      input: { point, pointerId: 1, pointerType: "touch" },
    });
    const all = run(context, [{ type: "select-all" }]).model;

    // Six pixels of a fingertip rolling is a tap: it narrows the selection
    // to him, as a click does, and moves nobody.
    const tapped = run(
      context,
      [
        touch("pointer-down", q),
        touch("pointer-move", across(6)),
        touch("pointer-up", across(6)),
      ],
      all,
    );
    expect(tapped.commands).toHaveLength(0);
    expect(tapped.model.selection).toEqual([player("q")]);

    // The same six pixels under a mouse are a drag of everything picked.
    const dragged = run(
      context,
      [down(q), move(across(6)), up(across(6))],
      all,
    );
    expect(dragged.commands).toHaveLength(1);

    // And a finger that means to move him still does.
    const moved = run(context, [
      touch("pointer-down", q),
      touch("pointer-move", across(24)),
      touch("pointer-up", across(24)),
    ]);
    expect(moved.commands).toHaveLength(1);
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
  it("deletes a mixed selection with its dependents as one batch, keeping the man", () => {
    const context = contextFor(stickThunderPlay);
    const session = run(context, [{ type: "delete" }], {
      selection: [player("x"), label("l1")],
      gesture: { kind: "idle" },
    });
    expect(session.commands).toHaveLength(1);
    expect(session.model.selection).toEqual([]);

    const after = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    // Eleven a side is the roster (ADR 0052): X stays in his stance, and
    // what he was given — his route, never itself selected — is cleared.
    expect(after.players.some(({ id }) => id === "x")).toBe(true);
    expect(after.paths.some(({ id }) => id === "rx")).toBe(false);
    expect(after.labels.some(({ id }) => id === "l1")).toBe(false);
    expect(after.players).toHaveLength(stickThunderPlay.players.length);
  });
});

describe("field interaction tools", () => {
  it("draws a blitz path from a defender asked for a block, and a zone drop", () => {
    const context = contextFor(withMike);
    expect(run(context, [start("block", "mike")]).model.drawing).toMatchObject({
      kind: "blitz",
      playerId: "mike",
    });
    expect(run(context, [start("zone", "mike")]).model.drawing).toMatchObject({
      kind: "zone",
    });
    expect(run(context, [start("block", "y")]).model.drawing).toMatchObject({
      kind: "block",
    });
  });

  it("gives nobody a line by hand his position cannot run", () => {
    const context = contextFor(withMike);
    const drawn = (kind: "route" | "motion" | "block" | "zone", id: string) =>
      run(context, [start(kind, id)]).model.drawing;

    // A defender never runs a route or a motion.
    expect(drawn("route", "mike")).toBeUndefined();
    expect(drawn("motion", "mike")).toBeUndefined();
    // Nobody on offense drops into a zone.
    expect(drawn("zone", "y")).toBeUndefined();
    expect(drawn("zone", "ol2")).toBeUndefined();
    // A lineman only blocks.
    expect(drawn("route", "ol2")).toBeUndefined();
    expect(drawn("motion", "ol2")).toBeUndefined();
    expect(drawn("block", "ol2")).toMatchObject({
      kind: "block",
      playerId: "ol2",
    });

    // The blue dot's drag is a route too, so it starts nothing from either.
    for (const playerId of ["mike", "ol2"]) {
      const dragged = run(context, [{ type: "start-route", playerId }]);
      expect(dragged.model.drawing).toBeUndefined();
      expect(dragged.commands).toHaveLength(0);
    }
  });

  it("ignores a start for a man who is not there, or while a line is in hand", () => {
    const context = contextFor(stickThunderPlay);
    expect(
      run(context, [start("route", "nobody")]).model.drawing,
    ).toBeUndefined();
    const busy = run(context, [start("route", "y"), start("motion", "z")]);
    expect(busy.model.drawing).toMatchObject({ kind: "route", playerId: "y" });
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

  it("holds a man at the line of scrimmage instead of carrying him across", () => {
    // Offense stands at negative depth and keeps a yard clear of the ball
    // (ADR 0052): a drag downfield stops there.
    const q = positionOf(stickThunderPlay, "q");
    const command = buildMoveCommand(stickThunderPlay, [player("q")], {
      lateralYards: 0,
      depthYards: 40,
    });
    const after = applyPlayCommand(stickThunderPlay, command!);
    expect(positionOf(after, "q").depthYards).toBe(-1);
    expect(positionOf(after, "q").lateralYards).toBe(q.lateralYards);

    const lineman = positionOf(stickThunderPlay, "ol2");
    expect(lineman.depthYards).toBeLessThan(0);
    const held = applyPlayCommand(
      stickThunderPlay,
      buildMoveCommand(stickThunderPlay, [player("ol2")], {
        lateralYards: 0,
        depthYards: 1 - lineman.depthYards,
      })!,
    );
    expect(positionOf(held, "ol2").depthYards).toBe(-1);
  });

  it("holds a dragged group together at the line, and lets men back away from it", () => {
    const q = positionOf(stickThunderPlay, "q");
    const ol2 = positionOf(stickThunderPlay, "ol2");
    const command = buildMoveCommand(
      stickThunderPlay,
      [player("q"), player("ol2")],
      { lateralYards: 2, depthYards: 40 },
    );
    const after = applyPlayCommand(stickThunderPlay, command!);
    // The lineman reaches the line first and the group stops with him, so
    // the Quarterback keeps his distance behind the line.
    expect(positionOf(after, "ol2").depthYards).toBe(-1);
    expect(positionOf(after, "q").depthYards).toBeCloseTo(
      q.depthYards + (-1 - ol2.depthYards),
      6,
    );
    expect(positionOf(after, "q").lateralYards).toBeCloseTo(
      q.lateralYards + 2,
      6,
    );

    // Away from the ball is always open.
    const back = applyPlayCommand(
      stickThunderPlay,
      buildMoveCommand(stickThunderPlay, [player("q")], {
        lateralYards: 0,
        depthYards: -3,
      })!,
    );
    expect(positionOf(back, "q").depthYards).toBeCloseTo(q.depthYards - 3, 6);
  });
});

describe("field interaction drawing", () => {
  const drawingContext = (overrides: Partial<FieldInteractionContext> = {}) =>
    contextFor(stickThunderPlay, {
      snap: { enabled: false, grid: "off" },
      createId: (prefix) => `${prefix}_drawn`,
      ...overrides,
    });

  it("gives each kind the original's defaults and dots a second route", () => {
    const y = positionOf(stickThunderPlay, "y");
    const breakPoint = {
      lateralYards: y.lateralYards + 4,
      depthYards: y.depthYards + 4,
    };
    const drawWith = (kind: "route" | "motion" | "block" | "zone") => {
      const session = run(drawingContext(), [
        start(kind, "y"),
        move(breakPoint),
        down(breakPoint),
        up(breakPoint),
        { type: "finish-drawing" },
      ]);
      const after = applyPlayCommand(stickThunderPlay, session.commands[0]!);
      return after.paths.find(({ id }) => id === "path_drawn")!;
    };
    // A drop is a defender's, so it is drawn from the Mike.
    const mike = positionOf(withMike, "mike");
    const dropBreak = {
      lateralYards: mike.lateralYards + 4,
      depthYards: mike.depthYards + 4,
    };
    const dropSession = run(
      contextFor(withMike, {
        snap: { enabled: false, grid: "off" },
        createId: (prefix) => `${prefix}_drawn`,
      }),
      [
        start("zone", "mike"),
        move(dropBreak),
        down(dropBreak),
        up(dropBreak),
        { type: "finish-drawing" },
      ],
    );
    const drop = applyPlayCommand(
      withMike,
      dropSession.commands[0]!,
    ).paths.find(({ id }) => id === "path_drawn")!;

    expect(drawWith("motion").style).toMatchObject({
      line: "zigzag",
      ending: "arrow",
      color: "ink",
    });
    expect(drawWith("block").style).toMatchObject({
      line: "solid",
      ending: "bar",
    });
    expect(drop.style).toMatchObject({
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
      start("route", "q"),
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

    const snapped = run(contextFor(stickThunderPlay), [
      start("route", "y"),
      move(loose),
    ]);
    const cursor = snapped.model.drawing!.cursor;
    // A 45° family member: straight up, so no lateral drift at all.
    expect(cursor.lateralYards).toBeCloseTo(y.lateralYards, 6);
    expect(cursor.depthYards).toBeGreaterThan(y.depthYards);

    const free = run(contextFor(stickThunderPlay), [
      start("route", "y"),
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
    const session = run(context, [
      start("route", "y"),
      move(nudge),
      down(nudge),
    ]);
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
      start("route", "y"),
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
      start("route", "y"),
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
    const halfWidth = stickThunderPlay.fieldProfile.widthYards / 2;

    const session = run(context, [
      start("route", "y"),
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
      start("route", "y"),
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
    const session = run(context, [
      start("route", "y"),
      { type: "finish-drawing" },
    ]);
    expect(session.commands).toHaveLength(0);
    expect(session.model.drawing).toBeUndefined();
  });

  it("abandons a drawing whose Player an undo removed", () => {
    const context = drawingContext();
    const started = run(context, [start("route", "y")]);
    const without = applyPlayCommand(
      stickThunderPlay,
      deletePlayersCommand(stickThunderPlay, ["y"]),
    );
    expect(pruneFieldSelection(started.model, without).drawing).toBeUndefined();
    expect(
      pruneFieldSelection(started.model, stickThunderPlay).drawing,
    ).toBeDefined();
  });

  it("follows a blue-dot drag in the direction pulled, not straight upfield", () => {
    const context = contextFor(stickThunderPlay);
    const origin = positionOf(stickThunderPlay, "q");
    // The handle sits upfield of the man. That offset must not become the
    // first segment: a pull to the side, back, or further upfield starts there.
    const press = { ...origin, depthYards: origin.depthYards + 3 };
    const sideways = {
      lateralYards: press.lateralYards + 6,
      depthYards: press.depthYards,
    };
    const toTheSide = run(context, [
      {
        type: "start-route",
        playerId: "q",
        input: { pointerId: 1, point: press },
      },
      move(sideways),
      up(sideways),
    ]);
    expect(toTheSide.model.drawing?.points?.[0]).toEqual(origin);
    expect(toTheSide.model.drawing?.points?.[1]?.depthYards).toBeCloseTo(
      origin.depthYards,
      5,
    );
    expect(toTheSide.model.drawing?.points?.[1]?.lateralYards).toBeCloseTo(
      origin.lateralYards + 6,
      5,
    );

    const back = {
      lateralYards: press.lateralYards,
      depthYards: press.depthYards - 5,
    };
    const backward = run(context, [
      {
        type: "start-route",
        playerId: "q",
        input: { pointerId: 1, point: press },
      },
      move(back),
      up(back),
    ]);
    expect(backward.model.drawing?.points?.[1]?.depthYards).toBeCloseTo(
      origin.depthYards - 5,
      5,
    );
    expect(backward.model.drawing?.points?.[1]?.lateralYards).toBeCloseTo(
      origin.lateralYards,
      5,
    );

    const ahead = { ...press, depthYards: press.depthYards + 8 };
    const forward = run(context, [
      {
        type: "start-route",
        playerId: "q",
        input: { pointerId: 1, point: press },
      },
      move(ahead),
      up(ahead),
    ]);
    // Eight yards of drag, not eight plus the handle's own upfield offset.
    expect(forward.model.drawing?.points?.[1]?.depthYards).toBeCloseTo(
      origin.depthYards + 8,
      5,
    );
  });

  it("keeps a blue-dot click in click-to-draw mode without adding a stub", () => {
    const context = contextFor(stickThunderPlay);
    const origin = positionOf(stickThunderPlay, "q");
    const dot = { ...origin, depthYards: origin.depthYards + 2 };
    const session = run(context, [
      {
        type: "start-route",
        playerId: "q",
        input: { pointerId: 1, point: dot },
      },
      up(dot),
    ]);
    expect(session.model.drawing?.points).toEqual([origin]);
    expect(session.model.drawing?.initialDrag).toBeUndefined();
  });

  it("ignores another pointer and cancels a blue-dot drag without retaining its endpoint", () => {
    const context = contextFor(stickThunderPlay);
    const origin = positionOf(stickThunderPlay, "q");
    const end = { ...origin, depthYards: origin.depthYards + 10 };
    const session = run(context, [
      {
        type: "start-route",
        playerId: "q",
        input: { pointerId: 1, point: origin },
      },
      { type: "pointer-up", input: { pointerId: 2, point: end } },
    ]);
    expect(session.model.drawing?.points).toEqual([origin]);
    expect(session.model.drawing?.initialDrag).toBeDefined();
    const canceled = run(
      context,
      [{ type: "pointer-cancel" }, up(end), { type: "finish-drawing" }],
      session.model,
    );
    expect(canceled.commands).toHaveLength(0);
  });
});

describe("field interaction free drawing", () => {
  const drawingContext = (overrides: Partial<FieldInteractionContext> = {}) =>
    contextFor(stickThunderPlay, {
      snap: { enabled: true, grid: "off" },
      createId: (prefix) => `${prefix}_drawn`,
      ...overrides,
    });
  const startFree = (
    kind: "route" | "motion" | "block" | "zone",
    playerId: string,
  ): FieldInteractionEvent => ({
    type: "start-drawing",
    kind,
    playerId,
    mode: "free",
  });
  /** A hand's stroke: a stem straight up, a hard cut out, with a wobble. */
  const strokeFrom = (origin: Coordinate): Coordinate[] => [
    ...Array.from({ length: 12 }, (_, index) => ({
      lateralYards: origin.lateralYards + (index % 2 === 0 ? 0.05 : -0.05),
      depthYards: origin.depthYards + index + 1,
    })),
    ...Array.from({ length: 8 }, (_, index) => ({
      lateralYards: origin.lateralYards - (index + 1),
      depthYards: origin.depthYards + 12 + (index % 2 === 0 ? 0.05 : -0.05),
    })),
  ];

  it("traces the held pointer, ignoring snap and typed depths, and commits when it lifts", () => {
    const context = drawingContext();
    const y = positionOf(stickThunderPlay, "y");
    const stroke = strokeFrom(y);

    const held = run(context, [
      startFree("route", "y"),
      { type: "depth-digit", digit: "7" },
      down(stroke[0]!),
      ...stroke.slice(1).map((point) => move(point)),
    ]);
    expect(held.commands).toHaveLength(0);
    expect(held.model.drawing).toMatchObject({
      mode: "free",
      pointerDown: true,
      depthBuffer: "",
    });
    // Every point the pointer passed after the press is kept, marked as
    // traced, and put where the hand went rather than on a 45° ray.
    const traced = held.model.drawing!.points.filter((point) => point.traced);
    expect(traced.length).toBe(stroke.length - 1);
    expect(traced[0]!.lateralYards).toBeCloseTo(stroke[1]!.lateralYards, 6);

    const lifted = run(context, [up(stroke.at(-1)!)], held.model);
    expect(lifted.commands).toHaveLength(1);
    expect(lifted.commands[0]).toMatchObject({
      kind: "batch",
      label: "Draw route",
    });
    expect(lifted.model.drawing).toBeUndefined();
    expect(lifted.model.selection).toEqual([path("path_drawn")]);

    // What is committed is the clean line: the stance, the cut, the end —
    // not twenty samples of tremor, and nothing marked traced.
    const drawn = applyPlayCommand(
      stickThunderPlay,
      lifted.commands[0]!,
    ).paths.find(({ id }) => id === "path_drawn")!;
    expect(drawn.points.length).toBeLessThanOrEqual(4);
    expect(drawn.points[0]).toMatchObject({
      lateralYards: y.lateralYards,
      depthYards: y.depthYards,
    });
    expect(drawn.points.at(-1)!.lateralYards).toBeCloseTo(
      stroke.at(-1)!.lateralYards,
      6,
    );
    expect(drawn.points.some((point) => "traced" in point)).toBe(false);
    const cut = drawn.points.find(
      (point) => Math.abs(point.depthYards - (y.depthYards + 12)) < 0.2,
    );
    expect(cut).toBeDefined();
  });

  it("keeps a press that never moved in hand, and traces a blue-dot drag", () => {
    const context = drawingContext();
    const q = positionOf(stickThunderPlay, "q");

    // A tap on the grass is not a stroke: the line waits for one.
    const tapped = run(context, [
      startFree("route", "q"),
      down({ lateralYards: q.lateralYards, depthYards: q.depthYards + 5 }),
      up({ lateralYards: q.lateralYards, depthYards: q.depthYards + 5 }),
    ]);
    expect(tapped.commands).toHaveLength(0);
    expect(tapped.model.drawing).toMatchObject({
      mode: "free",
      pointerDown: false,
    });

    // The dot sits upfield of the man; the drag is followed from his stance.
    const press = {
      lateralYards: q.lateralYards,
      depthYards: q.depthYards + 1,
    };
    const drag = Array.from({ length: 10 }, (_, index) => ({
      lateralYards: press.lateralYards + index * 0.6,
      depthYards: press.depthYards + index,
    }));
    const dragged = run(context, [
      {
        type: "start-route",
        playerId: "q",
        input: { pointerId: 1, point: press },
        mode: "free",
      },
      ...drag.map((point) => move(point)),
      up(drag.at(-1)!),
    ]);
    expect(dragged.commands).toHaveLength(1);
    const drawn = applyPlayCommand(
      stickThunderPlay,
      dragged.commands[0]!,
    ).paths.find(({ id }) => id === "path_drawn")!;
    expect(drawn.points[0]).toMatchObject(q);
    expect(drawn.points.at(-1)!.lateralYards).toBeCloseTo(
      q.lateralYards + 9 * 0.6,
      6,
    );
    expect(drawn.points.at(-1)!.depthYards).toBeCloseTo(q.depthYards + 9, 6);
  });

  it("switches mode mid-line, keeping the breaks placed so far", () => {
    const context = drawingContext({ snap: { enabled: false, grid: "off" } });
    const y = positionOf(stickThunderPlay, "y");
    const stem = { lateralYards: y.lateralYards, depthYards: y.depthYards + 6 };
    const stroke = Array.from({ length: 8 }, (_, index) => ({
      lateralYards: stem.lateralYards - index - 1,
      depthYards: stem.depthYards + index * 0.5,
    }));

    const session = run(context, [
      start("route", "y"),
      move(stem),
      down(stem),
      up(stem),
      { type: "set-drawing-mode", mode: "free" },
      down(stroke[0]!),
      ...stroke.slice(1).map((point) => move(point)),
      up(stroke.at(-1)!),
    ]);
    expect(session.commands).toHaveLength(1);
    const drawn = applyPlayCommand(
      stickThunderPlay,
      session.commands[0]!,
    ).paths.find(({ id }) => id === "path_drawn")!;
    expect(drawn.points[1]!.lateralYards).toBeCloseTo(stem.lateralYards, 6);
    expect(drawn.points[1]!.depthYards).toBeCloseTo(stem.depthYards, 6);
    expect(drawn.points.at(-1)!.lateralYards).toBeCloseTo(
      stroke.at(-1)!.lateralYards,
      6,
    );

    // Back to breaks: the same press places one, and lifting keeps drawing.
    const back = run(context, [
      startFree("route", "y"),
      { type: "set-drawing-mode", mode: "breaks" },
      down(stem),
      up(stem),
    ]);
    expect(back.commands).toHaveLength(0);
    expect(back.model.drawing?.mode).toBe("breaks");
    expect(back.model.drawing?.points).toHaveLength(2);
  });

  it("holds a traced line on the field and finishes a mid-stroke Done", () => {
    const context = drawingContext({
      depthWindow: { minDepthYards: -20, maxDepthYards: 30 },
    });
    const y = positionOf(stickThunderPlay, "y");
    const halfWidth = stickThunderPlay.fieldProfile.widthYards / 2;
    const past = Array.from({ length: 10 }, (_, index) => ({
      lateralYards: y.lateralYards + index * 4,
      depthYards: y.depthYards + index,
    }));
    const session = run(context, [
      startFree("route", "y"),
      down(past[0]!),
      ...past.slice(1).map((point) => move(point)),
      { type: "finish-drawing" },
    ]);
    expect(session.commands).toHaveLength(1);
    const drawn = applyPlayCommand(
      stickThunderPlay,
      session.commands[0]!,
    ).paths.find(({ id }) => id === "path_drawn")!;
    for (const point of drawn.points) {
      expect(Math.abs(point.lateralYards)).toBeLessThanOrEqual(halfWidth);
    }
  });
});

describe("field interaction drawing by hand between breaks", () => {
  const drawingContext = (overrides: Partial<FieldInteractionContext> = {}) =>
    contextFor(stickThunderPlay, {
      snap: { enabled: true, grid: "off" },
      createId: (prefix) => `${prefix}_drawn`,
      ...overrides,
    });
  /** A stem up the field, then a wheel bending out toward the sideline. */
  const wheelFrom = (origin: Coordinate): Coordinate[] => [
    ...Array.from({ length: 8 }, (_, index) => ({
      lateralYards: origin.lateralYards,
      depthYards: origin.depthYards + index + 1,
    })),
    ...Array.from({ length: 10 }, (_, index) => {
      const angle = ((index + 1) / 10) * (Math.PI / 2);
      return {
        lateralYards: origin.lateralYards + 6 * (1 - Math.cos(angle)),
        depthYards: origin.depthYards + 8 + 6 * Math.sin(angle),
      };
    }),
  ];
  const drawnPath = (command: PlayCommand) =>
    applyPlayCommand(stickThunderPlay, command).paths.find(
      ({ id }) => id === "path_drawn",
    )!;

  it("lands a straight pull off the dot as one snapped break, wobble and all", () => {
    const context = drawingContext();
    const q = positionOf(stickThunderPlay, "q");
    const press = {
      lateralYards: q.lateralYards,
      depthYards: q.depthYards + 1,
    };
    // A finger's stem: a little side to side, and drifting a touch off true.
    const stem = Array.from({ length: 10 }, (_, index) => ({
      lateralYards:
        press.lateralYards +
        (0.3 * (index + 1)) / 10 +
        (index % 2 === 0 ? 0.08 : -0.08),
      depthYards: press.depthYards + index + 1,
    }));
    const release = stem.at(-1)!;

    const session = run(context, [
      {
        type: "start-route",
        playerId: "q",
        input: { pointerId: 1, point: press },
      },
      ...stem.map((point) => move(point)),
      up(release),
    ]);
    const points = session.model.drawing!.points;
    expect(points).toHaveLength(2);
    expect(points[1]!.traced).toBeUndefined();
    // Snap holds the break on the 45° ray: straight up from his stance.
    expect(points[1]!.lateralYards).toBeCloseTo(q.lateralYards, 6);
    expect(points[1]!.depthYards).toBeGreaterThan(q.depthYards + 8);
  });

  it("draws on from the end of the line by hand, keeping the breaks before it", () => {
    const context = drawingContext({ snap: { enabled: false, grid: "off" } });
    const y = positionOf(stickThunderPlay, "y");
    const stem = { lateralYards: y.lateralYards, depthYards: y.depthYards + 6 };
    // From the break, a sail bending across toward the middle of the field.
    const sail = Array.from({ length: 12 }, (_, index) => {
      const angle = ((index + 1) / 12) * (Math.PI / 2);
      return {
        lateralYards: stem.lateralYards - 8 * (1 - Math.cos(angle)),
        depthYards: stem.depthYards + 8 * Math.sin(angle),
      };
    });

    const session = run(context, [
      start("route", "y"),
      move(stem),
      down(stem),
      up(stem),
      // The press lands on the break just placed, and takes the line up.
      down(stem),
      ...sail.map((point) => move(point)),
    ]);
    expect(session.model.drawing!.strokeFrom).toBe(1);

    const lifted = run(context, [up(sail.at(-1)!)], session.model);
    expect(lifted.commands).toHaveLength(0);
    const kept = lifted.model.drawing!.points[1]!;
    expect(kept.lateralYards).toBeCloseTo(stem.lateralYards, 6);
    expect(kept.depthYards).toBeCloseTo(stem.depthYards, 6);
    expect(kept.traced).toBeUndefined();

    const finished = run(context, [{ type: "finish-drawing" }], lifted.model);
    const drawn = drawnPath(finished.commands[0]!);
    expect(drawn.points[1]!.lateralYards).toBeCloseTo(stem.lateralYards, 6);
    expect(drawn.points[1]!.depthYards).toBeCloseTo(stem.depthYards, 6);
    expect(drawn.points.slice(2).some((point) => point.control)).toBe(true);
    expect(drawn.points.at(-1)!.lateralYards).toBeCloseTo(
      stem.lateralYards - 8,
      6,
    );
  });

  it("draws from his stance by hand when the line has only just begun", () => {
    const context = drawingContext();
    const y = positionOf(stickThunderPlay, "y");
    const wheel = wheelFrom(y);
    const session = run(context, [
      start("motion", "y"),
      down(y),
      ...wheel.map((point) => move(point)),
      up(wheel.at(-1)!),
    ]);
    expect(session.commands).toHaveLength(0);
    expect(session.model.drawing!.kind).toBe("motion");
    expect(
      session.model.drawing!.points.filter((point) => point.traced).length,
    ).toBeGreaterThan(10);

    // Backspace takes the whole stroke back, as it does a free one.
    const undone = run(context, [{ type: "delete" }], session.model);
    expect(undone.model.drawing!.points).toEqual([
      { lateralYards: y.lateralYards, depthYards: y.depthYards },
    ]);
  });

  it("still places a break for a click near the end, and for a typed depth", () => {
    const context = drawingContext({ snap: { enabled: false, grid: "off" } });
    const y = positionOf(stickThunderPlay, "y");
    const stem = { lateralYards: y.lateralYards, depthYards: y.depthYards + 6 };
    // Half a yard across is within reach of the end, but a click there that
    // never moves is a click, and it places the break it always did.
    const beside = {
      lateralYards: stem.lateralYards + 0.5,
      depthYards: stem.depthYards,
    };
    const clicked = run(context, [
      start("route", "y"),
      move(stem),
      down(stem),
      up(stem),
      down(beside),
      up(beside),
    ]);
    expect(clicked.model.drawing!.points).toHaveLength(3);
    expect(clicked.model.drawing!.points[2]!.lateralYards).toBeCloseTo(
      beside.lateralYards,
      6,
    );
    expect(clicked.model.drawing!.strokeFrom).toBeUndefined();

    // A typed depth is waiting for the next press, even one on his stance.
    const typed = run(context, [
      start("route", "y"),
      { type: "depth-digit", digit: "9" },
      down(y),
    ]);
    expect(typed.model.drawing!.strokeFrom).toBeUndefined();
    expect(typed.model.drawing!.points.at(-1)!.depthYards).toBe(9);
  });

  it("finishes a free line only on a stroke that drew, not on a tap after switching", () => {
    const context = drawingContext();
    const q = positionOf(stickThunderPlay, "q");
    const press = {
      lateralYards: q.lateralYards,
      depthYards: q.depthYards + 1,
    };
    const wheel = wheelFrom(press);
    const kept = run(context, [
      {
        type: "start-route",
        playerId: "q",
        input: { pointerId: 1, point: press },
      },
      ...wheel.map((point) => move(point)),
      up(wheel.at(-1)!),
      { type: "set-drawing-mode", mode: "free" },
    ]);
    const traced = kept.model.drawing!.points.length;

    // A tap is not a stroke, whatever the line traced before it.
    const tap = { lateralYards: -12, depthYards: 10 };
    const tapped = run(context, [down(tap), up(tap)], kept.model);
    expect(tapped.commands).toHaveLength(0);
    expect(tapped.model.drawing!.points).toHaveLength(traced);

    // A stroke that draws is the finish, and it carries the first one too.
    const end = wheel.at(-1)!;
    const on = Array.from({ length: 6 }, (_, index) => ({
      lateralYards: q.lateralYards + 6 + index + 1,
      depthYards: end.depthYards,
    }));
    const drawn = run(
      context,
      [down(on[0]!), ...on.slice(1).map((point) => move(point)), up(on[5]!)],
      tapped.model,
    );
    expect(drawn.commands).toHaveLength(1);
    const route = drawnPath(drawn.commands[0]!);
    expect(route.points.some((point) => point.control)).toBe(true);
    expect(route.points.at(-1)!.lateralYards).toBeCloseTo(
      on[5]!.lateralYards,
      6,
    );
  });

  it("keeps what was traced when the platform takes the pointer mid-stroke", () => {
    const context = drawingContext();
    const q = positionOf(stickThunderPlay, "q");
    const press = {
      lateralYards: q.lateralYards,
      depthYards: q.depthYards + 1,
    };
    const wheel = wheelFrom(press);
    const session = run(context, [
      {
        type: "start-route",
        playerId: "q",
        input: { pointerId: 1, point: press },
      },
      ...wheel.slice(0, 12).map((point) => move(point)),
      { type: "pointer-cancel" },
    ]);
    expect(session.model.drawing).toMatchObject({ pointerDown: false });
    expect(session.model.drawing!.strokeFrom).toBeUndefined();
    expect(session.model.drawing!.initialDrag).toBeUndefined();
    // A move after the cancel only aims; it does not keep tracing.
    const after = run(context, [move(wheel.at(-1)!)], session.model);
    expect(after.model.drawing!.points).toHaveLength(
      session.model.drawing!.points.length,
    );
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
});

describe("field interaction copy, paste, and mirror", () => {
  // Stick Thunder is a full eleven; paste and duplicate need room on that
  // side of the LOS. Drop two unlabeled linemen so the tests still have the
  // lettered men they copy (X, Q, H) while leaving slots to fill.
  const pasteRoom = applyPlayCommand(
    stickThunderPlay,
    deletePlayersCommand(stickThunderPlay, ["ol0", "ol1"]),
  );
  const clipContext = (overrides: Partial<FieldInteractionContext> = {}) => {
    let next = 0;
    return contextFor(pasteRoom, {
      snap: { enabled: false, grid: "off" },
      createId: (prefix) => `${prefix}_${(next += 1)}`,
      ...overrides,
    });
  };
  const pathOf = (document: PlayDocument, id: string) =>
    document.paths.find((candidate) => candidate.id === id)!;

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
    const after = applyPlayCommand(pasteRoom, session.commands[0]!);
    expect(after.players).toHaveLength(pasteRoom.players.length + 1);
    expect(after.paths).toHaveLength(pasteRoom.paths.length + 1);

    // The originals are untouched.
    expect(positionOf(after, "x")).toEqual(positionOf(pasteRoom, "x"));
    expect(pathOf(after, "rx")).toEqual(pathOf(pasteRoom, "rx"));

    // The copy is offset, and its route runs from the copied man.
    const copiedPlayer = after.players.at(-1)!;
    const copiedPath = after.paths.at(-1)!;
    expect(copiedPlayer.id).not.toBe("x");
    expect(copiedPath.playerId).toBe(copiedPlayer.id);
    expect(copiedPlayer.position.lateralYards).toBeGreaterThan(
      positionOf(pasteRoom, "x").lateralYards,
    );
    expect(copiedPlayer.position.depthYards).toBeLessThan(
      positionOf(pasteRoom, "x").depthYards,
    );
    // Everything the copy is made of moved by the same amount.
    const shift =
      copiedPlayer.position.lateralYards -
      positionOf(pasteRoom, "x").lateralYards;
    copiedPath.points.forEach((point, index) => {
      expect(point.lateralYards).toBeCloseTo(
        pathOf(pasteRoom, "rx").points[index]!.lateralYards + shift,
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
    const after = applyPlayCommand(pasteRoom, session.commands[0]!);
    // The schema has no way to say "attached to nobody", so the copy runs
    // from the same man rather than becoming an orphan.
    expect(after.paths.at(-1)!.playerId).toBe("x");
    expect(after.players).toHaveLength(pasteRoom.players.length);
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
    const once = applyPlayCommand(pasteRoom, first.commands[0]!);
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
    expect(twice.players).toHaveLength(pasteRoom.players.length + 2);
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
    const after = applyPlayCommand(pasteRoom, duplicated.commands[0]!);
    // H was duplicated, not the Quarterback that sits on the clipboard.
    expect(after.players.at(-1)!.label).toBe("H");
    expect(duplicated.model.clipboard).toEqual(copied.model.clipboard);
  });

  it("mirrors only what is picked, carrying each man's routes with him", () => {
    const context = clipContext();
    const session = run(context, [{ type: "mirror" }], {
      selection: [player("x")],
      gesture: { kind: "idle" },
    });
    expect(session.commands[0]).toMatchObject({ label: "Mirror selection" });

    const after = applyPlayCommand(pasteRoom, session.commands[0]!);
    expect(positionOf(after, "x").lateralYards).toBeCloseTo(
      -positionOf(pasteRoom, "x").lateralYards,
      9,
    );
    // X's route came with him; nobody else moved.
    expect(pathOf(after, "rx").points[2]!.lateralYards).toBeCloseTo(
      -pathOf(pasteRoom, "rx").points[2]!.lateralYards,
      9,
    );
    expect(positionOf(after, "z")).toEqual(positionOf(pasteRoom, "z"));
    expect(pathOf(after, "rz")).toEqual(pathOf(pasteRoom, "rz"));
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

  it("picks out the segment the Coach clicked, not always the same one", () => {
    const context = routeContext();
    const onFirst = midOfSegment(stickThunderPlay, "rx", 1);
    const selected = run(context, [down(onFirst), up(onFirst)]);
    const narrowed = run(context, [down(onFirst), up(onFirst)], selected.model);
    expect(narrowed.model.selectedSegmentIndex).toBe(1);
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
    const dropping = applyPlayCommand(withMike, {
      kind: "insert-paths",
      paths: [
        {
          index: withMike.paths.length,
          item: {
            id: "drop",
            kind: "zone",
            playerId: "mike",
            points: [
              { lateralYards: 0, depthYards: 5 },
              { lateralYards: 0, depthYards: 10 },
            ],
            branches: [],
            style: { line: "dashed", ending: "bubble", color: "blue" },
          },
        },
      ],
    });
    const blitz = pathOf(
      applyPlayCommand(
        dropping,
        setRouteKindCommand(dropping, "drop", "blitz")!,
      ),
      "drop",
    );
    expect(blitz.style).toMatchObject({ color: "red", ending: "arrow" });
  });

  it("only turns a line into what its man can run", () => {
    // A receiver never blitzes or drops.
    expect(
      setRouteKindCommand(stickThunderPlay, "rx", "blitz"),
    ).toBeUndefined();
    expect(setRouteKindCommand(stickThunderPlay, "rx", "zone")).toBeUndefined();

    // A lineman's block stays a block.
    const blocking = applyPlayCommand(stickThunderPlay, {
      kind: "insert-paths",
      paths: [
        {
          index: stickThunderPlay.paths.length,
          item: {
            id: "pass_pro",
            kind: "block",
            playerId: "ol2",
            points: [
              positionOf(stickThunderPlay, "ol2"),
              { lateralYards: 0, depthYards: -3 },
            ],
            branches: [],
            style: { line: "solid", ending: "bar", color: "ink" },
          },
        },
      ],
    });
    for (const kind of ["route", "motion", "ball", "blitz"] as const) {
      expect(setRouteKindCommand(blocking, "pass_pro", kind)).toBeUndefined();
    }

    // A defender's drop never becomes a route, a block or a ball flight.
    const dropping = applyPlayCommand(withMike, {
      kind: "insert-paths",
      paths: [
        {
          index: withMike.paths.length,
          item: {
            id: "drop",
            kind: "zone",
            playerId: "mike",
            points: [
              { lateralYards: 0, depthYards: 5 },
              { lateralYards: 0, depthYards: 10 },
            ],
            branches: [],
            style: { line: "dashed", ending: "bubble", color: "blue" },
          },
        },
      ],
    });
    for (const kind of ["route", "motion", "block", "ball"] as const) {
      expect(setRouteKindCommand(dropping, "drop", kind)).toBeUndefined();
    }
    expect(setRouteKindCommand(dropping, "drop", "stunt")).toBeDefined();
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
});

describe("what a route is for", () => {
  const pathOf = (document: PlayDocument, id: string) =>
    document.paths.find((candidate) => candidate.id === id)!;
  let counter = 0;
  const createId = () => `assignment_${(counter += 1)}`;

  it("drops the key when the Coach empties a field", () => {
    const written = applyPlayCommand(
      stickThunderPlay,
      setRouteCoachingTextCommand(stickThunderPlay, "rx", "conversion", "sit")!,
    );
    const cleared = applyPlayCommand(
      written,
      setRouteCoachingTextCommand(written, "rx", "conversion", "  ")!,
    );

    // Dropped rather than stored empty, so a route he has emptied hashes
    // like one he never wrote on.
    expect("conversion" in pathOf(cleared, "rx")).toBe(false);
    expect(canonicalStringify(cleared)).toBe(
      canonicalStringify(stickThunderPlay),
    );
  });

  it("refuses a read that reaches nothing", () => {
    expect(setRouteReadCommand(stickThunderPlay, "rx", 0)).toBeUndefined();
    expect(setRouteReadCommand(stickThunderPlay, "rx", 1.5)).toBeUndefined();
    expect(
      setRouteReadCommand(stickThunderPlay, "rx", undefined),
    ).toBeUndefined();
    // Two digits is what the original takes, so a longer one is held there.
    const wild = applyPlayCommand(
      stickThunderPlay,
      setRouteReadCommand(stickThunderPlay, "rx", 400)!,
    );
    expect(pathOf(wild, "rx").readOrder).toBe(99);
  });

  it("lets one man carry different words for each of his lines", () => {
    const rxPlayerId = pathOf(stickThunderPlay, "rx").playerId;
    // A second line off the same man, the way an alternate arrives.
    const twoLines = applyPlayCommand(stickThunderPlay, {
      kind: "insert-paths",
      paths: [
        {
          index: stickThunderPlay.paths.length,
          item: {
            ...pathOf(stickThunderPlay, "rx"),
            id: "rx_alternate",
            variant: "alternate",
          },
        },
      ],
    });

    let document = applyPlayCommand(
      twoLines,
      setRouteAssignmentCommand(twoLines, "rx", "STICK", createId)!,
    );
    document = applyPlayCommand(
      document,
      setRouteAssignmentCommand(document, "rx_alternate", "FADE", createId)!,
    );

    expect(assignmentForPath(document, "rx")?.text).toBe("STICK");
    expect(assignmentForPath(document, "rx_alternate")?.text).toBe("FADE");
    expect(
      document.assignments.filter(({ playerId }) => playerId === rxPlayerId),
    ).toHaveLength(2);
  });

  it("keeps an Assignment the Coach has built out, and only clears the words", () => {
    const written = applyPlayCommand(
      stickThunderPlay,
      setRouteAssignmentCommand(stickThunderPlay, "rx", "STICK", createId)!,
    );
    const existing = assignmentForPath(written, "rx")!;
    const structured = applyPlayCommand(written, {
      kind: "update-assignment",
      assignment: {
        ...existing,
        actions: [
          ...existing.actions,
          { id: "action_block", kind: "block", note: "check the Mike" },
        ],
      },
    });

    const emptied = applyPlayCommand(
      structured,
      setRouteAssignmentCommand(structured, "rx", "", createId)!,
    );
    const kept = assignmentForPath(emptied, "rx")!;

    expect(kept.text).toBe("");
    expect(kept.actions).toHaveLength(2);
  });

  it("never overwrites wording the Coach attached to something else", () => {
    const rxPlayerId = pathOf(stickThunderPlay, "rx").playerId;
    const freeform = applyPlayCommand(stickThunderPlay, {
      kind: "insert-assignments",
      assignments: [
        {
          index: stickThunderPlay.assignments.length,
          item: {
            id: "assignment_freeform",
            playerId: rxPlayerId,
            text: "Beat press with an outside release.",
            actions: [],
          },
        },
      ],
    });

    const document = applyPlayCommand(
      freeform,
      setRouteAssignmentCommand(freeform, "rx", "STICK", createId)!,
    );

    expect(
      document.assignments.find(({ id }) => id === "assignment_freeform")?.text,
    ).toBe("Beat press with an outside release.");
    expect(assignmentForPath(document, "rx")?.text).toBe("STICK");
  });

  it("coalesces retyping into one undo entry", () => {
    const first = setRouteCoachingTextCommand(
      stickThunderPlay,
      "rx",
      "coachingNote",
      "Pu",
    )!;
    const second = setRouteCoachingTextCommand(
      stickThunderPlay,
      "rx",
      "coachingNote",
      "Push",
    )!;

    expect(playCommandCoalesceKey(first)).toBe(playCommandCoalesceKey(second));
  });
});

describe("the other lines he could run", () => {
  const pathOf = (document: PlayDocument, id: string) =>
    document.paths.find((candidate) => candidate.id === id)!;
  const alternateOf = (document: PlayDocument) =>
    document.paths.find(({ id }) => id === "alternate")!;
  const createId = () => "alternate";
  /** The original's 34 and 36 canvas pixels, on the axis each belongs to. */
  const acrossYards = 34 / (976 / (160 / 3));
  const deeperYards = 36 / 12;

  it("shapes a second stem like the last line he has, offset and dotted", () => {
    const before = pathOf(stickThunderPlay, "rx");
    const document = applyPlayCommand(
      stickThunderPlay,
      addAlternateRouteCommand(stickThunderPlay, "x", createId)!,
    );
    const alternate = alternateOf(document);

    expect(alternate.playerId).toBe("x");
    expect(alternate.style.line).toBe("dotted");
    expect(alternate.variant).toBe("alternate");
    // It starts where he does, not where the line it was shaped from did.
    expect(alternate.points[0]).toEqual(
      document.players.find(({ id }) => id === "x")!.position,
    );
    // X lines up left of the ball, so his second stem clears the first to the
    // left, and every break runs deeper than the one it came from.
    expect(alternate.points[1]!.lateralYards).toBeCloseTo(
      before.points[1]!.lateralYards - acrossYards,
      6,
    );
    expect(alternate.points[1]!.depthYards).toBeCloseTo(
      before.points[1]!.depthYards + deeperYards,
      6,
    );
    // The tip runs on past where the base one finished.
    expect(alternate.points.at(-1)!.depthYards).toBeCloseTo(
      before.points.at(-1)!.depthYards + deeperYards + 60 / 12,
      6,
    );
  });

  it("offsets toward the sideline the man lines up on", () => {
    // Z lines up right of the ball, so his second stem goes the other way.
    const before = pathOf(stickThunderPlay, "rz");
    const document = applyPlayCommand(
      stickThunderPlay,
      addAlternateRouteCommand(stickThunderPlay, "z", createId)!,
    );

    expect(alternateOf(document).points[1]!.lateralYards).toBeCloseTo(
      Math.min(160 / 3 / 2, before.points[1]!.lateralYards + acrossYards),
      6,
    );
  });

  it("holds a stem that would land outside the paint inside it", () => {
    const sideline = 160 / 3 / 2;
    // Z's line taken out to the paint: another 34 pixels would clear it.
    const wide = applyPlayCommand(stickThunderPlay, {
      kind: "update-path",
      path: {
        ...pathOf(stickThunderPlay, "rz"),
        points: pathOf(stickThunderPlay, "rz").points.map((point) => ({
          ...point,
          lateralYards: sideline - 1,
        })),
      },
    });
    const document = applyPlayCommand(
      wide,
      addAlternateRouteCommand(wide, "z", createId)!,
    );
    const offset = alternateOf(document).points.slice(1);

    expect(offset).not.toHaveLength(0);
    for (const point of offset) {
      expect(point.lateralYards).toBe(sideline);
    }
  });

  it("carries the shape of the base line and nothing else", () => {
    // A bent, part-dotted base line: another call, not a copy of that one.
    const base = pathOf(stickThunderPlay, "rx");
    const decorated = applyPlayCommand(stickThunderPlay, {
      kind: "update-path",
      path: {
        ...base,
        points: [
          base.points[0]!,
          {
            ...base.points[1]!,
            control: { lateralYards: -14, depthYards: 0 },
            segmentStyle: { line: "dotted" },
          },
          base.points[2]!,
        ],
      },
    });
    const document = applyPlayCommand(
      decorated,
      addAlternateRouteCommand(decorated, "x", createId)!,
    );
    const alternate = alternateOf(document);

    expect(alternate.points).toHaveLength(base.points.length);
    expect(alternate.points.some(({ control }) => control !== undefined)).toBe(
      false,
    );
    expect(
      alternate.points.some(({ segmentStyle }) => segmentStyle !== undefined),
    ).toBe(false);
  });

  it("gives a man with nothing drawn on him a plain stem straight downfield", () => {
    // The Quarterback has no line of his own in the seeded Play.
    const document = applyPlayCommand(
      stickThunderPlay,
      addAlternateRouteCommand(stickThunderPlay, "q", createId)!,
    );
    const alternate = alternateOf(document);
    const stance = positionOf(document, "q");

    expect(alternate.style.line).toBe("solid");
    expect(alternate.variant).toBeUndefined();
    expect(alternate.points).toEqual([
      stance,
      {
        lateralYards: stance.lateralYards,
        depthYards: stance.depthYards + 150 / 12,
      },
    ]);
  });

  it("gives no alternate route to a man who does not run routes", () => {
    expect(
      addAlternateRouteCommand(stickThunderPlay, "ol2", createId),
    ).toBeUndefined();
    expect(
      addAlternateRouteCommand(withMike, "mike", createId),
    ).toBeUndefined();
  });
});

describe("a choice within one stem", () => {
  const pathOf = (document: PlayDocument, id: string) =>
    document.paths.find((candidate) => candidate.id === id)!;

  it("turns the original's angle, measured in the frame it was measured in", () => {
    const before = pathOf(stickThunderPlay, "rx");
    const document = applyPlayCommand(
      stickThunderPlay,
      addRouteChoiceCommand(stickThunderPlay, "rx", 1)!,
    );
    const tip = pathOf(document, "rx").branches[0]!.points[0]!;
    // Read back on the original's canvas, where the turn is defined: the
    // field is 1.525 times denser across than deep, so the same angle taken
    // in yards would point somewhere else entirely.
    const canvas = (point: { lateralYards: number; depthYards: number }) => ({
      x: point.lateralYards * (976 / (160 / 3)),
      y: -point.depthYards * 12,
    });
    const anchor = canvas(before.points[1]!);
    const leg = canvas(before.points[2]!);
    const forked = canvas(tip);
    const turn =
      Math.atan2(forked.y - anchor.y, forked.x - anchor.x) -
      Math.atan2(leg.y - anchor.y, leg.x - anchor.x);

    expect(Math.atan2(Math.sin(turn), Math.cos(turn))).toBeCloseTo(
      Math.PI / 2.6,
      6,
    );
  });

  it("continues the line when the fork is off its end", () => {
    // The original turns off a leg of no length here and points every such
    // fork the same way; ours turns off the leg that reaches the end.
    const before = pathOf(stickThunderPlay, "rx");
    const document = applyPlayCommand(
      stickThunderPlay,
      addRouteChoiceCommand(stickThunderPlay, "rx")!,
    );
    const branch = pathOf(document, "rx").branches[0]!;
    const running =
      before.points[2]!.lateralYards - before.points[1]!.lateralYards;
    const forked =
      branch.points[0]!.lateralYards - before.points[2]!.lateralYards;

    expect(branch.fromIndex).toBe(2);
    // X's route finishes running left; the fork keeps going left rather than
    // doubling back the way a turn off nothing would.
    expect(Math.sign(forked)).toBe(Math.sign(running));
  });

  it("never forks shorter than the original's minimum", () => {
    // rz has one long leg, so its fork takes the leg's length; a short leg
    // would take the floor instead.
    const stubby = applyPlayCommand(stickThunderPlay, {
      kind: "update-path",
      path: {
        ...pathOf(stickThunderPlay, "rz"),
        points: [
          { lateralYards: 10, depthYards: 0 },
          { lateralYards: 10, depthYards: 1 },
        ],
        branches: [],
      },
    });
    const document = applyPlayCommand(
      stubby,
      addRouteChoiceCommand(stubby, "rz", 0)!,
    );
    const tip = pathOf(document, "rz").branches[0]!.points[0]!;
    const length = Math.hypot(
      (tip.lateralYards - 10) * (976 / (160 / 3)),
      tip.depthYards * 12,
    );

    expect(length).toBeCloseTo(70, 6);
  });

  it("takes away only the choice the Coach is on", () => {
    let document = applyPlayCommand(
      stickThunderPlay,
      addRouteChoiceCommand(stickThunderPlay, "rx", 1)!,
    );
    document = applyPlayCommand(
      document,
      addRouteChoiceCommand(document, "rx", 2)!,
    );
    // The second of the two, so taking it cannot be confused with taking the
    // first — which is what dropping the head of the list would do.
    const first = pathOf(document, "rx").branches[0]!;
    const after = applyPlayCommand(
      document,
      removeRouteChoiceCommand(document, "rx", 1)!,
    );

    expect(pathOf(after, "rx").branches).toEqual([first]);
    expect(removeRouteChoiceCommand(after, "rx", 4)).toBeUndefined();
  });
});

describe("turning a line the other way", () => {
  const pathOf = (document: PlayDocument, id: string) =>
    document.paths.find((candidate) => candidate.id === id)!;

  it("reflects a line about where it starts, bends and all", () => {
    const base = pathOf(stickThunderPlay, "rx");
    const bent = applyPlayCommand(stickThunderPlay, {
      kind: "update-path",
      path: {
        ...base,
        points: [
          base.points[0]!,
          { ...base.points[1]!, control: { lateralYards: -14, depthYards: 0 } },
          base.points[2]!,
        ],
      },
    });
    const flipped = pathOf(
      applyPlayCommand(bent, flipRouteCommand(bent, "rx")!),
      "rx",
    );
    const axis = base.points[0]!.lateralYards;

    expect(flipped.points[0]!.lateralYards).toBeCloseTo(axis, 6);
    expect(flipped.points[2]!.lateralYards).toBeCloseTo(
      2 * axis - base.points[2]!.lateralYards,
      6,
    );
    expect(flipped.points[1]!.control!.lateralYards).toBeCloseTo(
      2 * axis - -14,
      6,
    );
    // Depth is untouched: he turns, he does not run backwards.
    expect(flipped.points[2]!.depthYards).toBe(base.points[2]!.depthYards);
  });

  it("turns every line a man has about his own stance, in one entry", () => {
    // The seeded lines all begin exactly where their man stands, which would
    // let the axis be read off either. Z's is moved off his stance first so
    // the two can be told apart, and a choice added so both are carried.
    const shifted = applyPlayCommand(stickThunderPlay, {
      kind: "update-path",
      path: {
        ...pathOf(stickThunderPlay, "rz"),
        points: [
          { lateralYards: 18, depthYards: -1.8333333333333333 },
          ...pathOf(stickThunderPlay, "rz").points.slice(1),
        ],
      },
    });
    const document = applyPlayCommand(
      shifted,
      addRouteChoiceCommand(shifted, "rz", 1)!,
    );
    const command = flipPlayerLinesCommand(document, "z")!;
    const stance = positionOf(document, "z").lateralYards;
    const before = pathOf(document, "rz");
    const flipped = pathOf(applyPlayCommand(document, command), "rz");

    expect(command.kind).toBe("batch");
    expect(flipped.points[0]!.lateralYards).toBeCloseTo(2 * stance - 18, 6);
    expect(flipped.branches[0]!.points[0]!.lateralYards).toBeCloseTo(
      2 * stance - before.branches[0]!.points[0]!.lateralYards,
      6,
    );
  });
});

describe("asking what can be done to one thing", () => {
  it("keeps a group whole when it is one of the group", () => {
    // Asking about one of several must not throw the rest away: the menu is
    // about all of them, which is what makes Delete take the group.
    const context = contextFor(stickThunderPlay);
    const { model } = run(context, [
      { type: "select-all" },
      { type: "point-at", item: player("z") },
    ]);

    expect(model.selection.length).toBeGreaterThan(1);
    expect(model.selection).toContainEqual(player("z"));
  });
});

describe("which of them draws on top", () => {
  const order = (document: PlayDocument) => document.paths.map(({ id }) => id);
  const seeded = order(stickThunderPlay);

  it("carries a group without letting its members overtake each other", () => {
    const moved = applyPlayCommand(
      stickThunderPlay,
      reorderSelectionCommand(stickThunderPlay, [path("rx"), path("rf")], 1)!,
    );

    // Both step forward once and keep their own order; neither jumps the other.
    expect(order(moved)).toEqual(["ry", "rx", "rf", "rh", "rz"]);
    // And with the group already against the back of the layer there is
    // nowhere to go: rf's only neighbour behind it is rx, which is one of the
    // group, so swapping with it would only shuffle the two of them.
    expect(
      reorderSelectionCommand(stickThunderPlay, [path("rx"), path("rf")], -1),
    ).toBeUndefined();
  });

  it("reorders text on its own layer, and lands as one entry", () => {
    const written = applyPlayCommand(stickThunderPlay, {
      kind: "insert-labels",
      labels: [0, 1].map((index) => ({
        index: stickThunderPlay.labels.length + index,
        item: {
          id: `note_${index}`,
          position: { lateralYards: index, depthYards: 3 },
          text: `n${index}`,
          color: "ink" as const,
          size: 12,
          box: "none" as const,
          boxColor: "ink" as const,
        },
      })),
    });
    const command = reorderSelectionCommand(written, [label("note_0")], 1)!;
    const after = applyPlayCommand(written, command);

    expect(command.kind).toBe("batch");
    // Forward is later in the layer, which is what draws on top.
    expect(after.labels.map(({ id }) => id).slice(-2)).toEqual([
      "note_1",
      "note_0",
    ]);
    // The lines were never touched, so their layer was never rewritten.
    expect(order(after)).toEqual(seeded);
  });
});

describe("holding everything on the field", () => {
  // The drawn frame as the shell reports it: a little past the seeded window
  // at either end, so a break can still be put on the last yard line.
  const depthWindow = { minDepthYards: -15, maxDepthYards: 35 };
  const halfWidth = stickThunderPlay.fieldProfile.widthYards / 2;
  const boundsContext = (overrides: Partial<FieldInteractionContext> = {}) =>
    contextFor(stickThunderPlay, {
      snap: { enabled: false, grid: "off" },
      depthWindow,
      createId: (prefix) => `${prefix}_new`,
      ...overrides,
    });
  const pathOf = (document: PlayDocument, id: string) =>
    document.paths.find((candidate) => candidate.id === id)!;
  const drag = (from: Coordinate, to: Coordinate): FieldInteractionEvent[] => [
    down(from),
    move(to),
    up(to),
  ];
  const dragged = (session: Session, id: string): Coordinate =>
    positionOf(applyPlayCommand(stickThunderPlay, session.commands[0]!), id);

  it("stops a dragged Player at the sideline", () => {
    const context = boundsContext();
    const q = positionOf(stickThunderPlay, "q");
    const far = { lateralYards: 90, depthYards: q.depthYards };

    const session = run(context, [down(q), move(far)]);
    expect(session.model.gesture.kind).toBe("moving");
    const preview = gesturePreviewCommand(session.model, stickThunderPlay)!;
    const previewed = positionOf(
      applyPlayCommand(stickThunderPlay, preview),
      "q",
    );
    expect(previewed.lateralYards).toBeCloseTo(halfWidth, 6);

    const released = run(context, [up(far)], session.model);
    expect(released.commands).toHaveLength(1);
    const landed = positionOf(
      applyPlayCommand(stickThunderPlay, released.commands[0]!),
      "q",
    );
    expect(landed.lateralYards).toBeCloseTo(halfWidth, 6);
    expect(landed.depthYards).toBeCloseTo(q.depthYards, 6);
  });

  it("stops a dragged Player at the edge of the drawn frame", () => {
    const q = positionOf(stickThunderPlay, "q");
    const below = run(
      boundsContext(),
      drag(q, { lateralYards: q.lateralYards, depthYards: -60 }),
    );
    expect(dragged(below, "q").depthYards).toBeCloseTo(
      depthWindow.minDepthYards,
      6,
    );

    // Downfield the ball stops an offensive man long before the frame does
    // (ADR 0052), so the frame's ceiling is read on a defender, who has the
    // whole of it to run in.
    const stance = { lateralYards: 0, depthYards: 12 };
    const withSafety = applyPlayCommand(stickThunderPlay, {
      kind: "insert-players",
      players: [
        {
          index: stickThunderPlay.players.length,
          item: {
            id: "safety",
            unit: "defense" as const,
            position: stance,
            symbol: "circle" as const,
            label: "S",
            sublabel: "",
            fill: "none" as const,
            color: "ink" as const,
          },
        },
      ],
    });
    const above = run(
      boundsContext({
        document: withSafety,
        scene: buildRenderScene(withSafety),
      }),
      drag(stance, { lateralYards: 0, depthYards: 80 }),
    );
    expect(above.commands).toHaveLength(1);
    expect(
      positionOf(applyPlayCommand(withSafety, above.commands[0]!), "safety")
        .depthYards,
    ).toBeCloseTo(depthWindow.maxDepthYards, 6);
  });

  it("stops a Player where the far end of his route touches the sideline", () => {
    const context = boundsContext();
    const z = positionOf(stickThunderPlay, "z");
    const route = pathOf(stickThunderPlay, "rz");
    const reach = Math.max(
      ...[...route.points, ...route.branches.flatMap((b) => b.points)].map(
        ({ lateralYards }) => lateralYards,
      ),
    );
    expect(reach).toBeGreaterThan(z.lateralYards);

    const session = run(
      context,
      drag(z, { lateralYards: z.lateralYards + 20, depthYards: z.depthYards }),
    );
    const after = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    const moved = pathOf(after, "rz");
    const tips = [
      ...moved.points,
      ...moved.branches.flatMap((b) => b.points),
    ].map(({ lateralYards }) => lateralYards);
    expect(Math.max(...tips)).toBeCloseTo(halfWidth, 6);
    // He and his route moved together, by exactly what the route allowed.
    expect(positionOf(after, "z").lateralYards).toBeCloseTo(
      z.lateralYards + (halfWidth - reach),
      6,
    );
  });

  it("holds a snapped Player on the field too", () => {
    const context = boundsContext({ snap: { enabled: true, grid: "off" } });
    const q = positionOf(stickThunderPlay, "q");
    const session = run(context, [
      down(q),
      move({ lateralYards: 90, depthYards: q.depthYards }),
    ]);
    const gesture = session.model.gesture;
    expect(gesture.kind).toBe("moving");
    if (gesture.kind !== "moving") return;
    expect(q.lateralYards + gesture.translation.lateralYards).toBeCloseTo(
      halfWidth,
      6,
    );
    expect(gesture.readout!.position.lateralYards).toBeCloseTo(halfWidth, 6);
  });

  it("holds a group by its outermost point", () => {
    const context = boundsContext();
    const x = positionOf(stickThunderPlay, "x");
    const q = positionOf(stickThunderPlay, "q");
    const routeX = pathOf(stickThunderPlay, "rx");
    const leftmost = Math.min(
      ...routeX.points.map(({ lateralYards }) => lateralYards),
    );

    const session = run(context, [
      down(q, { shiftKey: true }),
      up(q),
      down(x, { shiftKey: true }),
      up(x),
      ...drag(x, {
        lateralYards: x.lateralYards - 40,
        depthYards: x.depthYards,
      }),
    ]);
    expect(session.commands).toHaveLength(1);
    const after = applyPlayCommand(stickThunderPlay, session.commands[0]!);
    const tips = pathOf(after, "rx").points.map(
      ({ lateralYards }) => lateralYards,
    );
    expect(Math.min(...tips)).toBeCloseTo(-halfWidth, 6);
    // The group kept its shape: Q moved by the same held amount as X.
    const shift = positionOf(after, "x").lateralYards - x.lateralYards;
    expect(shift).toBeCloseTo(-halfWidth - leftmost, 6);
    expect(positionOf(after, "q").lateralYards).toBeCloseTo(
      q.lateralYards + shift,
      6,
    );
  });

  it("does not nudge a Player past the sideline", () => {
    const context = boundsContext();
    const q = positionOf(stickThunderPlay, "q");
    const onSideline = run(
      context,
      drag(q, { lateralYards: 90, depthYards: q.depthYards }),
    );
    const document = applyPlayCommand(
      stickThunderPlay,
      onSideline.commands[0]!,
    );
    const session = run(
      boundsContext({ document, scene: buildRenderScene(document) }),
      [{ type: "nudge", lateralYards: 0.5, depthYards: 0 }],
      { selection: [player("q")], gesture: { kind: "idle" } },
    );
    // Nothing to move by, so nothing to undo either.
    expect(session.commands).toHaveLength(0);

    const back = run(
      boundsContext({ document, scene: buildRenderScene(document) }),
      [{ type: "nudge", lateralYards: -0.5, depthYards: 0 }],
      { selection: [player("q")], gesture: { kind: "idle" } },
    );
    expect(back.commands).toHaveLength(1);
    expect(
      positionOf(applyPlayCommand(document, back.commands[0]!), "q")
        .lateralYards,
    ).toBeCloseTo(halfWidth - 0.5, 6);
  });

  it("brings a Player already off the frame back onto it", () => {
    const stranded = applyPlayCommand(stickThunderPlay, {
      kind: "move-players",
      moves: [
        { playerId: "q", position: { lateralYards: 0, depthYards: -30 } },
      ],
    });
    const context = boundsContext({
      document: stranded,
      scene: buildRenderScene(stranded),
    });
    const session = run(
      context,
      drag(
        { lateralYards: 0, depthYards: -30 },
        { lateralYards: 0, depthYards: -31 },
      ),
    );
    expect(session.commands).toHaveLength(1);
    const landed = positionOf(
      applyPlayCommand(stranded, session.commands[0]!),
      "q",
    );
    expect(landed.depthYards).toBeCloseTo(depthWindow.minDepthYards, 6);
  });

  it("keeps a bent segment inside the sidelines", () => {
    const context = boundsContext();
    const session = run(context, [
      {
        type: "handle-down",
        handle: { kind: "control", pathId: "rz", pointIndex: 1 },
        input: { point: { lateralYards: 21, depthYards: 5 }, pointerId: 1 },
      },
      move({ lateralYards: 60, depthYards: 5 }),
      up({ lateralYards: 60, depthYards: 5 }),
    ]);
    expect(session.commands).toHaveLength(1);
    const bent = pathOf(
      applyPlayCommand(stickThunderPlay, session.commands[0]!),
      "rz",
    );
    expect(bent.points[1]!.control!.lateralYards).toBeLessThanOrEqual(
      halfWidth,
    );
  });

  it("keeps a segment bent while drawing inside the sidelines", () => {
    const context = boundsContext();
    const z = positionOf(stickThunderPlay, "z");
    const first = {
      lateralYards: z.lateralYards,
      depthYards: z.depthYards + 8,
    };
    const session = run(context, [
      start("route", "z"),
      move(first),
      down(first),
      move({ lateralYards: 70, depthYards: first.depthYards - 4 }),
    ]);
    const control = session.model.drawing!.points.at(-1)!.control!;
    expect(control.lateralYards).toBeLessThanOrEqual(halfWidth);
  });

  it("pastes against the sideline rather than past it", () => {
    const room = applyPlayCommand(
      stickThunderPlay,
      deletePlayersCommand(stickThunderPlay, ["ol0", "ol1"]),
    );
    const bySideline = applyPlayCommand(room, {
      kind: "move-players",
      moves: [
        {
          playerId: "q",
          position: { lateralYards: halfWidth - 0.5, depthYards: -4 },
        },
      ],
    });
    let next = 0;
    const context = boundsContext({
      document: bySideline,
      scene: buildRenderScene(bySideline),
      createId: (prefix) => `${prefix}_${(next += 1)}`,
    });
    const session = run(context, [{ type: "copy" }, { type: "paste" }], {
      selection: [player("q")],
      gesture: { kind: "idle" },
    });
    expect(session.commands).toHaveLength(1);
    const after = applyPlayCommand(bySideline, session.commands[0]!);
    const copy = after.players.at(-1)!;
    expect(copy.position.lateralYards).toBeCloseTo(halfWidth, 6);
    // Only the held axis gave: the copy still lands clear of the original.
    expect(copy.position.depthYards).toBeLessThan(-4);
  });
});

describe("holding a zone bubble on the field", () => {
  const depthWindow = { minDepthYards: -15, maxDepthYards: 35 };
  const halfWidth = stickThunderPlay.fieldProfile.widthYards / 2;
  const dropAt = (
    lateralYards: number,
    coverageArea?: { radiusLateralYards: number; radiusDepthYards: number },
  ): PlayDocument => ({
    ...stickThunderPlay,
    players: stickThunderPlay.players.map((man) =>
      man.id === "q"
        ? { ...man, position: { lateralYards, depthYards: -4 } }
        : man,
    ),
    paths: [
      {
        id: "drop",
        kind: "zone" as const,
        playerId: "q",
        points: [
          { lateralYards, depthYards: -4 },
          { lateralYards, depthYards: 10 },
        ],
        branches: [],
        style: {
          line: "dashed" as const,
          ending: "bubble" as const,
          color: "blue" as const,
        },
        ...(coverageArea
          ? { coverageArea: { type: "hook" as const, ...coverageArea } }
          : {}),
      },
    ],
  });
  const zoneContext = (
    document: PlayDocument,
    overrides: Partial<FieldInteractionContext> = {},
  ) =>
    contextFor(document, {
      snap: { enabled: false, grid: "off" },
      depthWindow,
      createId: (prefix) => `${prefix}_new`,
      ...overrides,
    });
  const dropOf = (document: PlayDocument) =>
    document.paths.find(({ id }) => id === "drop")!;

  it("grows a bubble only until it touches the sideline", () => {
    const document = dropAt(20);
    const session = run(zoneContext(document), [
      {
        type: "handle-down",
        handle: { kind: "zone", pathId: "drop" },
        input: { point: { lateralYards: 21, depthYards: 11 }, pointerId: 1 },
      },
      move({ lateralYards: 45, depthYards: 14 }),
      up({ lateralYards: 45, depthYards: 14 }),
    ]);
    expect(session.commands).toHaveLength(1);
    const sized = dropOf(applyPlayCommand(document, session.commands[0]!));
    expect(sized.coverageArea!.radiusLateralYards).toBeCloseTo(
      halfWidth - 20,
      6,
    );
    expect(sized.coverageArea!.radiusDepthYards).toBeCloseTo(4, 6);
  });

  it("stops the end of a drop a bubble's width short of the sideline", () => {
    const document = dropAt(0, { radiusLateralYards: 5, radiusDepthYards: 4 });
    const session = run(zoneContext(document), [
      {
        type: "handle-down",
        handle: { kind: "node", pathId: "drop", pointIndex: 1 },
        input: { point: { lateralYards: 0, depthYards: 10 }, pointerId: 1 },
      },
      move({ lateralYards: 60, depthYards: 10 }),
      up({ lateralYards: 60, depthYards: 10 }),
    ]);
    expect(session.commands).toHaveLength(1);
    const moved = dropOf(applyPlayCommand(document, session.commands[0]!));
    expect(moved.points[1]!.lateralYards).toBeCloseTo(halfWidth - 5, 6);
  });

  it("stops a dragged defender where his bubble touches the sideline", () => {
    const document = dropAt(0, { radiusLateralYards: 5, radiusDepthYards: 4 });
    const q = positionOf(document, "q");
    const session = run(zoneContext(document), [
      down(q),
      move({ lateralYards: 50, depthYards: q.depthYards }),
      up({ lateralYards: 50, depthYards: q.depthYards }),
    ]);
    expect(session.commands).toHaveLength(1);
    const after = applyPlayCommand(document, session.commands[0]!);
    expect(dropOf(after).points[1]!.lateralYards + 5).toBeCloseTo(halfWidth, 6);
    expect(positionOf(after, "q").lateralYards).toBeCloseTo(halfWidth - 5, 6);
  });

  it("draws a drop no nearer the sideline than its default bubble allows", () => {
    const context = zoneContext(withMike);
    const session = run(context, [
      start("zone", "mike"),
      move({ lateralYards: 90, depthYards: 8 }),
    ]);
    expect(session.model.drawing!.kind).toBe("zone");
    expect(session.model.drawing!.cursor.lateralYards).toBeCloseTo(
      halfWidth - DEFAULT_ZONE_COVERAGE_RADII.radiusLateralYards,
      6,
    );
  });
});
