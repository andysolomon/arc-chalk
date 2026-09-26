import {
  starterExamplePlays,
  stickThunderPlay,
  stockDefensiveCalls,
  stockFormations,
} from "@chalk/domain";
import {
  applyDefensiveCallCommand,
  applyFormationCommand,
} from "@chalk/editor";
import { describe, expect, it } from "vitest";

import { assignmentSummary, rosterFor } from "./assignments-roster";

describe("assignments roster (ADR 0058)", () => {
  it("groups the offense skill, backs and line, left to right, and counts the men with something to do", () => {
    const roster = rosterFor(stickThunderPlay);
    expect(roster.groups.map(({ id }) => id)).toEqual([
      "skill",
      "backs",
      "line",
    ]);
    const letters = Object.fromEntries(
      roster.groups.map((group) => [
        group.id,
        group.rows.map(({ letter }) => letter),
      ]),
    );
    expect(letters.skill).toEqual(["X", "H", "Y", "Z"]);
    expect(letters.backs).toEqual(["Q", "F"]);
    expect(letters.line).toHaveLength(5);
    expect(roster.total).toBe(11);
    expect(roster.assigned).toBe(
      roster.rows.filter(({ summary }) => summary !== undefined).length,
    );
    expect(roster.assigned).toBeGreaterThan(0);
    expect(roster.assigned).toBeLessThan(11);
    // Every man plays something, said the way a coach says it.
    for (const row of roster.rows) expect(row.role).not.toBe("");
    expect(roster.rows.find(({ letter }) => letter === "Y")?.role).toBe(
      "Tight end",
    );
    expect(roster.rows.find(({ letter }) => letter === "Q")?.role).toBe(
      "Quarterback",
    );
  });

  it("says the Coach's words first, then the call, then his tag, then the kind", () => {
    const y = stickThunderPlay.players.find(({ label }) => label === "Y")!;
    const yLine = stickThunderPlay.paths.find(
      ({ playerId }) => playerId === y.id,
    )!;
    const assignment = stickThunderPlay.assignments.find(
      ({ playerId }) => playerId === y.id,
    );
    // The seeded Y carries an assignment; it leads.
    expect(assignmentSummary(stickThunderPlay, y)).toBe(
      assignment?.text.trim() ||
        yLine.preset ||
        y.sublabel.trim().charAt(0) + y.sublabel.trim().slice(1).toLowerCase(),
    );

    const bare = {
      ...stickThunderPlay,
      assignments: [],
      paths: stickThunderPlay.paths.map((path) =>
        path.playerId === y.id ? { ...path, preset: "slant" } : path,
      ),
    };
    expect(assignmentSummary(bare, y)).toBe("Slant");
    const kindOnly = {
      ...bare,
      paths: bare.paths.map((path) => {
        if (path.playerId !== y.id) return path;
        const rest: typeof path = { ...path };
        delete rest.preset;
        return rest;
      }),
    };
    // No words and no call: the tag under him, said as a word, not shouted.
    expect(y.sublabel.trim()).not.toBe("");
    expect(assignmentSummary(kindOnly, y)).toBe(
      y.sublabel.trim().charAt(0) + y.sublabel.trim().slice(1).toLowerCase(),
    );
    // No tag either: what kind of line it is.
    const untagged = {
      ...kindOnly,
      players: kindOnly.players.map((man) =>
        man.id === y.id ? { ...man, sublabel: "" } : man,
      ),
    };
    expect(assignmentSummary(untagged, { ...y, sublabel: "" })).toBe("Route");
    const nothing = { ...bare, paths: [] };
    expect(assignmentSummary(nothing, y)).toBeUndefined();
  });

  it("lists only the play's own unit, never the shadow", () => {
    const call = stockDefensiveCalls.find(
      ({ formation }) => formation.name === "4-3 Cover 3",
    )!;
    const withShadow = applyDefensiveCallCommand(
      stickThunderPlay,
      call,
      (() => {
        let next = 0;
        return (prefix: string) => `${prefix}_${(next += 1)}`;
      })(),
    ).result.play;
    expect(
      withShadow.players.filter(({ unit }) => unit === "defense").length,
    ).toBe(11);
    const roster = rosterFor(withShadow);
    expect(roster.total).toBe(11);
    expect(roster.rows.every(({ player }) => player.unit === "offense")).toBe(
      true,
    );
  });

  it("groups a defense by level and names its men by their letters", () => {
    const coverThree = starterExamplePlays().find(
      ({ name }) => name === "Cover 3 — Fire Zone",
    )!;
    const roster = rosterFor(coverThree);
    expect(roster.groups.map(({ id }) => id)).toEqual([
      "front",
      "linebackers",
      "secondary",
    ]);
    expect(roster.rows.every(({ player }) => player.unit === "defense")).toBe(
      true,
    );
    const mike = roster.rows.find(({ letter }) => letter === "M");
    expect(mike?.role).toBe("Mike");
    expect(mike?.group).toBe("linebackers");
    const corner = roster.rows.find(({ letter }) => letter === "C");
    expect(corner?.group).toBe("secondary");
    expect(roster.rows.find(({ letter }) => letter === "E")?.group).toBe(
      "front",
    );
  });

  it("reads an unlettered set off where the men stand", () => {
    const doubles = stockFormations.find(
      ({ name }) => name === "Gun Doubles Right",
    )!;
    const formed = applyFormationCommand(
      { ...stickThunderPlay, players: [], paths: [], assignments: [] },
      doubles,
      (prefix) => `${prefix}_formed`,
    ).result.play;
    const roster = rosterFor(formed);
    expect(roster.total).toBe(11);
    expect(roster.assigned).toBe(0);
    expect(roster.groups.find(({ id }) => id === "line")?.rows).toHaveLength(5);
    expect(roster.rows.every(({ summary }) => summary === undefined)).toBe(
      true,
    );
    expect(roster.rows[0]?.nothingYet).toMatch(/^No /);
    // Nobody's symbol is blank: an unlettered man shows the spot he plays.
    expect(roster.rows.every(({ mark }) => mark !== "" && mark !== "·")).toBe(
      true,
    );
    expect(
      roster.groups
        .find(({ id }) => id === "line")
        ?.rows.map(({ mark }) => mark),
    ).toEqual(expect.arrayContaining(["C"]));
  });
});
