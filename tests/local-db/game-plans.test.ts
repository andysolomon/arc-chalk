import {
  addCalls,
  assignCallCode,
  createGamePlan,
  prepareGamePlan,
  renameGamePlan,
  type GamePlan,
} from "@chalk/domain";
import {
  createDexieLocalRepository,
  type ChalkLocalRepository,
} from "@chalk/local-db";
import {
  offensivePlaybookGolden,
  releasedPlayDocumentV1,
} from "@chalk/test-fixtures";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";

import { writeReleasedDatabase } from "./released-database-fixtures";

const FIXED_TIME = 1_786_000_100_000;
const playbook = offensivePlaybookGolden.playbook;
const plays = offensivePlaybookGolden.plays;

let counter = 0;
const createId = (prefix: string) => `${prefix}_${(counter += 1)}`;

describe("Game Plans on the device", () => {
  const repositories: ChalkLocalRepository[] = [];

  afterEach(async () => {
    await Promise.all(
      repositories.splice(0).map((repository) => repository.destroy()),
    );
  });

  function open(now: () => number = () => FIXED_TIME): ChalkLocalRepository {
    const repository = createDexieLocalRepository({
      databaseName: `chalk-game-plans-${crypto.randomUUID()}`,
      indexedDB,
      IDBKeyRange,
      now,
    });
    repositories.push(repository);
    return repository;
  }

  /** A plan with two calls, one coded, and a prepared revision behind it. */
  async function seeded(repository: ChalkLocalRepository) {
    await repository.savePlaybook(offensivePlaybookGolden);
    let plan = createGamePlan({
      playbookId: playbook.id,
      name: "Week 3",
      unit: "offense",
      nowMs: FIXED_TIME,
      sections: ["Openers"],
      createId,
    });
    const added = addCalls(
      plan,
      plays.map(({ id }) => id),
      { nowMs: FIXED_TIME + 1, sectionId: plan.sections[0]!.id, createId },
    );
    plan = added.plan;
    const coded = assignCallCode(plan, added.callIds[0]!, "12", FIXED_TIME + 2);
    if (!coded.ok) throw new Error(coded.reason);
    plan = coded.plan;
    const sources = new Map(
      await Promise.all(
        plays.map(async (play) => {
          const stored = await repository.getPlay(play.id);
          return [
            play.id,
            stored
              ? { document: stored.document, documentHash: stored.documentHash }
              : undefined,
          ] as const;
        }),
      ),
    );
    const prepared = prepareGamePlan(plan, sources, {
      nowMs: FIXED_TIME + 3,
      label: "Thursday",
      createId,
    });
    await repository.saveGamePlanRevision(prepared.revision);
    await repository.saveGamePlan(prepared.plan);
    return { plan: prepared.plan, revision: prepared.revision };
  }

  it("saves, lists newest first, and reads back a plan", async () => {
    const repository = open();
    const { plan } = await seeded(repository);
    const older = createGamePlan({
      playbookId: playbook.id,
      name: "Week 1",
      unit: "defense",
      nowMs: FIXED_TIME - 10_000,
      createId,
    });
    await repository.saveGamePlan(older);
    const elsewhere = createGamePlan({
      playbookId: "playbook_other",
      name: "Someone else's",
      unit: "offense",
      nowMs: FIXED_TIME + 50_000,
      createId,
    });
    await repository.saveGamePlan(elsewhere);

    const listed = await repository.listGamePlans(playbook.id);
    expect(listed.map(({ name }) => name)).toEqual(["Week 3", "Week 1"]);
    await expect(repository.getGamePlan(plan.id)).resolves.toEqual(plan);
    await expect(repository.getGamePlan("nope")).resolves.toBeUndefined();

    const renamed = renameGamePlan(plan, "Week 3 — Central", FIXED_TIME + 9);
    await repository.saveGamePlan(renamed);
    await expect(repository.getGamePlan(plan.id)).resolves.toMatchObject({
      name: "Week 3 — Central",
      calls: plan.calls,
    });
  });

  it("refuses a plan the schema rejects", async () => {
    const repository = open();
    const { plan } = await seeded(repository);
    // Two calls with one id: the schema refuses it before it can be stored.
    const clashing: GamePlan = {
      ...plan,
      calls: [...plan.calls, { ...plan.calls[0]!, code: "" }],
    };
    await expect(repository.saveGamePlan(clashing)).rejects.toThrow();
    await expect(repository.getGamePlan(plan.id)).resolves.toEqual(plan);
  });

  it("keeps a prepared revision immutable and lists them newest first", async () => {
    const repository = open();
    const { plan, revision } = await seeded(repository);
    await expect(repository.getGamePlanRevision(revision.id)).resolves.toEqual(
      revision,
    );

    await repository.saveGamePlanRevision({
      ...revision,
      label: "Rewritten by a second save",
    });
    await expect(
      repository.getGamePlanRevision(revision.id),
    ).resolves.toMatchObject({ label: "Thursday" });

    const later = prepareGamePlan(
      plan,
      new Map(
        revision.plays.map((frozen) => [
          frozen.playId,
          { document: frozen.document, documentHash: frozen.documentHash },
        ]),
      ),
      { nowMs: FIXED_TIME + 60_000, label: "Friday", createId },
    );
    await repository.saveGamePlanRevision(later.revision);
    const summaries = await repository.listGamePlanRevisions(plan.id);
    expect(summaries.map(({ label }) => label)).toEqual(["Friday", "Thursday"]);
    expect(summaries[0]).toMatchObject({
      planId: plan.id,
      callCount: plays.length,
      missingCount: 0,
    });
    expect(summaries[0]).not.toHaveProperty("plays");
  });

  it("deletes a plan together with every revision prepared from it", async () => {
    const repository = open();
    const { plan, revision } = await seeded(repository);
    const other = createGamePlan({
      playbookId: playbook.id,
      name: "Keep me",
      unit: "offense",
      nowMs: FIXED_TIME,
      createId,
    });
    await repository.saveGamePlan(other);

    await expect(repository.counts()).resolves.toEqual(
      expect.objectContaining({ gamePlans: 2, gamePlanRevisions: 1 }),
    );
    await repository.deleteGamePlan(plan.id);
    await expect(repository.getGamePlan(plan.id)).resolves.toBeUndefined();
    await expect(
      repository.getGamePlanRevision(revision.id),
    ).resolves.toBeUndefined();
    await expect(repository.listGamePlanRevisions(plan.id)).resolves.toEqual(
      [],
    );
    await expect(repository.counts()).resolves.toEqual(
      expect.objectContaining({ gamePlans: 1, gamePlanRevisions: 0 }),
    );
  });

  it("carries plans and prepared revisions through a backup", async () => {
    const source = open();
    const { plan, revision } = await seeded(source);
    const payload = await source.exportBackup();
    expect(payload.gamePlans).toEqual([plan]);
    expect(payload.gamePlanRevisions).toEqual([revision]);

    const replacement = open();
    const result = await replacement.importBackup(payload, {
      mode: "replace",
    });
    expect(result).toEqual(
      expect.objectContaining({ gamePlans: 1, gamePlanRevisions: 1 }),
    );
    await expect(replacement.getGamePlan(plan.id)).resolves.toEqual(plan);
    await expect(replacement.getGamePlanRevision(revision.id)).resolves.toEqual(
      revision,
    );
    await expect(replacement.listGamePlanRevisions(plan.id)).resolves.toEqual([
      expect.objectContaining({ id: revision.id }),
    ]);
  });

  it("merges a backup without overwriting newer local work or a stored revision", async () => {
    const source = open();
    const { plan, revision } = await seeded(source);
    const payload = await source.exportBackup();

    // The Coach kept working after the backup was written.
    const newer = renameGamePlan(
      plan,
      "Week 3 — edited since",
      FIXED_TIME + 99_000,
    );
    await source.saveGamePlan(newer);
    const tampered = {
      ...payload,
      gamePlanRevisions: payload.gamePlanRevisions!.map((entry) => ({
        ...entry,
        label: "Relabelled by an import",
      })),
    };
    const result = await source.importBackup(tampered);
    expect(result).toEqual(
      expect.objectContaining({ gamePlans: 0, gamePlanRevisions: 0 }),
    );
    await expect(source.getGamePlan(plan.id)).resolves.toMatchObject({
      name: "Week 3 — edited since",
    });
    await expect(
      source.getGamePlanRevision(revision.id),
    ).resolves.toMatchObject({ label: "Thursday" });

    // An older local plan is brought up to the backup's copy.
    const older = renameGamePlan(plan, "Week 3 — stale", FIXED_TIME - 99_000);
    await source.saveGamePlan({ ...older, createdAtMs: FIXED_TIME - 100_000 });
    const merged = await source.importBackup(payload);
    expect(merged.gamePlans).toBe(1);
    await expect(source.getGamePlan(plan.id)).resolves.toEqual(plan);
  });

  it("reads a backup written before Game Plans existed", async () => {
    const source = open();
    await source.savePlaybook(offensivePlaybookGolden);
    const payload = await source.exportBackup();
    const { gamePlans, gamePlanRevisions, ...older } = payload;
    expect(gamePlans).toEqual([]);
    expect(gamePlanRevisions).toEqual([]);

    const replacement = open();
    const result = await replacement.importBackup(older, { mode: "replace" });
    expect(result).toEqual(
      expect.objectContaining({
        plays: plays.length,
        gamePlans: 0,
        gamePlanRevisions: 0,
      }),
    );
    await expect(replacement.listGamePlans(playbook.id)).resolves.toEqual([]);
  });

  it("opens a version-1 device database and adds the plan stores beside its Plays", async () => {
    const databaseName = `chalk-released-v1-${crypto.randomUUID()}`;
    await writeReleasedDatabase(indexedDB, {
      databaseName,
      version: 1,
      records: {
        playbooks: [playbook],
        plays: [
          {
            id: releasedPlayDocumentV1.id,
            playbookId: playbook.id,
            document: releasedPlayDocumentV1,
            documentHash: "hash-a-previous-release-computed-for-v1",
            updatedAtMs: FIXED_TIME,
          },
        ],
      },
    });
    const repository = createDexieLocalRepository({
      databaseName,
      indexedDB,
      IDBKeyRange,
      now: () => FIXED_TIME,
    });
    repositories.push(repository);

    await expect(repository.listGamePlans(playbook.id)).resolves.toEqual([]);
    const kept = await repository.getPlay(releasedPlayDocumentV1.id);
    expect(kept?.document.name).toBe(releasedPlayDocumentV1.name);

    const plan = createGamePlan({
      playbookId: playbook.id,
      name: "First plan on an upgraded device",
      unit: "offense",
      nowMs: FIXED_TIME,
      createId,
    });
    await repository.saveGamePlan(plan);
    await expect(repository.listGamePlans(playbook.id)).resolves.toEqual([
      plan,
    ]);
    await expect(repository.counts()).resolves.toEqual(
      expect.objectContaining({ plays: 1, gamePlans: 1, gamePlanRevisions: 0 }),
    );
  });
});
