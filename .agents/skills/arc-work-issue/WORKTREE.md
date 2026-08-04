# Worktree Setup

Load this when creating, shipping, or cleaning up a worktree for `arc-work-issue`.

## Defaults

- **Worktree root:** `../wt` (sibling of the repository root)
- **Worktree path:** `../wt/issue-<number>` or `../wt/<W-id>` when a `W-` ID exists
- **Base ref:** `origin/main`, falling back to `main` or `master` if needed

## Resolve W- ID to issue number

```bash
gh issue list --search "W-000014 in:title" --state open --json number,title --limit 5
```

If title search fails, search body text or list open issues and match `[W-000014]` / `W-000014`.

Ambiguous multiple matches: stop and ask the user which issue to use.

## Fetch issue

```bash
gh issue view <number> --json number,title,body,state,comments
```

Stop if `state` is not `OPEN`.

## Branch naming

```bash
# With W- ID in title, e.g. "[W-000014] Add queue retry"
feat/W-000014-add-queue-retry

# Without W- ID
feat/issue-14-add-queue-retry
```

Slug rules: lowercase, hyphens, drop punctuation, max ~40 chars.

## Create worktree

Run from the repository root (not inside an existing worktree):

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
ISSUE=14
BRANCH="feat/W-000014-add-queue-retry"
WT_DIR="$(dirname "$REPO_ROOT")/wt/issue-${ISSUE}"

git fetch origin
mkdir -p "$(dirname "$WT_DIR")"
git worktree add -b "$BRANCH" "$WT_DIR" origin/main
cd "$WT_DIR"
```

If the branch already exists locally, attach with `git worktree add "$WT_DIR" "$BRANCH"` instead of `-b`.

If `origin/main` is missing, use the repo's default branch.

## Commit (Conventional Commits)

Load `arc-conventional-commits` and choose the correct type:

- `feat:` for new behavior
- `fix:` for defect repair
- `test:`, `refactor:`, `docs:`, etc. when that is the sole change

```bash
git add <issue-scoped-files>

git commit -m "$(cat <<'EOF'
feat: add queue dispatch retry with backoff

Closes #14
EOF
)"
```

Include the `W-XXXXXX` ID in the subject when the issue uses one.

## Push and open PR

```bash
git push -u origin HEAD

gh pr create \
  --base main \
  --title "feat: <short title>" \
  --body "$(cat <<'EOF'
## Summary
<what changed>

## Related Issue
Closes #<number>
EOF
)"
```

## Merge PR

Prefer squash merge after checks pass:

```bash
gh pr checks <pr-number> --watch
gh pr merge <pr-number> --squash --delete-branch
```

If the repo uses required checks that cannot complete in this environment, enable auto-merge and report the PR URL:

```bash
gh pr merge <pr-number> --squash --auto --delete-branch
```

## Cleanup worktree (required after merge)

Run from the repository root:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git fetch origin

git worktree remove "$WT_DIR"
git worktree prune
git branch -d "$BRANCH" 2>/dev/null || true

cd "$REPO_ROOT"
git pull origin main
```

Do not delete the remote branch manually when `gh pr merge --delete-branch` already removed it.
