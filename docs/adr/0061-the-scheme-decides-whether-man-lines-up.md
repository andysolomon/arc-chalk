---
status: accepted
amends: 0060-man-coverage-lines-up-on-receivers
---

# The scheme decides whether man coverage lines up, and coverage has depth defaults

ADR 0060 lined every defender in man up on his receiver the moment he was given one,
whatever the call. That is right for an all-out man call and wrong for most others: in
Nickel Cover 1 a corner playing off with the free safety behind him was dragged a yard
inside his man at the call's depth, and a Coach who tapped _Man_ on a defender he had
placed by hand saw him jump across the field. A football video game does not do that. Its
defense lines up to the call: press-man Cover 0 walks everyone up on his man, a man call
with help deep leaves the men where the call aligns them, and the coach adjustments say
how far off the ball corners and safeties play.

Product decision (2026-09-26): making a man assignment should not move the player unless
the scheme calls for it. Cover 0 moves the men in man onto their receivers. The Coach
should be able to set defaults for how far off the ball corners and safeties play.

## Decision

**The scheme is read off the field** (`manCoverageScheme`). With any man call on, the
defense is named by how many defenders are deep behind the men in man: a zone drop that
reads as deep (its bubble's type, or `classifyZoneCoverage` of its end) is deep help, and so
is a defender with no line at all standing 10 or more yards off the ball — a free safety
waiting to be told. A rusher, a man in man and an underneath drop are not. None is
_Cover 0_, one _Cover 1_, more _Cover N Man_. Reading the lines rather than the catalogue
call means a hand-built defense is read the same way, and changing the free safety's drop
to man changes the call.

**Only Cover 0 lines up.** Matching is unchanged: every man call is still given the best
receiver, re-matched when the offense changes, and a Coach's pick is still kept. What
changes is the stance.

- In Cover 0 the men in man line up on their men as ADR 0060 describes — a yard inside him,
  at his own depth held between one and seven yards — and go with him when he moves. The
  moment the call _becomes_ Cover 0 (the last deep defender is taken off, or put in man),
  every man in man lines up.
- In any other call nobody in man is moved: not when he is given a man, not when a new
  set comes on, not when his man is dragged. His arrow is re-aimed from where he stands to
  his man.

Putting the defense back in its call (ADR 0055) puts the men in man on the call's spots,
and in a Cover 0 call then lines them up on their men.

**Coverage defaults.** A Playbook carries optional `coverageDepths`: `cornerYards` and
`safetyYards`, how far off the ball the Coach wants his corners and his deep safeties.
They are set in Settings → Playbook → _Coverage defaults_: corners _As the call draws it_,
_Press — 1 yard_ or 2–7 yards; deep safeties _As the call draws it_ or 8–16 yards. Corners
stop at seven because a Cover 0 corner lines up no deeper than that.

Every call put on the field, and every reset back to one or to base, is the call at those
depths (`defensiveCallAt`): corners (read off their letter) and deep safeties — a safety
whose drop in the call reads deep, or who has no line and stands 10 or more yards deep — take
the depth set; a safety in man or rolled down underneath keeps the call's spot. Only the
man moves: each of his lines starts from his new stance and still ends where the call sends
him. The Defenses browser, its cards and the hover ghost show the calls at the same depths,
and the call on the field is still read as that call.

**Reading the call in the Player panel.** The Covers row names the scheme — "Cover 0 —
nobody deep behind him, so he lines up a yard inside his man…" or "Cover 1 — with help deep
he stays where he is put; his arrow shows his man."

## Consequences

- Nickel Cover 1 put on over an offense now leaves its men on the catalogue's art, with
  their arrows aimed at their receivers, which is closer to the original than ADR 0060 was.
- A defense with nobody deep that the Coach built from _Man_ quick assignments is Cover 0
  and lines up; one with a safety standing deep does not.
- The defaults change nothing already on the field: they apply the next time a call is put
  on or reset. With neither set the calls are the catalogue's, so the Defenses browser's
  parity screenshots are unchanged.
- `coverageDepths` is optional on the Playbook schema, so a Playbook stored or synced
  without it parses as before; the cloud stores the Playbook as JSON and needs no change.
