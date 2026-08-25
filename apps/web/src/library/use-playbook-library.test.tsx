import {
  stickThunderConcept,
  stickThunderFamily,
  stickThunderPlay,
  type PlayCommand,
} from "@chalk/domain";
import { createEditorStore, type EditorStore } from "@chalk/editor";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createMemoryLibrary,
  type ChalkRuntime,
  type LibrarySnapshot,
} from "../app/editor-runtime";
import { usePlaybookLibrary } from "./use-playbook-library";

function stickSnapshot(): LibrarySnapshot {
  const family = stickThunderFamily();
  return {
    playbook: {
      schemaVersion: 1,
      id: family[0]!.playbookId,
      name: "Playbook",
      defaultFieldProfileId: family[0]!.fieldProfile.id,
      fieldProfiles: [family[0]!.fieldProfile],
      playTypes: [],
      createdAtMs: 0,
      updatedAtMs: 0,
    },
    concepts: [stickThunderConcept],
    members: family.map((play, index) => ({
      playId: play.id,
      playbookId: play.playbookId,
      name: play.name,
      unit: play.unit,
      conceptId: play.conceptSource?.conceptId,
      tags: [...play.tags],
      playerRoles: [],
      assignmentText: [],
      notes: play.notes,
      documentHash: `hash_${index}`,
      fieldProfileRevision: play.fieldProfile.revision,
      updatedAtMs: 1_000 - index,
    })),
  };
}

function setup() {
  const family = stickThunderFamily();
  const editorStore: EditorStore = createEditorStore({
    initialDocument: family[0]!,
    initialDocumentHash: "hash_0",
    persistence: {
      commitPlay: (input) =>
        Promise.resolve({
          playId: input.play.id,
          documentHash: `hash_${input.play.name}`,
          committedAtMs: 100,
          mutationId: input.mutation.id,
        }),
    },
    createMutationId: () => "mutation_test",
    monotonicNow: () => 0,
  });
  const library = createMemoryLibrary(
    stickSnapshot(),
    family.map((play, index) => ({
      id: play.id,
      playbookId: play.playbookId,
      document: play,
      documentHash: `hash_${index}`,
      updatedAtMs: 1_000 - index,
    })),
  );
  const runtime = { library, editorStore } as unknown as ChalkRuntime;
  const hook = renderHook(() => usePlaybookLibrary(runtime, editorStore));
  return { family, editorStore, hook };
}

function dashZ(store: EditorStore): PlayCommand {
  const play = store.getSnapshot().document;
  const z = play.paths.find((path) => path.playerId === "z")!;
  return {
    kind: "update-path",
    path: { ...z, style: { ...z.style, line: "dashed" } },
  };
}

describe("edits made in 'This play'", () => {
  it("offer the other versions afterwards, coalesced, and send on accept", async () => {
    const { editorStore, hook, family } = setup();
    await waitFor(() => expect(hook.result.current.familySize).toBe(5));

    const first = dashZ(editorStore);
    await act(async () => {
      await editorStore.applyCommand(first);
      hook.result.current.maybeBroadcast(first);
    });
    expect(hook.result.current.offer).toEqual({ edits: 1, others: 4 });

    act(() => hook.result.current.maybeBroadcast(dashZ(editorStore)));
    expect(hook.result.current.offer).toEqual({ edits: 2, others: 4 });

    // Nothing has gone anywhere yet, and a formation edit never offers.
    act(() => {
      hook.result.current.maybeBroadcast({ kind: "set-notes", notes: "x" });
    });
    expect(hook.result.current.offer?.edits).toBe(2);

    act(() => hook.result.current.acceptOffer());
    expect(hook.result.current.offer).toBeUndefined();
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(hook.result.current.report).toMatch(/^Applied to \d of 5/);
    expect(editorStore.getSnapshot().document.id).toBe(family[0]!.id);
  });

  it("can be waved off, and the offer expires on its own", async () => {
    const { editorStore, hook } = setup();
    await waitFor(() => expect(hook.result.current.familySize).toBe(5));
    act(() => hook.result.current.maybeBroadcast(dashZ(editorStore)));
    expect(hook.result.current.offer).toBeDefined();
    act(() => hook.result.current.dropOffer());
    expect(hook.result.current.offer).toBeUndefined();
  });
});

describe("an armed 'All versions' scope", () => {
  it("does not outlive the concept it was aimed at", async () => {
    const { editorStore, hook } = setup();
    await waitFor(() => expect(hook.result.current.familySize).toBe(5));

    act(() => hook.result.current.setScope("concept"));
    expect(hook.result.current.scopeBadge).toBe("All 5");
    expect(hook.result.current.conceptName).toBe("Stick — Thunder");

    // A play with no concept at all: the mode must fall back to this play.
    await act(async () => {
      await editorStore.openStoredPlay({
        document: { ...stickThunderPlay, id: "play_loose" },
        documentHash: "hash_loose",
        undoHistory: undefined,
        versions: [],
      });
    });
    await waitFor(() => expect(hook.result.current.scope).toBe("play"));
    expect(hook.result.current.scopeBadge).toBeUndefined();
    expect(hook.result.current.pickIds).toEqual([]);
  });

  it("narrows to a picked set through the tree's dots and back to all", async () => {
    const { family, hook } = setup();
    await waitFor(() => expect(hook.result.current.familySize).toBe(5));
    act(() => hook.result.current.setScope("concept"));
    act(() => hook.result.current.togglePick(family[4]!.id));
    expect(hook.result.current.scope).toBe("pick");
    expect(hook.result.current.scopeBadge).toBe("4 of 5");
    act(() => hook.result.current.togglePick(family[4]!.id));
    expect(hook.result.current.scope).toBe("concept");
    expect(hook.result.current.scopeBadge).toBe("All 5");
  });
});
