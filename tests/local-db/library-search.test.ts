import { starterPlaybookEnvelope, type PlayDocument } from "@chalk/domain";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";

import {
  createDexieLocalRepository,
  type ChalkLocalRepository,
} from "@chalk/local-db";

const FIXED_TIME = 1_786_000_100_000;

function createRepository(suffix: string): ChalkLocalRepository {
  return createDexieLocalRepository({
    databaseName: `chalk-library-${suffix}-${crypto.randomUUID()}`,
    indexedDB,
    IDBKeyRange,
    now: () => FIXED_TIME,
  });
}

describe("Playbook library local retrieval", () => {
  const repositories: ChalkLocalRepository[] = [];

  afterEach(async () => {
    await Promise.all(
      repositories.splice(0).map((repository) => repository.destroy()),
    );
  });

  function track(repository: ChalkLocalRepository): ChalkLocalRepository {
    repositories.push(repository);
    return repository;
  }

  it("lists Playbooks, Concepts, and paged Play metadata", async () => {
    const repository = track(createRepository("page"));
    await repository.open();
    const envelope = starterPlaybookEnvelope();
    await repository.savePlaybook(envelope);

    await expect(repository.listPlaybooks()).resolves.toEqual([
      expect.objectContaining({
        id: envelope.playbook.id,
        name: envelope.playbook.name,
        playCount: envelope.plays.length,
      }),
    ]);
    await expect(
      repository.listConcepts(envelope.playbook.id),
    ).resolves.toEqual([expect.objectContaining({ name: "Stick — Thunder" })]);
    const page = await repository.listPlaySummaryPage(envelope.playbook.id, {
      offset: 0,
      limit: 3,
    });
    expect(page.total).toBe(envelope.plays.length);
    expect(page.items).toHaveLength(3);
  });

  it("searches projections without loading Play revisions", async () => {
    const repository = track(createRepository("search"));
    await repository.open();
    const envelope = starterPlaybookEnvelope();
    await repository.savePlaybook(envelope);

    const hits = await repository.searchPlays({
      text: "red zone",
      filters: { playbookId: envelope.playbook.id },
    });
    expect(hits.map(({ name }) => name)).toEqual([
      "Stick — Thunder — Red zone",
      "Stick — Thunder",
    ]);
  });

  it("rebuilds search projections after derived data is deleted", async () => {
    const repository = track(createRepository("rebuild"));
    await repository.open();
    const envelope = starterPlaybookEnvelope();
    await repository.savePlaybook(envelope);
    await repository.clearDerivedData();
    await expect(repository.counts()).resolves.toEqual(
      expect.objectContaining({ searchProjections: 0, thumbnails: 0 }),
    );
    await expect(repository.searchPlays({ text: "stick" })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Stick — Thunder" }),
      ]),
    );
    expect(await repository.rebuildSearchProjections()).toBe(
      envelope.plays.length,
    );
  });

  it("saves a Concept note without rewriting Plays", async () => {
    const repository = track(createRepository("concept"));
    await repository.open();
    const envelope = starterPlaybookEnvelope();
    await repository.savePlaybook(envelope);
    const concept = envelope.concepts[0]!;
    await repository.saveConcept({
      ...concept,
      notes: "Take the flat.",
      revision: 2,
    });
    const stored = await repository.listConcepts(envelope.playbook.id);
    expect(stored[0]?.notes).toBe("Take the flat.");
    const play = await repository.getPlay(envelope.plays[0]!.id);
    expect((play?.document as PlayDocument).name).toBe("Stick — Thunder");
  });

  it("lists ten Playbooks without loading their Plays", async () => {
    const repository = track(createRepository("ten-books"));
    await repository.open();
    const base = starterPlaybookEnvelope();
    for (let index = 0; index < 10; index += 1) {
      const playbookId = `playbook_scale_${index}`;
      const source = structuredClone(base.plays[0]!);
      delete source.conceptSource;
      delete source.formationSource;
      const play = {
        ...source,
        id: `play_scale_${index}`,
        playbookId,
      };
      await repository.savePlaybook({
        ...structuredClone(base),
        playbook: {
          ...base.playbook,
          id: playbookId,
          name: `Book ${index}`,
        },
        concepts: [],
        plays: [play],
      });
    }
    const listed = await repository.listPlaybooks();
    expect(listed).toHaveLength(10);
    expect(listed.map(({ playCount }) => playCount)).toEqual(
      Array.from({ length: 10 }, () => 1),
    );
  });
});
