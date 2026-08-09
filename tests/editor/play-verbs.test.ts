import {
  applyPlayCommand,
  assignmentForPath,
  canonicalStringify,
  flipStrengthWords,
  highSchoolFieldProfile,
  playDocumentSchema,
  stockFormations,
  type PlayCommand,
  type PlayDocument,
} from "@chalk/domain";
import {
  addDepthLabelCommand,
  alignPlayersCommand,
  depthLabelText,
  expandSelectionToGroups,
  flipStrengthCommand,
  groupSelectionCommand,
  reverseRouteCommand,
  ungroupSelectionCommand,
  type FieldItemRef,
} from "@chalk/editor";
import { describe, expect, it } from "vitest";

let nextId = 0;
const makeId = (prefix: string) => `${prefix}_${(nextId += 1)}`;
const run = (play: PlayDocument, command?: PlayCommand): PlayDocument =>
  command ? applyPlayCommand(play, command) : play;

/** Gun Trips Right, with a route, a note pinned to it, and some wording. */
const play: PlayDocument = playDocumentSchema.parse({
  schemaVersion: 3,
  id: "play_verbs",
  playbookId: "playbook_verbs",
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
      sublabel: slot.label === "X" ? "STRONG RIGHT" : "",
      fill: "none",
      color: "ink",
    })),
  assignments: [
    {
      id: "assignment_x",
      playerId: "man_7",
      text: "OVER, then LEFT",
      actions: [{ id: "action_x", kind: "movement", pathId: "route_x" }],
    },
  ],
  paths: [
    {
      id: "route_x",
      kind: "route",
      playerId: "man_7",
      points: [
        { lateralYards: -20.218579234972676, depthYards: -1.8333333333333333 },
        { lateralYards: -20, depthYards: 6 },
        {
          lateralYards: -8,
          depthYards: 12,
          control: { lateralYards: -14, depthYards: 11 },
        },
      ],
      branches: [
        {
          fromIndex: 1,
          points: [{ lateralYards: -24, depthYards: 14 }],
          style: { line: "dashed", ending: "arrow", color: "ink" },
        },
      ],
      style: { line: "solid", ending: "arrow", color: "ink" },
      conversion: "vs man: fade LEFT",
    },
  ],
  labels: [
    {
      id: "note",
      position: { lateralYards: -18, depthYards: 9 },
      text: "STRONG side",
      color: "ink",
      size: 11,
      box: "none",
      boxColor: "yellow",
    },
  ],
});

const at = (document: PlayDocument, id: string) =>
  document.players.find((player) => player.id === id)!;

describe("flipping the strength", () => {
  it("turns the football words round and leaves the Coach's own alone", () => {
    expect(flipStrengthWords("STRONG RIGHT")).toBe("WEAK LEFT");
    expect(flipStrengthWords("Strong right")).toBe("Weak left");
    expect(flipStrengthWords("vs man: fade")).toBe("vs man: fade");
    // Anything that is not one of the football words is left exactly as he
    // wrote it, capital letters in the middle included.
    expect(flipStrengthWords("vs McCoy")).toBe("vs McCoy");
    // A crosser is a crosser whichever way it runs.
    expect(flipStrengthWords("OVER")).toBe("OVER");
  });

  it("moves the men, trades the letters, and flips the language with them", () => {
    const flipped = run(play, flipStrengthCommand(play, stockFormations));
    expect(() => playDocumentSchema.parse(flipped)).not.toThrow();

    const wasX = at(play, "man_7");
    const nowThere = flipped.players.find((player) => player.id === "man_7")!;
    expect(nowThere.position.lateralYards).toBeGreaterThan(0);
    // The X becomes the Z, because a letter says which side a man plays.
    expect(nowThere.label).toBe("Z");
    expect(wasX.label).toBe("X");
    expect(nowThere.sublabel).toBe("WEAK LEFT");

    expect(assignmentForPath(flipped, "route_x")?.text).toBe(
      "OVER, then RIGHT",
    );
    expect(flipped.paths[0]!.conversion).toBe("vs man: fade RIGHT");
    expect(flipped.labels[0]!.text).toBe("WEAK side");
  });

  it("flips a set it recognises through its own named counterpart", () => {
    // Nudged, but not enough to stop being Gun Trips Right. Flipping through
    // the named twin puts him on the twin's own spot; reflecting alone would
    // carry the nudge across with him.
    const nudged: PlayDocument = {
      ...play,
      players: play.players.map((player) =>
        player.id === "man_10"
          ? {
              ...player,
              position: {
                ...player.position,
                lateralYards: player.position.lateralYards - 0.5,
              },
            }
          : player,
      ),
      paths: [],
      labels: [],
      assignments: [],
    };
    const flipped = run(nudged, flipStrengthCommand(nudged, stockFormations));
    const left = stockFormations.find(({ name }) => name === "Gun Trips Left")!;
    for (const slot of left.slots) {
      expect(
        flipped.players.some(
          (player) =>
            Math.abs(
              player.position.lateralYards - slot.position.lateralYards,
            ) < 1e-9 &&
            Math.abs(player.position.depthYards - slot.position.depthYards) <
              1e-9,
        ),
      ).toBe(true);
    }
  });

  it("is no command at all on a Play with nothing to flip", () => {
    const empty: PlayDocument = {
      ...play,
      players: [],
      paths: [],
      labels: [],
      assignments: [],
    };
    expect(flipStrengthCommand(empty, stockFormations)).toBeUndefined();
  });
});

describe("lining men up with one another", () => {
  // The quarterback and the back stand deep; the X stands on the line. Three
  // men at three depths, so lining them up has to move somebody.
  const ids = ["man_5", "man_6", "man_7"];

  it("puts them all at the depth between them, and takes their lines with them", () => {
    const before = ids.map((id) => at(play, id).position.depthYards);
    const mean = before.reduce((total, value) => total + value, 0) / 3;
    expect(
      new Set(before.map((value) => value.toFixed(6))).size,
    ).toBeGreaterThan(1);

    const aligned = run(play, alignPlayersCommand(play, ids, "depth"));
    const depths = ids.map(
      (id) =>
        aligned.players.find((player) => player.id === id)!.position.depthYards,
    );
    expect(new Set(depths.map((value) => value.toFixed(9))).size).toBe(1);
    // The middle of them, not whichever of them came first.
    expect(depths[0]).toBeCloseTo(mean, 9);
    // His route moved with him, exactly as far.
    const moved =
      at(aligned, "man_7").position.depthYards -
      at(play, "man_7").position.depthYards;
    expect(aligned.paths[0]!.points[1]!.depthYards).toBeCloseTo(
      play.paths[0]!.points[1]!.depthYards + moved,
      9,
    );
    expect(aligned.paths[0]!.branches[0]!.points[0]!.depthYards).toBeCloseTo(
      play.paths[0]!.branches[0]!.points[0]!.depthYards + moved,
      9,
    );
  });

  it("spreads them evenly between the two widest, who do not move", () => {
    const spread = run(play, alignPlayersCommand(play, ids, "splits"));
    const before = ids
      .map((id) => at(play, id).position.lateralYards)
      .sort((left, right) => left - right);
    const after = ids
      .map((id) => at(spread, id).position.lateralYards)
      .sort((left, right) => left - right);
    expect(after[0]).toBeCloseTo(before[0]!, 9);
    expect(after.at(-1)).toBeCloseTo(before.at(-1)!, 9);
    expect(after[1]! - after[0]!).toBeCloseTo(after[2]! - after[1]!, 9);
  });

  it("needs two men to line up with each other", () => {
    expect(alignPlayersCommand(play, ["man_7"], "depth")).toBeUndefined();
    // Evening the splits between one man is a division by no gaps at all,
    // which is why this is turned away rather than attempted.
    expect(alignPlayersCommand(play, ["man_7"], "splits")).toBeUndefined();
    expect(alignPlayersCommand(play, [], "splits")).toBeUndefined();
  });
});

describe("tying things together", () => {
  const selection: readonly FieldItemRef[] = [
    { kind: "player", id: "man_7" },
    { kind: "path", id: "route_x" },
    { kind: "label", id: "note" },
  ];

  it("marks everything picked as one group, whatever kind of thing it is", () => {
    const grouped = run(play, groupSelectionCommand(play, selection, makeId));
    expect(() => playDocumentSchema.parse(grouped)).not.toThrow();
    const group = at(grouped, "man_7").group;
    expect(group).toBeDefined();
    expect(grouped.paths[0]!.group).toBe(group);
    expect(grouped.labels[0]!.group).toBe(group);
  });

  it("picks the whole of a group when one of it is picked, which is all a group does", () => {
    const grouped = run(play, groupSelectionCommand(play, selection, makeId));
    const expanded = expandSelectionToGroups(grouped, [
      { kind: "player", id: "man_7" },
    ]);
    expect(expanded).toHaveLength(3);
    expect(expanded.map(({ id }) => id).sort()).toEqual([
      "man_7",
      "note",
      "route_x",
    ]);
    // Something in no group brings nothing else with it — and is handed back
    // as it came, so nothing downstream sees a change that did not happen.
    const alone: readonly FieldItemRef[] = [{ kind: "player", id: "man_0" }];
    expect(expandSelectionToGroups(grouped, alone)).toBe(alone);
  });

  it("unties them again, and leaves what was never tied alone", () => {
    const grouped = run(play, groupSelectionCommand(play, selection, makeId));
    const loose = run(
      grouped,
      ungroupSelectionCommand(grouped, [{ kind: "player", id: "man_7" }]),
    );
    expect("group" in at(loose, "man_7")).toBe(false);
    expect("group" in loose.paths[0]!).toBe(false);
    // Untied, it hashes exactly like a Play that was never grouped.
    expect(canonicalStringify(loose)).toBe(canonicalStringify(play));
    expect(
      ungroupSelectionCommand(play, [{ kind: "player", id: "man_7" }]),
    ).toBeUndefined();
  });

  it("needs two things to tie together", () => {
    expect(
      groupSelectionCommand(play, [{ kind: "player", id: "man_7" }], makeId),
    ).toBeUndefined();
  });
});

describe("running a line the other way", () => {
  it("turns the points round and moves each bend back to the break it arrives at", () => {
    const reversed = run(play, reverseRouteCommand(play, "route_x"));
    const before = play.paths[0]!.points;
    const after = reversed.paths[0]!.points;
    expect(after.map(({ lateralYards }) => lateralYards)).toEqual(
      [...before].reverse().map(({ lateralYards }) => lateralYards),
    );
    // The bend arrived at the last point; reversed, it arrives at the second.
    expect(after[1]!.control).toEqual(before[2]!.control);
    expect(after[0]!.control).toBeUndefined();
    // The forks are dropped, because they hung off breaks counted from a
    // start that is now the finish.
    expect(reversed.paths[0]!.branches).toEqual([]);
    // And the line is still his, because production has no line without a man.
    expect(reversed.paths[0]!.playerId).toBe("man_7");
  });

  it("has nothing to turn round on a line of one point, or no line at all", () => {
    expect(reverseRouteCommand(play, "nope")).toBeUndefined();
    const stub: PlayDocument = {
      ...play,
      paths: [{ ...play.paths[0]!, points: [play.paths[0]!.points[0]!] }],
      labels: [],
    };
    expect(reverseRouteCommand(stub, "route_x")).toBeUndefined();
  });
});

describe("saying how deep a break is", () => {
  it("reads the number the way a card reads it", () => {
    expect(depthLabelText(12)).toBe("12 Yds");
    expect(depthLabelText(12.26)).toBe("12.5 Yds");
    expect(depthLabelText(11.9)).toBe("12 Yds");
    expect(depthLabelText(0)).toBe("0 Yds");
  });

  it("pins a marker to the leg the Coach picked out", () => {
    const marked = run(play, addDepthLabelCommand(play, "route_x", 1, makeId));
    expect(() => playDocumentSchema.parse(marked)).not.toThrow();
    const added = marked.labels.at(-1)!;
    expect(added.text).toBe("6 Yds");
    expect(added.role).toBe("landmark");
    expect(added.binding?.pathId).toBe("route_x");
    expect(added.binding?.segmentIndex).toBe(0);
  });

  it("marks the last break when he has not picked one out", () => {
    const marked = run(
      play,
      addDepthLabelCommand(play, "route_x", undefined, makeId),
    );
    expect(marked.labels.at(-1)!.text).toBe("12 Yds");
  });

  it("never marks the stance, which is not a break", () => {
    const marked = run(play, addDepthLabelCommand(play, "route_x", 0, makeId));
    expect(marked.labels.at(-1)!.text).toBe("6 Yds");
  });
});
