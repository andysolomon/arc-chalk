import {
  UNDO_HISTORY_LIMITS,
  applyPlayCommand,
  boundUndoHistory,
  createUndoHistory,
  hashPlayDocument,
  type PlayCommand,
  type PlayDocument,
  type UndoEntry,
  type UndoHistory,
} from "@chalk/domain";
import {
  UNDO_COALESCE_WINDOW_MS,
  recordUndoEntry,
  redoStep,
  restoreUndoHistory,
  sealUndoCoalescing,
  undoAvailability,
  undoStep,
} from "@chalk/editor";
import { offensiveStickThunderPlay } from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

const START_MS = 1_786_000_000_000;

async function renameTo(
  play: PlayDocument,
  name: string,
): Promise<{
  readonly document: PlayDocument;
  readonly forward: PlayCommand;
  readonly inverse: PlayCommand;
  readonly beforeHash: string;
  readonly afterHash: string;
}> {
  const forward: PlayCommand = { kind: "set-play-name", name };
  const document = applyPlayCommand(play, forward);
  return {
    document,
    forward,
    inverse: { kind: "set-play-name", name: play.name },
    beforeHash: await hashPlayDocument(play),
    afterHash: await hashPlayDocument(document),
  };
}

async function historyWithRename(name = "Stick — Alert"): Promise<{
  readonly history: UndoHistory;
  readonly document: PlayDocument;
  readonly beforeHash: string;
  readonly afterHash: string;
}> {
  const play = offensiveStickThunderPlay;
  const edit = await renameTo(play, name);
  const history = recordUndoEntry(createUndoHistory(play.id, START_MS), {
    id: "undo_1",
    createdAtMs: START_MS,
    beforeHash: edit.beforeHash,
    afterHash: edit.afterHash,
    forward: edit.forward,
    inverse: edit.inverse,
  });
  return {
    history,
    document: edit.document,
    beforeHash: edit.beforeHash,
    afterHash: edit.afterHash,
  };
}

function syntheticEntry(index: number, createdAtMs: number): UndoEntry {
  return {
    id: `undo_${index}`,
    label: "Rename Play",
    createdAtMs,
    beforeHash: `hash_${index}`,
    afterHash: `hash_${index + 1}`,
    forward: { kind: "set-play-name", name: `Play ${index + 1}` },
    inverse: { kind: "set-play-name", name: `Play ${index}` },
  };
}

describe("bounded persistent undo history", () => {
  it("records a committed edit and names it for the Coach", async () => {
    const { history } = await historyWithRename();

    expect(history.undo).toHaveLength(1);
    expect(history.undo[0]?.label).toBe("Rename Play");
    expect(history.encodedByteLength).toBeGreaterThan(0);
  });

  it("ignores an edit that leaves the Play unchanged", () => {
    const history = recordUndoEntry(
      createUndoHistory(offensiveStickThunderPlay.id, START_MS),
      {
        id: "undo_noop",
        createdAtMs: START_MS,
        beforeHash: "hash_same",
        afterHash: "hash_same",
        forward: { kind: "batch", commands: [] },
        inverse: { kind: "batch", commands: [] },
      },
    );

    expect(history.undo).toEqual([]);
  });

  it("coalesces consecutive edits to one field and keeps the earliest inverse", async () => {
    const play = offensiveStickThunderPlay;
    const first = await renameTo(play, "M");
    const second = await renameTo(first.document, "Me");
    const third = await renameTo(second.document, "Mesh");

    let history = createUndoHistory(play.id, START_MS);
    for (const [index, edit] of [first, second, third].entries()) {
      history = recordUndoEntry(history, {
        id: `undo_${index}`,
        createdAtMs: START_MS + index * 200,
        beforeHash: edit.beforeHash,
        afterHash: edit.afterHash,
        forward: edit.forward,
        inverse: edit.inverse,
        coalesceKey: "play-name",
      });
    }

    expect(history.undo).toHaveLength(1);
    expect(history.undo[0]?.beforeHash).toBe(first.beforeHash);
    expect(history.undo[0]?.afterHash).toBe(third.afterHash);
    expect(history.undo[0]?.inverse).toEqual({
      kind: "set-play-name",
      name: play.name,
    });

    const undone = await undoStep(
      history,
      third.document,
      third.afterHash,
      START_MS,
    );
    expect(undone.status).toBe("applied");
    if (undone.status !== "applied") return;
    expect(undone.document.name).toBe(play.name);
  });

  it("stops coalescing when the Coach pauses, blurs, or moves to another field", async () => {
    const play = offensiveStickThunderPlay;
    const first = await renameTo(play, "Mesh");
    const second = await renameTo(first.document, "Mesh — Alert");
    const record = (
      history: UndoHistory,
      edit: typeof second,
      createdAtMs: number,
      coalesceKey: string,
    ): UndoHistory =>
      recordUndoEntry(history, {
        id: `undo_${createdAtMs}`,
        createdAtMs,
        beforeHash: edit.beforeHash,
        afterHash: edit.afterHash,
        forward: edit.forward,
        inverse: edit.inverse,
        coalesceKey,
      });

    const base = record(
      createUndoHistory(play.id, START_MS),
      first,
      START_MS,
      "play-name",
    );

    const paused = record(
      base,
      second,
      START_MS + UNDO_COALESCE_WINDOW_MS + 1,
      "play-name",
    );
    const blurred = record(
      sealUndoCoalescing(base),
      second,
      START_MS + 10,
      "play-name",
    );
    const otherField = record(base, second, START_MS + 10, "play-notes");
    const stillTyping = record(base, second, START_MS + 10, "play-name");

    expect(paused.undo).toHaveLength(2);
    expect(blurred.undo).toHaveLength(2);
    expect(otherField.undo).toHaveLength(2);
    expect(stillTyping.undo).toHaveLength(1);
  });

  it("clears only this Play's redo stack when a new edit follows an undo", async () => {
    const { history, document, afterHash } = await historyWithRename();
    const undone = await undoStep(history, document, afterHash, START_MS);
    expect(undone.status).toBe("applied");
    if (undone.status !== "applied") return;
    expect(undone.history.redo).toHaveLength(1);

    const next = await renameTo(undone.document, "Different branch");
    const recorded = recordUndoEntry(undone.history, {
      id: "undo_branch",
      createdAtMs: START_MS + 5,
      beforeHash: next.beforeHash,
      afterHash: next.afterHash,
      forward: next.forward,
      inverse: next.inverse,
    });

    expect(recorded.redo).toEqual([]);
    expect(recorded.undo).toHaveLength(1);
  });

  it("keeps at most one hundred commands, dropping the oldest", () => {
    let history = createUndoHistory(offensiveStickThunderPlay.id, START_MS);
    for (
      let index = 0;
      index < UNDO_HISTORY_LIMITS.maxEntries + 15;
      index += 1
    ) {
      history = recordUndoEntry(history, {
        ...syntheticEntry(index, START_MS + index),
        forward: syntheticEntry(index, START_MS).forward,
        inverse: syntheticEntry(index, START_MS).inverse,
      });
    }

    expect(history.undo).toHaveLength(UNDO_HISTORY_LIMITS.maxEntries);
    expect(history.undo[0]?.id).toBe("undo_15");
    expect(history.undo.at(-1)?.id).toBe("undo_114");
  });

  it("keeps at most twenty mebibytes of encoded history", () => {
    const wall = "x".repeat(1024 * 1024);
    const bulky = Array.from({ length: 25 }, (_unused, index) => ({
      ...syntheticEntry(index, START_MS + index),
      forward: { kind: "set-notes" as const, notes: `${index}${wall}` },
      inverse: { kind: "set-notes" as const, notes: "" },
    }));
    const history = boundUndoHistory(
      {
        ...createUndoHistory(offensiveStickThunderPlay.id, START_MS),
        undo: bulky,
      },
      START_MS,
    );

    expect(history.encodedByteLength).toBeLessThanOrEqual(
      UNDO_HISTORY_LIMITS.maxEncodedBytes,
    );
    expect(history.undo.length).toBeLessThan(bulky.length);
    expect(history.undo.at(-1)?.id).toBe("undo_24");
  });

  it("keeps at most seven days of history", () => {
    const nowMs = START_MS + UNDO_HISTORY_LIMITS.maxAgeMs + 60_000;
    const history = boundUndoHistory(
      {
        ...createUndoHistory(offensiveStickThunderPlay.id, START_MS),
        undo: [syntheticEntry(0, START_MS), syntheticEntry(1, nowMs - 30_000)],
        redo: [syntheticEntry(2, START_MS + 10)],
      },
      nowMs,
    );

    expect(history.undo.map(({ id }) => id)).toEqual(["undo_1"]);
    expect(history.redo).toEqual([]);
  });

  it("offers a step only for the exact Play the entry expects", async () => {
    const { history, beforeHash, afterHash } = await historyWithRename();

    expect(undoAvailability(history, afterHash)).toEqual(
      expect.objectContaining({
        canUndo: true,
        canRedo: false,
        undoLabel: "Rename Play",
        undoDepth: 1,
      }),
    );
    expect(undoAvailability(history, beforeHash)).toEqual(
      expect.objectContaining({ canUndo: false, canRedo: false }),
    );
  });

  it("quarantines the stored history when the Play changed outside it", async () => {
    const { history, document } = await historyWithRename();
    const result = await undoStep(
      history,
      document,
      "hash_from_a_restored_revision",
      START_MS,
    );

    expect(result.status).toBe("quarantined");
    if (result.status !== "quarantined") return;
    expect(result.history.undo).toEqual([]);
    expect(result.history.redo).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.reason).toMatch(/changed outside its history/);
  });

  it("quarantines an entry whose replay does not reproduce the expected Play", async () => {
    const { history, document, afterHash } = await historyWithRename();
    const tampered: UndoHistory = {
      ...history,
      undo: [
        {
          ...history.undo[0]!,
          inverse: { kind: "set-play-name", name: "Not what was there" },
        },
      ],
    };

    const result = await undoStep(tampered, document, afterHash, START_MS);

    expect(result.status).toBe("quarantined");
    if (result.status !== "quarantined") return;
    expect(result.reason).toMatch(/did not reproduce/);
  });

  it("quarantines an entry Chalk can no longer replay", async () => {
    const { history, document, afterHash } = await historyWithRename();
    const tampered: UndoHistory = {
      ...history,
      undo: [
        {
          ...history.undo[0]!,
          inverse: { kind: "remove-players", playerIds: ["never-existed"] },
        },
      ],
    };

    const result = await undoStep(tampered, document, afterHash, START_MS);

    expect(result.status).toBe("quarantined");
    if (result.status !== "quarantined") return;
    expect(result.reason).toMatch(/could not replay/);
  });

  it("reports an empty history rather than guessing", async () => {
    const play = offensiveStickThunderPlay;
    const empty = createUndoHistory(play.id, START_MS);

    await expect(
      undoStep(empty, play, await hashPlayDocument(play), START_MS),
    ).resolves.toEqual({ status: "empty" });
    await expect(
      redoStep(empty, play, await hashPlayDocument(play), START_MS),
    ).resolves.toEqual({ status: "empty" });
  });

  it("redoes the edit it undid and returns to the same Play", async () => {
    const { history, document, afterHash, beforeHash } =
      await historyWithRename();
    const undone = await undoStep(history, document, afterHash, START_MS);
    expect(undone.status).toBe("applied");
    if (undone.status !== "applied") return;

    const redone = await redoStep(
      undone.history,
      undone.document,
      beforeHash,
      START_MS,
    );
    expect(redone.status).toBe("applied");
    if (redone.status !== "applied") return;
    expect(redone.document.name).toBe("Stick — Alert");
    expect(redone.history.undo).toHaveLength(1);
    expect(redone.history.redo).toEqual([]);
    expect(await hashPlayDocument(redone.document)).toBe(afterHash);
  });

  it("discards a stored history that no longer parses or belongs elsewhere", async () => {
    const { history } = await historyWithRename();
    const playId = offensiveStickThunderPlay.id;

    expect(restoreUndoHistory(playId, history, START_MS).undo).toHaveLength(1);
    expect(restoreUndoHistory(playId, undefined, START_MS).undo).toEqual([]);
    expect(
      restoreUndoHistory(playId, { schemaVersion: 9, playId }, START_MS).undo,
    ).toEqual([]);
    expect(
      restoreUndoHistory("play_somewhere_else", history, START_MS).undo,
    ).toEqual([]);
    expect(
      restoreUndoHistory(
        playId,
        history,
        START_MS + UNDO_HISTORY_LIMITS.maxAgeMs + 1,
      ).undo,
    ).toEqual([]);
  });
});
