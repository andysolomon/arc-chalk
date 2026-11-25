import {
  applyFormation,
  applyPlayCommand,
  emptyPlayDocument,
  highSchoolFieldProfile,
  lineKindChoices,
  snapSpotOf,
  stockFormations,
  type MovementPath,
  type PlayCommand,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { applyMotionCallCommand, setMotionAtSnapCommand } from "@chalk/editor";
import { describe, expect, it } from "vitest";

/**
 * Giving a man a motion type, in isolation (ADR 0080). The Coach's journey is
 * `tests/e2e/motion-panel.spec.ts`. These are the ways the command could
 * leave the Play wrong while the field still shows a zigzag, written before
 * the code:
 *
 * - a second type picked for a man leaves two motions on him;
 * - a type keeps Moving or Set from the type it replaced;
 * - Set is stored, so a motion set by choice hashes unlike one never touched;
 * - the route he already had is left starting where he no longer is at the
 *   snap;
 * - a route that never started where he was at the snap is dragged along;
 * - a re-anchored route loses its shape, or its forks stay behind;
 * - taking the motion off leaves his route starting where the motion ended;
 * - a type is put on a lineman;
 * - a type's breaks land outside the sidelines;
 * - a route is still offered Motion as something to turn into, or a motion
 *   Route.
 */

let nextId = 0;
const makeId = (prefix: string) => `${prefix}_${(nextId += 1)}`;

function gunDoubles(): PlayDocument {
  const formation = stockFormations.find(
    ({ name }) => name === "Gun Doubles Right",
  )!;
  const blank = emptyPlayDocument({
    playbookId: "playbook_motion",
    fieldProfile: highSchoolFieldProfile,
    id: "play_motion",
  });
  return applyFormation(blank, formation, makeId).play;
}

const man = (play: PlayDocument, label: string): Player => {
  const found = play.players.find((player) => player.label === label);
  if (!found) throw new Error(`Nobody lettered ${label}`);
  return found;
};

const run = (play: PlayDocument, command: PlayCommand | undefined) => {
  if (!command) throw new Error("No command was built.");
  return applyPlayCommand(play, command);
};

const motionsOf = (play: PlayDocument, player: Player) =>
  play.paths.filter(
    ({ playerId, kind }) => playerId === player.id && kind === "motion",
  );

const give = (play: PlayDocument, label: string, key: string) =>
  run(
    play,
    applyMotionCallCommand(play, man(play, label).id, key, () =>
      makeId("path"),
    ),
  );

/** A slant with a fork off its break, drawn from wherever he is at the snap. */
function withSlant(play: PlayDocument, label: string): PlayDocument {
  const player = man(play, label);
  const from = snapSpotOf(play, player.id);
  const slant: MovementPath = {
    id: `slant-${label}`,
    kind: "route",
    playerId: player.id,
    points: [
      from,
      { lateralYards: from.lateralYards, depthYards: from.depthYards + 3 },
      {
        lateralYards: from.lateralYards - 6,
        depthYards: from.depthYards + 9,
        control: {
          lateralYards: from.lateralYards - 2,
          depthYards: from.depthYards + 5,
        },
      },
    ],
    branches: [
      {
        fromIndex: 1,
        points: [
          {
            lateralYards: from.lateralYards + 4,
            depthYards: from.depthYards + 6,
          },
        ],
        style: { line: "dashed", ending: "arrow", color: "ink" },
      },
    ],
    style: { line: "solid", ending: "arrow", color: "ink" },
  };
  return { ...play, paths: [...play.paths, slant] };
}

const offsetsFrom = (path: MovementPath) => {
  const start = path.points[0]!;
  const off = (point: { lateralYards: number; depthYards: number }) => [
    Number((point.lateralYards - start.lateralYards).toFixed(3)),
    Number((point.depthYards - start.depthYards).toFixed(3)),
  ];
  return {
    points: path.points.map(off),
    controls: path.points.flatMap(({ control }) =>
      control ? [off(control)] : [],
    ),
    forks: path.branches.map(({ points }) => points.map(off)),
  };
};

describe("giving a man a motion type", () => {
  it("draws one zigzag from his stance, named for its type", () => {
    const play = give(gunDoubles(), "Z", "jet");
    const z = man(play, "Z");
    const [motion, ...rest] = motionsOf(play, z);
    expect(rest).toEqual([]);
    expect(motion!.points[0]).toEqual(z.position);
    expect(motion!.preset).toBe("jet");
    expect(motion!.style.line).toBe("zigzag");
    expect(motion!.atSnap).toBe("moving");
  });

  it("keeps a motion set by choice the same as one never touched", () => {
    const shift = give(gunDoubles(), "Z", "shift");
    const id = motionsOf(shift, man(shift, "Z"))[0]!.id;
    // Already set: nothing to change.
    expect(setMotionAtSnapCommand(shift, id, "set")).toBeUndefined();
    const moving = run(shift, setMotionAtSnapCommand(shift, id, "moving"));
    expect(moving.paths.find((path) => path.id === id)!.atSnap).toBe("moving");
    const set = run(moving, setMotionAtSnapCommand(moving, id, "set"));
    expect(set.paths.find((path) => path.id === id)).toEqual(
      shift.paths.find((path) => path.id === id),
    );
  });

  it("starts the route he had from where the motion leaves him, shape and forks intact", () => {
    const before = withSlant(gunDoubles(), "Z");
    const was = offsetsFrom(before.paths.find(({ id }) => id === "slant-Z")!);
    const after = give(before, "Z", "across");
    const z = man(after, "Z");
    const slant = after.paths.find(({ id }) => id === "slant-Z")!;
    const end = motionsOf(after, z)[0]!.points.at(-1)!;
    expect(slant.points[0]!.lateralYards).toBeCloseTo(end.lateralYards, 6);
    expect(slant.points[0]!.depthYards).toBeCloseTo(end.depthYards, 6);
    expect(offsetsFrom(slant)).toEqual(was);
  });

  it("follows the motion again when its type changes", () => {
    const jet = give(withSlant(gunDoubles(), "Z"), "Z", "jet");
    const shifted = give(jet, "Z", "shift");
    const z = man(shifted, "Z");
    const end = motionsOf(shifted, z)[0]!.points.at(-1)!;
    const slant = shifted.paths.find(({ id }) => id === "slant-Z")!;
    expect(slant.points[0]!.lateralYards).toBeCloseTo(end.lateralYards, 6);
    expect(slant.points[0]!.depthYards).toBeCloseTo(end.depthYards, 6);
  });

  it("leaves alone a route that never started where he was at the snap", () => {
    const base = withSlant(gunDoubles(), "Z");
    const elsewhere = {
      ...base,
      paths: base.paths.map((path) =>
        path.id === "slant-Z"
          ? {
              ...path,
              points: path.points.map((point, index) =>
                index === 0
                  ? { ...point, lateralYards: point.lateralYards - 3 }
                  : point,
              ),
            }
          : path,
      ),
    };
    const after = give(elsewhere, "Z", "across");
    expect(after.paths.find(({ id }) => id === "slant-Z")).toEqual(
      elsewhere.paths.find(({ id }) => id === "slant-Z"),
    );
  });

  it("gives a lineman nothing", () => {
    const play = gunDoubles();
    const tackle = play.players.find(
      ({ label, position }) => label === "" && position.lateralYards > 3,
    )!;
    expect(
      applyMotionCallCommand(play, tackle.id, "jet", () => makeId("path")),
    ).toBeUndefined();
  });

  it("keeps every type inside the sidelines for every man who can run one", () => {
    const play = gunDoubles();
    const half = play.fieldProfile.widthYards / 2;
    for (const label of ["X", "H", "Y", "Z", "F"]) {
      for (const key of ["jet", "orbit", "across", "return", "shift"]) {
        const after = give(play, label, key);
        const motion = motionsOf(after, man(after, label))[0]!;
        for (const point of motion.points) {
          expect(
            Math.abs(point.lateralYards),
            `${key} for ${label}`,
          ).toBeLessThanOrEqual(half);
        }
      }
    }
  });
});

describe("what a line can be turned into", () => {
  it("no longer trades a route for a motion, or a motion for a route", () => {
    const play = withSlant(gunDoubles(), "Z");
    const slant = play.paths.find(({ id }) => id === "slant-Z")!;
    expect(lineKindChoices(play, slant)).toEqual(["route"]);
    const after = give(play, "Z", "jet");
    const motion = motionsOf(after, man(after, "Z"))[0]!;
    expect(lineKindChoices(after, motion)).toEqual(["motion"]);
    // A back's route can still be the ball's flight.
    const back = withSlant(gunDoubles(), "F");
    expect(
      lineKindChoices(
        back,
        back.paths.find(({ id }) => id === "slant-F")!,
      ),
    ).toEqual(["route", "ball"]);
  });
});
