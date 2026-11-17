# Plan 06. One home for spec helpers

Read `plans/e2e/README.md` first. Start after plan 04 has merged. Both plans edit `editor-interaction.spec.ts`.

## Why

Spec files copy the same helpers. A change to how a Coach puts a defense on the field means editing ten files, and the copies have started to differ.

| Helper | Defined in |
|---|---|
| `putOnDefense` | 10 spec files |
| `saveField` | 9 spec files |
| `const field = (page) => page.locator("svg.field-diagram").first()` | 13 spec files, identical |
| `fieldPoint` | `editor-interaction`, `editor-performance`, `line-alignment` |
| `playerCenter`, `openEditor` | `editor-interaction`, `editor-performance`, and `hold-at-the-line` for the second |
| `drag` | `editor-interaction`, `select-and-hand` |
| `groupRows` | `football-metadata`, `goal-line-formation` |
| `selectPlayer` and `selectPlayers` | `arrange-menu`, `selection-assignments`, `defense-helpers.ts` |

Two more problems sit beside these.

- 31 calls to the bare `page.getByRole("status")` in 14 spec files mean "the toast". The app has a second element with that role, the lifecycle notice. Plan 01 hides it by blocking service workers, and the locator is still wrong.
- `editor-interaction.spec.ts` is 2,742 lines and 65 tests. It is the second slowest file and the one most often in a merge conflict.

## What to build

Land each step as its own pull request, merged before the next starts.

1. **Diff the copies first.** For each helper, compare every copy. Where they agree, move one copy. Where they differ, keep the difference as a parameter and say in the pull request what differed.
2. **Field helpers.** Move `field`, `fieldPoint`, `playerCenter`, `drag` and `saveField` to one module beside `tests/e2e/fixtures.ts`. Import them in every spec that had a copy.
3. **Defense helpers.** Move `putOnDefense` into `tests/e2e/defense-helpers.ts`, which already holds `addDefense`. Merge the two if they do the same thing.
4. **A toast locator.** Add `toast(page)` to `fixtures.ts`, returning the element with the class `toast` and the role `status`. Replace the 31 bare calls. Leave a call alone when it means the lifecycle notice.
5. **Split `editor-interaction.spec.ts`** into files by gesture: dragging and selecting, drawing a route, editing a route's handles and segments, notes and text, and menus. Keep every test title unchanged, because the retry counts in CI are tracked by title.
6. **Timers, if cheap.** Eight of the nine `waitForTimeout` calls wait out a real timer: the gap that tells a click from a double click, a long press, a map that rests. Seven are in `editor-interaction.spec.ts` and one is in `phone-minimap-rests.spec.ts`. Together they cost about 7 seconds per run of those tests. Try `page.clock` to move time instead of waiting. Keep the wait wherever the clock changes what the gesture does.

## Do not

- Do not change what any test checks. This plan moves code.
- Do not rename a test.
- Do not move a helper that has one caller.
- Do not start the split while another open pull request edits `editor-interaction.spec.ts`. Check with `gh pr list --search "editor-interaction"` first.

## Done when

- [ ] `bunx playwright test --list` prints the same count before and after each step: 782 tests at commit `1762b2a`, or the count on `main` when you start.
- [ ] Each helper in the table is defined once.
- [ ] No spec calls the bare `page.getByRole("status")` to mean the toast.
- [ ] No spec file from the split is longer than 700 lines.
- [ ] The retried-test table in the run summary shows no new entry after each step.
