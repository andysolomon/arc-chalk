import {
  applyPlayCommand,
  assignmentForPath,
  assignRoles,
  playDocumentSchema,
  routePresetPoints,
  stockConcepts,
  stockFormations,
  highSchoolFieldProfile,
  type ConceptDefinition,
  type PlayDocument,
} from "@chalk/domain";
import {
  applyConceptCommand,
  applyLinePresetCommand,
  applyPlayerRoutePresetCommand,
  applyRoutePresetCommand,
  baseRouteOf,
  conceptTargets,
  linemenOf,
  linePresetIsOn,
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
});

describe("putting a call off the tree on a line", () => {
  const withStem: PlayDocument = {
    ...trips,
    paths: [
      {
        id: "stem",
        kind: "route",
        playerId: idOfRole(trips, "X"),
        points: [
          trips.players.find(({ id }) => id === idOfRole(trips, "X"))!.position,
          { lateralYards: -20, depthYards: 6 },
        ],
        branches: [],
        style: { line: "solid", ending: "arrow", color: "ink" },
      },
    ],
  };

  it("keeps a fork on a break the new shape still has", () => {
    const forked: PlayDocument = {
      ...withStem,
      paths: [
        {
          ...withStem.paths[0]!,
          points: [
            ...withStem.paths[0]!.points,
            { lateralYards: -20, depthYards: 12 },
            { lateralYards: -20, depthYards: 18 },
          ],
          branches: [
            {
              fromIndex: 3,
              points: [{ lateralYards: -14, depthYards: 22 }],
              style: { line: "dashed", ending: "arrow", color: "ink" },
            },
          ],
        },
      ],
    };
    // Go has two points where the line had four, so the fork moves back to
    // the last break there is rather than hanging off one that has gone.
    const play = run(forked, applyRoutePresetCommand(forked, "stem", "go"));
    expect(play.paths[0]!.points).toHaveLength(2);
    expect(play.paths[0]!.branches[0]!.fromIndex).toBe(1);
    expect(() => playDocumentSchema.parse(play)).not.toThrow();
  });
});

describe("putting a call off the tree on the man himself", () => {
  const bare = trips;
  const x = idOfRole(bare, "X");

  it("lands on his base stem and leaves his alternates alone", () => {
    const one = run(
      bare,
      applyPlayerRoutePresetCommand(bare, x, "corner", () => "base"),
    );
    // A second line off the same man, drawn after the first, is an alternate:
    // another call he could be asked to run rather than the one he is running.
    const two: PlayDocument = {
      ...one,
      paths: [
        ...one.paths,
        { ...one.paths[0]!, id: "alternate", preset: "flat" },
      ],
    };
    expect(baseRouteOf(two, x)!.id).toBe("base");
    const play = run(
      two,
      applyPlayerRoutePresetCommand(two, x, "dig", () => "third"),
    );
    expect(play.paths.map(({ id }) => id)).toEqual(["base", "alternate"]);
    expect(play.paths[0]!.preset).toBe("dig");
    expect(play.paths[1]!.preset).toBe("flat");
  });

  it("reads past a block to the route underneath, since a block is not a stem", () => {
    const blocking = run(
      bare,
      applyLinePresetCommand(bare, [x], "drive", makeId),
    );
    expect(baseRouteOf(blocking, x)).toBeUndefined();
    const play = run(
      blocking,
      applyPlayerRoutePresetCommand(blocking, x, "flat", () => "route"),
    );
    // The block stays: it sits alongside his route rather than under it.
    expect(play.paths.map(({ kind }) => kind)).toEqual(["block", "route"]);
    expect(baseRouteOf(play, x)!.preset).toBe("flat");
  });
});

describe("drawing a concept", () => {
  it("keeps an extra man on the line out of it, though a sixth lineman reads as a slot", () => {
    const unbalanced: PlayDocument = {
      ...trips,
      players: [
        ...trips.players,
        // Two more unlettered men beside the tackles. Only five can be the
        // line by name, so these read as slots — but they are standing on
        // the ball, and a man on the ball is blocking.
        ...[-6, 6].map((lateralYards, index) => ({
          id: `extra_${index}`,
          unit: "offense" as const,
          position: { lateralYards, depthYards: -1.5 },
          symbol: "circle" as const,
          label: "",
          sublabel: "",
          fill: "none" as const,
          color: "ink" as const,
        })),
      ],
    };
    const roles = assignRoles(unbalanced.players);
    expect(roles.filter((role) => role === "H")).toHaveLength(3);
    const targets = conceptTargets(unbalanced, conceptNamed("mesh"));
    expect(targets.map(({ player }) => player.id)).not.toContain("extra_0");
    expect(targets.map(({ player }) => player.id)).not.toContain("extra_1");
    expect(targets).toHaveLength(5);
  });

  it("draws each man his job, in the words the original prints on the card", () => {
    const mesh = conceptNamed("mesh");
    const { command, count } = applyConceptCommand(trips, mesh, makeId);
    expect(count).toBe(5);
    const play = run(trips, command);
    expect(() => playDocumentSchema.parse(play)).not.toThrow();
    expect(play.paths).toHaveLength(5);

    const wording = play.paths.map(
      (path) => assignmentForPath(play, path.id)?.text,
    );
    expect(wording.filter(Boolean).sort()).toEqual([
      "CORNER",
      "DIG",
      "FLAT",
      "SHALLOW",
      "SHALLOW",
    ]);
    for (const path of play.paths) expect(path.concept).toBe("mesh");
  });

  it("replaces what the men were running rather than drawing over it", () => {
    const first = run(
      trips,
      applyConceptCommand(trips, conceptNamed("mesh"), makeId).command,
    );
    const second = run(
      first,
      applyConceptCommand(first, conceptNamed("smash"), makeId).command,
    );
    expect(second.paths).toHaveLength(5);
    for (const path of second.paths) expect(path.concept).toBe("smash");
    // The wording went with the lines it was about, rather than piling up.
    expect(second.assignments).toHaveLength(5);
  });

  it("leaves a man's block alone, since a concept is a distribution and not a Play", () => {
    const withBlock: PlayDocument = {
      ...trips,
      paths: [
        {
          id: "the_block",
          kind: "block",
          playerId: idOfRole(trips, "RB"),
          points: [
            trips.players.find(({ id }) => id === idOfRole(trips, "RB"))!
              .position,
            { lateralYards: 2, depthYards: -4 },
          ],
          branches: [],
          style: { line: "solid", ending: "bar", color: "ink" },
        },
      ],
    };
    const play = run(
      withBlock,
      applyConceptCommand(withBlock, conceptNamed("mesh"), makeId).command,
    );
    expect(play.paths.some(({ id }) => id === "the_block")).toBe(true);
    expect(play.paths.filter(({ kind }) => kind === "route")).toHaveLength(5);
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

  it("draws each man his own shape, so one call keeps every one of them his alignment", () => {
    const play = run(
      trips,
      applyLinePresetCommand(trips, linemanIds(trips), "reach", makeId),
    );
    expect(play.paths).toHaveLength(5);
    for (const path of play.paths) {
      expect(path.kind).toBe("block");
      expect(path.preset).toBe("reach");
      expect(path.style.ending).toBe("bar");
      // Every line starts on the man running it, exactly.
      expect(path.points[0]).toEqual(
        play.players.find(({ id }) => id === path.playerId)!.position,
      );
      // Reach goes to a man's own side, so it mirrors about the ball.
      const outward = path.points[0]!.lateralYards < 0 ? -1 : 1;
      expect(
        (path.points.at(-1)!.lateralYards - path.points[0]!.lateralYards) *
          outward,
      ).toBeGreaterThan(0);
    }
  });

  it("takes a call that carries a real direction the way it is written", () => {
    const play = run(
      trips,
      applyLinePresetCommand(trips, linemanIds(trips), "setleft", makeId),
    );
    // Left is left: every man steps the same way, whichever side of the
    // centre he lines up on.
    for (const path of play.paths) {
      expect(path.points.at(-1)!.lateralYards).toBeLessThan(
        path.points[0]!.lateralYards,
      );
    }
  });

  it("puts the call on the rest when only some of the line is running it", () => {
    const ids = linemenOf(trips).map(({ id }) => id);
    const one = run(
      trips,
      applyLinePresetCommand(trips, [ids[0]!], "passset", makeId),
    );
    expect(one.paths).toHaveLength(1);
    // Four of the five have not got it, so this is asking for it rather than
    // asking for it to come off.
    const all = run(one, applyLinePresetCommand(one, ids, "passset", makeId));
    expect(all.paths).toHaveLength(5);
    expect(linePresetIsOn(all, ids, "passset")).toBe(true);
  });

  it("gives a drop the ground it owns and a rush none, the way the call says", () => {
    const defender = "mike";
    const drop = run(
      withMike,
      applyLinePresetCommand(withMike, [defender], "deep3", makeId),
    );
    expect(drop.paths[0]!.kind).toBe("zone");
    expect(drop.paths[0]!.coverageArea?.type).toBe("deep");
    // The two radii are written in the frame of the axis each belongs to.
    expect(drop.paths[0]!.coverageArea!.radiusLateralYards).toBeCloseTo(
      104 / (976 / (160 / 3)),
      9,
    );
    expect(drop.paths[0]!.coverageArea!.radiusDepthYards).toBeCloseTo(
      44 / 12,
      9,
    );

    const rush = run(
      withMike,
      applyLinePresetCommand(withMike, [defender], "blitz", makeId),
    );
    expect(rush.paths[0]!.kind).toBe("blitz");
    expect(rush.paths[0]!.coverageArea).toBeUndefined();
    expect(rush.paths[0]!.style.color).toBe("red");
    // A rush goes at the ball, which is toward the line rather than away.
    expect(rush.paths[0]!.points.at(-1)!.depthYards).toBeLessThan(
      rush.paths[0]!.points[0]!.depthYards,
    );
  });

  it("replaces every kind of defensive line, since they are all the same call", () => {
    const defender = "mike";
    const zoned = run(
      withMike,
      applyLinePresetCommand(withMike, [defender], "hook", makeId),
    );
    const rushing = run(
      zoned,
      applyLinePresetCommand(zoned, [defender], "blitz", makeId),
    );
    expect(rushing.paths).toHaveLength(1);
    expect(rushing.paths[0]!.kind).toBe("blitz");
  });
});
