# Faster, steadier browser tests

Eight plans from the review of the Playwright suite on 2026-11-16. Each file is a self-contained prompt. Hand one file and this README to a fresh agent session and it has what it needs.

## The plans

| Plan | File | What it lands | Wave | Needs first |
|---|---|---|---|---|
| 01 | `01-production-build.md` | The suite runs against the production build, on a port each checkout owns | 1 | none |
| 02 | `02-ci-evidence-and-cache.md` | CI keeps traces and one HTML report, names flaky tests, and caches the browsers | 1 | none |
| 03 | `03-ci-shards-and-workers.md` | Browser jobs of equal weight that use all four runner cores | 2 | 01, 02 |
| 04 | `04-flaky-tests.md` | The tests that only pass on retry pass the first time | 2 | 01, 02 |
| 05 | `05-phone-viewports.md` | Phone layout specs boot the app once for all widths | 1 | none |
| 06 | `06-shared-helpers.md` | One home for spec helpers, one toast locator, a split `editor-interaction` spec | 3 | 04 |
| 07 | `07-spec-artifacts.md` | Every spec file writes an artifact, and a check keeps it so | 1 | none |
| 08 | `08-webkit-scope.md` | A decision on how much of the suite runs on WebKit for a pull request | 3 | 04, and a decision from Andrew |

Plans in the same wave touch different files and can run at the same time. A plan in a later wave waits until the plans it needs have merged.

## Who touches what

| File | Plans, in order |
|---|---|
| `playwright.config.ts` | 01, then 04 for the retry count |
| `.github/workflows/merge.yml` | 02, then 03, then 07 for one Quality step |
| `.github/workflows/flake-hunt.yml`, new | 04 |
| `tests/e2e/editor-interaction.spec.ts` | 04, then 06 |
| `tests/e2e/fixtures.ts` and the helper modules | 06 |
| The phone and tablet specs with a viewport loop | 05 |
| The eight spec files with no artifact that 05 does not touch | 07 |
| `.agents/skills/ship/SKILL.md` | 01 and 03, one paragraph each |

## Status

Update this table in the pull request that lands a plan.

| Plan | Status | Pull request |
|---|---|---|
| 01 | Not started | |
| 02 | Not started | |
| 03 | Not started | |
| 04 | Not started | |
| 05 | Not started | |
| 06 | Not started | |
| 07 | Not started | |
| 08 | Waiting on a decision | |

## Shared context

### The suite

- `playwright.config.ts` runs `tests/e2e` with four projects. `chromium` and `webkit-ipad` run every spec that is not a phone spec. `phone-chromium` and `phone-webkit` run `phone-*.spec.ts`.
- At commit `1762b2a` there are 782 tests in 103 files: 290 on each desktop project and 101 on each phone project.
- `tests/parity` and `tests/pwa` have their own configs. No plan here changes them.
- The config starts `bun run dev` on a port derived from the checkout's path, or on 4173 in CI, and never reuses a running server. `CHALK_E2E_PORT` sets the port.
- CI is `.github/workflows/merge.yml`. The Browser job runs `bun run test:e2e --shard=N/4` on four runners with `retries: 2`. The one required check is Merge Gate, which needs `quality`, `browser` and `parity`.
- The runners have 4 cores, and Playwright uses 2 workers on them.

### The baseline to beat

From Merge Gate run 43910118816 on 2026-11-16, read from its log.

| Project | Tests run | Test seconds | Mean |
|---|---|---|---|
| `chromium` | 289 | 735 | 2.5 s |
| `webkit-ipad` | 262 | 1,076 | 4.1 s |
| `phone-chromium` | 101 | 394 | 3.9 s |
| `phone-webkit` | 101 | 490 | 4.9 s |

| Job | Install browsers | Browser journeys | Test seconds |
|---|---|---|---|
| Browser 1/4 | 44 s | 267 s | 518 |
| Browser 2/4 | 36 s | 268 s | 523 |
| Browser 3/4 | 78 s | 407 s | 790 |
| Browser 4/4 | 50 s | 440 s | 863 |
| Parity and PWA | 42 s | 26 s | |

- Over the last 100 Merge Gate runs, 88 passed and 12 failed. A passing run took 11.2 minutes at the median and 15.2 at the 90th percentile, from creation to completion.
- All 14 of the most recent passing runs needed at least one retry. Of 42 retried tests, 34 were on `webkit-ipad`, 5 on `chromium` and 3 on `phone-webkit`.
- The slowest files, both engines added together: `phone-editor.spec.ts` 376 s, `editor-interaction.spec.ts` 307 s, `header-single-row.spec.ts` 103 s.

### Measure it again

Read one run's timings and retried tests.

```sh
gh run view <run-id> --json jobs -q '.jobs[] | "\(.name) \(.startedAt) \(.completedAt)"'
gh run view <run-id> --log | grep -E "✘ .*\[(chromium|webkit-ipad|phone-chromium|phone-webkit)\]"
```

Count retries per test over the last passing runs.

```sh
for id in $(gh run list --workflow merge.yml --limit 30 --json databaseId,conclusion \
  -q '.[] | select(.conclusion=="success") | .databaseId' | head -14); do
  gh run view "$id" --log | grep -E "✘ .*\[(chromium|webkit-ipad|phone-chromium|phone-webkit)\]" \
    | sed -E 's/.*✘ +[0-9]+ \[([a-z-]+)\] › tests\/e2e\/([^:]+):[0-9]+:[0-9]+ › (.{0,70}).*/\1 \2 › \3/'
done | sort | uniq -c | sort -rn
```

After plan 02 lands, read the same facts from the run's summary and its merged report.

### Rules for every plan

- Read `AGENTS.md` first. Its testing rules hold: write no unit test for this work, and end each spec with an artifact.
- Change no assertion to make a test pass. A plan that moves or reshapes a test keeps what the test checks.
- Add no `waitForTimeout`, raise no timeout, and mark nothing `fixme` or `skip` to get to green.
- Leave app code alone unless the plan says a test found a real bug. A fix to app code is a `fix` commit, and that type deploys.
- Use the commit types `test` and `ci` for this work. Neither cuts a release, so no deploy follows.
- Work on a branch of your own from an up-to-date `main`. Ship with the `ship` skill. Other agents merge often, so keep each pull request small and rebase before you merge.
- WebKit does not launch on the workstation. It is missing system libraries, and Docker there needs a group the agent is not in. Prove WebKit changes in CI.
- To run specs locally with video and traces, use the `verify-chalk` skill.
- Put the before and after numbers in the pull request body, with the run IDs they came from.
- Hold the pull request body and any doc you write to the copy rules in `AGENTS.md`.
