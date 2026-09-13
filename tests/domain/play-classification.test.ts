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
  playTypeName,
  playTypesForUnit,
  playbookEnvelopeSchema,
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
    expect(formatClassification({ unit: "special-teams" })).toBe(
      "Special teams",
    );
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
    expect(
      playTypesForUnit(playbook.playTypes, "special-teams").map(
        ({ name }) => name,
      ),
    ).toEqual(["Return", "Punt", "Field Goal"]);
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
      unit: "special-teams",
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
    expect(specialV2.playType).toBeUndefined();
    expect(formatClassification(specialV2)).toBe("Special teams");
  });

  it("seeds the starter Playbook's defensive example at its Unit, not as Pass", () => {
    const envelope = starterPlaybookEnvelope();
    const fireZone = envelope.plays.find(
      ({ name }) => name === "Cover 3 — Fire Zone",
    )!;
    expect(fireZone.unit).toBe("defense");
    expect(fireZone.playType).toBeUndefined();
    expect(formatClassification(fireZone)).toBe("Defense");
  });
});
