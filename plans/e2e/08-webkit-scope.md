# Plan 08. Decide how much runs on WebKit for a pull request

Read `plans/e2e/README.md` first. This plan needs a decision from Andrew before any agent builds it. Raise it after plan 04 has merged.

## Why

Every desktop test runs on `chromium` and on `webkit-ipad`, and every phone test on both phone engines. In the baseline run the two WebKit projects took 1,566 of 2,694 test seconds, which is 58%, and `webkit-ipad` alone took 40%. WebKit also had 37 of the 42 retries.

Some of that is flaky tests, which plan 04 fixes. What is left is a real cost: WebKit is the engine every browser on an iPad and an iPhone uses, and it is where a touch or layout bug shows first.

## The choice

| Option | A pull request runs | `main` runs | What it costs |
|---|---|---|---|
| Keep everything | All four projects | The same | The gate stays as long as plans 01 and 03 leave it |
| Tag what needs WebKit | Chromium in full, and WebKit for specs tagged for it | All four projects on every push | A WebKit-only bug in an untagged spec reaches `main` before a test catches it |

The recommendation on 2026-11-16 was to keep everything until plan 04 lands, then look again with new numbers.

## What to measure before deciding

1. Test seconds per project after plans 01, 03 and 04, from three runs.
2. How many failures in the last 100 runs were on WebKit only and were real bugs, not flakes. Read the merged reports. This number is the value WebKit adds on a pull request.
3. The gate's wall time, and how much of it is the WebKit jobs.

Put the three numbers in an issue for Andrew, with the two options above.

## If the answer is to tag

1. Tag a spec for WebKit when it drives touch or pointer gestures, checks layout or scrolling, prints, or checks the iPad or phone shell. Every `phone-*.spec.ts` keeps both engines.
2. On a pull request, run WebKit with `--grep` for the tag. On a push to `main`, run all four projects in full.
3. Make a failure on `main` loud. Open an issue from the workflow, because nobody watches a push run.
4. Record the decision as an ADR.

## Done when

- [ ] Andrew has the three numbers and has chosen.
- [ ] If the choice is to tag, a pull request runs the tagged set, `main` runs everything, and a failure on `main` opens an issue.
- [ ] If the choice is to keep everything, this file says so with the date, and the plan is closed.
