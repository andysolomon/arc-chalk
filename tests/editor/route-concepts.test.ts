import {
  applyPlayCommand,
  assignmentForPath,
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
  applyConceptCommand,
  applyRoutePresetCommand,
  conceptIsOn,
  conceptTargets,
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

  it("redraws the line from the man's stance and remembers which call it is", () => {
    const play = run(
      withStem,
      applyRoutePresetCommand(withStem, "stem", "corner"),
    );
    const path = play.paths[0]!;
    expect(path.preset).toBe("corner");
    expect(path.points[0]).toEqual(
      play.players.find(({ id }) => id === path.playerId)!.position,
    );
    // A corner from the left breaks toward the left sideline.
    expect(path.points.at(-1)!.lateralYards).toBeLessThan(
      path.points[0]!.lateralYards,
    );
  });

  it("runs a call on from the end of what he has, and stops naming it as one call", () => {
    const cornered = run(
      withStem,
      applyRoutePresetCommand(withStem, "stem", "corner"),
    );
    const before = cornered.paths[0]!.points;
    const play = run(
      cornered,
      applyRoutePresetCommand(cornered, "stem", "out", "continue"),
    );
    const path = play.paths[0]!;
    expect("preset" in path).toBe(false);
    // What he had is still the front of it, untouched — and the break it
    // continues from is one break, not the same point written twice.
    expect(path.points.slice(0, before.length)).toEqual(before);
    expect(path.points).toHaveLength(
      before.length + routePresetPoints("out", before.at(-1)!)!.length - 1,
    );
    expect(path.points[before.length]).not.toEqual(before.at(-1));
  });

  it("turns a call on by the side the man plays, not by where his line has got to", () => {
    // A shallow crosser from the left ends on the right of the ball. Running
    // an out on from there must still break to his own sideline, the left.
    const crossed: PlayDocument = {
      ...withStem,
      paths: [
        {
          ...withStem.paths[0]!,
          points: [
            withStem.paths[0]!.points[0]!,
            { lateralYards: 14, depthYards: 5 },
          ],
        },
      ],
    };
    const play = run(
      crossed,
      applyRoutePresetCommand(crossed, "stem", "out", "continue"),
    );
    const points = play.paths[0]!.points;
    expect(points.at(-1)!.lateralYards).toBeLessThan(points[1]!.lateralYards);
  });

  it("redraws from the stance when there is no break to continue from", () => {
    const bare: PlayDocument = {
      ...withStem,
      paths: [
        { ...withStem.paths[0]!, points: [withStem.paths[0]!.points[0]!] },
      ],
    };
    const play = run(
      bare,
      applyRoutePresetCommand(bare, "stem", "corner", "continue"),
    );
    // Nothing to run on from, so it is the call itself — named as one, and
    // drawn from the stance rather than run on from it.
    expect(play.paths[0]!.preset).toBe("corner");
    const expected = routePresetPoints("corner", bare.paths[0]!.points[0]!)!;
    expect(play.paths[0]!.points).toHaveLength(expected.length);
    for (const [index, point] of expected.entries()) {
      expect(play.paths[0]!.points[index]!.lateralYards).toBeCloseTo(
        point.lateralYards,
        6,
      );
      expect(play.paths[0]!.points[index]!.depthYards).toBeCloseTo(
        point.depthYards,
        6,
      );
    }
  });

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

  it("is no command at all when the line is already that call", () => {
    const cornered = run(
      withStem,
      applyRoutePresetCommand(withStem, "stem", "corner"),
    );
    expect(applyRoutePresetCommand(cornered, "stem", "corner")).toBeUndefined();
  });

  it("has nothing to say about a line or a call that is not there", () => {
    expect(applyRoutePresetCommand(withStem, "nope", "corner")).toBeUndefined();
    expect(applyRoutePresetCommand(withStem, "stem", "banana")).toBeUndefined();
  });
});

describe("drawing a concept", () => {
  it("gives a job to every man who plays a position in it, and to nobody else", () => {
    const mesh = conceptNamed("mesh");
    const targets = conceptTargets(trips, mesh);
    expect(targets.map(({ role }) => role).sort()).toEqual([
      "H",
      "RB",
      "TE",
      "X",
      "Z",
    ]);
    // The line blocks and the quarterback throws; neither is in a
    // distribution, and neither is a man playing a position the concept
    // says nothing about.
    expect(targets.map(({ role }) => role)).not.toContain("QB");
    expect(targets.map(({ role }) => role)).not.toContain("C");
  });

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

  it("names the shape off the tree where the job is one, and not where it is drawn out", () => {
    const play = run(
      trips,
      applyConceptCommand(trips, conceptNamed("mesh"), makeId).command,
    );
    const byWording = (text: string) =>
      play.paths.find(
        (path) => assignmentForPath(play, path.id)?.text === text,
      )!;
    expect(byWording("DIG").preset).toBe("dig");
    // The mesh crossers are the concept's own shape, not a call off the tree.
    expect("preset" in byWording("SHALLOW")).toBe(false);
  });

  it("ends a job the way the job ends, not the way a route usually does", () => {
    const play = run(
      trips,
      applyConceptCommand(trips, conceptNamed("stick"), makeId).command,
    );
    const byWording = (text: string) =>
      play.paths.find(
        (path) => assignmentForPath(play, path.id)?.text === text,
      )!;
    // A stick sits down and looks back, so it is drawn with the hook the
    // original draws it with rather than an arrow.
    expect(byWording("STICK").style.ending).toBe("hook");
    expect(byWording("FADE").style.ending).toBe("arrow");
  });

  it("mirrors each job to the side the man lines up on", () => {
    const play = run(
      trips,
      applyConceptCommand(trips, conceptNamed("verts"), makeId).command,
    );
    // Four straight up: every one of them ends downfield of where he started
    // and no further across than a step.
    for (const path of play.paths) {
      if (assignmentForPath(play, path.id)?.text === "CHECK") continue;
      expect(path.points.at(-1)!.depthYards).toBeGreaterThan(
        path.points[0]!.depthYards + 10,
      );
      expect(
        Math.abs(
          path.points.at(-1)!.lateralYards - path.points[0]!.lateralYards,
        ),
      ).toBeLessThan(1);
    }
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

  it("takes the concept off again when the Coach asks for the one already on", () => {
    const mesh = conceptNamed("mesh");
    const on = run(trips, applyConceptCommand(trips, mesh, makeId).command);
    expect(conceptIsOn(on, mesh)).toBe(true);

    const result = applyConceptCommand(on, mesh, makeId);
    expect(result.cleared).toBe(true);
    const off = run(on, result.command);
    expect(off.paths).toHaveLength(0);
    expect(off.assignments).toHaveLength(0);
    expect(conceptIsOn(off, mesh)).toBe(false);
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

  it("has nothing to draw on a field with nobody to draw it on", () => {
    const empty: PlayDocument = { ...trips, players: [], paths: [] };
    const result = applyConceptCommand(empty, conceptNamed("mesh"), makeId);
    expect(result.count).toBe(0);
    expect(result.command).toBeUndefined();
    expect(conceptIsOn(empty, conceptNamed("mesh"))).toBe(false);
  });
});
