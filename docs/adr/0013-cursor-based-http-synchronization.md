---
status: accepted
---

# Synchronize through durable cursor batches over Convex

Chalk synchronizes local devices with explicit push and pull batches implemented as Convex functions. A small Convex subscription may notify an online client that the cloud cursor advanced, but IndexedDB and Chalk's durable mutation queue—not the Convex client's in-memory queue or reactive cache—remain authoritative. The protocol supports automatic multi-device continuity for one Coach and never sits on the local editing critical path.

## Consequences

- A `sync.pushBatch` Convex mutation accepts bounded batches of durable local mutations with unique idempotency keys and the base revision each mutation was authored against.
- A paginated `sync.pullAfter` Convex query accepts the device's last acknowledged cursor and returns subsequent changes plus the next cursor.
- Convex documents maintain an ordered change cursor within each Coach's ownership boundary.
- An optional lightweight subscription to the Coach's sync head can wake pull processing while online; it is an acceleration, not a durability mechanism.
- The Convex browser client's mutation queue is memory-only and is never treated as Chalk's offline queue.
- Initial synchronization retrieves Playbook and Play metadata first; full Play documents, revisions, and binary assets load lazily.
- Synchronization is triggered after a short edit debounce, on launch, reconnect, focus, and explicit `Sync now`.
- Failed Convex calls retry from the IndexedDB queue with bounded exponential backoff and jitter while leaving local editing unaffected.
- `navigator.onLine` is treated only as a scheduling hint; request outcomes determine connectivity state.
- Base-revision divergence creates preserved Play branches under ADR 0001.
- Beta does not implement presence, CRDTs, or live collaboration. Convex may maintain its normal transport connection for authentication and the sync-head subscription.
