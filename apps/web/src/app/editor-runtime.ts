import {
  builtInPlayTypeDefinitions,
  stickThunderPlay,
  type PlaybookEnvelope,
} from "@chalk/domain";
import {
  createEditorStore,
  type EditorPersistence,
  type EditorStore,
} from "@chalk/editor";
import { createDexieLocalRepository } from "@chalk/local-db";

const DATABASE_NAME = "chalk-production-beta";
const SEED_TIME = 1_786_000_000_000;

const starterPlaybook: PlaybookEnvelope = {
  schemaVersion: 1,
  kind: "chalk-playbook",
  exportedAtMs: SEED_TIME,
  playbook: {
    schemaVersion: 1,
    id: stickThunderPlay.playbookId,
    name: "Chalk Starter Playbook",
    defaultFieldProfileId: stickThunderPlay.fieldProfile.id,
    fieldProfiles: [stickThunderPlay.fieldProfile],
    playTypes: [...builtInPlayTypeDefinitions],
    createdAtMs: SEED_TIME,
    updatedAtMs: SEED_TIME,
  },
  concepts: [],
  formations: [],
  plays: [stickThunderPlay],
};

export async function createBrowserEditorStore(): Promise<EditorStore> {
  const repository = createDexieLocalRepository({
    databaseName: DATABASE_NAME,
  });
  await repository.open();

  let storedPlay = await repository.getPlay(stickThunderPlay.id);
  if (!storedPlay) {
    await repository.savePlaybook(starterPlaybook);
    storedPlay = await repository.getPlay(stickThunderPlay.id);
  }
  if (!storedPlay) {
    throw new Error("Chalk could not initialize the starter Play.");
  }

  const persistence: EditorPersistence = {
    commitPlay: (input) => repository.commitPlay(input),
  };
  return createEditorStore({
    initialDocument: storedPlay.document,
    initialDocumentHash: storedPlay.documentHash,
    initialUndoHistory: await repository.getUndoHistory(storedPlay.id),
    persistence,
  });
}
