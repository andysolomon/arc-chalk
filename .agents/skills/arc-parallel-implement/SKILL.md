---
name: arc-parallel-implement
description: "Implements multiple planned user stories in parallel using subagents. Each story gets its own branch, commit, and PR. Use when asked to implement multiple issues, execute a batch of stories, or build several features at once."
---

# Parallel Story Implementation

Implement multiple independent planned stories concurrently. The leading words are
**worktree-first**: each story gets its own feature branch and isolated worktree
before any write-capable worker starts. The parent owns plans, route selection,
acceptance, review judgment, and approval; workers only edit and verify their
assigned worktree.

## Input

Accept the planned story or issue references plus an optional requested ship mode:

- `--ship pr` (default) — open one PR per accepted story and stop for review.
- `--ship auto` — enable auto-merge only when the caller explicitly requests it.
- `--ship merge` — merge only when the caller explicitly requests it.

Carry the requested mode into every story contract. Do not let an implementation
worker choose or execute it.

## When to Use

- The user asks to implement multiple issues or planned stories.
- Each story has a plan and acceptance criteria.
- File ownership is independent enough for concurrent work.

Use `arc-work-issue` for one story. Run dependent or heavily overlapping stories
sequentially.

## Prerequisites

1. **Plans exist.** Collect each issue number, `W-XXXXXX` ID, title, complete plan,
   acceptance criteria, target files, and verification commands. If a plan is
   missing, use `arc-planning-work` first.
2. **Stories are independent.** Build a file map. Assign minor shared-file changes
   to one story and record the dependency; serialize heavy overlap.
3. **Baseline is known.** Confirm the main checkout is clean enough to create
   worktrees and run the repository's baseline tests.
4. **Branches are fixed.** Default to
   `feat/W-XXXXXX-<short-description>` and preserve the repository's established
   convention when it differs.

## Orchestrator Route Guidance

Choose one bounded route per phase:

- `codex-explore` — read-only repository mapping, dependency tracing, or evidence
  gathering before the parent finalizes story boundaries.
- `composer-implement` — default for clear, mechanical implementation. This is the
  Cursor/Composer 2.5 implementation lane; there is no separate
  `cursor-implement` route.
- `codex-implement` — harder implementation, debugging-heavy work, or escalation
  after Composer misses the bar.
- `codex-check` — independent correctness, regression, security, and
  acceptance-criteria review.
- `opus-review` — high-taste UI/UX, API, architecture, copy, docs, prompt, or skill
  critique.
- `opus-explore`, `opus-check`, and `opus-implement` — matching availability
  fallbacks when Codex is unavailable, not default routes.

Concurrent read-only routes may share a checkout. Every concurrent write-capable
route must receive a different story worktree. Workers never commit, push, merge,
comment, deploy, edit secrets, update issues, or touch unrelated files. Review
workers return findings to the parent rather than posting them; the parent retains
judgment and approval.

## Workflow

### Step 1: Gather and Partition

Fetch each issue body and comments, then build the story/file map:

```bash
gh issue view <number> --json title,body,labels
gh issue view <number> --comments --json comments
```

Completion criterion: every story has a plan, acceptance criteria, owned files,
branch name, and test commands, with dependencies and overlaps explicitly marked.

### Step 2: Create Isolated Worktrees

Load the [worktree rules](../arc-work-issue/WORKTREE.md) used by
`arc-work-issue`. From the repository root, create one feature branch and worktree
per story before launching write-capable workers. Treat each returned path as that
story's sole directory for reads, edits, and tests.

Completion criterion: `git worktree list` shows one distinct worktree and feature
branch per story; no worker will write to the main checkout or another story's
worktree.

### Step 3: Delegate Bounded Story Work

Launch independent story tasks concurrently when the runtime supports it. Each
task contract must include:

1. exact story outcome and complete plan;
2. issue number, `W-XXXXXX` ID, branch, and absolute worktree path;
3. files to read and files allowed to change;
4. behavior and story/plan formats that must remain unchanged;
5. verification commands and acceptance criteria;
6. explicit prohibitions: no commits, pushes, comments, merges, deployments,
   secret edits, issue updates, generated artifacts, other GitHub mutations, or
   unrelated refactors;
7. required report: changed files, tests added, command results, risks, and blockers.

Use the route guidance above. Do not run two write-capable workers against the
same checkout.

Completion criterion: every worker returns scoped changes and verification
evidence from its assigned worktree, or a concrete blocker.

### Step 4: Inspect and Verify Each Story

The parent reviews every story diff against its plan and acceptance criteria,
checks that only story-owned files changed, and runs focused tests in that story's
worktree. Use `codex-check` when an independent correctness review is worthwhile
or `opus-review` for taste-sensitive review.

Completion criterion: each story is accepted with relevant tests passing, or is
reported blocked without being shipped. Worker output is evidence, not ground
truth.

### Step 5: Commit and Ship Per Story

For each accepted story under orchestration, the parent:

1. loads `arc-conventional-commits`, stages only the exact story-scoped file
   allowlist, then supplies a conventional message with `Closes #<N>` to
   `mechanical-commit-push` and inspects its result;
2. directly opens the PR with `gh pr create` from the story branch;
3. stops with the PR open for `--ship pr`, or delegates an explicitly requested
   auto-merge or merge to `mechanical-merge`.

If review findings need publication, the parent decides their disposition and
delegates the resulting GitHub comments to `mechanical-post-comment`. Outside
orchestration, preserve `arc-git-pr-check`'s standalone `--ship merge|auto|pr`
behavior and the caller's explicit mode.

Completion criterion: every accepted story has its own conventional commit and PR
result for the chosen ship mode, and every blocked story has an explicit handoff.

### Step 6: Report and Clean Up

Report one row per story:

| Branch | Issue | Tests | Files | PR / status |
|--------|-------|-------|-------|-------------|
| `feat/W-000005-...` | #5 | 149 (12 new) | 7 | #61 |

Remove a story worktree only after its PR is merged. Leave worktrees and branches
in place for `--ship pr` and `--ship auto`, and report their paths for review or
follow-up.

Completion criterion: merged stories leave no stale worktrees; unmerged stories
report their worktree paths, branches, and PR URLs or blockers.

## Rules

- Preserve one `W-XXXXXX` story, branch, commit, and PR per worktree.
- Never implement in the main checkout or share a writeable worktree between
  concurrent workers.
- Stage only story-owned files; never use `git add .`.
- The parent owns judgment and approval; workers only edit and verify within scope.
- Under orchestration, use `mechanical-commit-push`, direct `gh pr create`,
  `mechanical-post-comment`, and `mechanical-merge` for their respective mechanics.
- Outside orchestration, preserve `arc-git-pr-check` and its standalone ship modes.
- Keep dependent or heavily overlapping stories sequential.
