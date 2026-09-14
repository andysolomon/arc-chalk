---
status: accepted
---

# Print & export as one workflow: source, format, preview, then print or save (parity exception to ADR 0039)

The original prototype's Export menu lists thirteen outputs, Print is a workspace tab
showing one letter-landscape sheet, and Page, Type and layer controls sit in the
inspector. Which controls change which artifact is left to be inferred, and each
output decides its own source: the call sheet and the book read the whole library,
scout cards prefer the defense, the wristband takes eight cells, and every print opens
a pop-up window whose blocking `printOrSay` ignored. GitHub #69 asked for one workflow
with the source stated first and a preview before paper.

Product decision (GitHub #69, 2026-09-13): the Print tab becomes **Print & export**, a
workspace of four steps. Recorded here as a standing parity exception; the thirteen
generators and their menu entries are unchanged and still run from the menu.

## Decision

**Source first.** Current play, Selected plays (picked and ordered by the Coach, moved
with ↑ ↓), a Game plan (whole or one section, its prepared packet or its current
plays — labeled apart when they differ), or explicitly the Full playbook. Before
anything is built the workspace states the source, unit, play count, order and, for a
packet, the prepared revision. An empty selection says "Pick at least one play." and
never falls back to the library.

**Format second.** The fifteen outputs in four groups — Diagram (field sheet, PNG,
SVG), Game day (call sheet, wristband, practice cards, scout cards), Book (binder
playbook, handout), Teaching (install page, position view, quiz, slide, progression
strip, frame sequence). Each names its paper. A format that cannot take the source
stays visible, says why, and leaves the selection alone.

**Preview third.** The sheet is shown at its page width with its margins and forced
page breaks, and the number of sheets is read off that layout — with a plain warning
when a page runs over and flows onto another. The detail preset (Full detail,
Coaching, Diagram only) and Monochrome are the workspace's own, explicit settings; no
hidden editor layer reaches an output. The field sheet's page and type are chosen
here, starting from the editor's.

**Print or save fourth.** Print… prints from a hidden same-origin frame, so no pop-up
is needed. Save as PDF… is the same dialog and is labeled as the browser's Save as PDF
choice. Open in a new tab is the pop-up path; when the browser blocks it the workspace
says so and offers Print from here. Images download. Each output that runs is kept as
a preset under **Recent** in the Print & export menu, one click from running again;
the quick PNG, SVG and Print the field entries stay in the menu.

## Preserved

Every generator in `@chalk/exports` and every menu entry from the original's Export
list; the menu's labels, order and groups; the field sheet's letter-landscape sheet and
caption; the palette's "Print preview" row. Prepared revisions still fix their own
presentation (ADR 0042). The `printOrSay` path from the menu now reports a blocked
pop-up instead of ignoring it.

## Parity evidence

The Print state is the one that changes: the original shows a sheet alone, production
shows the sheet beside the choices that produce it. Measured on the same Linux machine:
Print 11,937 → 30,549 px (2.21% of the frame); Export menu unchanged at 17,877; no
other state moves. The Print ratchet in `tests/parity/production-shell.spec.ts` is
raised from 0.0081 to 0.0225 under this decision — the one approved raise since the
grass-true correction — and recorded in `docs/parity/README.md` and
`docs/original-prototype-parity-matrix.md`.
