import { emptyPlayDocument, highSchoolFieldProfile } from "@chalk/domain";
import { describe, expect, it, vi } from "vitest";

import { createEditorStore, type EditorPersistence } from "./editor-store";

const blank = emptyPlayDocument({
  playbookId: "playbook_test",
  fieldProfile: highSchoolFieldProfile,
});

function persistence(
  commitPlay: EditorPersistence["commitPlay"],
): EditorPersistence {
  return { commitPlay };
}

const succeed: EditorPersistence["commitPlay"] = (input) =>
  Promise.resolve({
    playId: input.play.id,
    documentHash: "hash_saved",
    committedAtMs: 1,
  });

describe("createEditorStore", () => {
  it("commits a never-written boot document without expecting it on disk", async () => {
    // A blank boot edits a Play the repository has never seen (issue #97);
    // asking the repository to find its hash first fails every first save.
    const commitPlay = vi.fn(succeed);
    const store = createEditorStore({
      initialDocument: blank,
      initialDocumentHash: "hash_unwritten",
      initialDocumentPersisted: false,
      persistence: persistence(commitPlay),
      monotonicNow: () => 0,
    });

    const outcome = await store.applyCommand({
      kind: "set-play-name",
      name: "Doubles",
    });

    expect(outcome.ok).toBe(true);
    expect(commitPlay).toHaveBeenCalledTimes(1);
    expect(commitPlay.mock.calls[0]?.[0]).not.toHaveProperty(
      "expectedDocumentHash",
    );
    expect(store.getSnapshot().localSave.phase).toBe("saved");

    // Once written, later commits guard against a stale copy as before.
    await store.applyCommand({ kind: "set-play-name", name: "Doubles Rt" });
    expect(commitPlay.mock.calls[1]?.[0]).toMatchObject({
      expectedDocumentHash: "hash_saved",
    });
  });

  it("still guards a stored document by default", async () => {
    const commitPlay = vi.fn(succeed);
    const store = createEditorStore({
      initialDocument: blank,
      initialDocumentHash: "hash_stored",
      persistence: persistence(commitPlay),
      monotonicNow: () => 0,
    });
    await store.applyCommand({ kind: "set-play-name", name: "Doubles" });
    expect(commitPlay.mock.calls[0]?.[0]).toMatchObject({
      expectedDocumentHash: "hash_stored",
    });
  });

  it("keeps the draft and names the reason when the repository fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let attempts = 0;
    const store = createEditorStore({
      initialDocument: blank,
      initialDocumentHash: "hash_stored",
      persistence: persistence((input) => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error("QuotaExceededError: no room"))
          : succeed(input);
      }),
      monotonicNow: () => 0,
    });

    const failed = await store.applyCommand({
      kind: "set-play-name",
      name: "Doubles",
    });
    expect(failed.ok).toBe(false);
    const snapshot = store.getSnapshot();
    expect(snapshot.document.name).toBe("Doubles");
    expect(snapshot.localSave).toMatchObject({
      phase: "error",
      reason: "QuotaExceededError: no room",
    });
    expect(consoleError).toHaveBeenCalledOnce();

    const retried = await store.retryLocalSave();
    expect(retried?.ok).toBe(true);
    expect(store.getSnapshot().localSave.phase).toBe("saved");
    expect(store.getSnapshot().document.name).toBe("Doubles");
    consoleError.mockRestore();
  });
});
