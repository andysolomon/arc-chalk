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
