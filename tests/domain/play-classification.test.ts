import {
  addCoachPlayType,
  applyPlayCommand,
  applyPlayCommandWithInverse,
  archivePlayType,
  blankPlaybook,
  builtInPlayTypeDefinitions,
  describeReclassifyDrops,
  formatClassification,
  migrateLegacyPlay,
  migratePlayDocument,
  opposingUnit,
  playTypeName,
  playTypesForUnit,
  playUnitSchema,
  playUnits,
  playbookEnvelopeSchema,
  playbookSchema,
  reclassifyPlay,
  starterPlaybookEnvelope,
  stickThunderConcept,
  stickThunderPlay,
  stockFormations,
  unitName,
  type PlayDocument,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

const playbook = blankPlaybook("playbook_classify");
const coverage = builtInPlayTypeDefinitions.find(
  ({ builtInKey }) => builtInKey === "coverage",
)!;
const pass = builtInPlayTypeDefinitions.find(
  ({ builtInKey }) => builtInKey === "pass",
)!;

describe("Play classification vocabulary", () => {
  it("says Unit · Type everywhere, and the Unit alone when there is no Type", () => {
    expect(formatClassification({ unit: "defense" })).toBe("Defense");
    expect(
      formatClassification({
        unit: "defense",
        playType: { id: coverage.id, name: coverage.name },
      }),
    ).toBe("Defense · Coverage");
    // The special-teams unit is set aside (ADR 0053): anything stored with it
    // reads as offense, so an older backup still loads and files sensibly.
    expect(playUnitSchema.parse("special-teams")).toBe("offense");
    expect(playUnits.map(({ id }) => id)).toEqual(["offense", "defense"]);
    expect(opposingUnit("offense")).toBe("defense");
    expect(opposingUnit("defense")).toBe("offense");
    expect(unitName("offense")).toBe("Offense");
    expect(playTypeName({ unit: "offense" })).toBe("Unclassified");
  });

  it("offers only a Unit's live Types, in the Coach's order", () => {
    expect(
      playTypesForUnit(playbook.playTypes, "defense").map(({ name }) => name),
    ).toEqual(["Coverage", "Pressure"]);
    const trimmed = archivePlayType(playbook, coverage.id);
    expect(
      playTypesForUnit(trimmed.playTypes, "defense").map(({ name }) => name),
    ).toEqual(["Pressure"]);
    // Return, Punt and Field Goal are no longer seeded (ADR 0053).
    expect(
      playbook.playTypes
        .map(({ name }) => name)
        .filter((name) => ["Return", "Punt", "Field Goal"].includes(name)),
    ).toEqual([]);
  });

  it("keeps a stored special-teams Type for the plays that carry it, archived under offense", () => {
    const kept = playbookSchema.parse({
      ...playbook,
      playTypes: [
        ...playbook.playTypes,
        {
          id: "play_type_punt",
          name: "Punt",
          unit: "special-teams",
          builtInKey: "punt",
          order: 7,
          archived: false,
        },
      ],
    });
    const punt = kept.playTypes.find(({ id }) => id === "play_type_punt")!;
    expect(punt).toMatchObject({ unit: "offense", archived: true });
    expect(
      playTypesForUnit(kept.playTypes, "offense").map(({ name }) => name),
    ).not.toContain("Punt");
  });

  it("lets the Coach define a Type of his own inside a Unit", () => {
    const added = addCoachPlayType(playbook, {
      name: "  Sim  pressure ",
      unit: "defense",
      id: "play_type_sim",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.playType).toMatchObject({
      id: "play_type_sim",
      name: "Sim pressure",
      unit: "defense",
      archived: false,
    });
    expect(added.playType.order).toBeGreaterThan(
      Math.max(...playbook.playTypes.map(({ order }) => order)),
    );
    expect(
      playTypesForUnit(added.playbook.playTypes, "defense").map(
        ({ name }) => name,
      ),
    ).toEqual(["Coverage", "Pressure", "Sim pressure"]);

    const duplicate = addCoachPlayType(added.playbook, {
      name: "sim PRESSURE",
      unit: "defense",
    });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.reason).toBe("Defense already has a Sim pressure type.");

    const elsewhere = addCoachPlayType(added.playbook, {
      name: "Sim pressure",
      unit: "offense",
    });
    expect(elsewhere.ok).toBe(true);
    expect(
      addCoachPlayType(playbook, { name: "   ", unit: "offense" }),
    ).toEqual({ ok: false, reason: "Give the type a name first." });
  });

  it("brings an archived Type back instead of duplicating it", () => {
    const archived = archivePlayType(playbook, coverage.id);
    const restored = addCoachPlayType(archived, {
      name: "coverage",
      unit: "defense",
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.playType.id).toBe(coverage.id);
    expect(restored.playbook.playTypes).toHaveLength(playbook.playTypes.length);
  });
});

describe("Reclassifying a Play", () => {
  const context = {
    playTypes: playbook.playTypes,
    concepts: [stickThunderConcept],
    formations: stockFormations,
  };
  const stick: PlayDocument = {
    ...stickThunderPlay,
    playType: { id: pass.id, name: pass.name },
    conceptSource: { conceptId: stickThunderConcept.id, revision: 1 },
  };

  it("changes the Type inside a Unit as one undoable command", () => {
    const plan = reclassifyPlay(
      stick,
      { unit: "offense", playType: { id: "play_type_run", name: "Run" } },
      context,
    );
    expect(plan).toBeDefined();
    expect(plan!.needsConfirmation).toBe(false);
    expect(plan!.drops).toEqual({});
    const step = applyPlayCommandWithInverse(stick, plan!.command);
    expect(step.document.playType).toEqual({
      id: "play_type_run",
      name: "Run",
    });
    expect(step.document.unit).toBe("offense");
    expect(step.document.conceptSource).toEqual(stick.conceptSource);
    expect(applyPlayCommand(step.document, step.inverse)).toEqual(stick);
  });

  it("lets a Play go unclassified rather than showing a false default", () => {
    const plan = reclassifyPlay(stick, { unit: "offense" }, context);
    expect(plan!.needsConfirmation).toBe(false);
    const next = applyPlayCommand(stick, plan!.command);
    expect(next.playType).toBeUndefined();
    expect(formatClassification(next)).toBe("Offense");
  });

  it("does nothing when the classification is already what was asked", () => {
    expect(
      reclassifyPlay(
        stick,
        { unit: "offense", playType: { id: pass.id, name: pass.name } },
        context,
      ),
    ).toBeUndefined();
  });

  it("names what a Unit change drops, keeps the diagram, and undoes as one step", () => {
    const withFormation: PlayDocument = {
      ...stick,
      formationSource: {
        formationId: "formation_gun_doubles_left",
        revision: 1,
        slotBindings: [],
      },
    };
    const plan = reclassifyPlay(
      withFormation,
      { unit: "defense", playType: { id: pass.id, name: pass.name } },
      context,
    );
    expect(plan!.needsConfirmation).toBe(true);
    expect(plan!.drops).toEqual({
      playType: "Pass",
      concept: "Stick — Thunder",
      formation: "Gun Doubles Left",
    });
    expect(describeReclassifyDrops(plan!.drops, "defense")).toBe(
      "Moving to Defense drops the Pass type, the Stick — Thunder concept link and the Gun Doubles Left formation link. The diagram stays.",
    );
    const step = applyPlayCommandWithInverse(withFormation, plan!.command);
    expect(step.document.unit).toBe("defense");
    expect(step.document.playType).toBeUndefined();
    expect(step.document.conceptSource).toBeUndefined();
    expect(step.document.formationSource).toBeUndefined();
    expect(step.document.players).toEqual(withFormation.players);
    expect(step.document.paths).toEqual(withFormation.paths);
    expect(step.document.labels).toEqual(withFormation.labels);
    expect(step.document.assignments).toEqual(withFormation.assignments);
    expect(applyPlayCommand(step.document, step.inverse)).toEqual(
      withFormation,
    );
  });

  it("moves a Play to a Unit whose Type it names in the same step", () => {
    const plan = reclassifyPlay(
      { ...stick, conceptSource: undefined },
      {
        unit: "defense",
        playType: { id: coverage.id, name: coverage.name },
      },
      context,
    );
    expect(plan!.needsConfirmation).toBe(false);
    const next = applyPlayCommand(stick, plan!.command);
    expect(formatClassification(next)).toBe("Defense · Coverage");
  });

  it("keeps a moved Play valid inside its Playbook envelope", () => {
    const envelope = starterPlaybookEnvelope();
    const head = envelope.plays.find(({ id }) => id === stickThunderPlay.id)!;
    const plan = reclassifyPlay(
      head,
      { unit: "defense" },
      {
        playTypes: envelope.playbook.playTypes,
        concepts: envelope.concepts,
        formations: envelope.formations,
      },
    );
    const moved = applyPlayCommand(head, plan!.command);
    const parsed = playbookEnvelopeSchema.safeParse({
      ...envelope,
      plays: envelope.plays.map((play) => (play.id === head.id ? moved : play)),
    });
    expect(parsed.success).toBe(true);
  });
});

describe("Classification of older Plays", () => {
  it("keeps a legacy Defense play at its Unit without guessing Coverage or Pressure", () => {
    const migrated = migrateLegacyPlay({
      id: "legacy_defense",
      name: "Cover 3",
      cat: "Defense",
      doc: { players: [], routes: [], labels: [] },
    });
    expect(migrated.unit).toBe("defense");
    expect(migrated.playType).toBeUndefined();
    expect(formatClassification(migrated)).toBe("Defense");
    expect(playTypeName(migrated)).toBe("Unclassified");
  });

  it("keeps a v2 Coverage play's Type and a Special play at its Unit", () => {
    const coverageV2 = migratePlayDocument({
      schemaVersion: 2,
      id: "v2_coverage",
      name: "Cover 2",
      unit: "defense",
      playType: "Coverage",
      tags: [],
      notes: "",
      fieldProfile: stickThunderPlay.fieldProfile,
      players: [],
      paths: [],
      labels: [],
    });
    expect(formatClassification(coverageV2)).toBe("Defense · Coverage");
    const specialV2 = migratePlayDocument({
      schemaVersion: 2,
      id: "v2_special",
      name: "Punt safe",
      unit: "special-teams",
      playType: "Special",
      tags: [],
      notes: "",
      fieldProfile: stickThunderPlay.fieldProfile,
      players: [],
      paths: [],
      labels: [],
    });
    // A released special-teams play reads as an unclassified offensive play
    // now that the unit is set aside (ADR 0053).
    expect(specialV2.unit).toBe("offense");
    expect(specialV2.playType).toBeUndefined();
    expect(formatClassification(specialV2)).toBe("Offense");
  });
});
