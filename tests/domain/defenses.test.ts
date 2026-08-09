import {
  applyDefensiveCall,
  countAssignments,
  currentDefensiveCall,
  defensiveFronts,
  formationSchema,
  highSchoolFieldProfile,
  playDocumentSchema,
  stockDefensiveCalls,
  type DefensiveCall,
  type PlayDocument,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

const callNamed = (name: string): DefensiveCall => {
  const call = stockDefensiveCalls.find(
    (value) => value.formation.name === name,
  );
  if (!call) throw new Error(`No such call: ${name}`);
  return call;
};

let nextId = 0;
const makeId = (prefix: string) => `${prefix}_${(nextId += 1)}`;

/** An offense with a route and a note, and nothing defensive on the field. */
const offenseOnly: PlayDocument = playDocumentSchema.parse({
  schemaVersion: 3,
  id: "play_defense_under_test",
  playbookId: "playbook_defenses",
  name: "Under test",
  unit: "offense",
  tags: [],
  notes: "",
  fieldProfile: highSchoolFieldProfile,
  players: [
    {
      id: "receiver",
      unit: "offense",
      position: { lateralYards: -12, depthYards: 0 },
      symbol: "circle",
      label: "X",
      sublabel: "",
      fill: "none",
      color: "ink",
    },
  ],
  assignments: [],
  paths: [
    {
      id: "route_x",
      kind: "route",
      playerId: "receiver",
      points: [
        { lateralYards: -12, depthYards: 0 },
        { lateralYards: -12, depthYards: 14 },
      ],
      branches: [],
      style: { line: "solid", ending: "arrow", color: "ink" },
    },
  ],
  labels: [
    {
      id: "offensive_note",
      position: { lateralYards: 6, depthYards: 6 },
      text: "Hot off the nickel",
      color: "ink",
      size: 11,
      box: "none",
      boxColor: "yellow",
      unit: "offense",
    },
    {
      id: "the_call",
      position: { lateralYards: 0, depthYards: 20 },
      text: "COVER 3",
      color: "blue",
      size: 12,
      box: "none",
      boxColor: "yellow",
      unit: "defense",
    },
  ],
});

describe("the calls the original ships with", () => {
  it("carries every one of them, each a Formation the schema accepts", () => {
    expect(stockDefensiveCalls).toHaveLength(11);
    for (const call of stockDefensiveCalls) {
      expect(() => formationSchema.parse(call.formation)).not.toThrow();
      expect(call.formation.unit).toBe("defense");
      expect(defensiveFronts).toContain(call.front);
    }
  });

  it("draws a defender as his letter and nothing else, which is how a Coach reads a side", () => {
    for (const slot of callNamed("4-3 Cover 3").formation.slots) {
      expect(slot.symbol).toBe("none");
      expect(slot.label).not.toBe("");
    }
  });

  it("tells the two corners apart by the side each plays, not by the letter they share", () => {
    const corners = callNamed("4-3 Cover 3").formation.slots.filter(
      ({ label }) => label === "C",
    );
    expect(corners).toHaveLength(2);
    expect(new Set(corners.map(({ role }) => role)).size).toBe(2);
  });

  it("is a front and a coverage, and every line in it belongs to one of its men", () => {
    for (const call of stockDefensiveCalls) {
      const slotIds = new Set(call.formation.slots.map(({ id }) => id));
      for (const assignment of call.assignments) {
        expect(slotIds.has(assignment.slotId)).toBe(true);
        expect(assignment.points.length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(countAssignments(callNamed("Fire Zone Blitz"))).toEqual({
      drop: 4,
      man: 0,
      blitz: 2,
    });
    expect(countAssignments(callNamed("Nickel Cover 1"))).toEqual({
      drop: 1,
      man: 6,
      blitz: 0,
    });
  });
});

describe("putting a call on the field", () => {
  it("brings the men on and draws what each of them has to do", () => {
    const { play, addedPlayerIds, addedPathCount } = applyDefensiveCall(
      offenseOnly,
      callNamed("4-3 Cover 3"),
      makeId,
    );
    expect(() => playDocumentSchema.parse(play)).not.toThrow();
    expect(addedPlayerIds).toHaveLength(11);
    expect(addedPathCount).toBe(7);
    expect(play.players.filter(({ unit }) => unit === "defense")).toHaveLength(
      11,
    );
  });

  it("leaves the lines off when the Coach wants the alignment to draw his own on", () => {
    const { play, addedPathCount } = applyDefensiveCall(
      offenseOnly,
      callNamed("4-3 Cover 3"),
      makeId,
      { withAssignments: false },
    );
    expect(addedPathCount).toBe(0);
    expect(play.paths).toHaveLength(offenseOnly.paths.length);
    expect(play.players).toHaveLength(12);
  });

  it("gives a drop the ground it owns, wider the deeper it goes, and reads back what it is", () => {
    const { play } = applyDefensiveCall(
      offenseOnly,
      callNamed("4-3 Cover 3"),
      makeId,
    );
    const areas = play.paths.flatMap((path) =>
      path.coverageArea ? [path.coverageArea] : [],
    );
    expect(areas).toHaveLength(7);
    const deep = areas.filter(({ type }) => type === "deep");
    const curl = areas.filter(({ type }) => type === "curl");
    expect(deep.length).toBeGreaterThan(0);
    expect(curl.length).toBeGreaterThan(0);
    expect(deep[0]!.radiusLateralYards).toBeGreaterThan(
      curl[0]!.radiusLateralYards,
    );
    // A drop's area is measured on both axes, and the original wrote each
    // radius in the frame of the axis it belongs to: the deepest is 104 px
    // across at 18.3 px to the yard, and 44 px deep at 12.
    expect(deep[0]!.radiusLateralYards).toBeCloseTo(104 / (976 / (160 / 3)), 9);
    expect(deep[0]!.radiusDepthYards).toBeCloseTo(44 / 12, 9);
  });

  it("draws a man assignment as a line that owns no ground", () => {
    const { play } = applyDefensiveCall(
      offenseOnly,
      callNamed("Nickel Cover 1"),
      makeId,
    );
    const zones = play.paths.filter(({ kind }) => kind === "zone");
    const followed = zones.filter(({ coverageArea }) => !coverageArea);
    expect(followed).toHaveLength(6);
    for (const path of followed) {
      expect(path.style.line).toBe("dotted");
      expect(path.style.ending).toBe("arrow");
    }
  });

  it("draws a blitz in red, the way the domain already says a blitz is drawn", () => {
    const { play } = applyDefensiveCall(
      offenseOnly,
      callNamed("Fire Zone Blitz"),
      makeId,
    );
    const blitzes = play.paths.filter(({ kind }) => kind === "blitz");
    expect(blitzes).toHaveLength(2);
    for (const path of blitzes) expect(path.style.color).toBe("red");
  });

  it("starts every line on the man running it", () => {
    const { play } = applyDefensiveCall(
      offenseOnly,
      callNamed("Bear Front Cover 0"),
      makeId,
    );
    const at = (id: string) =>
      play.players.find((player) => player.id === id)!.position;
    for (const path of play.paths) {
      if (path.kind === "route") continue;
      expect(path.points[0]).toEqual(at(path.playerId));
    }
  });

  it("takes the whole call it replaces — the men, their lines, and the call text", () => {
    const applied = applyDefensiveCall(
      offenseOnly,
      callNamed("4-3 Cover 3"),
      makeId,
    ).play;
    // A defender can run a line that is not the call's own — a return after a
    // pick — and it belongs to him, so it goes when he does.
    const first: PlayDocument = {
      ...applied,
      paths: [
        ...applied.paths,
        {
          id: "the_return",
          kind: "route",
          playerId: applied.players.at(-1)!.id,
          points: [
            applied.players.at(-1)!.position,
            { lateralYards: 0, depthYards: 30 },
          ],
          branches: [],
          style: { line: "solid", ending: "arrow", color: "ink" },
        },
      ],
    };
    const { play, replacedPlayerCount } = applyDefensiveCall(
      first,
      callNamed("Bear Front Cover 0"),
      makeId,
    );
    expect(replacedPlayerCount).toBe(11);
    expect(play.players.filter(({ unit }) => unit === "defense")).toHaveLength(
      11,
    );
    expect(currentDefensiveCall(play, stockDefensiveCalls)?.front).toBe("Bear");
    expect(play.paths.some(({ id }) => id === "the_return")).toBe(false);
    // The offense is untouched by any of it.
    expect(play.players.filter(({ unit }) => unit !== "defense")).toHaveLength(
      1,
    );
    expect(play.paths.filter(({ kind }) => kind === "route")).toHaveLength(1);
    // The call text went with the call it named; the Coach's own note stayed.
    expect(play.labels.map(({ id }) => id)).toEqual(["offensive_note"]);
  });

  it("takes a defensive line with the call whoever was running it", () => {
    const withOffensiveStunt: PlayDocument = {
      ...offenseOnly,
      paths: [
        ...offenseOnly.paths,
        {
          id: "stray_stunt",
          kind: "stunt",
          playerId: "receiver",
          points: [
            { lateralYards: -12, depthYards: 0 },
            { lateralYards: -8, depthYards: 4 },
          ],
          branches: [],
          style: { line: "solid", ending: "chevron", color: "orange" },
        },
      ],
    };
    const { play } = applyDefensiveCall(
      withOffensiveStunt,
      callNamed("4-3 Cover 3"),
      makeId,
    );
    expect(play.paths.some(({ id }) => id === "stray_stunt")).toBe(false);
    expect(play.paths.some(({ id }) => id === "route_x")).toBe(true);
  });

  it("takes a note pinned to a line the call removed, so nothing is left pointing at nothing", () => {
    const first = applyDefensiveCall(
      offenseOnly,
      callNamed("4-3 Cover 3"),
      makeId,
    ).play;
    const drop = first.paths.find(({ coverageArea }) => coverageArea)!;
    const annotated: PlayDocument = {
      ...first,
      labels: [
        ...first.labels,
        {
          id: "on_the_drop",
          position: { lateralYards: 0, depthYards: 12 },
          text: "carry the seam",
          color: "ink",
          size: 11,
          box: "none",
          boxColor: "yellow",
          unit: "offense",
          binding: {
            pathId: drop.id,
            segmentIndex: 0,
            progress: 0.5,
            offset: { lateralYards: 1, depthYards: 0 },
          },
        },
      ],
    };
    const { play } = applyDefensiveCall(
      annotated,
      callNamed("Dime Cover 3"),
      makeId,
    );
    expect(() => playDocumentSchema.parse(play)).not.toThrow();
    expect(play.labels.some(({ id }) => id === "on_the_drop")).toBe(false);
  });
});

describe("reading which call is on the field", () => {
  it("names nothing when there is no defense on it", () => {
    expect(
      currentDefensiveCall(offenseOnly, stockDefensiveCalls),
    ).toBeUndefined();
  });

  it("names the call the men are standing in", () => {
    const { play } = applyDefensiveCall(
      offenseOnly,
      callNamed("Nickel Cover 2"),
      makeId,
    );
    expect(
      currentDefensiveCall(play, stockDefensiveCalls)?.formation.name,
    ).toBe("Nickel Cover 2");
  });

  it("loses the name for a step in any direction, a changed letter, or an extra man", () => {
    const { play } = applyDefensiveCall(
      offenseOnly,
      callNamed("Nickel Cover 2"),
      makeId,
    );
    const named = () => currentDefensiveCall(play, stockDefensiveCalls);
    expect(named()?.formation.name).toBe("Nickel Cover 2");

    const changing = (
      change: (player: PlayDocument["players"][number]) => typeof player,
    ): PlayDocument => ({
      ...play,
      players: play.players.map((player) =>
        player.label === "N" ? change(player) : player,
      ),
    });
    const nobody = (moved: PlayDocument) =>
      expect(currentDefensiveCall(moved, stockDefensiveCalls)).toBeUndefined();

    nobody(
      changing((player) => ({
        ...player,
        position: { ...player.position, lateralYards: 0 },
      })),
    );
    // Depth on its own, since a defender walked up is a different call from
    // the same defender dropped off.
    nobody(
      changing((player) => ({
        ...player,
        position: {
          ...player.position,
          depthYards: player.position.depthYards + 3,
        },
      })),
    );
    // The letter is who a defender is, so a nickel relettered is not a nickel.
    nobody(changing((player) => ({ ...player, label: "W" })));
    // And a man standing where nobody was asked to is a twelfth defender.
    nobody({
      ...play,
      players: [
        ...play.players,
        { ...play.players.at(-1)!, id: "one_too_many" },
      ],
    });
  });

  it("tells apart two calls that stand the same men in almost the same places", () => {
    // Cover 2 and Tampa 2 align identically and differ only in what the Mike
    // does, so the reading has to be of the men rather than of the lines.
    const cover2 = callNamed("4-3 Cover 2");
    const tampa2 = callNamed("4-3 Tampa 2");
    expect(cover2.formation.slots.map(({ position }) => position)).toEqual(
      tampa2.formation.slots.map(({ position }) => position),
    );
    const { play } = applyDefensiveCall(offenseOnly, tampa2, makeId);
    // Standing in both, the catalogue's own order settles it — and the Coach
    // is told which by the lines on the field, not by the alignment.
    expect(currentDefensiveCall(play, stockDefensiveCalls)?.coverage).toBe(
      "Cover 2",
    );
  });
});
