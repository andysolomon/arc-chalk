import {
  applyPlayCommand,
  attachPlayToConcept,
  buildLibraryTree,
  commandBroadcasts,
  composedPlayName,
  copyPlayDocument,
  createVariationPlay,
  detachPlayFromConcept,
  emptyPlayDocument,
  familyOf,
  fieldProfileNeedsReapply,
  formatBroadcastReport,
  formationNeedsReapply,
  highSchoolFieldProfile,
  libraryDisclosureDefault,
  libraryScopeHint,
  libraryScopeTargets,
  playThumbnailKey,
  presentVariationLine,
  promoteVariationsOnConceptDelete,
  propagateCommand,
  pushAlignmentToPlay,
  searchPlays,
  starterPlaybookEnvelope,
  stickThunderConcept,
  stickThunderFamily,
  stickThunderPlay,
  variantNameFrom,
  type LibraryPlayMember,
  type SearchablePlay,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

function membersOf(
  plays: readonly { readonly id: string; readonly name: string }[],
): LibraryPlayMember[] {
  return plays.map((play, index) => ({
    playId: play.id,
    name: play.name,
    unit: "offense" as const,
    conceptId: stickThunderConcept.id,
    tags: [],
    updatedAtMs: 1_000 - index,
  }));
}

describe("Playbook library families", () => {
  it("nests variations under the concept and names them by what distinguishes them", () => {
    const family = stickThunderFamily();
    const tree = buildLibraryTree(membersOf(family), [stickThunderConcept]);
    expect(tree).toHaveLength(1);
    const row = tree[0]!;
    expect(row.name).toBe("Stick — Thunder");
    expect(row.notes).toContain("Stick underneath");
    expect(row.tags).toEqual(["3rd down", "red zone"]);
    expect(row.variations.map(({ label }) => label)).toEqual([
      "Gun Doubles Right",
      "Gun Doubles Left",
      "Gun Trips Right",
      "Red zone",
    ]);
    expect(variantNameFrom("Stick — Thunder", family[1]!.name)).toBe(
      "Gun Doubles Right",
    );
    expect(composedPlayName("Stick — Thunder", "Red zone")).toBe(
      "Stick — Thunder — Red zone",
    );
  });

  it("detaches a variation without touching its siblings", () => {
    const family = stickThunderFamily();
    const detached = detachPlayFromConcept(family[4]!);
    expect(detached.conceptSource).toBeUndefined();
    expect(detached.name).toBe(family[4]!.name);
    expect(family[1]!.conceptSource?.conceptId).toBe(stickThunderConcept.id);
  });

  it("promotes variations when the concept play is deleted", () => {
    const family = stickThunderFamily();
    const remaining = promoteVariationsOnConceptDelete(
      family[0]!.id,
      stickThunderConcept.id,
      family,
    );
    expect(remaining).toHaveLength(4);
    expect(remaining.every((play) => play.conceptSource === undefined)).toBe(
      true,
    );
  });

  it("creates a variation from the play on the field", () => {
    const variation = createVariationPlay({
      source: stickThunderPlay,
      concept: stickThunderConcept,
      variantName: "Gun Trips Right",
      playId: "play_new_variation",
    });
    expect(variation.id).toBe("play_new_variation");
    expect(variation.name).toBe("Stick — Thunder — Gun Trips Right");
    expect(variation.conceptSource).toEqual({
      conceptId: stickThunderConcept.id,
      revision: 1,
    });
    expect(variation.players).toEqual(stickThunderPlay.players);
  });

  it("opens the family of the play being worked on by default", () => {
    expect(
      libraryDisclosureDefault("concept_stick_thunder", "concept_stick_thunder", {}),
    ).toBe(true);
    expect(
      libraryDisclosureDefault("concept_other", "concept_stick_thunder", {}),
    ).toBe(false);
    expect(
      libraryDisclosureDefault("concept_other", "concept_stick_thunder", {
        concept_other: true,
      }),
    ).toBe(true);
  });

  it("names Present's variation line the way the original does", () => {
    const family = stickThunderFamily();
    const line = presentVariationLine(
      family[2]!.id,
      membersOf(family),
      [stickThunderConcept],
    );
    expect(line).toBe("3 / 5  ·  GUN DOUBLES LEFT");
    expect(
      presentVariationLine(family[0]!.id, membersOf([family[0]!]), [
        stickThunderConcept,
      ]),
    ).toBe("");
  });

  it("seeds a starter Playbook with the Stick family and the other examples", () => {
    const envelope = starterPlaybookEnvelope();
    expect(envelope.plays).toHaveLength(8);
    expect(envelope.concepts).toEqual([stickThunderConcept]);
    expect(envelope.plays.map(({ name }) => name)).toEqual([
      "Stick — Thunder",
      "Stick — Thunder — Gun Doubles Right",
      "Stick — Thunder — Gun Doubles Left",
      "Stick — Thunder — Gun Trips Right",
      "Stick — Thunder — Red zone",
      "Four Verticals",
      "Outside Zone — Pull",
      "Cover 3 — Fire Zone",
    ]);
  });

  it("starts a new Play empty without stealing the open Play's identity", () => {
    const created = emptyPlayDocument({
      playbookId: stickThunderPlay.playbookId,
      fieldProfile: highSchoolFieldProfile,
      name: "Untitled play",
    });
    expect(created.id).not.toBe(stickThunderPlay.id);
    expect(created.players).toEqual([]);
    expect(created.playbookId).toBe(stickThunderPlay.playbookId);
  });
});

describe("Concept-scope propagation", () => {
  it("copies route style onto the matching role and skips a diverged variation", () => {
    const family = stickThunderFamily();
    const source = applyPlayCommand(family[0]!, {
      kind: "update-path",
      path: {
        ...family[0]!.paths.find((path) => path.playerId === "z")!,
        style: {
          ...family[0]!.paths.find((path) => path.playerId === "z")!.style,
          line: "dashed",
        },
      },
    });
    const zPath = source.paths.find((path) => path.playerId === "z")!;
    expect(commandBroadcasts({ kind: "update-path", path: zPath })).toBe(true);

    const right = propagateCommand(source, family[1]!, {
      kind: "update-path",
      path: zPath,
    });
    expect(right.ok).toBe(true);
    if (right.ok) {
      const sibling = right.play.paths.find((path) => path.playerId === "z");
      expect(sibling?.style.line).toBe("dashed");
      expect(sibling?.points).toEqual(
        family[1]!.paths.find((path) => path.playerId === "z")!.points,
      );
    }

    const redZone = propagateCommand(source, family[4]!, {
      kind: "update-path",
      path: zPath,
    });
    expect(redZone).toEqual({ ok: false, reason: "has no Z route" });
    expect(
      formatBroadcastReport({
        applied: 4,
        total: 5,
        skipped: ["Red zone has no Z route"],
      }),
    ).toBe("Applied to 4 of 5 — Red zone has no Z route");
  });

  it("pushes the concept's alignment onto a variation and keeps its routes", () => {
    const family = stickThunderFamily();
    const result = pushAlignmentToPlay(family[0]!, family[2]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sourceZ = family[0]!.players.find((player) => player.label === "Z");
    const pushedZ = result.play.players.find((player) => player.label === "Z");
    expect(pushedZ?.position).toEqual(sourceZ?.position);
    expect(
      result.play.paths.filter((path) => path.playerId === pushedZ?.id).length,
    ).toBeGreaterThan(0);
  });
});

describe("Device-local Play search", () => {
  const plays: SearchablePlay[] = Array.from({ length: 2_000 }, (_, index) => ({
    playId: `play_${index}`,
    playbookId: "playbook_a",
    name: index === 7 ? "Stick — Thunder" : `Play ${index}`,
    unit: index % 10 === 0 ? "defense" : "offense",
    playTypeName: index % 3 === 0 ? "Pass" : "Run",
    tags: index === 7 ? ["3rd down"] : [],
    playerRoles: index === 7 ? ["X", "Z"] : ["X"],
    assignmentText: index === 7 ? ["Thunder"] : [],
    notes: index === 7 ? "Stick underneath" : "",
  }));

  it("filters, prefixes, and fuzzy-matches without loading Play revisions", () => {
    expect(
      searchPlays(plays, { text: "stick" }).map(({ playId }) => playId),
    ).toEqual(["play_7"]);
    expect(
      searchPlays(plays, { text: "thundr" }).map(({ playId }) => playId),
    ).toEqual(["play_7"]);
    expect(
      searchPlays(plays, {
        filters: { unit: "defense" },
        limit: 3,
      }).map(({ playId }) => playId),
    ).toEqual(["play_0", "play_10", "play_100"]);
  });

  it("answers a 2,000-Play query inside the 50 ms library budget", () => {
    const started = performance.now();
    const hits = searchPlays(plays, { text: "play 12" });
    const elapsed = performance.now() - started;
    expect(hits.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });
});

describe("Derived thumbnail keys and Field Profile reapply", () => {
  it("keys a thumbnail by revision, renderer, Field Profile, and theme", () => {
    expect(
      playThumbnailKey({
        playId: "play_1",
        revisionHash: "abc",
        fieldProfileRevision: 2,
      }),
    ).toBe("play_1:abc:1:2:light");
  });

  it("does not rewrite coordinates when a Field Profile is reapplied", () => {
    const bumped = {
      ...stickThunderPlay.fieldProfile,
      revision: stickThunderPlay.fieldProfile.revision + 1,
    };
    expect(fieldProfileNeedsReapply(stickThunderPlay, bumped)).toBe(true);
    expect(
      formationNeedsReapply(stickThunderPlay, {
        ...stickThunderPlay.formationSource!,
        id: "formation_x",
        playbookId: stickThunderPlay.playbookId,
        revision: 2,
        name: "Gun",
        unit: "offense",
        description: "",
        strength: "right",
        ball: {
          position: { lateralYards: 0, depthYards: 0 },
          hash: "middle",
        },
        slots: [
          {
            id: "s1",
            unit: "offense",
            role: "X",
            position: { lateralYards: 0, depthYards: 0 },
            symbol: "circle",
            label: "X",
            sublabel: "",
            fill: "none",
            color: "ink",
          },
        ],
        rolePairs: [],
        schemaVersion: 1,
      }),
    ).toBe(false);
  });

  it("keeps a copied Play's Concept pointer unless asked to drop it", () => {
    const attached = attachPlayToConcept(
      stickThunderPlay,
      stickThunderConcept,
    );
    const copied = copyPlayDocument(attached, { id: "play_copy" });
    expect(copied.conceptSource).toEqual(attached.conceptSource);
    expect(copyPlayDocument(attached, { id: "play_free", conceptSource: null })
      .conceptSource).toBeUndefined();
  });
});
