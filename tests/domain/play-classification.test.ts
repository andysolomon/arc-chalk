import {
  addCoachPlayType,
  applyPlayCommand,
  applyPlayCommandWithInverse,
  blankPlaybook,
  builtInPlayTypeDefinitions,
  describeReclassifyDrops,
  formatClassification,
  migratePlayDocument,
  playTypesForUnit,
  playbookSchema,
  reclassifyPlay,
  stickThunderConcept,
  stickThunderPlay,
  stockFormations,
  type PlayDocument,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

const playbook = blankPlaybook("playbook_classify");
const pass = builtInPlayTypeDefinitions.find(
  ({ builtInKey }) => builtInKey === "pass",
)!;

describe("Play classification vocabulary", () => {
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
});

describe("Classification of older Plays", () => {
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
