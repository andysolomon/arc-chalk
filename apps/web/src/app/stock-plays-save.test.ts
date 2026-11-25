import {
  canonicalSha256,
  createStableId,
  emptyPlayDocument,
  highSchoolFieldProfile,
  stockDefensiveCalls,
  stockFormations,
  type DefensiveCall,
  type Formation,
  type PlayDocument,
  type PlayUnit,
} from "@chalk/domain";
import {
  applyDefensiveCallCommand,
  applyFormationCommand,
  createEditorStore,
  type EditorStore,
} from "@chalk/editor";
import {
  createDexieLocalRepository,
  type ChalkLocalRepository,
} from "@chalk/local-db";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { repositoryPersistence } from "./editor-runtime";

interface CallPick {
  readonly call: DefensiveCall;
  readonly withAssignments: boolean;
}

interface StockPlay {
  readonly title: string;
  readonly unit: PlayUnit;
  readonly formation?: Formation;
  readonly callPick?: CallPick;
}

interface SaveResult {
  readonly play: StockPlay;
  readonly playbookId: string;
  readonly document: PlayDocument;
  readonly refusal?: string;
}

const callPicks: readonly CallPick[] = stockDefensiveCalls.flatMap((call) => [
  { call, withAssignments: false },
  { call, withAssignments: true },
]);

const setAndCallPairs = Array.from(
  { length: Math.max(stockFormations.length, callPicks.length) },
  (_, index) => ({
    formation: stockFormations[index % stockFormations.length]!,
    callPick: callPicks[index % callPicks.length]!,
  }),
);

const callName = ({ call, withAssignments }: CallPick) =>
  `${call.formation.name}${withAssignments ? " with assignments" : ""}`;

const stockPlays: readonly StockPlay[] = [
  ...stockFormations.map((formation) => ({
    title: `offensive Play in ${formation.name}`,
    unit: "offense" as const,
    formation,
  })),
  ...callPicks.map((callPick) => ({
    title: `offensive Play under ${callName(callPick)}`,
    unit: "offense" as const,
    callPick,
  })),
  ...setAndCallPairs.map(({ formation, callPick }) => ({
    title: `offensive Play in ${formation.name} under ${callName(callPick)}`,
    unit: "offense" as const,
    formation,
    callPick,
  })),
  ...callPicks.map((callPick) => ({
    title: `defensive Play in ${callName(callPick)}`,
    unit: "defense" as const,
    callPick,
  })),
  ...stockFormations.map((formation) => ({
    title: `defensive Play against ${formation.name}`,
    unit: "defense" as const,
    formation,
  })),
  ...setAndCallPairs.map(({ formation, callPick }) => ({
    title: `defensive Play in ${callName(callPick)} against ${formation.name}`,
    unit: "defense" as const,
    formation,
    callPick,
  })),
];

function refusalOf(store: EditorStore): string | undefined {
  const { localSave } = store.getSnapshot();
  return localSave.phase === "error" ? localSave.reason : undefined;
}

async function pickSet(store: EditorStore, formation: Formation) {
  await store.applyEdit(
    (document) =>
      applyFormationCommand(document, formation, createStableId).command,
  );
}

async function pickCall(
  store: EditorStore,
  { call, withAssignments }: CallPick,
) {
  await store.applyEdit(
    (document) =>
      applyDefensiveCallCommand(document, call, createStableId, {
        withAssignments,
      }).command,
  );
}

async function save(
  store: EditorStore,
  play: StockPlay,
  index: number,
): Promise<SaveResult> {
  const playbookId = `playbook_stock_play_${index}`;
  await store.adoptPlay(
    emptyPlayDocument({
      id: `play_stock_play_${index}`,
      playbookId,
      fieldProfile: highSchoolFieldProfile,
      unit: play.unit,
      name: play.title,
    }),
  );
  const { formation, callPick } = play;
  const pickTheSet = async () => formation && pickSet(store, formation);
  const pickTheCall = async () => callPick && pickCall(store, callPick);
  const picks =
    play.unit === "offense"
      ? [pickTheSet, pickTheCall]
      : [pickTheCall, pickTheSet];
  let refusal = refusalOf(store);
  for (const pick of picks) {
    if (refusal !== undefined) break;
    await pick();
    refusal = refusalOf(store);
  }
  return {
    play,
    playbookId,
    document: store.getSnapshot().document,
    ...(refusal === undefined ? {} : { refusal }),
  };
}

function refused(
  results: readonly SaveResult[],
  include: (play: StockPlay) => boolean,
): readonly string[] {
  return results
    .filter(({ play }) => include(play))
    .flatMap(({ play, refusal }) =>
      refusal === undefined ? [] : [`${play.title}: ${refusal}`],
    );
}

describe("saving a Play built from the stock sets and defenses", () => {
  const databaseName = `chalk-stock-plays-${crypto.randomUUID()}`;
  const open = async () => {
    const repository = createDexieLocalRepository({
      databaseName,
      indexedDB,
      IDBKeyRange,
    });
    await repository.open();
    return repository;
  };
  let repository: ChalkLocalRepository;
  let results: readonly SaveResult[] = [];

  beforeAll(async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    repository = await open();
    const blank = emptyPlayDocument({
      playbookId: "playbook_stock_play_blank",
      fieldProfile: highSchoolFieldProfile,
    });
    const store = createEditorStore({
      initialDocument: blank,
      initialDocumentHash: await canonicalSha256(blank),
      initialDocumentPersisted: false,
      persistence: repositoryPersistence(repository),
    });
    const saved: SaveResult[] = [];
    for (const [index, play] of stockPlays.entries()) {
      saved.push(await save(store, play, index));
    }
    results = saved;
  }, 120_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await repository.destroy();
  });

  it("saves an offensive Play in every stock set, though no stock set is a Playbook record (0e2bce6)", () => {
    expect(
      refused(
        results,
        ({ unit, formation }) => unit === "offense" && formation !== undefined,
      ),
    ).toEqual([]);
  });

  it("saves a defensive Play whose shadow offense stands in a stock set (ea4d1e7)", () => {
    expect(
      refused(
        results,
        ({ unit, formation }) => unit === "defense" && formation !== undefined,
      ),
    ).toEqual([]);
  });

  it("saves a defensive Play in every stock defense, though no stock defense is a Playbook record", () => {
    expect(
      refused(
        results,
        ({ unit, formation }) => unit === "defense" && formation === undefined,
      ),
    ).toEqual([]);
  });

  it("saves an offensive Play whose only men are a stock shadow defense", () => {
    expect(
      refused(
        results,
        ({ unit, formation }) => unit === "offense" && formation === undefined,
      ),
    ).toEqual([]);
  });

  it("still opens every Playbook a stock Play went into, because each later save loads it first", async () => {
    const unopened: string[] = [];
    for (const { play, playbookId, document, refusal } of results) {
      if (refusal !== undefined) continue;
      try {
        const playbook = await repository.loadPlaybook(playbookId);
        if (!playbook?.plays.some(({ id }) => id === document.id)) {
          unopened.push(`${play.title}: its Playbook lost it`);
        }
      } catch (error) {
        unopened.push(`${play.title}: ${String(error)}`);
      }
    }
    expect(unopened).toEqual([]);
  }, 60_000);

  it("reads back the same stock Play after a reload, so the next edit is not refused as stale", async () => {
    repository.close();
    repository = await open();
    const changed: string[] = [];
    for (const { play, document, refusal } of results) {
      if (refusal !== undefined) continue;
      const stored = await repository.getPlay(document.id);
      if (!stored) {
        changed.push(`${play.title}: nothing was stored`);
      } else if (
        (await canonicalSha256(stored.document)) !==
        (await canonicalSha256(document))
      ) {
        changed.push(
          `${play.title}: the stored Play differs from the editor's`,
        );
      }
    }
    expect(changed).toEqual([]);
  }, 60_000);
});
