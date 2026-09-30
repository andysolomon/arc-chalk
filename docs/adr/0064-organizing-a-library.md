---
status: accepted
---

# Organizing a real library (amends ADR 0060 and ADR 0062)

ADR 0060 put every Playbook on a shelf and ADR 0062 let a Coach name them,
but a Coach who had built eight books over a season still could not keep
them in order (issue #166). A book could not be deleted, duplicated, put
away or sorted. A Play could not be copied or moved into another book. Every
new book started with an offensive "Untitled play" that a defensive book had
to delete by hand. A front built on the field could not be kept the way a
set can. Plays could not be put in the order a staff installs them, so the
full-playbook export read in no particular order (#156). And only the open
book's card said how many of its Plays were offense and how many defense.

## Decision

**Every card counts its units.** A shelf card reads `12 plays · 8 offense ·
4 defense` for every book, open or not; the counts come with the book's
summary (`offenseCount`, `defenseCount` on `PlaybookSummary`).

**The shelf sorts, and each book has actions.** A Sort select beside the new
book's name field lists the books by Recently edited (the default) or by
Name, and the choice is remembered on the device. The `⋯` on a card opens a
sheet (from the bottom on a phone) with:

- **Rename…**: the same name field as the book's bar. A name another book
  already has is refused, as in ADR 0062.
- **Duplicate**: copies the whole book under "<name> copy" ("copy 2" and on
  when that name is taken). The copy gets new ids for its Plays, Concepts,
  saved sets and fronts, install order and Game plans, all linked to each
  other the way the original's are. A Game plan's prepared packets stay with
  the original, so the copy is prepared again when it is used.
- **Archive** / **Restore to the shelf**: puts the book under a collapsed
  **Archived** section at the foot of the shelf. Nothing is removed. An
  archived card offers Restore where a live one offers Open.
- **Delete…**: asks again, saying how many Plays go to the Trash and that
  the book's Game plans and saved sets go with it. The Plays keep their
  thirty days in the Trash (ADR 0012). Everything else goes with the
  record.

The only book left on the shelf cannot be archived or deleted, because a
Coach always has a book open. Archiving or deleting the open book first
opens the next most recently edited one, and the Coach stays on the shelf.

**A Play is copied or moved into another book.** A Play's Actions sheet,
on a book's page and on the cross-book Plays page, adds **Copy to…** and
**Move to…**, each listing the other books on the shelf. The copy keeps
what the Play was linked to (`copyPlayInto`):

- its Type: the target book's type with the same id, built-in key or name,
  or the source type added to the target when it has none of those;
- its Concept: the target's concept of the same name, or a copy of the
  source concept;
- the saved set or front it stands in: the target's one of the same name
  that has the same slots, or a copy.

A shipped set or call belongs to every book, so a link to one stays as it
is. Moving copies the Play and then puts the original in the Trash. A Play
moved out of the editor leaves the editor on the book's most recent Play,
or on a blank one. Deleting stays offered only for Plays of the open book.

**A new book starts empty.** Opening a book with no Plays gives the editor a
blank Play that is not written until the Coach puts something on it
(`showUnsavedPlay` on the editor store), which is what a fresh device
already did (issue #97). The book's page says "No plays yet" and offers
**New offensive play** and **New defensive play**. Deleting a book's last
Play does the same, rather than writing a new "Untitled play".

**Defenses has Mine.** The Defenses picker gains a **Mine** tab and a
**Save the defense on the field as…** field, the offense picker's pair.
Saving keeps each defender's position, symbol and letter, but not his
lines, the same way a saved set leaves out its routes. The front is starred
as it is saved. It is stored as a Formation of the defense in the book
(`formationFromDefense`), filed under the front **Mine** with no coverage of
its own, and it is put on a Play like any call (`coachDefensiveCall`). A
second front saved under the same name replaces the first, and so does a
second set under a set's name. The Formations page lists the saved fronts
under Defense, with the × to remove them.

**Install order.** A book's own page adds **Install order** to Sort. In that
order a card drags onto another to land before or after it, and a Play's
sheet offers **Move earlier** and **Move later** for a finger or a keyboard.
The order is stored on the Playbook record as `playOrder`. Plays not yet
placed come after the placed ones, by name. The full-playbook export reads
in that order once one is set, and it says so ("in install order"). Before
then it keeps library order.

## Stored

Two optional fields on the Playbook record: `playOrder` (Play ids) and
`archivedAtMs`. A record written before this release reads as it did.
Saved fronts are Formations with `unit: "defense"` and `family: "custom"`,
in the same store as saved sets. Like ADR 0062, this ADR does not change
how Playbook records reach the cloud replica. Copied Plays and saved fronts
are queued for sync the way a Play the Coach draws is.

## Parity

The Defenses dialog now has a tab and a footer row that the original's does
not. The parity ratchet for Defenses is re-measured below under this product
request, the way ADR 0058's sidebar was.

## Evidence

`tests/e2e/playbook-library.spec.ts`, at 1440 × 960 and on the iPad:

- A new defensive book starts empty and asks which side its first Play is
  for.
- A hand-moved front is saved under Mine and put on the next Play from Mine.
- Plays are copied and moved from the Plays page, and the copy brings its
  Concept.
- The book's Plays are put in install order by Move earlier and by
  dragging, which survives Chalk opening again, and the full-playbook
  export says it reads in that order.
- Books are renamed, duplicated, archived and restored, deleted, and sorted
  from the shelf, with each card's unit counts checked on the way.

`tests/e2e/phone-playbook-library.spec.ts`, at 360 × 800 and 390 × 844,
checks the same sheets on a phone: they sit on the bottom edge with 44 px
buttons, set the install order by Move earlier, start an empty book, copy a
Play, and duplicate a book. Each spec ends with a screenshot of the shelf in
its output folder, with the "Edited …" lines masked so a rerun draws the
same picture.
