---
status: accepted
---

# Persist bounded, hash-guarded undo history per Play

Chalk keeps a separate undo and redo history for each Play and persists that history locally. History is expressed as semantic forward and inverse commands rather than full-document snapshots, and every command is guarded by the document hashes it expects before and after application.

## Consequences

- Each Play owns independent undo and redo stacks that survive switching Plays and restarting the app.
- A committed gesture, multi-selection transform, mirror, paste, or delete creates one undo entry.
- Consecutive edits to one text field coalesce until the Coach pauses, blurs the field, or moves to another field.
- Undo entries store semantic forward and inverse commands plus expected before and after document hashes; they do not store complete Play snapshots.
- Undo or redo applies only when the current document hash matches the entry's expected boundary hash. A stale or incompatible entry is quarantined rather than applied speculatively.
- Creating a new edit after undo clears only that Play's redo stack.
- Each Play retains at most 100 commands, 20 MiB of encoded history, or seven days of history, whichever limit is reached first.
- A schema migration may invalidate local undo history, but it must never invalidate the current Play, immutable revisions, or named versions.
- Restoring an immutable revision creates a new current commit; it does not rewrite history.
- Clearing a Play is an ordinary hash-bound, undoable transaction.
- Undo persistence is device-local and is not synchronized to Convex.

