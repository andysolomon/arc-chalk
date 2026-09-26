---
status: accepted
---

# The Playbooks destination reads Playbooks · Formations · Plays (amends ADR 0044)

ADR 0044 made Playbooks a destination with two pages, Plays and Game plans, and
#138 laid the Plays page out around managing the book: search, one row of Unit and
Type chips, a count, a sort. The book of sets stayed a dialog over the editor, and
a Play's set and personnel — which the domain records (ADR 0033) and the editor's
own formation row reads — were nowhere a Coach could filter by.

Product request (2026-09-26): rework the Playbooks screen, starting with its
filters and categories. Three things at the top: Playbooks, Formations and Plays.
Inside a playbook, its plays as a list or as cards with a filter for formation and
personnel. On Formations, filters for offense, defense, playbook, formation, set,
personnel and package. On Plays, the same chips and an Advanced row.

## Decision

**Three pages.** The destination's bar is one segmented control: **Playbooks ·
Formations · Plays**. New play stays beside it wherever a page lists Plays.

**Playbooks** is the shelf and the open book. It opens on the book — a Coach with
one book should not have to open it every time — with a bar of its own: a way back
to the shelf, the book's name and count, and its two pages, **Plays** and **Game
plans**, which are what ADR 0044's two pages were. The shelf lists every book on
the device; Chalk opens one at a time, and **Open** on another card makes it the
open one: the runtime reads from it from then on, its saved sets replace the last
book's, the editor takes up the Play last changed in it (or a blank one), and a
reload comes back to it. The book's Plays page lists or tiles them — a phone lists, a
desk tiles, and a Cards / List switch remembered with the browser state overrides
either — and filters them by Unit, Type, Formation and Personnel.

**Formations** is the book of sets as a page: every set, shipped and saved, and
every shipped defensive call, grouped by what each is called from. Its filters are
Offense / Defense, Playbook, Formation, Set, Personnel and Package. A set's card
leads to the Plays that stand in it, on the Plays page with that set pinned, and
the plus beside its name starts a blank Play of the open book with the set already
on the field — a call's plus, a blank defensive Play with the call on it.

**Plays** is every Play on the device, across its books, with Offense / Defense, Type, Playbook, Formation, Set and
Personnel, and an **Advanced** row for what else a Play records: Concept, Tag and
Motion. Opening a Play of another book opens that book first; deleting is offered
only for Plays of the open book. Nothing is offered that a Play does not carry — there is no QB drop,
protection, run direction or run hole on a Play, so no chip claims one.

**A filter is a chip that names its choice.** Closed, it reads the axis until
something is chosen and then the choice, lit. Pressed, it opens a picker with
**All** first and each choice counted, and — once there are seven or more — a line
to filter the choices by. On a desk the picker is a panel under the chip; on a
phone it is a sheet up from the bottom with a handle, 48 px rows and a 16 px line,
so a list of eighteen sets can be read and Safari does not zoom.

**Play art.** A card's picture is drawn the way a play sheet under lights reads:
turf, yard lines every five yards with the scrimmage line brightest, the men as
their symbols, every line in its own colour with its head on — an arrow, a
blocker's bar — and the ground each zone owns as the field's own tinted ellipse,
in the coverage colours the editor and the Defenses dialog already use. The Play's
unit is drawn full and the shadow beneath it faded. The picture is projected in
true yards, downfield up, cropped to the Play. The thumbnail renderer's version is
bumped so every cached picture is drawn again (ADR 0037).

## Language

- **Formation**, as a filter, is what a set is called from — Gun, Pistol, I-Form,
  Empty, Strong — read as the first word of the set's name with the hand taken off.
  A set the Coach saved as "Trey Right" gets a Trey group of his own.
- **Set** is the family of sets the shipped book already groups by — Doubles,
  Trips, Bunch, Spread, Empty, 2 TE, I-form, Strong, Mine.
- **Personnel** is the label the Play carries (ADR 0033), or its set's when it
  carries none; a two-digit label is described as what it puts on the field —
  `(11) 1 RB, 1 TE, 3 WR`.
- **Package** is that personnel in a coordinator's words: two or more tight ends
  is a tight-end package, two or more backs a back package, and otherwise the
  receivers count — `3 WR` for 11, `2 TE` for 12.
- Under **Defense** the same four axes keep their football names: the **Front**
  (4-3, 3-4, Bear, Nickel, Dime), the **Coverage**, and **Personnel** as Base,
  Nickel or Dime. Package steps aside; a defensive call has no second grouping.

`formationGroupOf`, `describePersonnel`, `offensivePackageOf` and
`defensivePersonnelOf` in `packages/domain/src/formation-language.ts` are the one
source of these words.

## Derived, not stored

Nothing new is written to a Play. The search projection (ADR 0036) now also
records the set a Play stands in — the Formation it was put on the field from
while its men still stand in it, and otherwise the shipped set they recognizably
stand in, which is what the editor's formation row says of the same Play — and the
kinds of line drawn on it, so Motion can ask. Projections carry a version; a
device whose records were built by an earlier release rebuilds them once at
launch rather than reading a partial record as a Play with nothing on it.

## Preserved

The dialog over the editor (Browse Playbook) keeps its one row of toggle chips;
the Formations and Defenses dialogs are unchanged; Game plans is reached from
Game Day, the sidebar and the More menu as before, now as the open book's page;
Escape leaves the destination for the editor; the header is untouched.

## Parity evidence

Nothing here is a state the original prototype has: the destination is ADR 0044's
standing exception, and the dialogs the parity suite captures are unchanged. No
ratchet moves.

## Evidence

`tests/e2e/playbooks-pages.spec.ts` walks the three pages at 1440 × 960 and on
the iPad: the book's Cards / List switch and its memory, the Formation and
Personnel pickers and their counts, the Formations page under Offense and
Defense, a set's card leading to its Plays, the Plays page's axes and Advanced
row, a Play started in a set from the Formations page, the shelf's Open, and the
play art's turf, yard lines and zone ellipses. `tests/e2e/phone-playbooks.spec.ts` checks, at 360 × 800 and
390 × 844, the three pages on one row at 44 px, the list by default, the sheet
from the bottom, and the Formations page two across. Each ends with a screenshot
in the test's output folder.
