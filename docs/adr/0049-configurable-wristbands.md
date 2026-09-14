---
status: accepted
---

# Wristband inserts are cut to the Coach's dimensions from an explicit selection (additive extension under ADR 0042 and ADR 0047)

The original's wristband is eight fixed 2.1 × 1.4-inch cells, pre-filled with the
first eight library entries, printed in library order with long names ellipsized.
ADR 0042 let a plan print as many bands as its calls need. GitHub #71 asked for
inserts a Coach sizes, orders and labels himself, on the plan's stable codes.

## Decision

A plan's **Wristband** in Print & export is cut by a `WristbandConfig` kept per plan on
the device (`wristband.v1`):

- **Size** — cell width and height in inches, cells across and down one insert. Presets
  are named by their dimensions ("2.1 × 1.4 in cells, 2 across × 4 down") and claim
  nothing about any maker's band; the Coach's own numbers are the truth.
- **Layout** — code + name, code + diagram, or code, name + diagram.
- **Calls** — the band starts from every call of the plan in plan order, one cell per
  call, to confirm; the Coach takes calls off, adds them back, orders them by drag or
  by the arrows, and gives a call a short display name for a small cell. The plan's
  call code is never replaced and never renumbered. Nothing from outside the plan is
  ever placed on the band.
- **Inserts** — as many as the calls need, each on its own sheet, "Insert 1 of 3"; no
  call is left off.

The sheet prints each cell at its physical size with a dashed cut guide and corner
ticks, a one-inch calibration bar to hold a ruler against, and the instruction to
print at 100 % (Actual size) rather than Fit to page. Names wrap rather than cut.
Before printing, `wristbandFit` names a code on two cells, a call whose Play is not in
the packet, a name that will not fit its cell at this size (with the short name as the
remedy), and a cell too short for a diagram.

Selection and library sources keep the original eight-cell band.

## Parity

Additive: the original's Wristband menu entry, picker and eight-cell output are
unchanged for the library. Recorded in `docs/original-prototype-parity-matrix.md`.

## Not decided here

A physical insert test on a printed band, and name-heavy and diagram-heavy prints at
actual size on paper; the fixtures in `tests/exports/wristband.test.ts` cover both
shapes and the estimates they warn on are character-count heuristics, not measured
glyphs.
