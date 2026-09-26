import {
  applyPlayCommand,
  attachPlayToConcept,
  commandBroadcasts,
  copyPlayDocument,
  createVariationPlay,
  detachPlayFromConcept,
  fieldProfileNeedsReapply,
  formationNeedsReapply,
  promoteVariationsOnConceptDelete,
  propagateCommand,
  pushAlignmentToPlay,
  searchPlays,
  stickThunderConcept,
  stickThunderFamily,
  stickThunderPlay,
  type SearchablePlay,
  libraryScopeAfterToggle,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

describe("Playbook library families", () => {
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

describe("Applies-to scope from the tree's dots", () => {
  const siblings = ["b", "c", "d", "e"];

  it("walks none → some → all → none as dots are toggled", () => {
    const some = libraryScopeAfterToggle("play", [], siblings, "b");
    expect(some).toEqual({ scope: "pick", pickIds: ["b"] });
    const more = libraryScopeAfterToggle(
      "pick",
      ["b", "c", "d"],
      siblings,
      "e",
    );
    expect(more).toEqual({ scope: "concept", pickIds: siblings });
    const fewer = libraryScopeAfterToggle("concept", [], siblings, "c");
    expect(fewer).toEqual({ scope: "pick", pickIds: ["b", "d", "e"] });
    expect(libraryScopeAfterToggle("pick", ["b"], siblings, "b")).toEqual({
      scope: "play",
      pickIds: [],
    });
  });

  it("ignores a play outside the family and a stale pick id", () => {
    expect(libraryScopeAfterToggle("pick", ["zzz"], siblings, "q")).toEqual({
      scope: "pick",
      pickIds: ["zzz"],
    });
    expect(libraryScopeAfterToggle("pick", ["zzz"], siblings, "b")).toEqual({
      scope: "pick",
      pickIds: ["b"],
    });
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
});

describe("Derived thumbnail keys and Field Profile reapply", () => {
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
    const attached = attachPlayToConcept(stickThunderPlay, stickThunderConcept);
    const copied = copyPlayDocument(attached, { id: "play_copy" });
    expect(copied.conceptSource).toEqual(attached.conceptSource);
    expect(
      copyPlayDocument(attached, { id: "play_free", conceptSource: null })
        .conceptSource,
    ).toBeUndefined();
  });
});
