import {
  canonicalSha256,
  canonicalStringify,
  stickThunderPlay,
} from "@chalk/domain";
import { MAX_PUSH_BATCH, MAX_REVISION_BYTES } from "@chalk/contracts";
import { describe, expect, it } from "vitest";

import {
  applyPullAfter,
  applyPushBatch,
  applyResolveConflict,
} from "../../packages/sync/src/engine";
import { MemoryReplicaStore } from "../../packages/sync/src/memory-store";
import { EngineCloudReplica } from "../../packages/sync/src/replica";

const COACH = "coach_test";
const DEVICE_A = "device_a";
const DEVICE_B = "device_b";

async function playMutation(
  play = stickThunderPlay,
  extra: { idempotencyKey?: string; baseRevisionId?: string } = {},
) {
  const payloadJson = canonicalStringify(play);
  return {
    idempotencyKey: extra.idempotencyKey ?? `mutation_${play.id}_${play.name}`,
    entityKind: "play" as const,
    entityId: play.id,
    operation: "put" as const,
    ...(extra.baseRevisionId === undefined
      ? {}
      : { baseRevisionId: extra.baseRevisionId }),
    payloadJson,
    payloadHash: await canonicalSha256(play),
    clientCreatedAtMs: 1_786_000_000_000,
    schemaVersion: 1,
  };
}

describe("sync protocol engine", () => {
  it("applies a Play put and pages it from the cursor", async () => {
    const store = new MemoryReplicaStore();
    const first = await applyPushBatch(
      store,
      COACH,
      { mutations: [await playMutation()], deviceId: DEVICE_A },
      10,
    );
    expect(first.outcomes[0]?.status).toBe("applied");
    const page = await applyPullAfter(store, COACH, null, 50);
    expect(page.changes.some((change) => change.kind === "revision")).toBe(
      true,
    );
    expect(page.isDone).toBe(true);
    expect(page.headCursor).toBe(first.headCursor);
  });

  it("replays a batch with the same idempotency key", async () => {
    const store = new MemoryReplicaStore();
    const mutation = await playMutation();
    const first = await applyPushBatch(
      store,
      COACH,
      { mutations: [mutation], deviceId: DEVICE_A },
      10,
    );
    const second = await applyPushBatch(
      store,
      COACH,
      { mutations: [mutation], deviceId: DEVICE_A },
      20,
    );
    expect(second.outcomes[0]?.status).toBe("duplicate");
    expect(
      first.outcomes[0]?.status === "applied" &&
        second.outcomes[0]?.status === "duplicate",
    ).toBe(true);
    if (
      first.outcomes[0]?.status === "applied" &&
      second.outcomes[0]?.status === "duplicate"
    ) {
      expect(second.outcomes[0].revisionId).toBe(first.outcomes[0].revisionId);
    }
  });

  it("preserves both branches when base revisions diverge", async () => {
    const store = new MemoryReplicaStore();
    const seed = await applyPushBatch(
      store,
      COACH,
      { mutations: [await playMutation()], deviceId: DEVICE_A },
      10,
    );
    expect(seed.outcomes[0]?.status).toBe("applied");
    const baseRevisionId =
      seed.outcomes[0]?.status === "applied" ? seed.outcomes[0].revisionId : "";
    const fromA = await playMutation(
      { ...stickThunderPlay, name: "Device A edit" },
      { idempotencyKey: "mutation_a", baseRevisionId },
    );
    const fromB = await playMutation(
      { ...stickThunderPlay, name: "Device B edit" },
      { idempotencyKey: "mutation_b", baseRevisionId },
    );
    const a = await applyPushBatch(
      store,
      COACH,
      { mutations: [fromA], deviceId: DEVICE_A },
      20,
    );
    const b = await applyPushBatch(
      store,
      COACH,
      { mutations: [fromB], deviceId: DEVICE_B },
      30,
    );
    expect(a.outcomes[0]?.status).toBe("applied");
    expect(b.outcomes[0]?.status).toBe("conflict");
    const play = await store.getPlay(COACH, stickThunderPlay.id);
    expect(play?.name).toBe("Device A edit");
    if (b.outcomes[0]?.status === "conflict") {
      const local = await store.getRevision(
        COACH,
        b.outcomes[0].localRevisionId,
      );
      const remote = await store.getRevision(
        COACH,
        b.outcomes[0].remoteRevisionId,
      );
      expect(JSON.parse(local?.payloadJson ?? "{}")).toEqual(
        expect.objectContaining({ name: "Device B edit" }),
      );
      expect(JSON.parse(remote?.payloadJson ?? "{}")).toEqual(
        expect.objectContaining({ name: "Device A edit" }),
      );
    }
  });

  it("rejects a payload over the revision byte limit", async () => {
    const store = new MemoryReplicaStore();
    const huge = "x".repeat(MAX_REVISION_BYTES + 1);
    const result = await applyPushBatch(
      store,
      COACH,
      {
        mutations: [
          {
            idempotencyKey: "mutation_huge",
            entityKind: "play",
            entityId: stickThunderPlay.id,
            operation: "put",
            payloadJson: huge,
            payloadHash: "0".repeat(64),
            clientCreatedAtMs: 1,
            schemaVersion: 1,
          },
        ],
        deviceId: DEVICE_A,
      },
      10,
    );
    expect(result.outcomes[0]).toEqual(
      expect.objectContaining({ status: "rejected" }),
    );
  });

  it("rejects a batch larger than the push bound", async () => {
    const store = new MemoryReplicaStore();
    const mutations = await Promise.all(
      Array.from({ length: MAX_PUSH_BATCH + 1 }, (_, index) =>
        playMutation(stickThunderPlay, { idempotencyKey: `mutation_${index}` }),
      ),
    );
    await expect(
      applyPushBatch(store, COACH, { mutations, deviceId: DEVICE_A }, 10),
    ).rejects.toThrow(/at most/);
  });

  it("resumes pull from a cursor and ignores an earlier page", async () => {
    const store = new MemoryReplicaStore();
    await applyPushBatch(
      store,
      COACH,
      { mutations: [await playMutation()], deviceId: DEVICE_A },
      10,
    );
    const first = await applyPullAfter(store, COACH, null, 1);
    const rest = await applyPullAfter(store, COACH, first.nextCursor, 50);
    const overlap = rest.changes.filter((change) =>
      first.changes.some((seen) => seen.cursor === change.cursor),
    );
    expect(overlap).toEqual([]);
  });

  it("resolves a conflict by keeping the local branch", async () => {
    const store = new MemoryReplicaStore();
    const seed = await applyPushBatch(
      store,
      COACH,
      { mutations: [await playMutation()], deviceId: DEVICE_A },
      10,
    );
    const baseRevisionId =
      seed.outcomes[0]?.status === "applied" ? seed.outcomes[0].revisionId : "";
    await applyPushBatch(
      store,
      COACH,
      {
        mutations: [
          await playMutation(
            { ...stickThunderPlay, name: "A" },
            { idempotencyKey: "a", baseRevisionId },
          ),
        ],
        deviceId: DEVICE_A,
      },
      20,
    );
    const conflicted = await applyPushBatch(
      store,
      COACH,
      {
        mutations: [
          await playMutation(
            { ...stickThunderPlay, name: "B" },
            { idempotencyKey: "b", baseRevisionId },
          ),
        ],
        deviceId: DEVICE_B,
      },
      30,
    );
    expect(conflicted.outcomes[0]?.status).toBe("conflict");
    if (conflicted.outcomes[0]?.status !== "conflict") return;
    const resolved = await applyResolveConflict(
      store,
      COACH,
      {
        conflictId: conflicted.outcomes[0].conflictId,
        resolution: "local",
        deviceId: DEVICE_B,
      },
      40,
    );
    expect(resolved.resolution).toBe("local");
    const play = await store.getPlay(COACH, stickThunderPlay.id);
    expect(play?.name).toBe("B");
  });

  it("keeps coaches isolated from one another", async () => {
    const store = new MemoryReplicaStore();
    await applyPushBatch(
      store,
      "coach_one",
      { mutations: [await playMutation()], deviceId: DEVICE_A },
      10,
    );
    const other = await applyPullAfter(store, "coach_two", null, 50);
    expect(other.changes).toEqual([]);
  });

  it("exposes the engine through the CloudReplica port", async () => {
    const store = new MemoryReplicaStore();
    const replica = new EngineCloudReplica({
      store,
      coachId: () => COACH,
    });
    const pushed = await replica.pushBatch({
      mutations: [await playMutation()],
      deviceId: DEVICE_A,
    });
    expect(pushed.outcomes[0]?.status).toBe("applied");
    const head = await replica.readHead();
    expect(head).toBe(pushed.headCursor);
  });
});
