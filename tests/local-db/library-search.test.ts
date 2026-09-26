import { starterPlaybookEnvelope } from "@chalk/domain";
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
    expect(play?.document).toEqual(envelope.plays[0]);
  });
});
