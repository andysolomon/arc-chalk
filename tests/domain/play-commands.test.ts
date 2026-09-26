import {
  applyPlayCommand,
  applyPlayCommandWithInverse,
  canonicalStringify,
  diffPlayDocuments,
  deletePlayersCommand,
  describePlayCommand,
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

  it("refuses a command that would leave the Play referencing something missing", () => {
    expect(() =>
      applyPlayCommand(offensiveStickThunderPlay, {
        kind: "remove-players",
        playerIds: ["x"],
      }),
    ).toThrow();
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
});

describe("Play version differences", () => {
  const play = offensiveStickThunderPlay;

  function reproduces(from: PlayDocument, to: PlayDocument): void {
    const command = diffPlayDocuments(from, to, "Restore version");
    const { document, inverse } = applyPlayCommandWithInverse(from, command);
    expect(canonicalStringify(document)).toBe(canonicalStringify(to));
    expect(canonicalStringify(applyPlayCommand(document, inverse))).toBe(
      canonicalStringify(from),
    );
  }

  it("reproduces a Play whose metadata, routes, and Players all changed", () => {
    const changed = playDocumentSchema.parse({
      ...structuredClone(play),
      name: "Stick — Thunder Alert",
      notes: "Restored from a named version.",
      tags: ["third-down"],
      personnelLabel: "12",
      players: play.players
        .slice(0, 10)
        .map((player, index) =>
          index === 3
            ? { ...player, label: "W", color: "red" as const }
            : player,
        ),
      paths: play.paths.filter(({ playerId }) => playerId !== "z"),
      labels: [
        ...play.labels.slice(0, 4),
        { ...play.labels[0]!, id: "label_restored", text: "ALERT" },
      ],
      assignments: play.assignments.filter(({ playerId }) => playerId !== "z"),
      formationSource: {
        ...play.formationSource!,
        slotBindings: play.formationSource!.slotBindings.filter(
          ({ playerId }) => playerId !== "z",
        ),
      },
    });

    reproduces(play, changed);
    reproduces(changed, play);
  });

  it("replaces a layer wholesale when the Coach reordered what both versions keep", () => {
    const reordered = playDocumentSchema.parse({
      ...structuredClone(play),
      labels: [play.labels[3]!, play.labels[0]!, ...play.labels.slice(4)],
    });

    reproduces(play, reordered);
  });

  it("compares Plays whose optional football references are absent", () => {
    const bare = playDocumentSchema.parse({
      ...structuredClone(play),
      personnelLabel: undefined,
      playType: undefined,
      conceptSource: undefined,
      formationSource: undefined,
    });

    expect(diffPlayDocuments(bare, bare)).toEqual({
      kind: "batch",
      commands: [],
    });
    reproduces(play, bare);
    reproduces(bare, play);
  });

  it("reproduces the target Play for any generated edit sequence", () => {
    const playerIds = play.players.map(({ id }) => id);
    const labelIds = play.labels.map(({ id }) => id);

    fc.assert(
      fc.property(
        fc.record({
          name: fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((value) => value.trim().length > 0),
          notes: fc.string({ maxLength: 40 }),
          keptPlayers: fc.subarray(playerIds, { minLength: 1 }),
          keptLabels: fc.subarray(labelIds),
          reverseLabels: fc.boolean(),
        }),
        ({ name, notes, keptPlayers, keptLabels, reverseLabels }) => {
          const removedPlayers = playerIds.filter(
            (id) => !keptPlayers.includes(id),
          );
          const trimmed =
            removedPlayers.length > 0
              ? applyPlayCommand(
                  play,
                  deletePlayersCommand(play, removedPlayers),
                )
              : play;
          const chosenLabels = trimmed.labels.filter(({ id }) =>
            keptLabels.includes(id),
          );
          const target = playDocumentSchema.parse({
            ...structuredClone(trimmed),
            name,
            notes,
            labels: reverseLabels ? [...chosenLabels].reverse() : chosenLabels,
          });

          const command = diffPlayDocuments(play, target);
          const result = applyPlayCommand(play, command);
          return canonicalStringify(result) === canonicalStringify(target);
        },
      ),
      { numRuns: 40 },
    );
  });
});
