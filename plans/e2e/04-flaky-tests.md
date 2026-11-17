# Plan 04. Fix the tests that only pass on retry

Read `plans/e2e/README.md` first. Start after plans 01 and 02 have merged. Plan 01 changes test timing, so measure again before you fix anything. Plan 02 gives you the traces.

## Why

`retries: 2` in CI hides tests that fail and then pass. In the 14 most recent passing runs before 2026-11-16, every run needed at least one retry. A retry costs time, and a test that fails one time in three has stopped telling anyone anything.

## The tests

Counts are retries across those 14 runs. Lines are at commit `1762b2a`.

| Project | Spec and line | Test | Retries |
|---|---|---|---|
| `webkit-ipad` | `editor-interaction.spec.ts:1012` | says what a route is for, and prints it at the end of the line | 7 |
| `webkit-ipad` | `zone-shell.spec.ts:134` | lays each deep call on the ground its name says, and lets two men share a zone | 5 |
| `webkit-ipad` | `line-alignment.spec.ts:213` | fixes an illegal formation from the call, and undoes the fix | 5 |
| `webkit-ipad` | `line-alignment.spec.ts:126` | calls a covered receiver and a fifth back as the line changes | 4 |
| `webkit-ipad` | `selection-assignments.spec.ts:181` | two linemen double team one target and keep other assignments | 3 |
| `webkit-ipad` | `selection-assignments.spec.ts:273` | a corner and safety run 2-man without changing the remaining defense | 3 |
| `webkit-ipad` | `play-rename.spec.ts:43` | renames plays from the Playbooks page | 3 |
| `chromium` and `webkit-ipad` | `playbook-library.spec.ts:99` | organizes a library: empty books, saved fronts, copy and move, install order, and the shelf | 5 |
| `chromium` | `editor-shell.spec.ts:757` | keeps undo and redo inside the Play after saving it and starting a new one | 2 |
| `phone-webkit` | `phone-page-scroll.spec.ts:47` | scrolls the Playbooks page, not a box inside it, under a pinned header | 2 |

`play-rename` took about 37 seconds each time it failed, so it ran into a 30 second wait. `playbook-library` also timed out at 90 seconds on the production build under load.

## What to build

1. **Measure again.** Count retries per test over the passing runs since plan 01 merged, from the run summaries. Drop a test that no longer retries. Add any new test that retried twice or more.
2. **Add a way to repeat a test in CI.** WebKit cannot run on the workstation. Add `.github/workflows/flake-hunt.yml`, started by hand, that takes a spec, a project and a repeat count, runs `playwright test <spec> --project=<project> --repeat-each=<count> --retries=0`, and uploads the report. Land it alone first, because GitHub only starts a manual workflow that exists on `main`. Then run it against your branch with `gh workflow run flake-hunt.yml --ref <branch>`.
3. **Find the cause of each failure.** Open the trace from a failed attempt. Name the first action that saw the wrong state, and what the page was waiting on. Write that in the pull request.
4. **Fix the cause.** Most fixes wait on the state the next action needs: a saved marker, a settled layout, a closed dialog. If the app shows a state too early or drops an input, that is an app bug. Fix it in the app and commit it as `fix`.
5. **Prove each fix.** Run the test 30 times on its failing project with the flake-hunt workflow. It passes 30 of 30.
6. **Lower the retry count.** When every test in the table passes 30 of 30, set CI `retries` to 1 in `playwright.config.ts`.

Open one pull request per spec file, so a rebase stays small.

## Do not

- Do not add `waitForTimeout`, raise a timeout, or wrap an assertion in a retry loop.
- Do not mark a test `fixme`, `skip` or `slow`.
- Do not weaken an assertion. The test keeps checking what it checked.
- Do not set `failOnFlakyTests` yet. Ask Andrew after four weeks with a clean summary.

## Done when

- [ ] Each test in the table has a named cause and a fix, or a note that it stopped retrying after plan 01, with run IDs.
- [ ] Each fixed test passes 30 of 30 on its failing project.
- [ ] Ten passing Merge Gate runs in a row after the last fix list no retried test from the table.
- [ ] CI `retries` is 1.
