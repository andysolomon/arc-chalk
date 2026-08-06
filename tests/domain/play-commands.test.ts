import {
  PlayCommandError,
  applyPlayCommand,
  applyPlayCommandWithInverse,
  canonicalStringify,
  clearPlayLayerCommand,
  deletePathsCommand,
  deletePlayersCommand,
  describePlayCommand,
  invertPlayCommand,
  playCommandCoalesceKey,
  playCommandSchema,
  playDocumentSchema,
  type PlayCommand,
  type PlayDocument,
} from "@chalk/domain";
import {
  defensiveCoverThreePlay,
  offensiveStickThunderPlay,
} from "@chalk/test-fixtures";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

function roundTrips(play: PlayDocument, command: PlayCommand): void {
  const { document, inverse } = applyPlayCommandWithInverse(play, command);
  expect(canonicalStringify(applyPlayCommand(document, inverse))).toBe(
    canonicalStringify(play),
  );
}

describe("semantic Play commands", () => {
  it("restores the exact Play when every command kind is inverted", () => {
    const play = offensiveStickThunderPlay;
    const player = play.players[6]!;
    const path = play.paths[0]!;
    const label = play.labels[0]!;
    const assignment = play.assignments[0]!;
    const commands: PlayCommand[] = [
      { kind: "set-play-name", name: "Stick — Thunder Alert" },
      { kind: "set-notes", notes: "Beat two-high with the stick." },
      { kind: "set-tags", tags: ["third-down", "red-zone"] },
      { kind: "set-personnel-label", personnelLabel: "12" },
      { kind: "set-personnel-label" },
      {
        kind: "set-play-type",
        playType: { id: "play_type_boot", name: "Boot" },
      },
      { kind: "set-play-type" },
      { kind: "set-concept-source" },
      {
        kind: "set-field-profile",
        fieldProfile: { ...play.fieldProfile, revision: 4 },
      },
      {
        kind: "move-players",
        moves: [
          {
            playerId: player.id,
            position: { lateralYards: 12.5, depthYards: 3 },
          },
          {
            playerId: play.players[10]!.id,
            position: { lateralYards: -20, depthYards: 1 },
          },
        ],
      },
      {
        kind: "update-player",
        player: { ...player, label: "W", color: "red", fill: "solid" },
      },
      {
        kind: "update-path",
        path: {
          ...path,
          style: { ...path.style, line: "dashed", ending: "bar" },
        },
      },
      {
        kind: "update-label",
        label: { ...label, text: "STICK", box: "circle" },
      },
      {
        kind: "update-assignment",
        assignment: { ...assignment, text: "Win to the flat now." },
      },
      {
        kind: "insert-labels",
        labels: [
          {
            index: 0,
            item: { ...label, id: "label_new", text: "ALERT" },
          },
        ],
      },
      { kind: "remove-labels", labelIds: [label.id, play.labels[3]!.id] },
      { kind: "mirror-play" },
      {
        kind: "batch",
        label: "Restyle the Play",
        commands: [
          { kind: "set-play-name", name: "Batched" },
          { kind: "mirror-play" },
          { kind: "remove-labels", labelIds: [label.id] },
        ],
      },
    ];

    for (const command of commands) {
      roundTrips(play, playCommandSchema.parse(command));
    }
  });

  it("restores removed Players, routes, and labels at their original positions", () => {
    const play = offensiveStickThunderPlay;
    const removed = [play.labels[2]!.id, play.labels[7]!.id];
    const command: PlayCommand = { kind: "remove-labels", labelIds: removed };
    const { document, inverse } = applyPlayCommandWithInverse(play, command);

    expect(document.labels.map(({ id }) => id)).not.toContain(removed[0]);
    expect(
      applyPlayCommand(document, inverse).labels.map(({ id }) => id),
    ).toEqual(play.labels.map(({ id }) => id));
  });

  it("deletes a Player with its routes, Assignments, and Formation binding as one step", () => {
    const play = offensiveStickThunderPlay;
    const command = deletePlayersCommand(play, ["x"]);
    const { document, inverse } = applyPlayCommandWithInverse(play, command);

    expect(document.players.map(({ id }) => id)).not.toContain("x");
    expect(document.paths.some(({ playerId }) => playerId === "x")).toBe(false);
    expect(document.assignments.some(({ playerId }) => playerId === "x")).toBe(
      false,
    );
    expect(
      document.formationSource?.slotBindings.some(
        ({ playerId }) => playerId === "x",
      ),
    ).toBe(false);
    expect(describePlayCommand(command)).toBe("Delete Player");
    expect(canonicalStringify(applyPlayCommand(document, inverse))).toBe(
      canonicalStringify(play),
    );
  });

  it("keeps an Assignment the Coach wrote when only its dangling action is removed", () => {
    const play = playDocumentSchema.parse({
      ...structuredClone(offensiveStickThunderPlay),
      assignments: [
        ...structuredClone(offensiveStickThunderPlay.assignments),
        {
          id: "assignment_protection_call",
          playerId: "q",
          text: "Slide the protection to the stick side.",
          actions: [
            {
              id: "action_protection_call",
              kind: "block",
              target: { kind: "player", playerId: "x" },
            },
          ],
        },
      ],
    });

    const document = applyPlayCommand(play, deletePlayersCommand(play, ["x"]));
    const kept = document.assignments.find(
      ({ id }) => id === "assignment_protection_call",
    );

    expect(kept?.text).toBe("Slide the protection to the stick side.");
    expect(kept?.actions).toEqual([]);
  });

  it("clears one layer as an ordinary undoable transaction", () => {
    const play = offensiveStickThunderPlay;
    const command = clearPlayLayerCommand(play, "paths");
    const { document, inverse } = applyPlayCommandWithInverse(play, command);

    expect(document.paths).toEqual([]);
    expect(document.players).toHaveLength(play.players.length);
    expect(describePlayCommand(command)).toBe("Clear routes");
    expect(canonicalStringify(applyPlayCommand(document, inverse))).toBe(
      canonicalStringify(play),
    );
  });

  it("refuses a command that names something the Play does not contain", () => {
    expect(() =>
      applyPlayCommand(offensiveStickThunderPlay, {
        kind: "remove-players",
        playerIds: ["not-on-this-play"],
      }),
    ).toThrow(PlayCommandError);
    expect(() =>
      deletePathsCommand(offensiveStickThunderPlay, ["not-a-route"]),
    ).toThrow(PlayCommandError);
  });

  it("refuses a command that would leave the Play referencing something missing", () => {
    expect(() =>
      applyPlayCommand(offensiveStickThunderPlay, {
        kind: "remove-players",
        playerIds: ["x"],
      }),
    ).toThrow();
  });

  it("names each edit the way a Coach would read it in the Undo control", () => {
    expect(describePlayCommand({ kind: "set-play-name", name: "Mesh" })).toBe(
      "Rename Play",
    );
    expect(
      describePlayCommand({
        kind: "move-players",
        moves: [
          { playerId: "x", position: { lateralYards: 0, depthYards: 0 } },
          { playerId: "z", position: { lateralYards: 1, depthYards: 0 } },
        ],
      }),
    ).toBe("Move Players");
    expect(describePlayCommand({ kind: "mirror-play" })).toBe("Mirror Play");
    expect(
      describePlayCommand({
        kind: "batch",
        commands: [{ kind: "mirror-play" }],
      }),
    ).toBe("Edit Play");
  });

  it("coalesces only whole-value field edits", () => {
    const label = offensiveStickThunderPlay.labels[0]!;
    expect(
      playCommandCoalesceKey({ kind: "set-play-name", name: "Mesh" }),
    ).toBe("play-name");
    expect(playCommandCoalesceKey({ kind: "update-label", label })).toBe(
      `label:${label.id}`,
    );
    expect(playCommandCoalesceKey({ kind: "mirror-play" })).toBeUndefined();
    expect(
      playCommandCoalesceKey({
        kind: "remove-labels",
        labelIds: [label.id],
      }),
    ).toBeUndefined();
  });

  it("returns to the same Play for any generated sequence of moves and renames", () => {
    const play = defensiveCoverThreePlay;
    const playerIds = play.players.map(({ id }) => id);

    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({
              kind: fc.constant("set-play-name" as const),
              name: fc
                .string({ minLength: 1, maxLength: 24 })
                .filter((name) => name.trim().length > 0),
            }),
            fc.record({
              kind: fc.constant("move-players" as const),
              moves: fc
                .uniqueArray(fc.constantFrom(...playerIds), {
                  minLength: 1,
                  maxLength: 4,
                })
                .chain((ids) =>
                  fc.tuple(
                    ...ids.map((playerId) =>
                      fc.record({
                        playerId: fc.constant(playerId),
                        position: fc.record({
                          lateralYards: fc.integer({ min: -26, max: 26 }),
                          depthYards: fc.integer({ min: -10, max: 40 }),
                        }),
                      }),
                    ),
                  ),
                ),
            }),
            fc.constant({ kind: "mirror-play" as const }),
          ),
          { minLength: 1, maxLength: 8 },
        ),
        (commands) => {
          let document = play;
          const inverses: PlayCommand[] = [];
          for (const command of commands) {
            const step = applyPlayCommandWithInverse(document, command);
            document = step.document;
            inverses.unshift(step.inverse);
          }
          for (const inverse of inverses) {
            document = applyPlayCommand(document, inverse);
          }
          return canonicalStringify(document) === canonicalStringify(play);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("computes the inverse against the Play as it stood before the edit", () => {
    const play = offensiveStickThunderPlay;
    expect(
      invertPlayCommand(play, { kind: "set-play-name", name: "Changed" }),
    ).toEqual({ kind: "set-play-name", name: play.name });
  });
});
