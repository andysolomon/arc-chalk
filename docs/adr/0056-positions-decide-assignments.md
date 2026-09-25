---
status: accepted
---

# A man's position decides what he can be given (amends ADR 0052 and ADR 0053)

ADR 0052 gave each man a Draw row that offers his own lines — Route, Motion, Block for a
receiver or back; Block for a lineman; Zone drop and Blitz for a defender — and ADR 0053
had a selected line offer its owner's kinds. Neither was a rule: the row was a menu, and
every other way of giving a man a line went round it. The R and M keys drew a route or
a motion from a defender or a lineman, Z drew a zone drop from a receiver, the blue dot
dragged a route from anybody, and the line inspector offered Route, Motion and Ball on a
lineman's block and Ball on a defender's drop.

Product decision (2026-09-25): specific positions perform specific assignments.
Defensive players never run routes, offensive players never blitz, and the offensive
line never runs routes — it only blocks.

## Decision

**One rule, in the domain.** `lineKindsFor(player)` names the lines a man can be given
and `canRunLine(player, kind)` asks it:

| Who                  | Can be given               |
| -------------------- | -------------------------- |
| A defender           | Zone drop, Blitz, Stunt    |
| An offensive lineman | Block                      |
| Any other offense    | Route, Motion, Block, Ball |

It reads the man, not the Play, so a shadow defender on an offensive play is held to it
as firmly as a defender on his own.

**Who is a lineman.** `isLineman` keeps the original's reading — an offensive man with
no letter, level with the ball — and adds the letters that name a spot on the line:
LT, LG, C, RG and RT. A Coach who letters his centre _C_ has said he is the centre,
wherever he stands.

**Every way in asks.** Starting a line by hand (the Draw row, R M B Z, the palette's
four Draw commands, the blue dot's drag) goes through `canDrawFrom`, and a key a man
cannot use starts nothing and closes nothing. The blue dot is shown only on a man who
runs routes. The line inspector's kind buttons are his `lineKindsFor`. The editor's
commands refuse the same things the controls no longer offer: `setRouteKindCommand`
turns a line only into a kind its man can run; `addAlternateRouteCommand`,
`applyPlayerRoutePresetCommand` and `applyRoutePresetCommand` give a route only to a
man who runs one; `applyLinePresetCommand` puts a block, drop or blitz only on the men
given who can run it and leaves the rest as they were.

**What is already drawn stays.** A Play is never silently rewritten (CONTEXT.md, Play):
a stored line its man could not be given today — from an older device, a backup, or a
man moved onto the line after his route was drawn — still loads, renders, animates and
exports. The domain's commands and schema accept it; only the editor refuses to make
new ones. The Coach can turn it into a kind his man can run.

## Consequences

- A defender's line no longer offers Ball, and a lineman's block offers only Block.
- A lettered lineman (LT, LG, C, RG, RT) is left out of concept distribution and
  counted into line calls, the ball's lateral spot and line pacing, as an unlettered
  one already was.
- `offensiveRouteKinds` and `defensiveRouteKinds` are replaced by `lineKindsFor` and
  `lineKindNames`.
- `docs/original-prototype-parity-matrix.md` records this beside ADR 0052 and 0053.
