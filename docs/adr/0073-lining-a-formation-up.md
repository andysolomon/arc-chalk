---
status: accepted
---

# Lining a formation up: the line, the men beside him, and the count on the line (amends ADR 0035)

A Coach asked for alignment the way a design tool does it: drag a shape and see when it is
level with, in line with, or evenly spaced from the shapes around it. He wanted it most
for the offensive line, so five men stand level with even splits; he wanted to be able to
leave men unaligned when the play calls for it; he wanted a receiver to be on the line or
off it on purpose; and he wanted the canvas to know how many men the rules allow off the
line of scrimmage.

## What was wrong

ADR 0035 already snapped a lone dragged man to the ball, the line of scrimmage, the
Field Profile's landmarks, the men around him and a grid, in that order. Its yard marks
are every yard and ranked as landmarks, above the men. At the default zoom a yard is
about ten screen pixels, so a yard mark is never more than five pixels from the pointer,
inside the eight-pixel reach; depth alignment with a teammate could almost never win.
The starter's linemen stand a yard and a half off the ball, so a tackle dragged a little
low landed on the two-yard mark, half a yard under the rest of his line. Every guide was
a dashed line across the whole field, an unlettered lineman was named "player", and
nothing said which men a dragged man was lined up with.

## Decision

**The offense's line is a place a man is dragged to.** A man of the offense has two
targets in depth: level with the snapper — _On the line_ — and a yard under it — _Off
the line_. The snapper is the lineman nearest the ball, or the man drawn as the center
when nobody stands where a lineman does; a dragged snapper measures the line off the
next man over the ball, so it does not follow the pointer. On the line ranks with the
ball and the line of scrimmage, so a lineman dragged along it stays on it. Off the line
ranks with the men, so a slot can line up with another slot. Neither reaches further
than the half yard that decides whether a man is on the line: zoomed out on a phone,
eight pixels is nearly two yards, and a line that reached that far pulled back every
receiver dragged off it. A snap to the line never changes whether a man is on it.
Defenders are given neither.

**The men rank above the yard marks** (amends ADR 0035). The order is now: the ball, the
line of scrimmage and the offense's line (or, in the tackle box, its gaps — issue #164);
the hashes and the sidelines; the men — in line with one, the same depth as one, centred
between two, an even split, a step off the line; the yard marks; the grid. Nearest wins
within a rank, as before.

**Even splits.** Like a design tool's equal spacing, a man is offered the spot a split
from the man beside him that the men of his own row already keep — the row is everyone
within three quarters of a yard of his depth, so the backfield's spacing never pulls a
lineman. The space he stands in is not offered (measured by it he lands on the man at its
far side). One offer per spot, named for the pair nearest him: a tackle brought back in
is told _Same split as C to RG_.

**Guides say what lines up with what.** A field landmark — the ball, the line of
scrimmage, a hash, a sideline, a yard mark — is drawn across the field with its word at
the edge, as the original drew it. The offense's line is drawn the same way with a cross
on every man standing on it. A teammate is a short solid line through the men it lines
up, the dragged man among them, each marked with a cross. An even split, or a man centred
between two, measures each matching space between the men's marks, and the dragged
man's own space carries the distance (_2 yd_). Unlettered linemen are named for the spot
they stand in — LT, LG, C, RG, RT — so a guide reads _Same depth as RG_. The depth
readout beside a dragged man of the offense says whether he is on the line or off it.

**Unaligned on purpose.** Holding ⌘ or Ctrl through a drag puts a man exactly where the
pointer does, as a design tool lets a shape go unsnapped (Alt already pans the field,
ADR 0016). S still turns snapping off, the arrow keys still nudge without snapping, and a
snap only ever reaches a few pixels, so a man dragged past one goes where he is dragged.
When one man is picked, the status bar says what he snaps to and how to place him
freely.

**The count on the line.** No eleven-man code allows more than four backs. The NFL and
the NCAA say it as at least seven on the line; high school since 2019 says at least five
on the line and no more than four backs ([NFHS](https://nfhs.org/stories/40-second-play-clock-postseason-instant-replay-among-football-changes)).
With eleven on offense every code comes to seven on the line; there is no most. A man is
on the line when he stands within half a yard of the snapper's depth — the shipped sets
draw receivers a third of a yard under the linemen and mean them on it — and a back
otherwise; the quarterback under center is a back. `scrimmageLine` in `@chalk/domain`
reads it off the Play. The count rides in the field's lower left while a man of the
offense is dragged — _7 on the line · 4 backs_ — and stays there, in the error colours,
while the formation has more than four backs: _Illegal formation — needs 7 on the line_,
or _no more than 4 backs_ while fewer than eleven are drawn. A legal set at rest says
nothing over the field; the status bar carries _LINE 7 · BACKS 4_ on screens wide enough
for its readouts. It is a call, never a block: a Coach mid-edit or drawing a scout look
can stand any formation he likes. A defensive play counts its shadow offense only while
the shadow is shown.

## Consequences

- Snapping still changes only the transient gesture and commits ordinary coordinates
  (ADR 0035, ADR 0012). Nothing new is stored in a Play, and rendering, playback, Share
  Links and exports are unchanged.
- The shipped sets draw their slots level with the outside receivers, so most read eight
  to ten on the line; a Coach who drags his slots a step off the line makes the count
  true. The sets themselves are the original's and are not changed here.
- Which receivers are eligible — the two men at the ends of the line and the backs, so a
  tight end covered by a receiver on the line cannot catch a pass — is not decided here.
- Fewer than eleven on offense is an unfinished drawing; only the four-back limit is
  called, since high school allows fewer than seven on the line then.
- A group still moves raw; ⌘/Ctrl is read from the pointer's moves, so it is held through
  the drag rather than pressed alone.
- The regressions are `tests/e2e/line-alignment.spec.ts` (a tackle held on the line and
  put back at his split, Z and X taken off the line until the formation is illegal, a
  guard placed freely) and `tests/e2e/phone-line-alignment.spec.ts` (a finger puts Z a
  step off the line on an upright and a sideways phone, and the call stays clear of the
  sheet). In isolation, `tests/domain/line-of-scrimmage.test.ts` holds the reading of the
  line to its edge cases and `tests/editor/even-split-snapping.test.ts` keeps a lineman
  from the backfield's spacing; `tests/editor/smart-snapping.test.ts` now ranks the men
  above the yard marks.
- The selection toolbar's Arrange menu (Align depth, Space evenly) is held to the rules where
  a drag is not: a rearrangement that would leave more than four backs, carry a man across the
  line of scrimmage, or stand two men's marks on one another is greyed, with the reason under
  it (_Needs 7 on the line_, _C and Q would overlap_). Only a fault the rearrangement causes
  counts, so a scout look already drawn wrong can still be lined up. `arrangePlayers` in
  `@chalk/editor` makes the call, and the palette's Same depth and Even splits share it. The
  regressions are `tests/e2e/arrange-menu.spec.ts` and `tests/e2e/phone-arrange-menu.spec.ts`.
