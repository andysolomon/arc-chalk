# Plan 07. An artifact from every spec

Read `plans/e2e/README.md` first. This plan can start now.

## Why

`AGENTS.md` says each spec ends with an artifact someone can inspect and regenerate. Twelve spec files write none. Plan 05 covers four of them: `phone-editor`, `phone-plans`, `tablet-layout` and `assignments-inspector`. This plan covers the other eight.

| Spec | Tests | An artifact that shows the behavior |
|---|---|---|
| `blank-default.spec.ts` | 2 | The blank editor on first open, and the first saved play after a reload |
| `book-print.spec.ts` | 2 | The handout and the binder as Chromium prints them, saved as PDF |
| `editor-playback.spec.ts` | 4 | The field at the frozen frame, Present with the play paused, and the first frame after a rewind |
| `mobile-cards.spec.ts` | 2 | The formation cards two across, and a play card's tile |
| `offline-shell.spec.ts` | 1 | The editor with the offline notice showing |
| `share-link.spec.ts` | 2 | The shared page asking for its missing fragment, and the More menu with Share & assets |
| `sync-local.spec.ts` | 2 | The play after the reload, and Account with no cloud keys |
| `editor-performance.spec.ts` | 1 | The measured numbers, written as JSON |

Nothing stops a new spec from landing without an artifact, and that is how these got through.

## What to build

1. **Add the artifact to each spec.** Write it with `testInfo.outputPath(...)` after the last assertion that matters. Use the viewport the spec already sets, and the starter Playbook or a blank library, so a rerun on the same commit writes the same picture.
2. **Take the picture of the thing under test.** Screenshot the field, the dialog or the preview frame, not the whole page, when the whole page adds nothing.
3. **Say what the performance artifact is.** Frame times differ on every run, so `editor-performance.spec.ts` cannot write the same file twice. Write the numbers anyway, and say in a comment that the file is a record of the run.
4. **Add a check.** Write `scripts/check-spec-artifacts.ts`. It reads every `*.spec.ts` under `tests/e2e` and fails when a file has no `outputPath`, `toHaveScreenshot` or `saveAs`. Follow `scripts/check-boundaries.ts` for shape. Add a `check:specs` script to `package.json` and to the `check` script.
5. **Run the check in CI.** Add one step to the Quality job in `.github/workflows/merge.yml`. Do this step after plans 02 and 03 have merged, in its own small pull request, so the workflow file has one editor at a time.

## Do not

- Do not use `toHaveScreenshot` for these. A baseline that must match on two engines is a new source of flakes. A saved screenshot is enough.
- Do not add an artifact with a date, a random ID or a time in it.
- Do not touch the four spec files plan 05 owns.

## Done when

- [ ] Each of the eight specs writes an artifact, and the files appear in the run's report.
- [ ] Running a spec twice on one commit writes the same picture, except `editor-performance.spec.ts`.
- [ ] `bun run check:specs` passes, and fails when an artifact line is removed from one spec.
- [ ] The Quality job runs the check.
