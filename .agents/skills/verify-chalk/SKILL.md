---
name: verify-chalk
description: Prove a change to Chalk works by driving the real app in Chromium and keeping the evidence. Use after implementing a change and before opening a pull request. Use when asked to "verify", "prove it works", "check it in the browser" or "show me it working". Use whenever a claim about the editor, Playbooks, game plans or printed output needs a screenshot, a video or a trace behind it.
---

# Verify Chalk

Run this after the code is written and before the pull request opens. It starts this checkout's own copy of Chalk, drives the changed behavior in Chromium the way a Coach would, and leaves screenshots, a video and a trace for each run.

Chalk is a web app with no login and no server to seed. A Coach's work lives in the browser's IndexedDB, so a fresh browser profile is a clean device. Every command below runs from the repo root.

```sh
V="bun .agents/skills/verify-chalk/scripts/chalk-verify.ts"
```

## The pass

Do these in order. Each step ends in something you can check before the next.

1. **Name what changed for a Coach.** Read `git diff main...HEAD` and `git status --short`. Write one line for each behavior a Coach can see or do differently. A change with no line here has nothing to verify in a browser, so say that and stop.
2. **Find each behavior in the feature map.** Open [`features/README.md`](features/README.md) and the feature file that matches. It lists every way a Coach reaches the feature and the specs that already drive it. A change that reaches a feature through one entry point is proven on that entry point only.
3. **Launch and check.** Run `$V launch`, then `$V doctor`. Drive nothing until doctor prints `ok` on every line.
4. **Drive the specs.** Run `$V drive` on every spec the diff adds or changes, and on the specs the feature file names.
5. **Drive what the specs leave out.** Write a scratch journey for any behavior from step 1 that no spec shows. See "Write a journey" below.
6. **Look at the evidence.** Read every screenshot the run wrote. A green assertion beside a wrong picture is a failure. Check the picture against the line you wrote in step 1.
7. **Check the phone** when the change touches layout, the header, the sidebar, a sheet or a drawer. Drive the matching `phone-*.spec.ts`, or name a journey `phone-<slug>.spec.ts`.
8. **Report.** Use the format under "Report".
9. **Stop the instance.** Run `$V stop`.

## Launch

```sh
$V launch
```

Launch starts `bun run dev` from `apps/web` on a free port, not on 4173. It waits for the server to answer, then opens the editor once in Chromium and waits for the field to draw. It prints the URL when the editor is usable. The state is in `.verify/instance.json` and the server log is in `.verify/server.log`.

Launch blanks `VITE_CONVEX_URL` and `VITE_CLERK_PUBLISHABLE_KEY`, so the app runs signed out and on this device only, as it does in CI. Pass `--cloud` to keep the keys from the environment.

One checkout runs one instance. A second `launch` reports the first one. Another worktree can run its own instance at the same time.

## Doctor

```sh
$V doctor
```

Doctor changes nothing. It checks four things.

- The recorded instance belongs to this checkout.
- The process group that launch started is alive.
- The process listening on the port has its working directory in this checkout.
- The URL answers 200 with the Chalk shell.

It also prints the commit at launch and the commit now. The dev server serves the working tree, so an edit made after launch is live without a relaunch. Run doctor before the first drive and again after any drive that fails in a way you did not expect. When doctor fails, run `$V stop` and `$V launch`.

## Drive

```sh
$V drive tests/e2e/goal-line-formation.spec.ts
$V drive tests/e2e/phone-play-rename.spec.ts
$V drive tests/e2e/editor-interaction.spec.ts -- -g "draws a route from the selected man"
$V drive .verify/journeys/my-change.spec.ts --headed
```

Drive runs the files with the repo's Playwright projects against the launched instance. It uses the full Chromium build in place of the headless shell. Arguments after `--` go to Playwright unchanged.

Drive picks the project from the file name.

| File name | Project | Screen |
|---|---|---|
| `phone-*.spec.ts` | `phone-chromium` | Pixel 7 |
| `*.demo.ts` | `demo` | 1280×800, for the demo-kit skill |
| anything else | `chromium` | 1440×960 |

Pass `--project webkit-ipad`, `--project phone-webkit` or `--project all` to choose another.

### See the page before you write against it

```sh
$V look --seed
$V look --do 'press Control+Shift+f' --scope 'role=dialog[name="Formations"]'
$V look --phone --seed --scope 'role=banner'
```

Look opens one page on a clean device, runs each `--do` in order, prints the ARIA tree and saves a screenshot under `.verify/looks`. Use the roles and names it prints as your locators.

- `--seed` opens the starter Playbook with the play `Stick — Thunder`. Without it the library is empty and the play is Untitled play.
- `--do 'press <keys>'` presses a key combination. `--do 'click <selector>'` clicks a Playwright selector.
- `--scope <selector>` prints one region. `--phone` uses a Pixel 7. `--name <label>` names the screenshot.

### Write a journey

A journey is a Playwright spec that you do not commit. Put it in `.verify/journeys/`, which git ignores.

```ts
import {
  capture,
  expect,
  openBlankEditor,
  test,
} from "../../.agents/skills/verify-chalk/scripts/journey";

test("a Coach puts Goal Line Right on the field", async ({ page }, testInfo) => {
  await openBlankEditor(page);
  await page.keyboard.press("Control+Shift+f");
  const browser = page.getByRole("dialog", { name: "Formations" });
  await browser.getByRole("button", { name: "Goal line", exact: true }).click();
  await capture(page, testInfo, "goal-line-group");
  await browser.getByText("Goal Line Right", { exact: true }).click();
  await expect(page.locator("[data-scene-player]")).toHaveCount(11);
  await capture(page, testInfo, "eleven-on-the-field");
});
```

`journey.ts` exports everything in `tests/e2e/fixtures.ts` plus `capture`. `capture(page, testInfo, name)` saves a numbered screenshot and the ARIA tree of the page at that moment.

Hold a journey to these rules.

- Do what a Coach does. Use the pointer, the keyboard and the controls on screen. Do not call `page.evaluate` to set state, and do not write to IndexedDB.
- Find controls by role and accessible name. Use a `data-scene-*` attribute for marks on the field, which have no role.
- Call `capture` after each action that matters, so the run shows what each action left.
- Check what the change saves as well as what it shows. Reload and look again for anything kept on the device. Read the preview frame for anything printed. Save a download with `download.saveAs(testInfo.outputPath(...))`.
- Use no mocks. The app needs no network.

When the behavior needs a test that stays, the journey becomes a spec in `tests/e2e` under the rules in `AGENTS.md`. A journey is not a substitute for that spec.

## Evidence

Each drive writes a new folder and overwrites nothing.

```text
.verify/runs/<date>-<time>-<commit>/
  evidence.md       every test, its result, and its files
  report.json       Playwright's own report
  artifacts/<test>/
    video.webm      the whole test, at the size of the screen
    trace.zip       every action with the page before and after it
    *.png           the final screen, each capture, and each spec artifact
    *.aria.yml      the ARIA tree at each capture
```

Open a trace with `bunx playwright show-trace <path to trace.zip>`.

Playwright empties `test-results/` at the start of every run, so evidence does not go there.

## Report

Give the person who reviews the change this, and put the same list in the pull request's Testing section.

- One line for each behavior from step 1, marked verified, failed or not run.
- For each line, the entry point you drove and the path of the screenshot or video that shows it.
- For a failure, the assertion or the wrong picture, quoted or attached.
- For anything not run, the reason. WebKit that cannot start on this machine is not run. It is not verified.
- The run folder.

Do not report a behavior as verified through a different entry point than the one you drove.

## Cleanup

```sh
$V stop
```

Stop ends the process group that launch started and removes the tailnet address if `share` made one. It never ends a process by name. It leaves `.verify/runs` and `.verify/looks` in place. Delete old runs by hand when you no longer need them.

After a failed drive, run `$V doctor`. If the instance is healthy, keep it. If not, run `$V stop` and `$V launch` before the next drive.

## Show a person the running app

```sh
$V share
```

Share publishes the instance on the tailnet with `tailscale serve` and prints an `https://<machine>.ts.net:<port>` address. `$V stop` takes the address down.

## Helpers

| File | What it does |
|---|---|
| `scripts/chalk-verify.ts` | `launch`, `doctor`, `look`, `drive`, `share` and `stop`. Run it with `bun`. |
| `scripts/journey.ts` | The import for a journey. It exports the repo's fixtures and `capture`. |
| `playwright.verify.config.ts` | The repo's Playwright projects with video, trace and screenshots on. `drive` passes it to Playwright. Do not run it by hand. |

## Gotchas

- **Port 4173 belongs to the first checkout that ran `bun run dev`.** `bun run test:e2e` reuses whatever answers there, so from a second worktree it tests the wrong code. `$V drive` never uses 4173.
- **WebKit needs system libraries this machine may lack.** `webkit-ipad` and `phone-webkit` then fail at launch with "Host system is missing dependencies". CI runs both.
- **The starter Playbook is opt-in.** `openSeededEditor(page)` and the fixture's `page.goto("/")` open `Stick — Thunder`. `openBlankEditor(page)` opens an empty library.
- **A clean device is cleared once per page.** The fixtures clear `localStorage` and delete the `chalk-production-beta` database in the test browser's own profile. They never touch a person's browser.
- **Thanksgiving week tints the shell.** The fixtures pin `chalk.season` to `none`, so screenshots match on any date.
- **Headless Chromium does not print.** A print journey reads the `iframe[title="Preview"]` frame and the "Sent to print." status.
- **A change to `apps/web/vite.config.ts` needs a relaunch.** Other edits reach the page through the dev server.

## Keep the map current

The feature map goes stale when the app changes. Run `/maintain-verification-skill` to check every feature file against the source and against the running app.
