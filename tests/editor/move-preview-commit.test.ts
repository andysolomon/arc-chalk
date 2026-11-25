import {
  applyPlayCommand,
  type Coordinate,
  type PlayCommand,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import {
  fieldInteraction,
  idleFieldInteraction,
  type FieldInteractionContext,
  type FieldInteractionEvent,
  type FieldInteractionModel,
  type FieldItemRef,
} from "@chalk/editor";
import { buildRenderScene, createSvgProjection } from "@chalk/render";
import { stickThunderPlay } from "@chalk/test-fixtures";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

/**
 * While a man is dragged the field paints every moving thing shifted by the
 * gesture's translation, and the line count and depth readout read it too.
 * The release and the keyboard nudge commit a move. These properties drive
 * the machine the way the shell does and check that what was shown is what
 * lands, for random drags across the sidelines, the drawn frame, the line of
 * scrimmage and onto teammates.
 *
 * Ways the shown move and the committed move can part:
 * 1. The release holds a man at the line of scrimmage that the preview let
 *    him cross, so he jumps back when the pointer lifts (#244).
 * 2. A group is held differently mid-drag than on release, so the men land
 *    apart from where they were shown or out of their shape.
 * 3. A man dropped on a teammate is pushed clear in one path and not the
 *    other (#245).
 * 4. The keyboard nudge holds a move differently from a drag of the same
 *    size, so a key puts a man where the pointer cannot.
 * 5. A route carried with its man is committed by a different amount than
 *    the man, while the preview paints it shifted by his.
 */

const projection = createSvgProjection(stickThunderPlay.fieldProfile);
const depthWindow = { minDepthYards: -15, maxDepthYards: 35 };

function defender(id: string, lateralYards: number, depthYards: number) {
  return {
    id,
    unit: "defense" as const,
    position: { lateralYards, depthYards },
    symbol: "circle" as const,
    label: id.toUpperCase(),
    sublabel: "",
    fill: "none" as const,
    color: "ink" as const,
  };
}

/** Stick Thunder with a front across from it, so both sides have a line to hold. */
const play: PlayDocument = applyPlayCommand(stickThunderPlay, {
  kind: "insert-players",
  players: [
    defender("m", 0, 5),
    defender("w", -7, 4),
    defender("s", 7, 4),
    defender("fs", 0, 13),
  ].map((item, offset) => ({
    index: stickThunderPlay.players.length + offset,
    item,
  })),
});

function contextFor(snapEnabled: boolean): FieldInteractionContext {
  return {
    document: play,
    scene: buildRenderScene(play),
    screenScale: {
      lateralPixelsPerYard: projection.lateralPixelsPerYard,
      depthPixelsPerYard: projection.depthPixelsPerYard,
    },
    snap: { enabled: snapEnabled, grid: "off" },
    tool: "select",
    depthWindow,
  };
}
const contexts = { snapping: contextFor(true), free: contextFor(false) };

const men = play.players;
const byId = new Map(men.map((man) => [man.id, man]));

function run(
  context: FieldInteractionContext,
  model: FieldInteractionModel,
  events: readonly FieldInteractionEvent[],
): { model: FieldInteractionModel; commands: PlayCommand[] } {
  const commands: PlayCommand[] = [];
  for (const event of events) {
    const result = fieldInteraction(model, event, context);
    model = result.model;
    if (result.command) commands.push(result.command);
  }
  return { model, commands };
}

const pointer = (
  type: "pointer-down" | "pointer-move" | "pointer-up",
  point: Coordinate,
  free: boolean,
): FieldInteractionEvent => ({
  type,
  input: { point, pointerId: 1, free },
});

const selected = (ids: readonly string[]): FieldInteractionModel => ({
  ...idleFieldInteraction,
  selection: ids.map((id): FieldItemRef => ({ kind: "player", id })),
});

interface Shown {
  readonly items: readonly FieldItemRef[];
  readonly translation: Coordinate;
  readonly readout?: Coordinate;
}

interface Drag {
  readonly shown?: Shown;
  readonly committed: PlayDocument;
}

/** Press the first man, drag to `to`, read what the field shows, let go. */
function drag(
  ids: readonly string[],
  to: Coordinate,
  options: { readonly snap: boolean; readonly free: boolean },
): Drag {
  const context = options.snap ? contexts.snapping : contexts.free;
  const from = byId.get(ids[0]!)!.position;
  const pressed = run(context, selected(ids), [
    pointer("pointer-down", from, options.free),
    pointer("pointer-move", to, options.free),
  ]);
  const gesture = pressed.model.gesture;
  const released = run(context, pressed.model, [
    pointer("pointer-up", to, options.free),
  ]);
  const command = released.commands[0];
  return {
    ...(gesture.kind === "moving"
      ? {
          shown: {
            items: gesture.items,
            translation: gesture.translation,
            ...(gesture.readout ? { readout: gesture.readout.position } : {}),
          },
        }
      : {}),
    committed: command ? applyPlayCommand(play, command) : play,
  };
}

function shifted(point: Coordinate, by: Coordinate): Coordinate {
  return {
    lateralYards: point.lateralYards + by.lateralYards,
    depthYards: point.depthYards + by.depthYards,
  };
}

function expectAt(actual: Coordinate, expected: Coordinate): void {
  expect(actual.lateralYards).toBeCloseTo(expected.lateralYards, 6);
  expect(actual.depthYards).toBeCloseTo(expected.depthYards, 6);
}

function movedMen(shown: Shown): Player[] {
  return shown.items.flatMap((item) =>
    item.kind === "player" ? [byId.get(item.id)!] : [],
  );
}

function expectLandedWhereShown(drag: Drag): void {
  const shown = drag.shown!;
  for (const man of movedMen(shown)) {
    const landed = drag.committed.players.find(({ id }) => id === man.id)!;
    expectAt(landed.position, shifted(man.position, shown.translation));
  }
}

const ids = men.map(({ id }) => id);
const oneMan = fc.constantFrom(...ids);
const group = fc.uniqueArray(oneMan, { minLength: 2, maxLength: 4 });
/** Far enough to carry a man over a sideline, the frame or the ball. */
const reach = fc.record({
  lateralYards: fc.double({ min: -45, max: 45, noNaN: true }),
  depthYards: fc.double({ min: -35, max: 40, noNaN: true }),
});
const handling = fc.record({ snap: fc.boolean(), free: fc.boolean() });

// Each run drives the whole machine, so a loaded runner needs more than 5 s.
describe("a drag lands where the field showed it", { timeout: 60_000 }, () => {
  it("does not let one man cross the line mid-drag and jump back on release (#244)", () => {
    fc.assert(
      fc.property(oneMan, reach, handling, (id, by, options) => {
        const result = drag([id], shifted(byId.get(id)!.position, by), options);
        fc.pre(result.shown !== undefined);
        expectLandedWhereShown(result);
        const readout = result.shown.readout;
        if (readout) {
          const landed = result.committed.players.find((man) => man.id === id)!;
          expectAt(landed.position, readout);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("does not hold a group one way mid-drag and another on release", () => {
    fc.assert(
      fc.property(group, reach, handling, (picked, by, options) => {
        const first = byId.get(picked[0]!)!;
        const result = drag(picked, shifted(first.position, by), options);
        fc.pre(result.shown !== undefined);
        expectLandedWhereShown(result);
      }),
      { numRuns: 100 },
    );
  });

  it("does not push a man off a teammate in the preview and not on release, or the other way (#245)", () => {
    const teammates = (man: Player) =>
      men.filter(
        (other) =>
          other.id !== man.id &&
          (other.unit === "defense") === (man.unit === "defense"),
      );
    fc.assert(
      fc.property(
        oneMan,
        fc.nat(),
        fc.record({
          lateralYards: fc.double({ min: -1, max: 1, noNaN: true }),
          depthYards: fc.double({ min: -1, max: 1, noNaN: true }),
        }),
        handling,
        (id, pick, near, options) => {
          const man = byId.get(id)!;
          const others = teammates(man);
          const onto = others[pick % others.length]!;
          const result = drag([id], shifted(onto.position, near), options);
          fc.pre(result.shown !== undefined);
          expectLandedWhereShown(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does not let a key put men where a drag of the same size cannot", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(oneMan, { minLength: 1, maxLength: 3 }),
        reach,
        (picked, by) => {
          const first = byId.get(picked[0]!)!;
          const dragged = drag(picked, shifted(first.position, by), {
            snap: false,
            free: true,
          });
          fc.pre(dragged.shown !== undefined);
          const nudged = run(contexts.free, selected(picked), [
            { type: "nudge", ...by },
          ]);
          const committed = nudged.commands[0]
            ? applyPlayCommand(play, nudged.commands[0])
            : play;
          expectLandedWhereShown({ ...dragged, committed });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does not commit a man's routes by a different amount than the man", () => {
    const runners = [...new Set(play.paths.map(({ playerId }) => playerId))];
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...runners), {
          minLength: 1,
          maxLength: 3,
        }),
        reach,
        handling,
        (picked, by, options) => {
          const first = byId.get(picked[0]!)!;
          const result = drag(picked, shifted(first.position, by), options);
          fc.pre(result.shown !== undefined);
          const moving = new Set(movedMen(result.shown).map(({ id }) => id));
          for (const path of play.paths) {
            if (!moving.has(path.playerId)) continue;
            const landed = result.committed.paths.find(
              ({ id }) => id === path.id,
            )!;
            const lines = [path.points, ...path.branches.map((b) => b.points)];
            const landedLines = [
              landed.points,
              ...landed.branches.map((b) => b.points),
            ];
            lines.forEach((points, line) =>
              points.forEach((point, index) =>
                expectAt(
                  landedLines[line]![index]!,
                  shifted(point, result.shown!.translation),
                ),
              ),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
