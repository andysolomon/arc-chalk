---
name: ship
description: Ship finished work in arc-chalk to production — commit it, open a pull request, merge once the Merge Gate CI is green, and see the deploy through to arc-chalk.vercel.app. Use when asked to "ship it", "commit, PR, merge and deploy", "merge when CI is green", or to get a change live.
---

# Ship

Take the working tree from "done" to "live on https://arc-chalk.vercel.app".
Every step below is idempotent: if a step is already done (committed, pushed,
PR open, merged), confirm it and move on.

## Repo facts

- Default branch `main`. Squash merges; the PR title becomes the commit on main
  with ` (#N)` appended.
- Branch protection requires the PR branch to be **up to date with main**, and
  GitHub auto-merge is **disabled** for the repo (`gh pr merge --auto` fails).
  Merges happen by hand, after green, on an up-to-date branch.
- CI is `.github/workflows/merge.yml` ("Merge Gate"), run on every PR to main:
  **Quality** (format, lint, boundaries, Vitest, build), **Browser 1/4 – 4/4**
  (Playwright e2e, Chromium and WebKit), **Parity and PWA**, rolled up into
  the one required check, **Merge Gate**. Wait for all of them anyway.
- Deploy is `.github/workflows/release.yml` ("Release"), on every push to main.
  semantic-release reads the squashed commit. `feat`, `fix`, `perf` and
  breaking changes cut a version tag, and then the **Deploy production** job
  runs `vercel deploy --prebuilt --prod`. Any other type (`chore`, `docs`,
  `test`, `refactor`, `ci`, `build`, `style`) cuts no release and **does not
  deploy**.
- Vercel project `arc-chalk`, team scope `andrewsolomonedus-projects`.
  Vercel's own git integration only builds previews from main; production
  changes only through the Release workflow or an explicit CLI deploy.

## 1. Preflight

1. `git status --short` and `git diff` — know exactly what is shipping. Leave
   out stray files: lockfile churn from a local `bun install`, scratch
   configs, `test-results/`.
2. If on `main`, branch first: `git switch -c <type>/<short-slug>`.
3. Run the cheap checks locally, scoped to what changed:
   `bun run format:check`, `bun run lint`, `bun run typecheck`, and
   `bunx playwright test <changed specs> --project=chromium`.
   - WebKit may not launch locally for lack of system libraries; CI runs it.
4. Run the `verify-chalk` skill for any change a Coach can see. It drives the
   change in Chromium and leaves screenshots, a video and a trace under
   `.verify/runs`. Do not open the pull request until its report marks each
   changed behavior verified.

## 2. Commit

Conventional Commits, in the style of `git log` on main:

- Subject: `type(scope): what changed`, lower case, imperative, no period.
  Pick the type deliberately — it decides whether step 6 deploys
  automatically.
- Body: plain language, wrapped at ~72 columns. Say what a coach sees change
  and any limit or rule introduced. Cite an ADR when one was written.
- No `Co-Authored-By:` trailers and no "Generated with" lines. Commits and PRs
  are authored solely by the repo owner.

## 3. Push

```bash
git fetch origin
git rebase origin/main          # resolve conflicts, re-run checks if any
git push -u origin HEAD         # --force-with-lease only after a rebase of pushed work
```

## 4. Pull request

```bash
gh pr create --base main --title "<commit subject>" --body "<body>"
```

The body: what changed and why, then a **Testing** section listing the checks
run, the e2e artifact (screenshot or export) the new spec produces, and the
`verify-chalk` report: each behavior, the entry point driven, and the evidence
file that shows it. Same no-attribution rule. Run the body through
`bun scripts/check-copy.ts -` before you post it. If the host has a
PR-linking tool, link the PR.

## 5. Wait for green, then merge

Wait on the Merge Gate checks. Prefer the host's PR watch tool when there is
one; otherwise `gh pr checks <N> --watch --fail-fast`.

- **Red:** read the failing job (`gh run view <run-id> --log-failed`), fix,
  commit, push, wait again. Never merge red, never skip checks, never
  `--admin`.
- A failure that also fails on main without this change is pre-existing: say
  so with evidence, and rerun the job (`gh run rerun <run-id> --failed`) only
  if it is genuinely flaky.
- **Green:** `gh pr merge <N> --squash --delete-branch`. Record the merge
  commit: `gh pr view <N> --json mergeCommit -q .mergeCommit.oid`.
- **"Head branch is not up to date with the base branch":** main moved while
  CI ran. `git fetch origin && git rebase origin/main && git push
--force-with-lease`, then wait for the new run and try again. Other agents
  merge often, so expect this; merge promptly once green to keep the window
  short.

## 6. Deploy

1. Find the Release run for the merge commit and wait for it to finish:
   `gh run list --workflow release.yml --commit <sha> --json databaseId,status,conclusion`.
2. Check its jobs: `gh run view <run-id> --json jobs -q '.jobs[] | "\(.name) \(.conclusion)"'`.
   - **Deploy production: success** — read the deployment URL from the job
     log or step summary.
   - **Deploy production: skipped** — the commit type cut no release. If the
     change touches the app (anything outside docs, tests, skills or CI),
     deploy by hand from an up-to-date `main`:
     `vercel deploy --prod --scope andrewsolomonedus-projects`.
     If it touches nothing that ships, say no deploy was needed.
   - **Failure** — read the log, report it, do not paper over it.
3. Verify: `vercel inspect arc-chalk.vercel.app --scope andrewsolomonedus-projects`
   must show `target production`, `status Ready`, and the same deployment URL
   (or a creation time after the merge).

## 7. Report

PR URL, merge commit, release version (if one was cut), production
deployment URL, and anything skipped or failed along the way, with its
output.
