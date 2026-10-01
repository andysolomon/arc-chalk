---
status: accepted
---

# A route's name follows the route

ADR 0011 gives a Coach's wording to the man, not to the line. A movement action says
which of his lines the words are about. Two edits left those words behind (issue #160).
A concept named Y's route DIG, and a quick route redrew it as a curl that still read
DIG. A route the Coach named BUBBLE was deleted, and the roster still read `H: BUBBLE`
and counted him as assigned. The field label, the roster, the Game Day reader and every
export read the same Assignment, so all of them were wrong together.

## Decision

**A quick route renames the route it reshapes, unless the Coach named it.** A name
counts as the call's own when it matches, ignoring case, the preset the route was drawn
as or any job in the concept that drew it. Replacing the shape sets that name to the
new preset's name in capitals, the way concepts write theirs (DIG → CURL). Continuing
the shape past its call drops the name, just as it drops the preset. Any other words
are the Coach's, and a quick route never overwrites them. The toast then says the name
was kept (`Sit vs zone — kept as the route's name`), so the name on the new shape is one
he can see he kept.

**Deleting a line takes the words that named it.** When deleting routes or men leaves
an Assignment with no actions, and one of the actions it lost named a deleted line, the
Assignment goes too. Words the Coach wrote for the man himself, with no line, are not
touched. Words on an action that is not a movement, such as a block on a man who was
deleted, stay as before. Clearing lines from the Play menu uses the same cleanup, so it
follows the same rule.

Both edits are one undo step. Undo brings the line and its name back together.

## Evidence

`tests/e2e/route-names.spec.ts`, at 1440 × 960 and on the iPad, runs Mesh from Gun
Trips Right, gives Y a Curl, and checks that the field, the route's accessible name and
the roster read CURL. It then undoes and redoes the pair. It also keeps a typed name
under a quick route and checks the toast. Finally it deletes H's hand-named route and
checks that the roster reads *No route yet* and the count drops by one, and that undo
restores both. `tests/e2e/phone-route-names.spec.ts` gives Z a Curl from the phone's
quick tray after Mesh and checks the same names. Each spec saves a screenshot of the
renamed field in its output folder.

## Amendment — 2026-09-30 (issue #153)

The audit behind issue #153 ran on a build before this decision: Clear every line
left `X DIG, H SEAM, Y FLAT, Z GO, F CHECK` on the roster and *Assignments 5 of 11*
over an empty field, and five Drive blocks then read *10 of 11*. With the cleanup
above the names go with the lines and the count reads *0 of 11*, then *5 of 11*.
Three things were still missing and are decided here.

**Every Clear says what it took.** The toast names the scope — *Clear every line*,
*Clear offensive routes*, *Clear defensive assignments*, *Clear offense* and the
rest — and counts what went: `Clear every line — 5 lines, 5 names off`. The men
stay where they are for a Clear of lines, as the rail's title already says, and the
toast's Undo takes all of it back in one step.

**Words with no line under them read as text only.** A man can carry words about no
line at all (ADR 0011). The roster says so on his row — `Q: Check the Mike first ·
text only` — and the Assignments bar counts him and says it apart: *6 of 11 · 1 text
only*. He is counted because the words are his instruction; he is marked because
nothing is drawn, so a Coach turning a pass into a run can tell his own note from a
route by name.

**A call's name left standing goes with the next Clear.** A Play cleared before this
decision kept each route's name with nothing drawn under it. Words that are a stock
call's own — any job a concept hands out, or a route's name off the tree — with no
line and no action on the man go the next time that side's lines are cleared, as
they would have gone with the line. Words that are the Coach's own are never
touched.

Evidence: `tests/e2e/clear-lines.spec.ts` runs Dagger from I-Form Right, clears
every line, reads the toast, the count and every roster row, calls Drive on the
line, and undoes both; does the same to 4-3 Cover 3 on a defensive Play; and opens
the starter Play as an earlier release stored it, with a DIG on a man with no route
and a word of the Coach's on the quarterback, to check that the first goes with the
next Clear and the second stays, marked text only. Each test saves the roster and
the field in its output folder.
