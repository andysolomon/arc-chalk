import { canonicalStringify } from "@chalk/domain";
import {
  createSyncOrchestrator,
  EngineCloudReplica,
  MemoryIdentity,
  MemoryReplicaStore,
  UnauthenticatedError,
} from "@chalk/sync";
import {
  createDexieLocalRepository,
  type ChalkLocalRepository,
} from "@chalk/local-db";
import { offensivePlaybookGolden } from "@chalk/test-fixtures";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

const COACH = "coach_sync_tests";
const FIXED = 1_786_000_200_000;

async function openDevice(suffix: string) {
  const repository = createDexieLocalRepository({
    databaseName: `chalk-sync-${suffix}-${crypto.randomUUID()}`,
    indexedDB,
    IDBKeyRange,
    now: () => FIXED,
  });
  await repository.open();
  await repository.savePlaybook(offensivePlaybookGolden);
  return repository;
}

function identityFor(coachId = COACH) {
  return new MemoryIdentity({
    status: "signed_in",
    identity: { coachId, email: "coach@example.com" },
  });
}

async function commitName(
  repository: ChalkLocalRepository,
  name: string,
  mutationId: string,
) {
  const play = {
    ...structuredClone(offensivePlaybookGolden.plays[0]!),
    name,
  };
  await repository.commitPlay({
    play,
    mutation: { id: mutationId },
  });
  return play;
}

describe("durable sync orchestrator", () => {
  it("keeps mutations queued while offline and drains them on reconnect", async () => {
    const repository = await openDevice("offline");
    const store = new MemoryReplicaStore();
    const identity = identityFor();
    let online = false;
    const replica = new EngineCloudReplica({
      store,
      coachId: () => COACH,
    });
    const orchestrator = await createSyncOrchestrator({
      repository,
      replica,
      identity,
      debounceMs: 0,
      now: () => FIXED,
      online: () => online,
    });
    await commitName(repository, "Offline edit", "mutation_offline");
    const offline = await orchestrator.syncNow();
    expect(offline.status).toBe("offline");
    expect(offline.pendingCount).toBeGreaterThan(0);
    expect(
      (await repository.getPlay(offensivePlaybookGolden.plays[0]!.id))?.document
        .name,
    ).toBe("Offline edit");

    online = true;
    const synced = await orchestrator.syncNow();
    expect(synced.status).toBe("synced");
    expect(synced.pendingCount).toBe(0);
    expect(await repository.readSyncMutationBatch(10)).toEqual([]);
    await repository.destroy();
  });

  it("replays a batch that the replica already applied", async () => {
    const repository = await openDevice("replay");
    const store = new MemoryReplicaStore();
    const identity = identityFor();
    const replica = new EngineCloudReplica({
      store,
      coachId: () => COACH,
    });
    const orchestrator = await createSyncOrchestrator({
      repository,
      replica,
      identity,
      debounceMs: 0,
      now: () => FIXED,
    });
    const play = await commitName(repository, "Replay", "mutation_replay");
    const queued = await repository.readSyncMutationBatch(10);
    const mutation = queued[0]!;
    const envelope = {
      idempotencyKey: mutation.id,
      entityKind: mutation.entityKind,
      entityId: mutation.entityId,
      operation: mutation.operation,
      payloadJson: canonicalStringify(mutation.payload),
      payloadHash: mutation.payloadHash,
      clientCreatedAtMs: mutation.createdAtMs,
      schemaVersion: 1,
    };
    await replica.pushBatch({
      mutations: [envelope],
      deviceId: "device_replay",
    });
    await replica.pushBatch({
      mutations: [envelope],
      deviceId: "device_replay",
    });
    const snapshot = await orchestrator.syncNow();
    expect(snapshot.status).toBe("synced");
    expect(await repository.readSyncMutationBatch(10)).toEqual([]);
    expect(play.name).toBe("Replay");
    await repository.destroy();
  });

  it("marks the session revoked without deleting local work", async () => {
    const repository = await openDevice("revoked");
    const store = new MemoryReplicaStore();
    const identity = identityFor();
    const replica = new EngineCloudReplica({
      store,
      coachId: () => COACH,
      authenticated: () => false,
    });
    const orchestrator = await createSyncOrchestrator({
      repository,
      replica,
      identity,
      debounceMs: 0,
      now: () => FIXED,
    });
    await commitName(repository, "Keep me", "mutation_revoked");
    const snapshot = await orchestrator.syncNow();
    expect(snapshot.status).toBe("revoked");
    expect(
      (await repository.getPlay(offensivePlaybookGolden.plays[0]!.id))?.document
        .name,
    ).toBe("Keep me");
    await expect(replica.pullAfter(null, 10)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    await repository.destroy();
  });

  it("converges two devices and preserves both branches on divergence", async () => {
    const store = new MemoryReplicaStore();
    const deviceA = await openDevice("two-a");
    const deviceB = await openDevice("two-b");
    const identityA = identityFor();
    const identityB = identityFor();
    const replicaA = new EngineCloudReplica({ store, coachId: () => COACH });
    const replicaB = new EngineCloudReplica({ store, coachId: () => COACH });
    const orchestratorA = await createSyncOrchestrator({
      repository: deviceA,
      replica: replicaA,
      identity: identityA,
      debounceMs: 0,
      now: () => FIXED,
    });
    const orchestratorB = await createSyncOrchestrator({
      repository: deviceB,
      replica: replicaB,
      identity: identityB,
      debounceMs: 0,
      now: () => FIXED + 1,
    });

    await commitName(deviceA, "From A", "mutation_a");
    await expect(orchestratorA.syncNow()).resolves.toEqual(
      expect.objectContaining({ status: "synced" }),
    );

    await commitName(deviceB, "From B", "mutation_b");
    const conflicted = await orchestratorB.syncNow();
    expect(conflicted.status).toBe("conflict");
    const conflicts = await orchestratorB.listConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.playName).toBeDefined();

    await orchestratorB.resolveConflict(conflicts[0]!.id, "keep-both");
    const leftover = await orchestratorB.listConflicts();
    expect(leftover).toEqual([]);
    const original = await deviceB.getPlay(
      offensivePlaybookGolden.plays[0]!.id,
    );
    expect(original?.document.name).toBe("From A");
    const counts = await deviceB.counts();
    expect(counts.plays).toBeGreaterThan(1);
    await deviceA.destroy();
    await deviceB.destroy();
  });

  it("does not overwrite the Play the Coach currently has open", async () => {
    const store = new MemoryReplicaStore();
    const deviceA = await openDevice("open-a");
    const deviceB = await openDevice("open-b");
    const playId = offensivePlaybookGolden.plays[0]!.id;
    const orchestratorA = await createSyncOrchestrator({
      repository: deviceA,
      replica: new EngineCloudReplica({ store, coachId: () => COACH }),
      identity: identityFor(),
      debounceMs: 0,
      now: () => FIXED,
    });
    const orchestratorB = await createSyncOrchestrator({
      repository: deviceB,
      replica: new EngineCloudReplica({ store, coachId: () => COACH }),
      identity: identityFor(),
      debounceMs: 0,
      now: () => FIXED + 5,
      currentPlayId: () => playId,
    });

    await commitName(deviceA, "Remote title", "mutation_open_a");
    await orchestratorA.syncNow();
    await orchestratorB.syncNow();

    const stillLocal = await deviceB.getPlay(playId);
    expect(stillLocal?.document.name).toBe(
      offensivePlaybookGolden.plays[0]!.name,
    );
    expect(await orchestratorB.listConflicts()).toHaveLength(1);
    await deviceA.destroy();
    await deviceB.destroy();
  });

  it("resumes a later pull from the stored cursor", async () => {
    const store = new MemoryReplicaStore();
    const deviceA = await openDevice("cursor-a");
    const deviceB = await openDevice("cursor-b");
    const orchestratorA = await createSyncOrchestrator({
      repository: deviceA,
      replica: new EngineCloudReplica({ store, coachId: () => COACH }),
      identity: identityFor(),
      debounceMs: 0,
      now: () => FIXED,
    });
    const orchestratorB = await createSyncOrchestrator({
      repository: deviceB,
      replica: new EngineCloudReplica({ store, coachId: () => COACH }),
      identity: identityFor(),
      debounceMs: 0,
      now: () => FIXED + 2,
    });
    await commitName(deviceA, "First remote", "mutation_first");
    await orchestratorA.syncNow();
    await orchestratorB.syncNow();
    await commitName(deviceA, "Second remote", "mutation_second");
    await orchestratorA.syncNow();
    await orchestratorB.syncNow();
    const play = await deviceB.getPlay(offensivePlaybookGolden.plays[0]!.id);
    expect(play?.document.name).toBe("Second remote");
    await deviceA.destroy();
    await deviceB.destroy();
  });

  it("retries a failed push without dropping the local Play", async () => {
    const repository = await openDevice("intermittent");
    const store = new MemoryReplicaStore();
    const inner = new EngineCloudReplica({ store, coachId: () => COACH });
    let failures = 1;
    const replica = {
      pushBatch: async (
        request: Parameters<EngineCloudReplica["pushBatch"]>[0],
      ) => {
        if (failures > 0) {
          failures -= 1;
          throw new Error("temporary network");
        }
        return inner.pushBatch(request);
      },
      pullAfter: (cursor: string | null, limit: number) =>
        inner.pullAfter(cursor, limit),
      getRevision: (revisionId: string) => inner.getRevision(revisionId),
      resolveConflict: (
        request: Parameters<EngineCloudReplica["resolveConflict"]>[0],
      ) => inner.resolveConflict(request),
      readHead: () => inner.readHead(),
    };
    const orchestrator = await createSyncOrchestrator({
      repository,
      replica,
      identity: identityFor(),
      debounceMs: 0,
      now: () => FIXED,
    });
    await commitName(repository, "Retry me", "mutation_retry");
    const first = await orchestrator.syncNow();
    expect(first.status).toBe("offline");
    expect(
      (await repository.getPlay(offensivePlaybookGolden.plays[0]!.id))?.document
        .name,
    ).toBe("Retry me");
    const second = await orchestrator.syncNow();
    expect(second.status).toBe("synced");
    expect(await repository.readSyncMutationBatch(10)).toEqual([]);
    await repository.destroy();
  });
});
