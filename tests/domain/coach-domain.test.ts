import {
  LEGACY_IMPORT_PLAYBOOK_ID,
  canonicalSha256,
  canonicalStringify,
  createSharePublication,
  migratePlayDocument,
  migratePlayDocumentV1ToV2,
  migratePlayDocumentV2ToV3,
  playDocumentSchema,
  playbookEnvelopeSchema,
  sharePublicationSchema,
} from "@chalk/domain";
import {
  defensiveCoverThreePlay,
  offensivePlaybookGolden,
  offensiveStickThunderPlay,
  releasedPlayDocumentV1,
  releasedPlayDocumentV2,
} from "@chalk/test-fixtures";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("Coach-owned Playbook domain", () => {
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

describe("versioned Play migrations", () => {
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
});
