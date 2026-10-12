---
status: accepted
---

# The rail calls the concept (amends ADR 0077)

Once the set was on, the next thing a Coach does is draw the concept — and
that was a row in the inspector's Play call, _Concept ›_, on the far side
of the field from the rail that had just put the men on. With the inspector
folded away there was no button for it at all.

Product request (2026-10-12): add an icon to the toolbar for adding a play
concept.

## Decision

**The rail carries the play call, after the set and the shadow.** It sits
with what goes on the field, above the rule:

- **Concept** — two men, one going deep and one breaking in under him:
  _Add or change the concept_ on an offensive play. It opens the
  _Concepts & line calls_ catalogue on its **Concepts** chip, the same
  catalogue the inspector's Concept row opens.
- **Coverage** — the same button on a defensive play reads _Add or change
  the coverage_ and opens _Unit calls_ on its **Coverages**, the call in
  charge of the defense (ADR 0075). The set's button changes with the unit
  in the same way (ADR 0077).

It is grey while nobody on the field could run a call — a blank field, or
a defense with nobody to drop — and its tooltip then says to put the set on
first. It has no key; the catalogue's own search and the palette are
unchanged.

## Preserved

The inspector's Play call rows, their words and their catalogue; every
other rail button, its order, names, keys and greying; Done on a phone; the
collapse control and ⌥2; the Demo's rail.

## Parity evidence

Measured against the original's goldens at 1440 × 960 in
`tests/parity/production-shell.spec.ts`, on one Linux machine, this branch
against `main`: every state that draws the rail gains between 51 and 76
pixels of 1,382,400 for the new glyph and Text and the clears moving down
one slot; Present and Print do not move. Every state stays inside its
ratchet, so no ratchet moves. Print and Demo sit over their macOS-captured
ratchets on this machine on `main` as well (ADR 0077), and pass with the CI
rasterization delta.

## Evidence

`tests/e2e/rail-concept.spec.ts` checks the button is grey on a blank
offensive play, puts Gun Doubles Right on, draws Mesh from the rail and
changes it to Smash, and reads the inspector's Concept row; on a defensive
play it checks the button is grey until the defense is on, then calls
Cover 2 from it. Each test ends on a screenshot of the field.
`tests/e2e/phone-toolbar.spec.ts` checks that the button, like the rest of
the row, is 44 px and on the glass at 390 px. At 360 px the row still ends
inside the glass, at 357 px. Chromium's desktop and phone projects were run
locally; WebKit was not.
