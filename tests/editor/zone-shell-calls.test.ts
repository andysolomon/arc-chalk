import {
  applyDefensiveCall,
  applyPlayCommand,
  highSchoolFieldProfile,
  invertPlayCommand,
  playDocumentSchema,
  stockDefensiveCalls,
  type PlayCommand,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { applyLinePresetCommand, buildDeleteCommand } from "@chalk/editor";
import { describe, expect, it } from "vitest";

const WIDTH = highSchoolFieldProfile.widthYards;

let nextId = 0;
const makeId = (prefix: string) => `${prefix}_${(nextId += 1)}`;

const run = (play: PlayDocument, command: PlayCommand | undefined) => {
  expect(command).toBeDefined();
  return applyPlayCommand(play, command!);
};

const defender = (
  id: string,
  lateralYards: number,
  depthYards: number,
): Player => ({
  id,
  unit: "defense",
  position: { lateralYards, depthYards },
  symbol: "triangle",
  label: id.toUpperCase(),
  sublabel: "",
  fill: "none",
  color: "ink",
});

/** Two corners, a free safety and a mike, with nothing called yet. */
const bare: PlayDocument = playDocumentSchema.parse({
  schemaVersion: 3,
  id: "play_zone_calls",
  playbookId: "playbook_zone_calls",
  name: "Under test",
  unit: "defense",
  tags: [],
  notes: "",
  fieldProfile: highSchoolFieldProfile,
  players: [
    defender("lc", -20, 7),
    defender("rc", 20, 7),
    defender("fs", 2, 12),
    defender("m", 0, 5),
  ],
  assignments: [],
  paths: [],
  labels: [],
});

const dropOf = (play: PlayDocument, playerId: string) =>
  play.paths.find(
    (path) => path.playerId === playerId && path.style.ending === "bubble",
  );
const centerOf = (play: PlayDocument, playerId: string) =>
  dropOf(play, playerId)!.points.at(-1)!.lateralYards;

const call = (play: PlayDocument, playerId: string, preset: string) =>
  run(play, applyLinePresetCommand(play, [playerId], preset, makeId));

describe("the zone shell, as the Coach calls it", () => {
  const oneDeep = call(bare, "lc", "deep3");
  const twoDeep = call(oneDeep, "rc", "deep3");
  const threeDeep = call(twoDeep, "fs", "mid3");

  it("makes room for each deep defender called, in one step each", () => {
    // Alone, the corner owns the middle of the field.
    expect(centerOf(oneDeep, "lc")).toBeCloseTo(0, 9);
    // The second deep defender takes half of it.
    expect(centerOf(twoDeep, "lc")).toBeCloseTo(-WIDTH / 4, 9);
    expect(centerOf(twoDeep, "rc")).toBeCloseTo(WIDTH / 4, 9);
    // The third takes the middle third, and the corners give it up.
    expect(centerOf(threeDeep, "lc")).toBeCloseTo(-WIDTH / 3, 9);
    expect(centerOf(threeDeep, "fs")).toBeCloseTo(0, 9);
    expect(centerOf(threeDeep, "rc")).toBeCloseTo(WIDTH / 3, 9);
    // Every call is still the one the Coach picked, so its button stays lit.
    expect(dropOf(threeDeep, "lc")!.preset).toBe("deep3");
    expect(dropOf(threeDeep, "fs")!.preset).toBe("mid3");
  });

  it("puts the shell back the way it was with one undo", () => {
    const command = applyLinePresetCommand(twoDeep, ["fs"], "mid3", makeId)!;
    const undone = applyPlayCommand(
      applyPlayCommand(twoDeep, command),
      invertPlayCommand(twoDeep, command),
    );
    expect(undone.paths).toEqual(twoDeep.paths);
  });

  it("closes over a deep defender whose call is taken off", () => {
    const off = call(threeDeep, "fs", "mid3");
    expect(dropOf(off, "fs")).toBeUndefined();
    expect(centerOf(off, "lc")).toBeCloseTo(-WIDTH / 4, 9);
    expect(centerOf(off, "rc")).toBeCloseTo(WIDTH / 4, 9);
  });

  it("closes over a deep defender sent on a blitz instead", () => {
    const rushing = call(threeDeep, "fs", "blitz");
    expect(rushing.paths.find(({ playerId }) => playerId === "fs")!.kind).toBe(
      "blitz",
    );
    expect(centerOf(rushing, "lc")).toBeCloseTo(-WIDTH / 4, 9);
  });

  it("closes over a deep drop that is deleted, or a defender whose lines are cleared", () => {
    const pathId = dropOf(threeDeep, "fs")!.id;
    const deleted = run(
      threeDeep,
      buildDeleteCommand(threeDeep, [{ kind: "path", id: pathId }]),
    );
    expect(centerOf(deleted, "rc")).toBeCloseTo(WIDTH / 4, 9);

    const cleared = run(
      threeDeep,
      buildDeleteCommand(threeDeep, [{ kind: "player", id: "lc" }]),
    );
    expect(dropOf(cleared, "lc")).toBeUndefined();
    expect(centerOf(cleared, "fs")).toBeCloseTo(-WIDTH / 4, 9);
    expect(centerOf(cleared, "rc")).toBeCloseTo(WIDTH / 4, 9);
  });

  it("leaves the deep shell alone when a zone is called underneath", () => {
    const hooked = call(threeDeep, "m", "hook");
    for (const id of ["lc", "fs", "rc"]) {
      expect(dropOf(hooked, id)).toEqual(dropOf(threeDeep, id));
    }
  });
});

describe("a defensive call joined by one more zone", () => {
  const cover2 = stockDefensiveCalls.find(
    ({ formation }) => formation.name === "Nickel Cover 2",
  )!;
  const { play } = applyDefensiveCall(bare, cover2, makeId);
  const deepCenters = (of: PlayDocument) =>
    of.paths
      .filter(({ coverageArea }) => coverageArea?.type === "deep")
      .map(({ points }) => points.at(-1)!.lateralYards)
      .sort((left, right) => left - right);

  it("puts the call on as the original draws it", () => {
    const art = cover2.assignments
      .filter(({ kind }) => kind === "drop")
      .map(({ points }) => points.at(-1));
    for (const path of play.paths) {
      expect(art).toContainEqual(path.points.at(-1));
    }
  });

  it("lays the call's own deep drops out with the new one", () => {
    // The mike leaves the hole underneath for the deep middle: two-deep
    // rotates to three.
    const mike = play.players.find(({ label }) => label === "M")!;
    const rotated = call(play, mike.id, "mid3");
    const centers = deepCenters(rotated);
    expect(centers).toHaveLength(3);
    centers.forEach((center, index) => {
      expect(center).toBeCloseTo(-WIDTH / 2 + (index + 0.5) * (WIDTH / 3), 9);
    });
    expect(centerOf(rotated, mike.id)).toBeCloseTo(0, 9);
  });
});
