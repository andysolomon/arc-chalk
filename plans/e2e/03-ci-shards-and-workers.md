# Plan 03. Balance the shards and use the runner's cores

Read `plans/e2e/README.md` first. Start after plans 01 and 02 have merged. This plan changes `.github/workflows/merge.yml`.

## Why

Playwright splits shards by test count in project order. WebKit tests take longer, so the shards that hold them run longest, and the longest shard sets the gate time.

| Shard | Test seconds | What it holds |
|---|---|---|
| 1 of 4 | 518 | `chromium` |
| 2 of 4 | 523 | `chromium` 217, `webkit-ipad` 306 |
| 3 of 4 | 790 | `webkit-ipad` 769, `phone-chromium` 21 |
| 4 of 4 | 863 | `phone-chromium` 373, `phone-webkit` 490 |

The slowest shard does 67% more work than the fastest. Each runner has 4 cores and Playwright uses 2 workers.

## What to build

1. **Measure again first.** Plan 01 changed how long tests take. Read test seconds per project from the merged JSON report of three recent runs.
2. **Shard by project.** Replace the `shard: [1, 2, 3, 4]` matrix with a matrix of project and shard pairs, sized from the new numbers. With the old numbers the split would be `chromium` in 2, `webkit-ipad` in 2, and one each for the phone projects, which puts the heaviest job at 538 test seconds. Aim for every job within 15% of the mean.
3. **Install one engine per job.** A job that runs one project needs one browser. Install only that one.
4. **Try more workers.** On a branch, run the gate three times each at 2, 3 and 4 workers. Record the Browser journeys time and the retried tests from the summary. Keep the fastest setting that does not raise the retry count. Set it with `--workers` in the workflow, not in the config, so local runs keep their default.
5. **Update the `ship` skill.** Its "Repo facts" name the jobs "Browser 1/4 – 4/4". Rewrite the line to match the new job names.

## Do not

- Do not rename the `browser` job ID. Merge Gate needs it.
- Do not drop a project from the pull request run. Plan 08 owns that question.
- Do not turn on more workers if retries rise. A faster gate that flakes more is slower to merge.

## Done when

- [ ] Over three runs, the slowest browser job is within 15% of the mean in test seconds.
- [ ] The pull request body has a table of jobs with test seconds and wall time, before and after, and the three worker trials with their retry counts.
- [ ] The gate's wall time is lower than the baseline on the same three runs. The baseline's slowest job ran its tests for 440 seconds.
- [ ] Blob reports from every job still merge into one report.
