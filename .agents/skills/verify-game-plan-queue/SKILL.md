---
name: verify-game-plan-queue
description: Model-check the game-plan write queue with TLA+, the path from a change the Coach makes to an open Game Plan to the plan list, the plan stored in IndexedDB and a prepared revision. Use when a diff touches apps/web/src/library/use-game-plans.ts. Use when a diff in apps/web/src/library/game-plans-workspace.tsx adds or changes a state.apply, state.revise or state.prepare call, a DraftField, leaveField, or the key of a call's row. Use when `bun run check:models` fails on a config in models/game-plan-queue.
---

# Verify the game-plan queue

`useGamePlans` in `apps/web/src/library/use-game-plans.ts` runs every write to a Game Plan through one queue, `enqueue`. `apply` publishes a change to `plansRef` before its write is queued. `revise` builds a change on `plansRef` as it stands, and `prepare` joins the queue and reads `plansRef` when its turn comes. Two bugs shipped in this code. The #75 review found that Prepare froze a call number from before the last edit, and b24b02c fixed it. Issue #155 lost a note typed just before its call moved to another section, and f016f25 fixed it.

`models/game-plan-queue/GamePlanQueue.tla` is a TLA+ model of that design. TLC checks every order in which the Coach, React, the queue and IndexedDB can take their steps, within small bounds. TLC never reads the TypeScript. A change to the code reaches the check only when you change the model to match it.

## What the model promises

| Property               | The rule                                                                                                                                                                               | The harm when it breaks                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NoEditLost`           | Once every write has run, the plan on the Coach's screen and the plan in IndexedDB carry every change he made. A change whose own write failed and text still in a field are left out. | A note, call number or move he saw land vanishes from his screen, from his device, or from both.         |
| `ShownIsStored`        | Once every write has run, the plan on his screen is the plan IndexedDB holds.                                                                                                          | He reloads and sees another plan. His next edit builds on the plan he saw and overwrites the stored one. |
| `PrepareFreezesLatest` | The revision Prepare writes carries every edit he made before he clicked "Prepare for game", less the edits whose own write failed.                                                    | The call sheet and wristband he prints are missing an edit he made.                                      |

## 1. Find out whether your change is covered

```sh
git diff a0ce590 -- apps/web/src/library/use-game-plans.ts
git diff a0ce590 -- apps/web/src/library/game-plans-workspace.tsx | grep -nE "state\.(apply|revise|prepare|refresh)|revise\(|apply\(|onApply|DraftField|leaveField|key="
```

`a0ce590` is the sync commit, the last commit at which someone confirmed that the model describes this code. Read each changed function against its row in the action map below. Your change is covered when it alters what one of those functions reads, writes, waits on or hands to another. Three kinds of change are covered most often. A new edit calls `apply(change(plan))` with the plan prop where the code around it calls `revise`. A new `await` lands inside a task that `enqueue` runs. A field commits some other way than through `DraftField`. A change to copy, styling, or the body of a domain function such as `assignCallCode` is not covered.

## 2. Make the model match the code

Skip this step when step 1 found nothing covered.

For each covered change, open the action its row names in `models/game-plan-queue/GamePlanQueue.tla` and decide whether the action still does what the code does. Check three things. The action reads and writes the same state. One action is still one stretch of JavaScript between two waits, where a wait is an IndexedDB request, a React render or an event. Each action's comment still names the code it stands for.

If the code now does something the action does not, change the action, or a constant in `GamePlanQueue.cfg` when one already describes the new behavior. For example, `EditsBuildOn = "render"` describes a field commit or a move built with `apply` on the plan prop, and `FieldCommits = "on blur only"` describes a field that loses its text when its row unmounts. A new button that calls `apply` with the plan prop is one more caller of `CoachClicks`, so the model needs no change for it. Do this before you run the check. A pass on a model that still describes the old code proves nothing about your change.

## 3. Run the check

```sh
bun run check:models
```

It needs Java 11 or later from `JAVA`, `JAVA_HOME` or the `PATH`, and it downloads TLA+ tools 1.8.0 once into `node_modules/.cache`. Run this model's main config alone with `bun run check:models GamePlanQueue`. Each config here took about 3 seconds.

Each config's first line says what TLC must report, and the command exits 0 only when every config reports exactly that:

| Config                               | TLC must report                 | What it is                                                                                              |
| ------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GamePlanQueue.cfg`                  | pass                            | Main, with the three timing assumptions below.                                                          |
| `BugNoteDroppedOnMove.cfg`           | `NoEditLost` violated           | Replays f016f25^. A note committed only on blur, and a move with the note focused remade its row.       |
| `BugPrepareStalePlan.cfg`            | `PrepareFreezesLatest` violated | Replays b24b02c^. `apply` showed a change once written, and Prepare froze the plan the click passed in. |
| `FindingRefreshDropsQueuedEdits.cfg` | `NoEditLost` violated           | Main without `FailedWriteIsLast`. A finding, see below.                                                 |
| `FindingEditDuringPrepare.cfg`       | `NoEditLost` violated           | Main without `EditsWaitForPrepare`. A finding, see below.                                               |

A `Bug*` or `Finding*` config that stops failing means the check can no longer catch that bug. Find out why before you change its expected line.

## 4. Read the result

Each line says `ok` or `FAIL`, then the steps of TLC's first counterexample as action names, such as `CoachTypes(e1) -> CoachMoves(e2) -> Render -> StartTask -> Land`. A failing run keeps TLC's whole output in `.tlc/<config>.out`.

Read every result with the pstack `/statechart` skill. Give it `models/game-plan-queue/GamePlanQueue.tla` and the config. It tells the shortest path to each broken rule in plain words, and it draws how the queue moves between states when the check passes.

## 5. Tell a real bug from a modeling error

Replay the counterexample against the real hook, one call per action, with the action map. Render the hook with `renderHook(() => useGamePlans(library))` from `@testing-library/react`. Build `library` from `createMemoryLibrary`, with a `saveGamePlan` that waits until you resolve or reject it and a `getPlay` you can hold, the way `gatedLibrary` in `use-game-plans.test.tsx` does. A `Render` that commits a remade row's field is a second `revise` right after the move's. Keep the replay in a scratch file and do not commit it, per AGENTS.md.

- The real hook ends where the trace ends. It is a real bug. Report it with the trace in the code's words. Do not weaken the property or the model, and do not change product code unless asked.
- The real hook cannot take one of the steps. The model is wrong at that action. Fix the action, say in the pull request which step the code cannot take, and run the check again.

## 6. Move the sync commit

After the check matches every expected line on a model that you confirmed describes the code, replace `a0ce590` in step 1 and in the coverage record with the commit you confirmed. Do not move it for a run where you skipped step 2.

## Action map

| Action                | Code                                                                                                                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Init`                | The plan is stored, and the mount effect's `listGamePlans` has published it.                                                                                                                                                                                                            |
| `CoachTypes(e)`       | `DraftField`'s `onChange` sets `pending`. The fields are `NoteField`, `CodeField`, "Plan name", "Opponent" and "Game".                                                                                                                                                                  |
| `CoachLeaves`         | `DraftField`'s `onBlur` calls `leave`, then `onCommit`, which calls `revise` with `setCallNote`, `commitCode`'s `assignCallCode`, `renameGamePlan` or `setGamePlanDetails`. `leaveField` blurs the same way in Back, Close, "Prepare for game" and a call's name button.                |
| `CoachMoves(e)`       | A call row change through `revise` that is not a field commit: the "Move to…" select, a drop, ↑, ↓, "Take this call out of the section" and "Remove". The select and a drop leave the focused field focused. The model takes the worst case, a move of the call whose field is focused. |
| `CoachClicks(e)`      | `apply` with the plan prop, which main still uses for a section's ↑ and ↓, "Sort by number", the section name, "Remove section", "Add section" and Add plays' `onApply`.                                                                                                                |
| `CoachPrepares`       | The "Prepare for game" button calls `leaveField()`, then `state.prepare(plan, now())` with the plan prop.                                                                                                                                                                               |
| `Render`              | React renders a `setPlans`. A row whose key `${sectionId ?? "loose"}:${callId}` changed unmounts its `DraftField`, whose layout cleanup calls `leave` with the `onCommit` of the render before.                                                                                         |
| `StartTask`           | `queueRef.current.then(task, task)` runs the next task. For `apply`, `write` calls `library.saveGamePlan`. For `prepare`, it reads `latest` from `plansRef`, then awaits `library.getPlay` for each call.                                                                               |
| `Freeze`              | `saveGamePlanRevision` resolves. `prepare` calls `publish(withPlan(plansRef.current, result.plan))`, then `write(result.plan)`.                                                                                                                                                         |
| `Land`                | `library.saveGamePlan` resolves.                                                                                                                                                                                                                                                        |
| `Refuse`              | `library.saveGamePlan` rejects, and `write`'s catch calls `refresh()`.                                                                                                                                                                                                                  |
| `RefreshShowsLibrary` | In `refresh()`, `listGamePlans` resolves and `publish(next)` shows it. Then `loadRevision` runs, and `write` rethrows.                                                                                                                                                                  |
| `Finished`            | Nothing left to run. It keeps TLC from reporting the end as a deadlock.                                                                                                                                                                                                                 |

## Scope

A pass covers the model within these bounds: one open plan, two edits, one Prepare, one write IndexedDB refuses, and three tasks waiting behind the running one. `GamePlanQueue.cfg` explores 576 states. With three edits, two refused writes and four waiting tasks it explores 5,478 and still passes.

React renders a `setPlans` made in an event or a layout effect before the next task runs. A `setPlans` made after an await, in `refresh` or in `prepare`, renders in a later task, and other tasks can run first. A task the queue frees starts in microtasks, so nothing else runs between two tasks.

`GamePlanQueue.cfg` assumes three things about timing, and two of them have a `Finding*.cfg` that drops it:

- `ClicksSeeEveryPublish`. A click handler that reads the plan prop runs after React has rendered every publish. Without it, a section button clicked in the frame after Prepare publishes builds on the plan before Prepare and takes `preparedRevisionId` off. A `renderHook` replay cannot reach that frame, so it has no `Finding*.cfg`.
- `FailedWriteIsLast`. IndexedDB refuses a write only when nothing is queued behind it, and nothing is committed until the refresh lands.
- `EditsWaitForPrepare`. Nothing is committed from the "Prepare for game" click until Prepare publishes the prepared plan.

Left out: `remove`, the mount effect's first load and its `versionRef` check, creating and duplicating a plan, the plan list's rename, `open`, `loadRevision`, the pick scope, a second plan, and a second tab. A plan here is the set of changes it carries, and two edits always touch the same call, which is the worst case for a change built on an old copy of the plan.

## Findings on main

A scratch script replayed each one against the real hook at a0ce590.

| Config                               | What happens                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FindingRefreshDropsQueuedEdits.cfg` | The Coach types a note and moves its call, so the note's commit is queued behind the move's write. IndexedDB refuses the move. `refresh()` publishes the library's list, which has neither the move nor the note, and the note leaves his screen. The note's write lands anyway, with the move in it. His next edit builds on the plan on screen and takes the note out of IndexedDB too.                          |
| `FindingEditDuringPrepare.cfg`       | The Coach clicks "Prepare for game" and moves a call while Prepare reads the Plays. Prepare publishes the plan it read before the move, and the move leaves his screen. The move's write lands after Prepare's, so IndexedDB has the move and no `preparedRevisionId`. A move made after the click and before Prepare's turn loses `preparedRevisionId` from IndexedDB the same way. The revision itself is right. |

## Coverage record

Sync commit: `a0ce590`.

| Check                                                           | Covers                                                                                                                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NoEditLost`, `BugNoteDroppedOnMove`                            | `game-plans-workspace.tsx`: `DraftField`, `NoteField`, `CodeField`, `revise` and `apply` in `PlanEditor`, the "Move to…" select, `drop`, the call row's key. `use-game-plans.ts`: `revise`, `apply`, `publish`. |
| `PrepareFreezesLatest`, `BugPrepareStalePlan`                   | `use-game-plans.ts`: `apply`, `enqueue`, `prepare`. `game-plans-workspace.tsx`: the "Prepare for game" button and `leaveField`.                                                                                 |
| `NoEditLost`, `ShownIsStored`, `FindingRefreshDropsQueuedEdits` | `use-game-plans.ts`: `write`, `refresh`, `enqueue`, `publish`.                                                                                                                                                  |
| `NoEditLost`, `ShownIsStored`, `FindingEditDuringPrepare`       | `use-game-plans.ts`: `prepare`, `publish`, `write`. `game-plans-workspace.tsx`: every `revise` and `apply` caller in `PlanEditor`.                                                                              |
