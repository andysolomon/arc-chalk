import {
  applyPlayCommand,
  assignRoles,
  playDocumentSchema,
  routePresetNames,
  routePresetPoints,
  stockConcepts,
  stockFormations,
  highSchoolFieldProfile,
  type ConceptDefinition,
  type PlayDocument,
} from "@chalk/domain";
import {
  applyLinePresetCommand,
  applyPlayerRoutePresetCommand,
  applyRoutePresetCommand,
  linemenOf,
} from "@chalk/editor";
import { describe, expect, it } from "vitest";

const conceptNamed = (key: string): ConceptDefinition => {
  const concept = stockConcepts.find((value) => value.key === key);
  if (!concept) throw new Error(`No such concept: ${key}`);
  return concept;
};

/** Gun Trips Right, and nothing drawn on anybody. */
const trips: PlayDocument = playDocumentSchema.parse({
  schemaVersion: 3,
  id: "play_concepts",
  playbookId: "playbook_concepts",
  name: "Under test",
  unit: "offense",
  tags: [],
  notes: "",
  fieldProfile: highSchoolFieldProfile,
  players: stockFormations
    .find(({ name }) => name === "Gun Trips Right")!
    .slots.map((slot, index) => ({
      id: `man_${index}`,
      unit: slot.unit,
      position: slot.position,
      symbol: slot.symbol,
      label: slot.label,
      sublabel: "",
      fill: "none",
      color: "ink",
    })),
  assignments: [],
  paths: [],
  labels: [],
});

let nextId = 0;
const makeId = (prefix: string) => `${prefix}_${(nextId += 1)}`;

const idOfRole = (play: PlayDocument, role: string): string => {
  const roles = assignRoles(play.players);
  return play.players[roles.indexOf(role)]!.id;
};

const run = (play: PlayDocument, command?: unknown): PlayDocument =>
  command ? applyPlayCommand(play, command as never) : play;

describe("the route tree", () => {
  it("offers the shapes the original offers, and draws each from the man's own spot", () => {
    expect(routePresetNames.map(({ key }) => key)).toEqual([
      "go",
      "slant",
      "hitch",
      "curl",
      "out",
      "dig",
      "post",
      "corner",
      "flat",
      "wheel",
    ]);
    const stance = { lateralYards: -20, depthYards: 0 };
    const go = routePresetPoints("go", stance)!;
    expect(go[0]).toEqual(stance);
    expect(go.at(-1)!.depthYards).toBeGreaterThan(13);
  });

  it("turns the same call the other way for the man on the other side", () => {
    const left = routePresetPoints("out", {
      lateralYards: -20,
      depthYards: 0,
    })!;
    const right = routePresetPoints("out", {
      lateralYards: 20,
      depthYards: 0,
    })!;
    // Out breaks toward a man's own sideline, so it is away from the middle
    // whichever side he stands on.
    expect(left.at(-1)!.lateralYards).toBeLessThan(-20);
    expect(right.at(-1)!.lateralYards).toBeGreaterThan(20);
    expect(left.at(-1)!.lateralYards).toBeCloseTo(
      -right.at(-1)!.lateralYards,
      9,
    );
  });

  it("breaks a slant and a dig toward the middle from either side", () => {
    for (const key of ["slant", "dig"]) {
      const left = routePresetPoints(key, {
        lateralYards: -20,
        depthYards: 0,
      })!;
      expect(left.at(-1)!.lateralYards).toBeGreaterThan(-20);
      const right = routePresetPoints(key, {
        lateralYards: 20,
        depthYards: 0,
      })!;
      expect(right.at(-1)!.lateralYards).toBeLessThan(20);
    }
  });

  it("bends the wheel, and only the wheel", () => {
    const stance = { lateralYards: 20, depthYards: 0 };
    const wheel = routePresetPoints("wheel", stance)!;
    expect(wheel.some((point) => point.control)).toBe(true);
    for (const { key } of routePresetNames.filter((p) => p.key !== "wheel")) {
      expect(routePresetPoints(key, stance)!.some((p) => p.control)).toBe(
        false,
      );
    }
  });

  it("knows nothing about a call it does not have", () => {
    expect(
      routePresetPoints("banana", { lateralYards: 0, depthYards: 0 }),
    ).toBeUndefined();
  });

  it("has no job for a position a concept says nothing about", () => {
    const stance = { lateralYards: -20, depthYards: 0 };
    expect(conceptNamed("mesh").jobFor("LT", stance)).toBeUndefined();
    expect(conceptNamed("mesh").jobFor("QB", stance)).toBeUndefined();
    expect(conceptNamed("mesh").jobFor("X", stance)).toBeDefined();
  });
});

describe("how a man blocks, and how a defender plays", () => {
  const linemanIds = (play: PlayDocument) =>
    linemenOf(play).map(({ id }) => id);
  /** Trips with a Mike linebacker across from it, for the calls a defender takes. */
  const withMike: PlayDocument = {
    ...trips,
    players: [
      ...trips.players,
      {
        id: "mike",
        unit: "defense",
        position: { lateralYards: 0, depthYards: 5 },
        symbol: "none",
        label: "M",
        sublabel: "",
        fill: "none",
        color: "ink",
      },
    ],
  };

  it("gives nobody a call his position cannot run", () => {
    // A receiver never drops into a zone or blitzes, a defender never blocks,
    // and a lineman never drops or blitzes.
    const receiver = idOfRole(withMike, "X");
    const lineman = linemanIds(withMike)[0]!;
    expect(
      applyLinePresetCommand(withMike, [receiver], "blitz", makeId),
    ).toBeUndefined();
    expect(
      applyLinePresetCommand(withMike, [receiver], "deep3", makeId),
    ).toBeUndefined();
    expect(
      applyLinePresetCommand(withMike, [lineman], "blitz", makeId),
    ).toBeUndefined();
    expect(
      applyLinePresetCommand(withMike, ["mike"], "drive", makeId),
    ).toBeUndefined();

    // Asked of a mixed group, the call lands only on the men who can run it.
    const mixed = run(
      withMike,
      applyLinePresetCommand(withMike, [lineman, "mike"], "drive", makeId),
    );
    expect(mixed.paths.map(({ playerId }) => playerId)).toEqual([lineman]);
  });

  it("puts no route on a man who does not run one", () => {
    const lineman = linemanIds(withMike)[0]!;
    for (const man of [lineman, "mike"]) {
      expect(
        applyPlayerRoutePresetCommand(withMike, man, "slant", () => "new"),
      ).toBeUndefined();
    }
    // Nor does a call off the tree reshape a block or a drop into a route.
    const blocked = run(
      withMike,
      applyLinePresetCommand(withMike, [lineman], "drive", makeId),
    );
    const block = blocked.paths.find(({ playerId }) => playerId === lineman)!;
    expect(applyRoutePresetCommand(blocked, block.id, "go")).toBeUndefined();
  });
});
