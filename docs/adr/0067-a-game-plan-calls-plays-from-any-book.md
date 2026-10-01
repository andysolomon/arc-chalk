---
status: accepted
---

# A Game Plan calls Plays from any of the Coach's books (amends ADR 0042)

ADR 0042 made a Game Plan a curated, numbered view of the library, and ADR 0060 put
every Playbook on a shelf. A coordinator who keeps his base offense, his trips and
bunch material, his personnel packages and his red-zone calls in separate books —
the Plays page already lists all of them together — could not assemble one week's
plan from them: **Add plays** offered only the open book's Plays, so he either
duplicated Plays into one book or kept one book for everything (issue #157).

## Decision

**A Game Plan keeps one home Playbook.** It is listed, printed and prepared from
that book, and it coordinates that book's unit. How a Coach organizes his books
stays independent of how he composes a week: nothing about a plan asks a Play to
move.

**A Call may name a Play from any book on the device.** A Call still holds only the
Play's id (ADR 0042); the Play's book is read off the Play. In the plan a Call from
another book reads _Stick — Thunder (Red Zone)_ — in its row, in the label of its
code field, in a code collision's "It belongs to …" and in its move and remove
controls — so two Plays with one name from two books are told apart. Printed sheets,
wristbands, handouts and Game Day read the packet's names as before and do not print
the book: a coordinator calls a number.

**Add plays has a scope.** A **Pick from** control above the search offers **This
book** and **All my playbooks**. Search, the Unit chips and the Type chips span the
chosen scope; the Type chips take in any Type a Play from another book carries, as
the Playbook browser already does for an imported Play. A row from another book
carries that book's name as a label and in its checkbox's name, and the list reads
by name and then by book so the two Sticks sit together. A Play already in the plan
is reported as it was — _· in plan_ on its row, _N already in the plan_ in the
preview — by id, whichever book it is from. **Concept's variants…** stays the home
book's Concepts, because a Concept belongs to one book.

**The scope is remembered on the device, not on the plan.** It is a preference
(`gamePlans.pickScope.v1`), kept beside favorites and chrome, and it starts on
**This book**. It says how this Coach gathers plans here: one who keeps his material
in several books wants every plan to look across them, and one who keeps one book
never sees the difference. A per-plan setting would start every new plan on **This
book** again, and it would put a picker's state on a record that travels in backups
and may later replicate. A saved search is the exception: it records the scope it
was saved under (`savedFilter.scope`), so expanding it later finds the same Plays;
unset reads as the home book, which is all a search saved before this ADR could
cover.

**Prepare freezes the Play from whichever book holds it.** `getPlay` reads by id
across books, so the packet carries a Play from another book the way it carries one
from the home book; each frozen document names its own book, and the revision's
`playbookId` stays the plan's home. A Play in the Trash is no source: it is carried
from the last packet, or listed **Missing play**, the way ADR 0042 says a deleted
Play is. Before this ADR Prepare froze a trashed Play's document silently while the
plan's status line called it missing; the two now agree. The status line and Game
Day's "the library has moved on" notice read every book's hashes, so a Call from
another book is never taken for missing while its Play is there.

**Not changed.** The Output workspace already reads a plan's Plays by id. Plans are
not replicated to the cloud (ADR 0042), so nothing there changes. A Play moved to
another book by a later change (PR #175) is a new Play there and the original goes
to the Trash: a plan's Call keeps naming the original and is carried until the Coach
points it at the copy; re-pointing Calls on a move is left for that work.

## Language

`CONTEXT.md`'s Game Plan and Call entries say a plan lives in one Playbook and a
Call may name a Play from any of the Coach's books.

## Parity

Additive: the original prototype has no game plans. Recorded in
`docs/original-prototype-parity-matrix.md`.

## Evidence

`tests/e2e/cross-book-game-plans.spec.ts`, at 1440 × 960: a second book with a Play
of its own and one named like the starter's; a plan in the starter book whose picker
offers this book first and every book on request, with the other book's rows
labelled, search and Unit chips spanning the scope, the two Sticks told apart, a
Play already in the plan reported as before and a code collision naming its holder's
book; Prepare and the call sheet carrying the other book's Play; Chalk opened again
in a new tab finding the calls by name with the packet current and the picker on
**All my playbooks**; Game Day reading the packet with no stale notice; and the Play
deleted from its book reported as **1 missing**, still named from the packet, and
carried on the next Prepare. `tests/e2e/phone-cross-book-plans.spec.ts`, at 390 ×
844, does the same through the phone's own doors with 44 px scope buttons inside
the glass. Each ends with a screenshot of the plan in its output folder.
