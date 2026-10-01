---
status: accepted
---

# A route's words stack beside it and stay on the paper

A route says four things at the end of its line: the number the quarterback reads it
on, the man's Assignment, what it converts to, and the point the Coach makes off it.
The original hangs the read off the last leg's normal on one side and steps the words
out along the same normal on the other, 22 px for the first line and the label size
plus 5 for each further one. Across the field that stacks the words up the page. Beside
a vertical route — a Go, a fade, a seam — it lays all three on one baseline, each 17 px
further from the line, and a name as long as COMET FADE-OUT, centred 22 px off the
line, runs back across it. A note of any length ran off the left edge of the paper. The
production renderer reproduced this exactly (issue #158): the exported SVG had the
Assignment at y 225.950, the conversion at 225.909 and the note at 225.868, and the
install page carried the same picture because it prints through the same renderer.

The original also places every word on the field in one pass — a line that lands on
another slides along its normal up to 14 px, and one that still cannot get clear is
drawn on a white card — and the production renderer had never ported that pass.

## Decision

**The words stack up or down the page, never along the line.** Lines of type run across
the page whatever the route does. The block hangs off the same anchor the original uses
(22 px along the normal, away from the read) and its further lines step a line at a
time — up the page when the words sit above the line, down the page when they sit below
it or beside it. Beside a vertical route that reads in order: Assignment, conversion,
note, level with the read on the other side. Across the field nothing moves: a route
heading left or right keeps its words centred over or under the line at the original's
own offsets, so the goldens captured from the original still measure the same field.

**Beside a vertical line the block hangs away from it.** When the last leg is steeper
than 30° the words are set with their end nearest the line at the anchor (`text-anchor`
`end` to the left of a line, `start` to the right), so a long name never straddles the
route. Across the field they stay centred.

**Every line stays on the paper.** A line whose estimated width would cross the paper's
left or right edge turns to hang inward from a 6 px margin; a block that would leave the
top or bottom is lifted back in whole. Type on the field is estimated, not measured, at
the original's 0.62 em a character plus tracking, which overshoots Geist a little; that is
the safe side, since words are pushed clear of a line and turned in from an edge a few
pixels sooner than they had to be.

**A line on the field is a call, not a paragraph.** Words wider than a quarter of the
paper (260 px, about the split from a wide receiver to the numbers) are cut short between
words with an ellipsis, so the character count follows the type size: 38 characters for
a Coach note, 34 in Print, fewer under Present. The Assignment is limited to 18 characters
already and is never cut in practice. The whole note lives on the install page, in the
position sheets and in the inspector; the renderer's scene under the field still carries
every word.

**Words are placed once, in the original's order.** The read number holds its spot over
the Assignment, the Assignment over the conversion, that over the note, and all of them
over a free label. A line that lands on one already placed slides along its own normal
by 4, 9 or 14 px either way; if it still cannot clear it goes on a white card so the line
on top reads. A label the Coach placed by hand is never moved: a boxless one that lands on
a route's words is given the card, and one he boxed keeps his box.

**The status bar's hint is left as it is.** Since #176 it reads _labels are small — zoom
in to read them_ below the original's 11 px threshold. That is true: the field draws its
words at every zoom, and this change does not take them off.

**Notes on the field and notes on the sheet stay two controls.** Show on field → Notes
takes the conversion and the note off the field; the Print & export workflow's own Detail
(ADR 0047) decides what a sheet prints — _Coaching_ prints reads, assignments and text
without notes. The install table under the diagram carries every word either way.

Semantic colour and contrast of the words is issue #73, not this decision.

## Evidence

`tests/render/field-words.test.ts` names each way the placement was found to fail or
could — one baseline on a vertical route, words across the line, off the left, right,
top or bottom edge, a paragraph on the field, the horizontal case moved, two routes' words
on top of each other, a label on a route's words — and pins one test to each. They were
written before the geometry.

`tests/e2e/route-labels.spec.ts`, at 1440 × 960, gives X a Go named COMET FADE-OUT with
read 1, a conversion and a note, and H a Curl named COMET RETURN with read 3, a choice and
a note, on the seeded Stick. It measures the rendered SVG: each line a full line under the
last, none past the paper's edge, none across the Go, in light and dark; then the install
page's SVG the same way, with the table carrying every word; then Notes off on the field
and Coaching detail on the sheet. It saves the field in both appearances, the install
page's HTML with and without notes, and the sheet as printed (PNG, and PDF on Chromium).

Parity: `tests/parity/production-shell.spec.ts` against the original's goldens on the
same Linux machine, branch against `main`. Editor 35,242 px from 35,254; More / Export /
Save / Palette 36,738 / 37,098 / 35,385 / 36,039 from 36,750 / 37,110 / 35,394 / 36,053;
Print 35,695 from 35,697; Formations, Defenses and Shortcuts unchanged at 36,770 /
29,679 / 59,679; Present and Demo under ratchet and unchanged. The seeded Play's routes
all end across the field, where the words do not move, so every state holds or narrows by
a few pixels. Every editor state is above its macOS-captured ratchet on this machine on
`main` as well, by rasterization, and passes with the CI delta; no ratchet moves. Recorded
in `docs/parity/README.md`.
