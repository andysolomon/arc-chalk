# Plan 05. Boot the app once for phone layout checks

Read `plans/e2e/README.md` first. This plan can start now.

## Why

`phone-editor.spec.ts` is the slowest file in the suite. It lists 52 tests on each phone project, 104 in all, and they took 376 seconds in the baseline run. That is 14% of all test time. The file has 12 tests in source. Two `for (const viewport of VIEWPORTS)` loops, at lines 169 and 349, repeat them for six screen sizes, and every repeat opens a new page and boots the app.

Other specs loop the same way: `phone-plans`, `phone-playbooks`, `phone-line-alignment`, `phone-play-card`, `phone-select-and-hand`, `phone-playbook-library`, `phone-play-rename`, `tablet-layout` and `assignments-inspector`.

## What to build

1. **Sort each looped test into one of two kinds.** A layout test reads where things are and changes no Play. An interaction test draws, drags, renames or saves.
2. **Give a layout test one boot.** Open the app once, then for each size call `page.setViewportSize`, wait for the layout to settle, and run the checks inside a `test.step` named for the size. Use `expect.soft` so one size failing does not hide the others.
3. **Reload when first paint is the point.** Some checks are about how the app lays out when it opens at a width. For those, call `page.reload()` after the resize. A reload is still cheaper than a new page and context.
4. **Leave an interaction test as it is** unless its sizes can share one page without one size's edits reaching the next. When in doubt, leave it.
5. **Write the artifact.** `phone-editor`, `phone-plans`, `tablet-layout` and `assignments-inspector` write none today, and `AGENTS.md` requires one. Save one screenshot per size with `testInfo.outputPath`, at the fixed sizes the spec already names.
6. **Start with `phone-editor.spec.ts`.** Measure it, then do the other files in order of test seconds.

## Do not

- Do not drop a size or an assertion. List each test's sizes and checks before and after in the pull request.
- Do not change the device a project emulates. `setViewportSize` changes the size only, so touch, pixel ratio and the user agent stay as the project sets them.
- Do not touch `phone-page-scroll.spec.ts` or `phone-header-single-row.spec.ts`. Plan 04 owns the first. The second already runs every size in one test.

## Risks to check

- A resize fires the app's resize handling, which a fresh load does not. If a check passes after a fresh load and fails after a resize, that is a real difference. Report it. Do not paper over it with a reload.
- One long test reports less precisely than six short ones. The named steps and soft assertions are what keep a failure readable. Check one on purpose by breaking a size, and look at the report.

## Done when

- [ ] `phone-editor.spec.ts` takes less than half its baseline of 376 test seconds across both phone projects, read from a CI run.
- [ ] Every size and every check from before is still there, shown in a before and after list.
- [ ] Each spec this plan touched writes at least one artifact.
- [ ] A size broken on purpose fails with the size's name in the report.
