import {
  starterPlaybookEnvelope,
  stickThunderPlay,
  type Coordinate,
  type PlayDocument,
} from "@chalk/domain";
import {
  createEditorStore,
  fieldInteraction,
  idleFieldInteraction,
  type EditorStore,
  type FieldInteractionContext,
  type FieldInteractionEvent,
} from "@chalk/editor";
import {
  createDexieLocalRepository,
  type ChalkLocalRepository,
} from "@chalk/local-db";
import { buildRenderScene, createSvgProjection } from "@chalk/render";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { repositoryPersistence } from "./editor-runtime";

/**
 * A gesture released while the Coach's last edit is still saving goes to
 * the queue as a builder: dispatchField runs the field machine again on
 * the Play as it stands when its turn comes. That only helps if the
 * machine builds the command from the document it is given at release,
 * not from something it captured during the drag.
 */

const path = stickThunderPlay.paths.find(({ points }) => points.length > 1)!;
const projection = createSvgProjection(stickThunderPlay.fieldProfile);

function contextFor(document: PlayDocument): FieldInteractionContext {
  return {
    document,
    scene: buildRenderScene(document),
    screenScale: {
      lateralPixelsPerYard: projection.lateralPixelsPerYard,
      depthPixelsPerYard: projection.depthPixelsPerYard,
    },
    snap: { enabled: false, grid: "off" },
    tool: "select",
  };
}

/**
 * Holds the next SHA-256 the page asks for until the test lets it go, so a
 * turn can be caught waiting on its hash. `reached` settles once it asks.
 */
function holdNextHash(): {
  readonly reached: Promise<void>;
  readonly release: () => void;
} {
  const subtle = globalThis.crypto.subtle;
  const digest = subtle.digest.bind(subtle);
  let reach = () => {};
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(subtle, "digest").mockImplementationOnce(async (...args) => {
    reach();
    await held;
    return digest(...args);
  });
  return { reached, release };
}

describe("a gesture released while a coaching note is still saving", () => {
  let repository: ChalkLocalRepository;
  let store: EditorStore;

  beforeEach(async () => {
    repository = createDexieLocalRepository({
      databaseName: `chalk-gesture-during-save-${crypto.randomUUID()}`,
      indexedDB,
      IDBKeyRange,
    });
    await repository.open();
    await repository.savePlaybook(starterPlaybookEnvelope());
    const stored = await repository.getPlay(stickThunderPlay.id);
    if (!stored) throw new Error("The starter Play was not stored.");
    store = createEditorStore({
      initialDocument: stored.document,
      initialDocumentHash: stored.documentHash,
      persistence: repositoryPersistence(repository),
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await repository.destroy();
  });

  const onScreen = () =>
    store.getSnapshot().document.paths.find(({ id }) => id === path.id)!;
  const stored = async () =>
    (await repository.getPlay(stickThunderPlay.id))?.document.paths.find(
      ({ id }) => id === path.id,
    );

  /**
   * Types a note on the route, then runs the gesture's events against the
   * Play on screen while the note waits on its hash, and queues the last
   * one the way dispatchField does.
   */
  async function gestureBehindTheNote(
    events: readonly FieldInteractionEvent[],
  ): Promise<void> {
    const hash = holdNextHash();
    const typed = store.applyEdit(
      (document) => ({
        kind: "update-path",
        path: {
          ...document.paths.find(({ id }) => id === path.id)!,
          coachingNote: "eyes up",
        },
      }),
      { coalesce: true },
    );
    await hash.reached;
    let model = idleFieldInteraction;
    for (const event of events.slice(0, -1)) {
      model = fieldInteraction(
        model,
        event,
        contextFor(store.getSnapshot().document),
      ).model;
    }
    const released = model;
    const release = events.at(-1)!;
    const gesture = store.applyEdit(
      (document) =>
        fieldInteraction(released, release, contextFor(document)).command,
    );
    hash.release();
    await Promise.all([typed, gesture]);
  }

  it("keeps the note when the Coach drags a break of the route (FindingGestureDuringSave)", async () => {
    const from = path.points[1]!;
    const to: Coordinate = {
      lateralYards: from.lateralYards + 3,
      depthYards: from.depthYards + 2,
    };
    await gestureBehindTheNote([
      {
        type: "handle-down",
        handle: { kind: "node", pathId: path.id, pointIndex: 1 },
        input: { point: from, pointerId: 1 },
      },
      { type: "pointer-move", input: { point: to, pointerId: 1 } },
      { type: "pointer-up", input: { point: to, pointerId: 1 } },
    ]);

    expect(onScreen().coachingNote).toBe("eyes up");
    expect(onScreen().points[1]).not.toEqual(from);
    expect(await stored()).toEqual(onScreen());
    expect(store.getSnapshot().localSave.phase).toBe("saved");
  });
});
