---
status: accepted
---

# Resolve synchronization conflicts in a non-blocking visual inbox

When synchronization detects divergent revisions of one Play, Chalk preserves both branches and lets the Coach continue working. Resolution is an explicit visual workflow rather than an interrupting modal or an automatic merge.

## Consequences

- Synchronization never replaces the currently open Play with a remote branch.
- The current device continues editing its local branch, and affected Plays receive a visible unresolved-conflict badge.
- A Conflict Inbox compares branches with diagram previews, timestamps, device labels, and revision notes.
- An optional overlay highlights added, removed, moved, and changed diagram elements.
- Resolution actions are `Use this version`, `Keep both as separate Plays`, and `Combine manually`.
- Manual combination starts from a selected branch and allows the Coach to copy Players, MovementPaths, Assignments, and annotations from the other branch.
- Source revisions remain recoverable after resolution.
- An unresolved conflict does not block editing or synchronization of unrelated Plays.

