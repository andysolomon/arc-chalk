import {
  applyPlayCommand,
  applyPlayCommandWithInverse,
  canonicalStringify,
  describePlayCommand,
  highSchoolFieldProfile,
  playDocumentSchema,
  playErasureCommand,
  type PlayDocument,
  type PlayErasure,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * A Play with both sides of the ball on the field, a special-teams man who
 * draws one line of each, and labels sided every way the schema allows —
 * everything the Clear menu has to tell apart.
 */
const mixedPlay: PlayDocument = playDocumentSchema.parse({
  schemaVersion: 3,
  id: "play_mixed_sides",
  playbookId: "playbook_erasures",
  name: "Both sides on the field",
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
    {
      id: "back",
      unit: "offense",
      position: { lateralYards: 0, depthYards: -5 },
      symbol: "circle",
      label: "F",
      sublabel: "",
      fill: "none",
      color: "ink",
    },
    {
      id: "corner",
      unit: "defense",
      position: { lateralYards: -12, depthYards: 7 },
      symbol: "none",
      label: "C",
      sublabel: "",
      fill: "none",
      color: "gray",
    },
    {
      id: "gunner",
      unit: "special-teams",
      position: { lateralYards: 20, depthYards: 0 },
      symbol: "triangle",
      label: "G",
      sublabel: "",
      fill: "none",
      color: "ink",
    },
  ],
  paths: [
    {
      id: "route_x_slant",
      kind: "route",
      playerId: "receiver",
      points: [
        { lateralYards: -12, depthYards: 0 },
        { lateralYards: -6, depthYards: 6 },
      ],
      branches: [],
      style: { line: "solid", ending: "arrow", color: "ink" },
    },
    {
      id: "drop_corner_third",
      kind: "zone",
      playerId: "corner",
      points: [
        { lateralYards: -12, depthYards: 7 },
        { lateralYards: -14, depthYards: 18 },
      ],
      branches: [],
      style: { line: "dashed", ending: "bubble", color: "blue" },
    },
    {
      // A defender may still be sent, and it is still the call.
      id: "blitz_corner_edge",
      kind: "blitz",
      playerId: "corner",
      points: [
        { lateralYards: -12, depthYards: 7 },
        { lateralYards: -9, depthYards: -2 },
      ],
      branches: [],
      style: { line: "solid", ending: "arrow", color: "red" },
    },
    {
      // A ball flight belongs to neither side by its kind, so only the man
      // drawing it says which this is: the corner's pick, taken back.
      id: "return_corner_pick",
      kind: "ball",
      playerId: "corner",
      points: [
        { lateralYards: -14, depthYards: 18 },
        { lateralYards: -24, depthYards: -6 },
      ],
      branches: [],
      style: { line: "dotted", ending: "arrow", color: "gray" },
    },
    {
      // The gunner's release is the concept; his zone turn is the call.
      id: "release_gunner",
      kind: "route",
      playerId: "gunner",
      points: [
        { lateralYards: 20, depthYards: 0 },
        { lateralYards: 22, depthYards: 14 },
      ],
      branches: [],
      style: { line: "solid", ending: "arrow", color: "ink" },
    },
    {
      id: "drop_gunner_flat",
      kind: "zone",
      playerId: "gunner",
      points: [
        { lateralYards: 20, depthYards: 0 },
        { lateralYards: 24, depthYards: 6 },
      ],
      branches: [],
      style: { line: "dashed", ending: "bubble", color: "blue" },
    },
  ],
  labels: [
    {
      id: "label_offense",
      position: { lateralYards: -18, depthYards: 4 },
      text: "MAX SPLIT",
      color: "ink",
      size: 11,
      box: "none",
      boxColor: "yellow",
      unit: "offense",
    },
    {
      id: "label_defense",
      position: { lateralYards: 8, depthYards: 12 },
      text: "COVER 3",
      color: "red",
      size: 12,
      box: "outline",
      boxColor: "red",
      unit: "defense",
    },
    {
      // No side of its own: the original counts an unmarked note as the
      // Coach annotating his own concept.
      id: "label_unsided",
      position: { lateralYards: 0, depthYards: 16 },
      text: "5 Yds",
      color: "ink",
      size: 13,
      box: "none",
      boxColor: "yellow",
    },
    {
      id: "label_pinned_to_slant",
      position: { lateralYards: -9, depthYards: 3 },
      text: "SLANT",
      color: "ink",
      size: 11,
      box: "none",
      boxColor: "yellow",
      unit: "defense",
      binding: {
        pathId: "route_x_slant",
        segmentIndex: 1,
        progress: 0.5,
        offset: { lateralYards: 0, depthYards: 1 },
      },
    },
  ],
  assignments: [
    {
      id: "assignment_receiver",
      playerId: "receiver",
      text: "Slant on the snap.",
      actions: [
        { id: "action_slant", kind: "movement", pathId: "route_x_slant" },
      ],
    },
    {
      id: "assignment_corner",
      playerId: "corner",
      text: "",
      actions: [
        { id: "action_drop", kind: "movement", pathId: "drop_corner_third" },
      ],
    },
  ],
});

/** What an erasure leaves standing, named the way a Coach would check it. */
function survivors(play: PlayDocument, erasure: PlayErasure) {
  const command = playErasureCommand(play, erasure);
  if (!command) throw new Error(`${erasure} erased nothing`);
  const document = applyPlayCommand(play, command);
  return {
    players: document.players.map(({ id }) => id),
    paths: document.paths.map(({ id }) => id),
    labels: document.labels.map(({ id }) => id),
    assignments: document.assignments.map(({ id }) => id),
  };
}

describe("clearing part of a Play", () => {
  it("takes the concept off and leaves the players standing", () => {
    const left = survivors(mixedPlay, "offensive-lines");

    // The gunner's release goes with the concept; his zone turn stays. The
    // corner's return is his because he drew it, whatever kind of line it is.
    expect(left.paths).toEqual([
      "drop_corner_third",
      "blitz_corner_edge",
      "return_corner_pick",
      "drop_gunner_flat",
    ]);
    expect(left.players).toHaveLength(mixedPlay.players.length);
  });

  it("takes the call off and leaves the defenders standing", () => {
    const left = survivors(mixedPlay, "defensive-lines");

    expect(left.paths).toEqual(["route_x_slant", "release_gunner"]);
    expect(left.players).toHaveLength(mixedPlay.players.length);
  });

  it("takes every line and keeps everyone on the field", () => {
    const left = survivors(mixedPlay, "lines");

    expect(left.paths).toEqual([]);
    expect(left.players).toHaveLength(mixedPlay.players.length);
    expect(left.labels).not.toContain("label_pinned_to_slant");
  });

  it("removes the offense with its lines, its notes, and its Assignments", () => {
    const left = survivors(mixedPlay, "offense");

    expect(left.players).toEqual(["corner", "gunner"]);
    // The special-teams man keeps both of his lines: he is neither side.
    expect(left.paths).toEqual([
      "drop_corner_third",
      "blitz_corner_edge",
      "return_corner_pick",
      "release_gunner",
      "drop_gunner_flat",
    ]);
    // An unmarked note counts as the Coach's own concept and goes with it.
    expect(left.labels).toEqual(["label_defense"]);
    expect(left.assignments).toEqual(["assignment_corner"]);
  });

  it("removes the defense with its drops and its pressure", () => {
    const left = survivors(mixedPlay, "defense");

    expect(left.players).toEqual(["receiver", "back", "gunner"]);
    expect(left.paths).toEqual([
      "route_x_slant",
      "release_gunner",
      "drop_gunner_flat",
    ]);
    expect(left.labels).toEqual(["label_offense", "label_unsided"]);
    expect(left.assignments).toEqual(["assignment_receiver"]);
  });

  it("removes every note whichever side wrote it", () => {
    const left = survivors(mixedPlay, "text");

    expect(left.labels).toEqual([]);
    expect(left.players).toHaveLength(mixedPlay.players.length);
    expect(left.paths).toHaveLength(mixedPlay.paths.length);
  });

  it("empties the field", () => {
    const left = survivors(mixedPlay, "field");

    expect(left).toEqual({
      players: [],
      paths: [],
      labels: [],
      assignments: [],
    });
  });

  it("removes a label pinned to a cleared route exactly once", () => {
    // The pinned label is marked defensive and hangs off an offensive route,
    // so both reasons to remove it fire at once.
    const command = playErasureCommand(mixedPlay, "field");
    const removed = command!.commands.flatMap((entry) =>
      entry.kind === "remove-labels" ? entry.labelIds : [],
    );

    expect(removed).toEqual([...new Set(removed)]);
    expect(removed).toContain("label_pinned_to_slant");
  });

  it("undoes as one step, whichever erasure it was", () => {
    const every: readonly PlayErasure[] = [
      "offensive-lines",
      "defensive-lines",
      "lines",
      "offense",
      "defense",
      "text",
      "field",
    ];

    for (const erasure of every) {
      const command = playErasureCommand(mixedPlay, erasure);
      const { document, inverse } = applyPlayCommandWithInverse(
        mixedPlay,
        command!,
      );

      expect(canonicalStringify(applyPlayCommand(document, inverse))).toBe(
        canonicalStringify(mixedPlay),
      );
    }
  });

  it("names each erasure the way the Coach asked for it", () => {
    expect(describePlayCommand(playErasureCommand(mixedPlay, "offense")!)).toBe(
      "Clear offense",
    );
    expect(
      describePlayCommand(playErasureCommand(mixedPlay, "defensive-lines")!),
    ).toBe("Clear defensive assignments");
  });

  /**
   * Grey and inert have to come from the same answer, so a Clear never looks
   * dead and still takes a click, nor the reverse.
   */
  it("is no command at all when it would take nothing", () => {
    const emptied = applyPlayCommand(
      mixedPlay,
      playErasureCommand(mixedPlay, "field")!,
    );

    expect(playErasureCommand(emptied, "field")).toBeUndefined();
    expect(playErasureCommand(emptied, "offensive-lines")).toBeUndefined();
    expect(playErasureCommand(emptied, "text")).toBeUndefined();
  });

  it("still offers to clear a side whose only trace is a note", () => {
    const noDefenders = applyPlayCommand(
      mixedPlay,
      playErasureCommand(mixedPlay, "defense")!,
    );
    const strayNote = applyPlayCommand(noDefenders, {
      kind: "insert-labels",
      labels: [
        {
          index: noDefenders.labels.length,
          item: {
            id: "label_late_call",
            position: { lateralYards: 6, depthYards: 10 },
            text: "ROBBER",
            color: "red",
            size: 12,
            box: "none",
            boxColor: "yellow",
            unit: "defense",
          },
        },
      ],
    });

    const command = playErasureCommand(strayNote, "defense");
    expect(command).toBeDefined();
    expect(
      applyPlayCommand(strayNote, command!).labels.map(({ id }) => id),
    ).not.toContain("label_late_call");
  });
});
