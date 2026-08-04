# Phase 2 — Concept families and variations

Read `plans/README.md` first. Phase 1 should be done — realignment is what makes
variations cheap enough to be worth organising.

## The problem

The library is a flat list with a hint of hierarchy: `saveVariant()` sets `parentId`, and
`pushToVariants()` can push an alignment down. But there is no tree in the UI, no way to
say "this change applies to all four versions of Stick", and no way to detach a variation
that has grown into its own play. A real playbook is a set of concepts, each run from
several formations.

## What to build

### 1. The library becomes a tree

Replace the flat `sc-for` over `savedPlays` with a two-level tree. Concept row (a play
with no `parentId`) is 34px, 13px/500 text, with a disclosure caret and a mono count chip
(`4`). Variation rows are 30px, indented 18px, 12px #4D4D4D, with a 1px #EBEBEB rail down
the indent so the family reads as a group.

```
▾ Stick — Thunder                         Pass  4
  │ Gun Doubles Right          ← current
  │ Gun Doubles Left
  │ Gun Trips Right
  │ Red zone
▸ Four Verticals                          Pass  2
```

The variation's row label is its **distinguishing name** (the formation or situation), not
the full play name — store `variantName` on the record and compose the display name as
`concept + ' — ' + variantName`. The currently-open play gets a #0072F5 dot and #171717 text.

Collapsed by default except the family containing the open play. Persist expansion state
in `fpd.libraryOpen.v1`.

### 2. New-variation flow

Replace the bare "Save as variant" link with a row of two: **Save** (updates the open
record) and **+ Variation**. `+ Variation` asks for one thing inline — the distinguishing
name, seeded from the recognised formation from Phase 1 (`"Gun Trips Right"`) — in a 30px
inline input in the library, not a modal. Enter commits, Esc cancels.

### 3. Edit scope

A scope control at the top of the library section, three segments in the existing
segmented-control style:

```
Applies to:  [ This play ]  [ Whole concept ]  [ Pick… ]
```

Default `This play`. When scope is not `This play`, mark the header of every affected
inspector section with a 11px #0072F5 tag reading `CONCEPT` so the coach can never forget
a change is broadcasting.

Scope governs these operations only — everything else stays local:

- route style, ending, color, line style
- assignment / read number / conversion / coaching note
- quick-route and quick-block application
- alignment push (the existing `pushToVariants`)
- rename

Propagation matches by `role` (Phase 1) then by route index within the player. When a
variation has diverged so far that a match fails, skip it and report: "Applied to 3 of 4 —
Red zone has no Z route." The report is a 3-second inline line in the library, not a toast
stack.

`Pick…` expands the family list with checkboxes; selection lives in state, not storage.

### 4. Detach

On each variation row's hover menu: **Detach from concept**. Clears `parentId`, promotes
it to a top-level concept, renames it to its full composed name. Undoable through the
normal history.

### 5. Concept-level record

Concepts get `{ notes, tags: [] }` — a one-line concept note and free tags ("3rd down",
"red zone"). Show tags as 10px mono chips on the concept row, right-aligned before the
category. Tags are the seed for Phase 4's call-sheet grouping, so store them even though
this phase only displays them.

## Done when

- [x] Four variations of one concept nest under it, collapse, and persist their expansion.
- [x] Changing a route's assignment with scope `Whole concept` updates all four records on
      disk and reports the count.
- [x] Scope `This play` leaves siblings byte-identical.
- [x] A diverged variation is skipped with a named reason, never silently corrupted.
- [x] Detach promotes a variation and its siblings are unaffected.
- [x] Opening any variation loads it with the family expanded and the row marked current.

## Landed

- Library renders as concept → variation tree; expansion in `fpd.libraryOpen.v1`, family of
  the open play expanded by default. Variation rows show the distinguishing name only
  (`variantName` on the record), rail down the indent, blue dot on the open one.
- `Save` / `+ Variation` pair in the library header; `+ Variation` is a 30px inline input
  seeded with the recognised formation, Enter commits, Esc cancels.
- `Applies to: This play / Whole concept / Pick…` at the top of the library. Scope governs
  route style, ending, colour, line style, assignment / read / conversion / note, quick
  routes, quick blocks, whole-line calls, alignment push, and rename. Affected inspector
  headers carry a 11px #0072F5 `CONCEPT` tag.
- Propagation matches by role, then route index within the player; a miss is skipped and
  reported inline ("Applied to 4 of 5 — Red zone has no Z route"). Library writes ride the
  normal undo stack as `{__lib}` snapshots.
- Detach on a variation row's hover menu; concepts carry `{notes, tags[]}` edited from the
  row's `note` action, first tag shown as a 10px mono chip.
- Seed bumped to `fpd.examples.v9`: Stick — Thunder as a concept with Gun Doubles Right,
  Gun Doubles Left, Gun Trips Right and Red zone (Red zone has no Z route on purpose).
