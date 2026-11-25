---
name: verify-save-queue
description: Model-check the editor's save queue with TLA+, the path from an edit the Coach makes to the Play stored in IndexedDB. Use when a diff touches packages/editor/src/editor-store.ts, packages/editor/src/undo-history.ts, commitPlay or applyRemotePlay in packages/local-db/src/repository.ts, or revealPersistedPlay and its callers. Use when a diff adds an editorStore.applyEdit call, or widens the commands applyCommand takes. Use when `bun run check:models` fails.
---

# Verify the save queue

The editor store runs every change to the open Play through one queue, `enqueue` in `packages/editor/src/editor-store.ts`. `commitPlay` in `packages/local-db/src/repository.ts` refuses a write whose expected hash is not the stored one. The same lost-edit bug shipped twice, and 4d7994b and b41f13d each fixed one call site. A fresh device could never save its first Play until 251b330.

`models/save-queue/SaveQueue.tla` is a TLA+ model of that design. TLC checks every order in which the Coach, the queue, IndexedDB and sync can take their steps, within small bounds. TLC never reads the TypeScript. A change to the code reaches the check only when you change the model to match it.

## What the model promises

| Property                  | The rule                                                                                                                                                                       | The harm when it breaks                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `NoEditLost`              | Once every save has run, the Play on the Coach's screen carries every edit he made, less the ones he undid and the ones on a branch he gave up for his other device's version. | An edit he saw land vanishes from his screen and from his device.                                 |
| `CommitExpectsStoredHash` | Every commit expects the hash stored on this device, unless sync wrote the Play and the store has not been shown it yet.                                                       | IndexedDB refuses the save as stale, and every Retry is refused the same way.                     |
| `SavedMeansStored`        | Once he has edited and every save has run, a status of "Saved on this device" means the Play on screen is the stored one.                                                      | He closes the tab because the status says saved, and his last edits are gone.                     |
| `SavingEnds`              | Once every save has run, the status says saved or failed, even when the newest turn found nothing to write.                                                                    | The status says "Saving on this device…" for good, and he cannot tell whether his Play is stored. |
| `SaveEventuallyLands`     | Once he has edited, the Play on his screen ends up stored on this device. This holds on a fresh device too.                                                                    | His Play never saves. Before 251b330 this happened to the first Play on every device.             |

## 1. Find out whether your change is covered

```sh
git diff a048321 -- packages/editor/src/editor-store.ts packages/editor/src/undo-history.ts packages/local-db/src/repository.ts packages/sync/src/orchestrator.ts apps/web/src/app/editor-runtime.ts apps/web/src/app/cloud-session.tsx apps/web/src/app/clerk-session.tsx
git diff a048321 -- apps/web/src | grep -nE "applyCommand|applyEdit|getSnapshot\(\)\.document"
```

`a048321` is the sync commit, the last commit at which someone confirmed that the model describes this code. Read each changed function against its row in the action map below. Your change is covered when it alters what one of those functions reads, writes, waits on or hands to another. A change to copy, styling or a command builder's geometry is not covered.

## 2. Make the model match the code

Skip this step when step 1 found nothing covered.

For each covered change, open the action its row names in `models/save-queue/SaveQueue.tla` and decide whether the action still does what the code does. Check three things. The action reads and writes the same state. One action is still one stretch of JavaScript between two waits on a task. Every await on `crypto.subtle.digest`, an IndexedDB transaction or a new event splits an action. Each action's comment still names the code it stands for.

If the code now does something the action does not, change the action, or a constant in `SaveQueue.cfg` when one already describes the new behavior. For example, `EditBuild = "from snapshot"` describes an edit built before it is queued. Do this before you run the check. A pass on a model that still describes the old code proves nothing about your change.

## 3. Run the check

```sh
bun run check:models
```

It needs Java 11 or later from `JAVA`, `JAVA_HOME` or the `PATH`. It downloads TLA+ tools 1.8.0 once into `node_modules/.cache` and refuses any jar whose sha256 differs. Set `TLA_TOOLS_JAR` to use a jar already on disk. A full run took 4 seconds on an idle machine and 3 minutes on a machine with a load average of 40. Run one config by naming it, as in `bun run check:models SaveQueue`.

Each config's first line says what TLC must report, and the command exits 0 only when every config reports exactly that:

| Config                         | TLC must report                    | What it is                                                                                                                                                         |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SaveQueue.cfg`                | pass                               | Main.                                                                                                                                                              |
| `BugSnapshotCommand.cfg`       | `NoEditLost` violated              | Replays 4d7994b, b41f13d and `FindingGestureDuringSave` from a0ce590. An edit built from `editorStore.getSnapshot().document`, with `EditBuild = "from snapshot"`. |
| `BugFreshDeviceHash.cfg`       | `CommitExpectsStoredHash` violated | Replays 251b330. `persistedDocumentHash` starts as the blank Play's hash on a fresh device.                                                                        |
| `BugFreshDeviceNeverSaves.cfg` | `SaveEventuallyLands` violated     | Replays 251b330 again. Every commit and every Retry is refused as stale.                                                                                           |
| `BugRevealMidSave.cfg`         | `NoEditLost` violated              | Replays `FindingRevealMidSave` from a0ce590. `revealPersistedPlay` showed the Play at once, with `RevealRuns = "at once"`.                                         |
| `BugUndoSequence.cfg`          | `SavedMeansStored` violated        | Replays `FindingUndoSequence` from a0ce590. Undo and Redo took their save sequence when they ran, with `UndoSequence = "when run"`.                                |

A `Bug*` or `Finding*` config that stops failing means the check can no longer catch that bug. Find out why before you change its expected line.

## 4. Read the result

Each line says `ok` or `FAIL`, then the steps of TLC's first counterexample as action names, such as `CoachEdits(e1) -> StartTurn -> CoachEdits(e2) -> ShowAndSend -> Commit`. A failing run keeps TLC's whole output in `.tlc/<config>.out`. The trace for a temporal property such as `SaveEventuallyLands` can differ between runs, because TLC checks those properties at timed intervals.

Read every result with the pstack `/statechart` skill. Give it `models/save-queue/SaveQueue.tla` and the config. It tells the shortest path to each broken rule in plain words, and it draws how the queue moves between states when the check passes. Let it use the TLC it installs for itself. Pointed at this repo's 1.8.0 jar, it failed to read the model.

## 5. Tell a real bug from a modeling error

Replay the counterexample against the real store, one step per action, with the action map. Use `createEditorStore` with a fake `EditorPersistence` whose `commitPlay` checks `expectedDocumentHash` against a stored hash the way `repository.commitPlay` does, and hold or release each commit to choose the order. Keep the replay in a scratch file and do not commit it, per AGENTS.md. `tests/editor/editor-store.test.ts` already replays the 4d7994b path.

- The real store ends where the trace ends. It is a real bug. Report it with the trace in the code's words. Do not weaken the property or the model, and do not change product code unless asked.
- The real store cannot take one of the steps. The model is wrong at that action. Fix the action, say in the pull request which step the code cannot take, and run the check again.

## 6. Move the sync commit

After the check matches every expected line on a model that you confirmed describes the code, replace `a048321` in step 1 and in the coverage record with the commit you confirmed. Do not move it for a run where you skipped step 2.

## Action map

| Action             | Code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Init`             | `createEditorStore` sets `persistedDocumentHash` from `initialDocumentPersisted`, which `apps/web/src/app/editor-runtime.ts` sets from `initial.storedPlay !== undefined`.                                                                                                                                                                                                                                                                                                                        |
| `CoachEdits(e)`    | Every edit the Coach types or gestures. `editRouteCoaching`, `editRouteTiming` and the label `onText` in `apps/web/src/components/chalk-app.tsx` call `applyEdit`. `dispatchField`, the inspector buttons and the menus call `queueEdit` or `runPanelEdit`, which call `applyEdit`. `runCommand` calls `enqueueSave`, and the builder runs when the turn starts. `applyCommand` takes only a `PlayFieldCommand`, and the `buildEditsInTheQueue` lint rejects a builder that ignores its document. |
| `CoachSteps(kind)` | `undo()` and `redo()` call `stepHistory`, which calls `enqueueSave`. It takes its save sequence and shows saving when the Coach asks.                                                                                                                                                                                                                                                                                                                                                             |
| `CoachRetries`     | `retryLocalSave`, only while `localSave.phase` is `"error"`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `StartTurn`        | The task `enqueue` runs. In `runCommand` it reads `state.getState().document`, builds the command and waits on `canonicalSha256(next)`. In `retryLocalSave` it calls `persist` at once. In `stepHistory`, `undoStep` or `redoStep` returns empty or quarantines, and `settleSave` shows how the last save to finish ended, or it waits on the hash.                                                                                                                                               |
| `ShowAndSend`      | The hash resolves. `runCommand` calls `recordUndoEntry`, sets `documentHash = afterHash` and calls `showDocument(next)`. Then `persist` takes `persistedDocumentHash` as the expected hash.                                                                                                                                                                                                                                                                                                       |
| `Commit`           | `persistence.commitPlay` in `editor-runtime.ts`, then `repository.commitPlay`'s transaction, which throws `StaleLocalPlayError` on a stale hash, then the rest of `persist`. `settleSave` keeps every outcome in `settledSave`, and only the save whose `sequence === latestSequence` sets `localSave`.                                                                                                                                                                                           |
| `SyncWritesTheirs` | `resolveConflict(..., "remote")` in `packages/sync/src/orchestrator.ts` calls `repository.applyRemotePlay`, which checks no expected hash.                                                                                                                                                                                                                                                                                                                                                        |
| `AskToReveal`      | `onOpenPlayChanged` in `apps/web/src/app/cloud-session.tsx` and `clerk-session.tsx` hashes the Play and calls `revealPersistedPlay`, which calls `enqueueSave`.                                                                                                                                                                                                                                                                                                                                   |
| `RevealTurn`       | The reveal's task runs. It shows the Play, sets `persistedDocumentHash` to its hash and settles its save as saved. If the Coach has opened another Play by then, it shows nothing, which the model leaves out with `openStoredPlay`.                                                                                                                                                                                                                                                              |
| `RevealAtOnce`     | The code before `RevealRuns = "in queue"`: `revealPersistedPlay` showed the Play in the step that called it.                                                                                                                                                                                                                                                                                                                                                                                      |
| `Finished`         | Nothing left to run. It keeps TLC from reporting the end as a deadlock.                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Scope

A pass covers the model within these bounds: two edits on this device, one edit on the other device, one sync write, two turns waiting behind the running one, one write IndexedDB refuses, and two Undo or Redo presses. `SaveQueue.cfg` explores 8,163 states.

`SaveQueue.cfg` assumes nothing about when the Coach acts. The model takes two facts about the runtime as given. A queued turn starts in the microtask that frees the queue, so nothing runs between them. `commitPlay`'s transaction and the store's handling of its receipt are one step, because Dexie resolves the transaction in microtasks.

Left out: `commitDocument`, `adoptPlay`, `showUnsavedPlay`, `openStoredPlay`, `createVersion`, `restoreVersion`, `commitPlayName`, undo coalescing and `endCoalescing`, the defensive settling in `withManCoverageSettled`, a second tab writing the same Play, and the "keep-both" and "combine" sync resolutions. A Play here is the set of edits it carries, and two edits always touch the same entity, which is the worst case for a command that carries whole entities.

## Coverage record

Sync commit: `a048321`.

| Check                                               | Covers                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NoEditLost`, `BugSnapshotCommand`                  | `editor-store.ts`: `runCommand`, `applyEdit`, `applyCommand` and the `PlayFieldCommand` kinds it takes, `enqueue`, `showDocument`. `undo-history.ts`: `recordUndoEntry`, `undoStep`, `redoStep`. `chalk-app.tsx`: `queueBuiltEdit`, `dispatchField` and every `applyEdit` caller. `eslint.config.js`: `buildEditsInTheQueue`. |
| `NoEditLost`, `BugRevealMidSave`                    | `editor-store.ts`: `revealPersistedPlay`, `enqueueSave`, `runCommand`, `stepHistory`. `orchestrator.ts`: `resolveConflict`. `repository.ts`: `applyRemotePlay`. `cloud-session.tsx` and `clerk-session.tsx`: `onOpenPlayChanged`.                                                                                             |
| `CommitExpectsStoredHash`, `BugFreshDeviceHash`     | `editor-store.ts`: `persistedDocumentHash`, `persist`, `retryLocalSave`. `repository.ts`: `commitPlay`. `editor-runtime.ts`: `initialDocumentPersisted` and the `persistence.commitPlay` adapter.                                                                                                                             |
| `SavedMeansStored`, `SavingEnds`, `BugUndoSequence` | `editor-store.ts`: `enqueueSave`, `settleSave`, `latestSequence`, `persist`, `stepHistory`, `retryLocalSave`, `revealPersistedPlay`, `showUnsavedPlay`.                                                                                                                                                                       |
| `SaveEventuallyLands`, `BugFreshDeviceNeverSaves`   | Everything above, with `retryLocalSave` as the Coach's way out of a failed save.                                                                                                                                                                                                                                              |
