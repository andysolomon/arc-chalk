# Phase 1 — Formation intelligence

Read `plans/README.md` first for the shared context (file layout, palette, doc shape,
commit discipline). This phase is the one genuinely missing P0 item: today, applying a
formation is destructive, and formations are anonymous bags of coordinates.

## The problem

`insertFormation(id, mode)` supports three modes — `off` (replace offensive players and
their routes), `all` (clear the field), `add` (drop players in on top). All three throw
away route work, and the panel copy says so out loud: "Undo brings the old play back."
Undo is a safety net, not a workflow. A coach who has drawn a five-route concept in Gun
Doubles Right and wants to see it from Gun Trips Right currently has to redraw it.

Separately, formations have no football identity. `formationDefs()` entries are
`{id, name, desc, players:[{x,y,s,l,sub}]}`. Nothing knows the personnel grouping, which
way the strength points, where the ball is, or which formation is this one's mirror. So
"Gun Doubles Right → Gun Doubles Left" can only be done by geometric mirroring, which is
right by accident and wrong as soon as terminology is involved.

## What to build

### 1. Formations become structured objects

Extend every entry in `formationDefs()` and the custom-formation record with:

```js
{
  id, name, desc,
  family:   'doubles',        // groups Right/Left/Trips siblings
  personnel:'11',             // 10, 11, 12, 20, 21 — RB/TE count
  strength: 'right',          // 'right' | 'left' | 'balanced'
  mirrorOf: 'doubles-left',   // id of the semantic counterpart, or null
  ball:     { x: 500, y: 372 },  // spot the alignment is described from
  hash:     'middle',         // 'left' | 'middle' | 'right'
  players: [{ x, y, s, l, sub, role }]  // role: 'QB','RB','TE','X','Z','H','LT'…
}
```

`role` is the load-bearing addition — it is what lets a route survive a realignment.
Backfill `role` on every existing preset formation and every defense preset. When a user
saves a custom formation, infer `role` from the player's `label` first (X/Y/Z/H/Q/T are
unambiguous), then from position on the field (interior five closest to the ball are
LT/LG/C/RG/RT by x-order; anything ≥8 yards deep and near midX is a back).

Surface identity in the formation list row: name on the left, then a mono chip reading
`11 · RIGHT` where the current `desc` sits. Keep the row height at 34px.

### 2. A fourth apply mode: "Realign — keep assignments"

This is the headline. Add `mode: 'realign'` to `insertFormation`, and make it the
**default** selected mode in `formModes` (currently `off`).

Algorithm:

1. Match current players to incoming slots by `role`. Exact role match first.
2. Unmatched incoming slots → new players, drawn ghosted-in for one frame so the eye
   catches them.
3. Unmatched current players → left exactly where they are, and reported in the summary
   ("2 players had no spot in Trips — left in place").
4. For each matched pair, translate every route the player owns by the delta
   `(newX - oldX, newY - oldY)`. Points, curve handles, and branch geometry all move.
   Depth relative to the line of scrimmage is preserved, so a 12-yard dig stays a
   12-yard dig even if the receiver's alignment depth changed — translate x fully, and y
   only by the player's own y-delta.
5. Labels bound to a player (`side`+proximity) follow him.
6. Everything is one `commit`, so one undo restores the whole realignment.

### 3. Pinned ghost preview with an explicit commit

Today the ghost only shows on hover and applies on click — a mis-click reshapes the play.
Change to: hover ghosts as it does now; **click pins** the ghost and shows a compact
confirm bar over the bottom of the canvas (not a modal):

```
Gun Trips Right · 11 · RIGHT     [Realign ▾]  Cancel   Apply
```

- The mode dropdown in the bar mirrors `formModes`, so the decision happens at the moment
  of applying rather than before choosing.
- While pinned, the ghost renders at 0.32 opacity with matched players connected to their
  destination by a 1px #0072F5 hairline — the coach can see who moves where before
  committing.
- `Esc` cancels. `Enter` applies. The confirm bar is the only new chrome; do not add a
  modal or a dialog.
- Below the bar, a one-line summary in 11px #8F8F8F: "8 players realign · 3 routes stay
  attached · 1 player has no spot."

### 4. Strength flip uses the counterpart

`mirrorStrength()` currently mirrors geometry and swaps terminology words. When the
current play's players match a known formation and that formation has `mirrorOf`, route
the flip through the counterpart's alignment instead of a pure reflection — so hash
relationship and unbalanced alignments come out right. Fall back to the existing
geometric mirror when no formation is recognised. Add `recognizeFormation(doc)` returning
`{def, confidence}` by comparing role-tagged positions within a 14px tolerance.

Show the recognised formation in the status bar when nothing is selected:
`GUN DOUBLES RIGHT · 11` in mono 11px, or `CUSTOM ALIGNMENT` when confidence is low.

## Panel copy to replace

The `formHint` strings currently lead with what gets destroyed. Rewrite around what is
kept:

- realign: "Players move to the new alignment. Every route stays attached to the man
  running it."
- off: "Replaces the offense and their routes. Defense, text and notes stay put."
- all: "Clears the whole field and starts fresh from this formation."
- add: "Drops these players in on top. Nothing is removed — they land selected so you can
  drag them as a group."

## Done when

- [x] Draw five routes in Gun Doubles Right, apply Gun Trips Right with Realign: every
      route is still attached, still at its original depth, nothing needs repair.
- [x] One `⌘Z` after a realignment restores the previous alignment *and* route geometry.
- [x] Clicking a formation never changes the field until Apply; `Esc` leaves the play
      untouched.
- [x] The pinned ghost draws destination hairlines for matched players.
- [x] A saved custom formation gets sensible `role` values and realigns correctly.
- [x] Flip strength on a recognised formation produces the counterpart alignment, and on
      an unrecognised one still mirrors geometrically.
- [x] Status bar names the recognised formation with personnel.

## Landed — 2026-07-31

All of the above, in `Chalk Play Editor.dc.html`:

- `formationDefs()` now returns structured objects (`family`, `personnel`, `strength`,
  `mirrorOf`, `ball`, `hash`, per-man `role`). The five presets are authored right-strength
  and their Left counterparts are derived — geometry mirrors, X/Z and the tackles/guards keep
  their side of the field. Ten rows, each with a mono `11 · RIGHT` chip. Defense presets carry
  side-qualified roles (`C-L`, `E-R`).
- `roleFromLabel()` / `rolesFor()` infer roles for any doc: label first, then the five
  unlabeled men closest to the ball as the line, then depth for backs. Custom formations are
  saved with roles, personnel, strength, ball and hash.
- `realignPlan()` / `realignDoc()` / `applyRealign()`: role-matched realignment that carries
  routes, curve handles, branches and nearby unbound labels; unmatched incoming slots land as
  new players (blue ring for ~0.6s, and selected); unmatched current players stay put and are
  reported. One `commit`, so one undo.
- `realign` is the default apply mode. Clicking a formation pins the ghost (0.32 opacity)
  with #0072F5 destination hairlines and a confirm bar over the bottom of the canvas —
  name, chip, mode dropdown, Cancel, Apply, one-line summary. Esc cancels, Enter applies.
- `recognizeFormation()` (role match, 14px tolerance) drives both the status-bar readout
  (`GUN TRIPS RIGHT · 11` / `CUSTOM ALIGNMENT`) and `mirrorStrength()`, which now routes a
  recognised flip through the counterpart's alignment and falls back to the geometric mirror.

Not in scope, still true: inserting a **defense** still applies on click (no pin) — the phase
only names formations. Worth revisiting when Phase 3 touches the panels.
