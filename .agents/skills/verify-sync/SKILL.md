---
name: verify-sync
description: Model-check cloud sync with TLA+, the path from a Play saved on this device to Convex and from the Coach's other device back to this one. Use when a diff touches packages/sync/src/orchestrator.ts, packages/sync/src/engine.ts, convex/sync.ts, convex/lib/store.ts, the sync functions in packages/local-db/src/repository.ts (commitPlay's mutation, readSyncMutationBatch, setPlayCloudHead, applyRemotePlay, scheduleSyncMutationRetry, acknowledgeSyncMutations, putConflict), or the resolution buttons in apps/web/src/components/conflict-inbox.tsx. Use when `bun run check:models` fails on a config in models/sync.
---

# Verify cloud sync

`createSyncOrchestrator` in `packages/sync/src/orchestrator.ts` runs one drain at a time. A drain pulls every change after the stored cursor, applies each one, then pushes the queued mutations. `applyPushBatch` and `applyResolveConflict` in `packages/sync/src/engine.ts` run inside one Convex mutation each. The Conflict Inbox calls `resolveConflict`, which runs beside the drain, not in its queue.

`models/sync/Sync.tla` is a TLA+ model of that design. TLC checks every order in which the Coach, the drain, a resolution, Convex and his other device can take their steps, within small bounds. TLC never reads the TypeScript. A change to the code reaches the check only when you change the model to match it.

No past commit fixed a sync bug. `packages/sync` has two commits, and #51 wrote the sync code once. So the model has no `Bug*.cfg`. Each `Finding*.cfg` is a live bug on main, replayed against the real code.

## What the model promises

| Property                      | The rule                                                                                                                      | The harm when it breaks                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `NoEditLost`                  | Every edit the Coach saved on this device stays in its Play there, or in an open conflict, unless he chose the other version. | An edit he saw saved vanishes from his device, and no conflict tells him.                      |
| `NoPushedEditLost`            | An edit that reached a Play's head on Convex stays in that head, unless the Coach gave it up when he resolved a conflict.     | An edit made on one device disappears from every device.                                       |
| `NoChangeSkipped`             | The cursor passes another device's revision of a Play only after this device applied it or a later change to that Play.       | A Play changed on the other device never reaches this one.                                     |
| `NoConflictWithSelf`          | Convex records a conflict only against a revision another device wrote.                                                       | The Conflict Inbox asks the Coach to choose between two of his own edits.                      |
| `InboxConflictsKnownToServer` | Every conflict in the Conflict Inbox is one Convex holds.                                                                     | Every button in the Conflict Inbox fails, and sync shows a conflict until the device is wiped. |
| `QuietMeansInSync`            | Once sync has nothing left to do, each Play on this device is the head Convex holds.                                          | The device shows a version the server has replaced, and nothing says so.                       |
| `RetryReasonShown`            | While a mutation waits on its retry, the snapshot carries the reason Convex gave.                                             | The account panel says "syncing" and never says why the save cannot reach the cloud.           |
| `DrainSettles`                | Once the Coach and his other device stop, the orchestrator stops draining.                                                    | The tab calls `sync:pullAfter` in a loop for as long as it stays open.                         |

## 1. Find out whether your change is covered

```sh
git diff d703c75 -- packages/sync/src/orchestrator.ts packages/sync/src/engine.ts convex/sync.ts convex/lib/store.ts packages/local-db/src/repository.ts apps/web/src/components/conflict-inbox.tsx apps/web/src/app/cloud-session.tsx apps/web/src/app/clerk-session.tsx
```

`d703c75` is the sync commit, the last commit at which someone confirmed that the model describes this code. Read each changed function against its row in the action map below. Your change is covered when it alters what one of those functions reads, writes, waits on or hands to another. In `repository.ts`, only the functions the action map names count. A change to copy, styling or how a payload is parsed is not covered.

## 2. Make the model match the code

Skip this step when step 1 found nothing covered.

For each covered change, open the action its row names in `models/sync/Sync.tla` and decide whether the action still does what the code does. Check three things. The action reads and writes the same state. One action is still one stretch of JavaScript between two waits that another actor can act in: an IndexedDB request or transaction, or a call to Convex. Each action's comment still names the code it stands for.

If the code now does something the action does not, change the action. A fix to a finding usually removes a step or a window, and the `Finding*.cfg` for it should then pass. Delete that config, and move its row in "Findings on main" below into the pull request that fixes it. Change the model before you run the check. A pass on a model that still describes the old code proves nothing about your change.

## 3. Run the check

```sh
bun run check:models
```

It needs Java 11 or later from `JAVA`, `JAVA_HOME` or the `PATH`. It downloads TLA+ tools 1.8.0 once into `node_modules/.cache` and refuses any jar whose sha256 differs. Run one config by naming it, as in `bun run check:models Sync`. `Sync.cfg` explores 56,490 states. It took 5 seconds alone and 47 seconds beside every other config in `models/` on a machine with a load average above 20.

Each config's first line says what TLC must report, and the command exits 0 only when every config reports exactly that:

| Config                               | TLC must report                        | What it is                                                   |
| ------------------------------------ | -------------------------------------- | ------------------------------------------------------------ |
| `Sync.cfg`                           | pass                                   | Main, with every assumption below.                           |
| `FindingOwnEditsConflict.cfg`        | `NoConflictWithSelf` violated          | Main without `EditsWaitForSync`.                             |
| `FindingPushSkipsChange.cfg`         | `NoChangeSkipped` violated             | Main without `OthersWaitForPush`.                            |
| `FindingLostAnswerSkipsChange.cfg`   | `QuietMeansInSync` violated            | Main with one push whose answer is lost, `MaxDrops = 1`.     |
| `FindingCloudHeadRace.cfg`           | `NoEditLost` violated                  | Main without `EditsWaitForSync` and `EditsWaitForCloudHead`. |
| `FindingApplyRace.cfg`               | `NoEditLost` violated                  | Main without `EditsWaitForApply`.                            |
| `FindingOpenPlayConflict.cfg`        | `InboxConflictsKnownToServer` violated | Main with Play `p1` open in the editor.                      |
| `FindingResolveCrash.cfg`            | `QuietMeansInSync` violated            | Main with one crash, `MaxCrashes = 1`.                       |
| `FindingResolveOverwritesPush.cfg`   | `NoPushedEditLost` violated            | Main without `OthersWaitForResolve`.                         |
| `FindingResolveAppliesStale.cfg`     | `QuietMeansInSync` violated            | Main without `OthersWaitForResolve`.                         |
| `FindingRejectedEditOverwritten.cfg` | `NoEditLost` violated                  | Main with edit `a1` rejected by Convex.                      |
| `FindingRetryForever.cfg`            | `DrainSettles` violated                | Main with edit `a1` rejected by Convex.                      |
| `FindingRetryReasonLost.cfg`         | `RetryReasonShown` violated            | Main with edit `a1` rejected by Convex.                      |

Each `Finding*.cfg` checks one property, so TLC stops at the first counterexample. A `Finding*.cfg` that stops failing means the check can no longer catch that bug, or a change fixed it. Find out which before you change its expected line.

## 4. Read the result

Each line says `ok` or `FAIL`, then the steps of TLC's first counterexample as action names, such as `CoachEdits(p1) -> CoachEdits(p1) -> DrainStart -> Pull -> PullDone -> PushRead -> PushSend`. A failing run keeps TLC's whole output in `.tlc/<config>.out`. The trace for `DrainSettles` ends in `back to state N`, the loop that never ends, and it can differ between runs.

Read every result with the pstack `/statechart` skill. Give it `models/sync/Sync.tla` and the config. It tells the shortest path to each broken rule in plain words, and it draws how sync moves between states when the check passes. Let it use the TLC it installs for itself.

## 5. Tell a real bug from a modeling error

Replay the counterexample against the real code, one step per action, with the action map. Open two `createDexieLocalRepository` devices on `fake-indexeddb`, share one `MemoryReplicaStore` through two `EngineCloudReplica`s, and give each device a `createSyncOrchestrator`, as `tests/sync/orchestrator.test.ts` does. To make a step land inside another, wrap device A's `CloudReplica` and act in the wrapper: rename a Play during `getRevision` for `ApplyWrite`, let the other device push during `pushBatch` for `OthersWaitForPush`, or throw after the inner call to lose an answer or close the tab. For the race inside `setPlayCloudHead`, start it and `commitPlay` together and vary how many microtasks pass between them. Keep the replay in a scratch file and do not commit it, per AGENTS.md.

- The real code ends where the trace ends. It is a real bug. Report it with the trace in the code's words. Do not weaken the property or the model, and do not change product code unless asked.
- The real code cannot take one of the steps. The model is wrong at that action. Fix the action, say in the pull request which step the code cannot take, and run the check again.

## 6. Move the sync commit

After the check matches every expected line on a model that you confirmed describes the code, replace `d703c75` in step 1 and in the coverage record with the commit you confirmed. Do not move it for a run where you skipped step 2.

## Action map

| Action                 | Code                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Init`                 | Both devices hold `p1` and `p2` at one cloud revision, the cursor is 0, and `start()` has queued a drain.                                                                                               |
| `CoachEdits(p)`        | The editor's `persist` or `library.renamePlay` in `apps/web/src/app/editor-runtime.ts` calls `repository.commitPlay` with a mutation. Its base is the stored `cloudRevisionId`. Then `notifyLocalEdit`. |
| `OtherDevicePushes(p)` | The other device's push lands on the head, and the head watcher in `clerk-session.tsx` calls `queueDrain`.                                                                                              |
| `BackoffEndsOne`       | `Date.now()` passes a mutation's `nextAttemptAtMs`. Nothing queues a drain when it does.                                                                                                                |
| `Wake`                 | The `online` or `focus` listener in `start()` after a drain ended in `catch`.                                                                                                                           |
| `Crash`                | The tab closes or reloads. IndexedDB and Convex keep their data, and the next `start()` queues a drain.                                                                                                 |
| `DrainStart`           | `drain` passes its session and online checks, `setStatus("syncing")` clears `lastError`, and `pull` calls `readCursor`.                                                                                 |
| `Pull`                 | `replica.pullAfter`, one Convex query through `applyPullAfter`.                                                                                                                                         |
| `ApplyChange`          | `applyChange` for one change, up to its first write: `putConflict` for a conflict change, or `currentPlayId` and `readSyncMutationBatch` for a revision.                                                |
| `ApplyWrite`           | `replica.getRevision`, then `repository.applyRemotePlay`'s transaction.                                                                                                                                 |
| `PullDone`             | `writeCursor(page.nextCursor)`.                                                                                                                                                                         |
| `PushRead`             | `ensureDevice`, then `readSyncMutationBatch`, which leaves out mutations whose `nextAttemptAtMs` is later than now. An empty batch returns before `writeCursor`.                                        |
| `PushSend`             | `replica.pushBatch`, one Convex mutation through `applyPushBatch`. With `MaxDrops`, Convex commits it and the answer is lost, so `drain`'s `catch` sets "offline".                                      |
| `Outcome`              | One turn of push's loop over `result.outcomes`: `setPlayCloudHead`'s `plays.get`, `recordConflict`, or `scheduleSyncMutationRetry` and `lastError = outcome.reason`.                                    |
| `CloudWrite`           | `setPlayCloudHead`'s `plays.put({...existing, cloudRevisionId})`, outside any transaction.                                                                                                              |
| `Acknowledge`          | `acknowledgeSyncMutations`.                                                                                                                                                                             |
| `PushCursor`           | `writeCursor(result.headCursor)`.                                                                                                                                                                       |
| `DrainEnd`             | `refreshCounts`, `setStatus`, which clears `lastError`, and the `drainTail` that queues another drain while `pendingCount > 0` and there is no conflict.                                                |
| `CoachResolvesOne`     | "Use this device's version" or "Use the other version" in `conflict-inbox.tsx`. Each is disabled while its side's Play is missing. `resolveConflict` finds the conflict and calls `ensureDevice`.       |
| `ResolveSend`          | `replica.resolveConflict`, one Convex mutation through `applyResolveConflict`. It throws "Conflict not found" for an id Convex never made.                                                              |
| `ResolveApply`         | "remote": `applyRemotePlay` with `conflict.remoteDocument`. "local": `setPlayCloudHead`'s `plays.get`.                                                                                                  |
| `ResolveCloudWrite`    | "local": `setPlayCloudHead`'s `plays.put`.                                                                                                                                                              |
| `ResolveMark`          | `putConflict` with status "resolved", `refreshCounts`, then `queueDrain`.                                                                                                                               |
| `Finished`             | Nothing left to run. It keeps TLC from reporting the end as a deadlock.                                                                                                                                 |

## Scope

A pass covers the model within these bounds: two Plays, two edits on this device, two pushes from the other device, and no crash or lost answer. `Sync.cfg` explores 56,490 states.

`Sync.cfg` assumes these things, and each `Finding*.cfg` drops one:

- `EditsWaitForSync`. The Coach edits a Play only while it has no mutation queued and no open conflict.
- `OthersWaitForPush`. The other device pushes only while this device is not between its pull and its push.
- `EditsWaitForCloudHead`. No edit lands inside `setPlayCloudHead`.
- `EditsWaitForApply`. No edit lands while `applyChange` is writing that Play.
- `OthersWaitForResolve`. The other device leaves a Play alone from the moment it conflicts until this device has resolved it.
- `Rejected = {}`. Convex accepts every mutation.
- `OpenPlay = NoPlay`. No Play is open in the editor while a revision for it arrives.
- `MaxCrashes = 0` and `MaxDrops = 0`.

The model also takes these facts as given. The Conflict Inbox covers the editor, so no edit lands while a resolution runs. Convex runs each mutation and query as one serializable transaction, and every push and resolution reads and writes the one `syncHeads` row for the Coach. So `advanceHead` hands out sequence numbers in commit order, and a pull never sees a later change without the earlier ones. Each `pullAfter` page reads one snapshot and moves the cursor only to the last change it returned, so the model reads every change in one page.

Left out: Playbooks, Concepts, Formations and tombstones, the "keep-both" and "combine" resolutions, the other device's own conflicts, sign-in and revocation, `MAX_PUSH_BATCH` and `MAX_PULL_PAGE`, and the save queue in the editor, which `verify-save-queue` covers. The other device always pushes on top of the head. A conflict that `applyChange` records for the open Play gets one id per revision, where the code makes a new id each time.

## Findings on main

A scratch script replayed each one against the real code at 246952c and again at d703c75, with Dexie on `fake-indexeddb` and the engine on `MemoryReplicaStore`.

| Config                               | What happens                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FindingOwnEditsConflict.cfg`        | The Coach renames a Play twice before the next sync. `commitPlay` gives both mutations the stored `cloudRevisionId` as their base. Convex applies the first, then finds the second in conflict with it. The Conflict Inbox asks him to choose between his two edits. Editing a Play with an open conflict, then choosing "Use this device's version", does the same. |
| `FindingPushSkipsChange.cfg`         | Device A pulls, then device B renames another Play and pushes, then A pushes. `push` ends with `writeCursor(result.headCursor)`, which passes B's change. A reports "synced" and keeps the old name for good.                                                                                                                                                        |
| `FindingLostAnswerSkipsChange.cfg`   | Convex applies A's push, but the answer is lost, so the mutation stays queued. B renames the same Play. A's next pull skips B's revision because a mutation for that Play is queued, and the retried push comes back "duplicate", not "conflict". A reports "synced" with its own name, and Convex holds B's.                                                        |
| `FindingCloudHeadRace.cfg`           | Push's `setPlayCloudHead` reads the Play, the editor commits the Coach's next edit, and the `put` writes the read copy back. IndexedDB loses the edit, and the editor's next save throws `StaleLocalPlayError`. The replay varied the microtasks between the two calls from 0 to 60 and reverted the Play at 20 offsets in one run and 1 in another.                 |
| `FindingApplyRace.cfg`               | `applyChange` finds no queued mutation for a Play and fetches B's revision. The Coach renames that Play from the Playbooks page meanwhile. `applyRemotePlay` writes B's version over the rename. The conflict that follows shows B's version on both sides.                                                                                                          |
| `FindingOpenPlayConflict.cfg`        | B saves the Play open on A. A has nothing queued, so `applyChange` records a conflict under `createId("conflict")`. Convex never made that id, so "Use this device's version" and "Keep both as separate Plays" throw "Conflict not found", and "Keep both" leaves a new Play behind each time. "Use the other version" is disabled. The conflict stays.             |
| `FindingResolveCrash.cfg`            | The Coach picks "Use the other version". Convex resolves the conflict, then the tab closes before `applyRemotePlay`. On the next boot, pull reads the "resolved" change and closes the local conflict. A reports "synced" and keeps the version he gave up.                                                                                                          |
| `FindingResolveOverwritesPush.cfg`   | While A's conflict on a Play is open, B renames it again. The Coach picks "Use this device's version", and `applyResolveConflict` makes his revision the head without checking the head. B's second rename is gone from Convex, from A and, after it syncs, from B.                                                                                                  |
| `FindingResolveAppliesStale.cfg`     | Same start, and A has already pulled B's second rename. The Coach picks "Use the other version", and `resolveConflict` applies `conflict.remoteDocument`, B's first rename. A reports "synced" with it, and Convex holds the second.                                                                                                                                 |
| `FindingRejectedEditOverwritten.cfg` | Convex rejects a rename over `MAX_REVISION_BYTES` and stores the rejection as its receipt. The mutation waits on backoff, so `readSyncMutationBatch` leaves it out, and `applyChange` writes B's next revision over the rename. No conflict is recorded.                                                                                                             |
| `FindingRetryForever.cfg`            | The same rejected mutation stays queued, and every retry gets the stored rejection. `drain` queues itself while `pendingCount > 0`, so it pulls with nothing to do. The replay counted 67 and then 227 `pullAfter` calls in 500 ms, and the status stays "syncing".                                                                                                  |
| `FindingRetryReasonLost.cfg`         | `push` sets `lastError` to Convex's reason, and `setStatus` at the end of `drain` clears it. The snapshot after the rejection has no `lastError`.                                                                                                                                                                                                                    |

## Coverage record

Sync commit: `d703c75`.

| Check                                                                                                   | Covers                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NoEditLost`, `FindingCloudHeadRace`, `FindingApplyRace`, `FindingRejectedEditOverwritten`              | `orchestrator.ts`: `applyChange`, `push`. `repository.ts`: `commitPlay`, `setPlayCloudHead`, `applyRemotePlay`, `readSyncMutationBatch`, `scheduleSyncMutationRetry`. `editor-runtime.ts`: `renamePlay`.                |
| `NoPushedEditLost`, `FindingResolveOverwritesPush`                                                      | `engine.ts`: `applyPlayPut`, `applyResolveConflict`. `convex/sync.ts`: `pushBatch`, `resolveConflict`.                                                                                                                  |
| `NoChangeSkipped`, `FindingPushSkipsChange`                                                             | `orchestrator.ts`: `pull`, `push`, `writeCursor`. `engine.ts`: `applyPullAfter`, `append`. `convex/lib/store.ts`: `advanceHead`, `listChangesAfter`.                                                                    |
| `NoConflictWithSelf`, `FindingOwnEditsConflict`                                                         | `repository.ts`: `commitPlay`'s `baseRevisionId`, `setPlayCloudHead`. `engine.ts`: `applyPlayPut`. `orchestrator.ts`: `push`, `resolveConflict`.                                                                        |
| `InboxConflictsKnownToServer`, `FindingOpenPlayConflict`                                                | `orchestrator.ts`: `applyChange`, `recordConflict`, `resolveConflict`. `engine.ts`: `applyResolveConflict`. `conflict-inbox.tsx`: the resolution buttons. `cloud-session.tsx` and `clerk-session.tsx`: `currentPlayId`. |
| `QuietMeansInSync`, `FindingLostAnswerSkipsChange`, `FindingResolveCrash`, `FindingResolveAppliesStale` | Everything above, with `orchestrator.ts`: `drain`'s `catch` and `resolveConflict`'s order of calls.                                                                                                                     |
| `RetryReasonShown`, `FindingRetryReasonLost`                                                            | `orchestrator.ts`: `push`, `setStatus`, `drain`.                                                                                                                                                                        |
| `DrainSettles`, `FindingRetryForever`                                                                   | `orchestrator.ts`: `drain`, `queueDrain`, `refreshCounts`. `repository.ts`: `counts`, `readSyncMutationBatch`. `engine.ts`: `applyOneMutation`'s receipts.                                                              |
