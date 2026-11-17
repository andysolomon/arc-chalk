# Plan 02. Keep CI evidence and cache the browsers

Read `plans/e2e/README.md` first. This plan changes `.github/workflows/merge.yml` only.

## Why

- The workflow uploads nothing. The config records a trace on the first retry, and the trace is deleted with the runner. Nobody can see why a test failed or needed a retry.
- All 14 recent passing runs needed a retry, and the only way to learn which tests is to search the raw log.
- Every Browser shard spends 36 to 78 seconds installing Chromium and WebKit. The Parity job spends 42 seconds installing Chromium for 26 seconds of tests.

## What to build

1. **One report for the whole run.** Run each shard with the `blob` reporter next to a line reporter, passed with `--reporter` on the command line so `playwright.config.ts` does not change. Upload each shard's blob report. Add a `report` job that downloads them, runs `bunx playwright merge-reports --reporter html`, and uploads the HTML report. The blob report carries the traces and screenshots.
2. **Run the report job after failures too.** Use `if: ${{ !cancelled() }}` on the uploads and on the `report` job. A report that exists only for green runs is no use.
3. **Name the flaky tests.** In the `report` job, also merge to JSON and write a table to `$GITHUB_STEP_SUMMARY`: each test that failed and each test that passed on a retry, with its project and file. Plan 04 measures itself with this table.
4. **Annotate the pull request.** Add the `github` reporter in CI so a failed assertion shows on the changed line.
5. **Keep the parity pictures.** Upload `test-results/parity` when the Parity job fails. It holds the screenshot diffs.
6. **Cache the browsers.** Cache `~/.cache/ms-playwright` with a key that holds the Playwright version from `bunx playwright --version`. On a hit, install only the system packages with `bunx playwright install-deps`. On a miss, install as today.

## Do not

- Do not add the `report` job to the Merge Gate job's `needs`. A failed upload must not block a merge.
- Do not change the shard count or the worker count. That is plan 03.
- Do not change `retries`. That is plan 04.
- Do not keep artifacts longer than 7 days. The repo is public, so the artifacts are public. They hold starter Playbook data only, and that must stay true.

## Done when

- [ ] A run with a failing test has one downloadable HTML report whose trace opens with `bunx playwright show-trace`. Prove it on a scratch branch with a test that fails on purpose, then delete the branch.
- [ ] A passing run that needed a retry lists the retried tests in its summary.
- [ ] The pull request body gives the install step time per job before and after, with both run IDs. If the cache saves less than 15 seconds a job, say so and remove it.
- [ ] Merge Gate still needs exactly `quality`, `browser` and `parity`.
