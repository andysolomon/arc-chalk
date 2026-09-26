import {
  applyPlayCommand,
  DEFAULT_ZONE_COVERAGE_RADII,
  deletePlayersCommand,
  type Coordinate,
  type PlayCommand,
  type PlayDocument,
} from "@chalk/domain";
import {
  addAlternateRouteCommand,
  buildMoveCommand,
  fieldHitOptions,
  fieldInteraction,
  gesturePreviewCommand,
  hitTestField,
  idleFieldInteraction,
  setRouteKindCommand,
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
});

describe("field interaction tools", () => {
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
});

describe("field hit testing", () => {
  const scene = buildRenderScene(stickThunderPlay);

  it("gives a finger the man it landed on when the men stand closer than it is wide", () => {
    // A phone draws the field at about four tenths of its frame, which puts
    // linemen fourteen pixels apart inside a finger's forty-four.
    const phone = {
      lateralPixelsPerYard: screenScale.lateralPixelsPerYard * 0.39,
      depthPixelsPerYard: screenScale.depthPixelsPerYard * 0.39,
    };
    for (const man of stickThunderPlay.players) {
      expect(
        hitTestField(scene, man.position, phone, fieldHitOptions("touch"))
          ?.item,
      ).toEqual(player(man.id));
    }
    // Off his centre, a press still goes to whoever it is nearer.
    const center = positionOf(stickThunderPlay, "ol2");
    const guard = positionOf(stickThunderPlay, "ol3");
    const leaning = {
      lateralYards:
        center.lateralYards + (guard.lateralYards - center.lateralYards) * 0.4,
      depthYards: center.depthYards,
    };
    expect(
      hitTestField(scene, leaning, phone, fieldHitOptions("touch"))?.item,
    ).toEqual(player("ol2"));
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

  it("traces a bent pull off the blue dot, keeps it in hand, and commits the curve on Done", () => {
    const context = drawingContext();
    const q = positionOf(stickThunderPlay, "q");
    // The dot sits upfield of the man; the drag is followed from his stance.
    const press = {
      lateralYards: q.lateralYards,
      depthYards: q.depthYards + 1,
    };
    const wheel = wheelFrom(press);

    const held = run(context, [
      {
        type: "start-route",
        playerId: "q",
        input: { pointerId: 1, point: press },
      },
      ...wheel.map((point) => move(point)),
    ]);
    expect(held.model.drawing).toMatchObject({
      mode: "breaks",
      pointerDown: true,
      strokeFrom: 0,
    });
    expect(
      held.model.drawing!.points.filter((point) => point.traced).length,
    ).toBeGreaterThan(10);

    // Lifting keeps the shape the hand drew and the line in hand: the next
    // press would place the next break, and nothing is committed yet.
    const lifted = run(context, [up(wheel.at(-1)!)], held.model);
    expect(lifted.commands).toHaveLength(0);
    expect(lifted.model.drawing).toMatchObject({
      mode: "breaks",
      pointerDown: false,
    });
    expect(lifted.model.drawing!.strokeFrom).toBeUndefined();
    expect(lifted.model.drawing!.initialDrag).toBeUndefined();
    expect(lifted.model.drawing!.points.some((point) => point.traced)).toBe(
      true,
    );

    const finished = run(context, [{ type: "finish-drawing" }], lifted.model);
    expect(finished.commands).toHaveLength(1);
    const drawn = drawnPath(finished.commands[0]!);
    expect(drawn.points[0]).toMatchObject(q);
    // The wheel arrives as a curve, fitted, not as the samples it was.
    expect(drawn.points.some((point) => point.control !== undefined)).toBe(
      true,
    );
    expect(drawn.points.length).toBeLessThan(wheel.length);
    expect(drawn.points.some((point) => "traced" in point)).toBe(false);
    expect(drawn.points.at(-1)!.lateralYards).toBeCloseTo(
      q.lateralYards + 6,
      6,
    );
    expect(drawn.points.at(-1)!.depthYards).toBeCloseTo(q.depthYards + 14, 6);
  });

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

describe("route styling", () => {
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
});

describe("the other lines he could run", () => {
  const createId = () => "alternate";

  it("gives no alternate route to a man who does not run routes", () => {
    expect(
      addAlternateRouteCommand(stickThunderPlay, "ol2", createId),
    ).toBeUndefined();
    expect(
      addAlternateRouteCommand(withMike, "mike", createId),
    ).toBeUndefined();
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

  it("leaves the frame alone when the shell has not drawn one", () => {
    const context = boundsContext({ depthWindow: undefined });
    const q = positionOf(stickThunderPlay, "q");
    const session = run(
      context,
      drag(q, { lateralYards: q.lateralYards, depthYards: -60 }),
    );
    expect(dragged(session, "q").depthYards).toBeCloseTo(-60, 6);
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
