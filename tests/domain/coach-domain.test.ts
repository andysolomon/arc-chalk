import {
  LEGACY_IMPORT_PLAYBOOK_ID,
  assignmentSchema,
  builtInPlayTypeDefinitions,
  canonicalSha256,
  canonicalStringify,
  createSharePublication,
  hashPlayDocument,
  legacyLateralSpanToYards,
  migratePlayDocument,
  migratePlayDocumentV1ToV2,
  migratePlayDocumentV2ToV3,
  migratePlayEnvelope,
  playDocumentSchema,
  playEnvelopeSchema,
  playRevisionSchema,
  playbookEnvelopeSchema,
  playbookSchema,
  sharePublicationSchema,
} from "@chalk/domain";
import {
  defensiveCoverThreePlay,
  defensivePlaybookGolden,
  offensivePlaybookGolden,
  offensiveStickThunderPlay,
  releasedPlayDocumentV1,
  releasedPlayDocumentV2,
  releasedPlayEnvelopeV1,
} from "@chalk/test-fixtures";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("Coach-owned Playbook domain", () => {
  it("provides the approved built-in Play Types while accepting Coach-defined types", () => {
    expect(builtInPlayTypeDefinitions.map(({ name }) => name)).toEqual([
      "Run",
      "Pass",
      "RPO",
      "Screen",
      "Coverage",
      "Pressure",
      "Return",
      "Punt",
      "Field Goal",
    ]);

    expect(
      playbookSchema.parse(offensivePlaybookGolden.playbook).playTypes.at(-1),
    ).toEqual({
      id: "play_type_boot",
      name: "Boot",
      unit: "offense",
      order: 9,
      archived: false,
    });
  });

  it("never requires a Play to be classified below Unit", () => {
    const unitOnly = structuredClone(offensiveStickThunderPlay);
    delete unitOnly.playType;
    delete unitOnly.personnelLabel;
    delete unitOnly.conceptSource;
    delete unitOnly.formationSource;

    expect(playDocumentSchema.parse(unitOnly)).toMatchObject({
      unit: "offense",
    });
  });

  it("round-trips realistic offensive and defensive Playbooks", () => {
    for (const golden of [offensivePlaybookGolden, defensivePlaybookGolden]) {
      const json = JSON.stringify(golden);
      expect(playbookEnvelopeSchema.parse(JSON.parse(json))).toEqual(golden);
    }

    expect(offensiveStickThunderPlay.players).toHaveLength(11);
    expect(offensiveStickThunderPlay.assignments).toHaveLength(5);
    expect(defensiveCoverThreePlay.players).toHaveLength(11);
    expect(defensiveCoverThreePlay.assignments).toHaveLength(11);
    expect(defensiveCoverThreePlay.paths).toHaveLength(5);
  });

  it("retains stable source revisions and explicit Formation slot bindings", () => {
    expect(offensiveStickThunderPlay.conceptSource).toEqual({
      conceptId: "concept_stick",
      revision: 3,
    });
    expect(offensiveStickThunderPlay.formationSource).toMatchObject({
      formationId: "formation_gun_doubles_right",
      revision: 1,
    });
    expect(
      offensiveStickThunderPlay.formationSource?.slotBindings,
    ).toHaveLength(11);

    const changedSource = structuredClone(offensivePlaybookGolden);
    changedSource.formations[0]!.revision = 3;
    changedSource.formations[0]!.slots[0]!.position.lateralYards = -9;

    expect(playbookEnvelopeSchema.parse(changedSource)).toEqual(changedSource);
    expect(offensiveStickThunderPlay.players[0]!.position.lateralYards).toBe(
      legacyLateralSpanToYards(-72),
    );
    expect(offensiveStickThunderPlay.formationSource?.revision).toBe(1);
  });

  it("supports exact Coach wording with every structured Assignment action family", () => {
    const kinds = [
      "movement",
      "block",
      "coverage",
      "pressure",
      "handoff",
      "fake",
      "kick",
      "other",
    ] as const;
    const assignment = assignmentSchema.parse({
      id: "assignment_complete_vocabulary",
      playerId: "player_qb",
      text: "Read it exactly as coached.",
      actions: kinds.map((kind, index) => {
        if (kind === "movement") {
          return { id: `action_${index}`, kind, pathId: "path_qb" };
        }
        if (kind === "other") {
          return { id: `action_${index}`, kind, text: "Alert smoke" };
        }
        return {
          id: `action_${index}`,
          kind,
          target: { kind: "landmark", landmark: "ball" },
        };
      }),
    });

    expect(assignment.actions.map(({ kind }) => kind)).toEqual(kinds);
  });

  it("projects immutable Share Publication entries without private coaching data", () => {
    const privatePlay = structuredClone(offensiveStickThunderPlay);
    const publication = createSharePublication({
      id: "publication_install_one",
      title: "Install One",
      publishedAtMs: 1_786_000_000_000,
      entries: [
        {
          id: "publication_entry_stick",
          playRevisionId: "revision_stick_12",
          play: privatePlay,
        },
      ],
      presentation: {
        fieldStyle: "lines",
        playback: true,
        downloads: ["svg", "pdf"],
      },
    });

    expect(sharePublicationSchema.parse(publication)).toEqual(publication);
    expect(publication.entries[0]?.play).not.toHaveProperty("notes");
    expect(publication.entries[0]?.play).not.toHaveProperty("assignments");
    expect(publication.entries[0]?.play).not.toHaveProperty("playbookId");
    expect(publication.entries[0]?.play).not.toHaveProperty("conceptSource");
    expect(publication.entries[0]?.play).not.toHaveProperty("formationSource");

    const publishedName = publication.entries[0]!.play.name;
    privatePlay.name = "Private edit after publishing";
    expect(publication.entries[0]!.play.name).toBe(publishedName);

    const privateLeak = structuredClone(publication) as unknown as {
      entries: Array<{ play: Record<string, unknown> }>;
    };
    privateLeak.entries[0]!.play.notes = "private coaching note";
    expect(sharePublicationSchema.safeParse(privateLeak).success).toBe(false);
  });
});

describe("versioned Play and envelope migrations", () => {
  it("upgrades every released Play version through explicit sequential steps", () => {
    const versionTwo = migratePlayDocumentV1ToV2(releasedPlayDocumentV1);
    const currentFromOne = migratePlayDocument(releasedPlayDocumentV1);
    const currentFromTwo = migratePlayDocumentV2ToV3(releasedPlayDocumentV2);

    expect(versionTwo.schemaVersion).toBe(2);
    expect(currentFromOne).toEqual(currentFromTwo);
    expect(currentFromTwo).toMatchObject({
      schemaVersion: 3,
      playbookId: LEGACY_IMPORT_PLAYBOOK_ID,
      playType: { id: "play_type_pass", name: "Pass" },
    });
    expect(currentFromTwo.assignments).toContainEqual({
      id: "assignment_rx",
      playerId: "x",
      text: "Push vertical, then win to the flat",
      actions: [
        {
          id: "assignment_action_rx",
          kind: "movement",
          pathId: "rx",
        },
      ],
    });
    expect(currentFromTwo.paths[0]).not.toHaveProperty("assignment");
    expect(migratePlayDocument(currentFromTwo)).toEqual(currentFromTwo);
  });

  it("upgrades the released Play envelope to the current envelope", () => {
    const migrated = migratePlayEnvelope(releasedPlayEnvelopeV1);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.play.schemaVersion).toBe(3);
    expect(playEnvelopeSchema.parse(migrated)).toEqual(migrated);
  });

  it("preserves arbitrary nonblank legacy Assignment wording during upgrade", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 120 })
          .filter((text) => text.trim().length > 0),
        (text) => {
          const legacy = structuredClone(releasedPlayDocumentV2);
          legacy.paths[0]!.assignment = text;
          const migrated = migratePlayDocument(legacy);

          expect(migrated.assignments[0]?.text).toBe(text.trim());
          expect(migrated.assignments[0]?.actions[0]).toMatchObject({
            kind: "movement",
            pathId: legacy.paths[0]!.id,
          });
        },
      ),
    );
  });
});

describe("canonical and malformed Coach documents", () => {
  it("hashes only validated current Plays and validates immutable revision identity", async () => {
    const documentHash = await hashPlayDocument(offensiveStickThunderPlay);
    const revision = playRevisionSchema.parse({
      schemaVersion: 1,
      id: "revision_stick_12",
      playId: offensiveStickThunderPlay.id,
      createdAtMs: 1_786_000_000_000,
      label: "Install one",
      documentHash,
      document: offensiveStickThunderPlay,
    });

    expect(documentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(revision.documentHash).toBe(documentHash);
    expect(await hashPlayDocument(structuredClone(revision.document))).toBe(
      documentHash,
    );
    expect(() =>
      playRevisionSchema.parse({ ...revision, playId: "play_wrong" }),
    ).toThrow("does not match");
    await expect(
      hashPlayDocument({ ...offensiveStickThunderPlay, paths: [] }),
    ).rejects.toThrow("missing MovementPath");
    await expect(
      hashPlayDocument({ ...offensiveStickThunderPlay, players: [] }),
    ).rejects.toThrow("missing Player");
  });

  it("round-trips generated current Play metadata through JSON and Zod", () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 80 }),
          personnelLabel: fc.option(fc.string({ maxLength: 30 }), {
            nil: undefined,
          }),
          tags: fc.array(fc.string({ maxLength: 30 }), { maxLength: 12 }),
          notes: fc.string({ maxLength: 500 }),
        }),
        ({ name, personnelLabel, tags, notes }) => {
          const candidate = {
            ...structuredClone(offensiveStickThunderPlay),
            name,
            tags,
            notes,
            ...(personnelLabel === undefined ? {} : { personnelLabel }),
          };
          if (personnelLabel === undefined) delete candidate.personnelLabel;

          expect(
            playDocumentSchema.parse(JSON.parse(JSON.stringify(candidate))),
          ).toEqual(candidate);
        },
      ),
    );
  });

  it("round-trips generated metadata and hashes equivalent key order identically", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 16 }),
          fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          { maxKeys: 30 },
        ),
        async (metadata) => {
          const reversed = Object.fromEntries(
            Object.entries(metadata).reverse(),
          );
          expect(canonicalStringify(metadata)).toBe(
            canonicalStringify(reversed),
          );
          expect(await canonicalSha256(metadata)).toBe(
            await canonicalSha256(reversed),
          );
        },
      ),
    );
  });

  it("rejects generated dangling Player references instead of coercing them", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 40 })
          .filter(
            (id) =>
              !defensiveCoverThreePlay.players.some(
                (player) => player.id === id,
              ),
          ),
        (missingPlayerId) => {
          const malformed = structuredClone(defensiveCoverThreePlay);
          malformed.paths[0]!.playerId = missingPlayerId;

          expect(playDocumentSchema.safeParse(malformed).success).toBe(false);
        },
      ),
    );
  });

  it("rejects duplicate IDs and dangling Assignment or Formation references", () => {
    const duplicatePlayer = structuredClone(defensiveCoverThreePlay);
    duplicatePlayer.players[1]!.id = duplicatePlayer.players[0]!.id;
    expect(playDocumentSchema.safeParse(duplicatePlayer).success).toBe(false);

    const danglingAssignment = structuredClone(defensiveCoverThreePlay);
    danglingAssignment.assignments[0]!.actions = [
      {
        id: "action_missing_path",
        kind: "movement",
        pathId: "path_missing",
      },
    ];
    expect(playDocumentSchema.safeParse(danglingAssignment).success).toBe(
      false,
    );

    const danglingSlot = structuredClone(offensivePlaybookGolden);
    danglingSlot.plays[0]!.formationSource!.slotBindings[0]!.slotId =
      "slot_missing";
    expect(playbookEnvelopeSchema.safeParse(danglingSlot).success).toBe(false);
  });

  it("rejects missing Play Types and cross-Unit reusable sources", () => {
    const missingType = structuredClone(defensivePlaybookGolden);
    missingType.plays[0]!.playType = {
      id: "play_type_missing",
      name: "Missing",
    };
    expect(playbookEnvelopeSchema.safeParse(missingType).success).toBe(false);

    const crossUnitConcept = structuredClone(defensivePlaybookGolden);
    crossUnitConcept.concepts[0]!.unit = "offense";
    expect(playbookEnvelopeSchema.safeParse(crossUnitConcept).success).toBe(
      false,
    );
  });
});
