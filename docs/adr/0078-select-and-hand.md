---
status: accepted
---

# Select and Hand (amends ADR 0016 and ADR 0077)

ADR 0016 gave a phone one finger on open grass to pan, since a phone has no
Space bar and no second hand to spare, and kept the selection box a desktop
gesture. That left a phone with no way to pick more than one man at a time:
a tap picks one, Shift does not exist, and a drag on the grass moved the
field. The Arrange menu, Group, Trips, Double team and the scheme picker all
wait on a multi-selection a phone could not make.

Product request (2026-10-12): the toolbar needs a selection tool, so a Coach
can select many players, and a hand tool that pans around — the pair drawn
as a pointer arrow and an open hand, the one that is on filled in blue.

## Decision

**Select and Hand are the field's two pointer modes.** Select is the
standing one, as before. Hand moves the field under the pointer from
anywhere — the grass, a man, a route, a picked route's handle — and edits
nothing. Text stays the one drawing tool (ADR 0052) and puts the Coach back
on Select once its note is down.

- **Select.** A press on a man, a route or a note picks it and drags it. A
  drag on open grass draws a box and picks everything in it, under a mouse,
  a Pencil **or a finger**. A tap on the grass puts everything down. A
  finger is allowed the same ten pixels of wobble before its press on the
  grass becomes a box as it is before a press on a man becomes a drag, so a
  tap stays a tap.
- **Hand.** One finger or the primary button moves the field from wherever
  it lands. Nothing is picked, moved, bent, or given a break: the press on a
  handle goes through to the field, a double-click adds no break, a long
  press opens no menu, and the blue dot is not offered. What was picked
  stays picked, and its inspector, the sheet, and the selection's toolbar
  stay open.
- **Unchanged under either.** Two fingers pan and pinch. Held space, a held
  alt and a middle-button drag are a moment's Hand. Once a Pencil has been
  out, a finger moves the field and the tip draws (ADR 0016). The wheel and
  ⌘+ / ⌘− / ⌘0 zoom.

**Where they live.** On a desktop and a tablet the pair is the head of the
rail, above Formation, in a well of its own with a rule under it. A phone's
tool row is already six 44 px buttons and eight do not fit on a 360 px
glass, so on a phone the pair floats over the field's lower left, opposite
the map: above the sheet's peek when the phone is upright, in the corner
when it is held sideways. It is the pair's one home on each layout (ADR
0074); the phone's row is unchanged.

**Keys.** V is Select, as it was. Hand has no letter of its own — H is the
shadow's (ADR 0053), and held space is already the keyboard's Hand. The
palette lists _Hand tool_ beside _Select tool_ and _Text tool_.

**The status bar** under the Hand reads _drag anywhere to move the view —
nothing on the field moves · ⌘+ / ⌘−: zoom · v: back to select_.

## Preserved

Select's every press, drag, Shift-click and box under a mouse; the route
dot; the handles under Select; Text and T; V; space-drag, alt-drag and
middle-drag; two-finger pan and pinch; the Pencil's split between the tip
and the hand; the phone's tool row, its six buttons and Done; the Demo's
rail, which replays the original's tools as filmed.

## Consequences

- A phone Coach who used to pan with one finger on the grass now boxes in
  what is under it. Two fingers still pan, and the Hand is one press away.
- The desktop rail is two buttons and a rule taller. The parity ratchets of
  every state that draws the rail rise by what that costs; the measurements
  are below.

## Parity evidence

Measured against the original's goldens at 1440 × 960 in
`tests/parity/production-shell.spec.ts`, on one Linux machine, this branch
against `main` (pixels differing out of 1,382,400): Editor 31,571 → 33,087;
More menu 32,558 → 34,074; Export menu 32,846 → 34,362; Save menu 31,839 →
33,355; command palette 32,791 → 34,326; Formations 33,195 → 34,489;
Defenses 26,899 → 28,193; shortcut reference 51,836 → 53,346; Demo 29,025
→ 29,067; Present and Print unchanged at 107,153 and 31,499. The rail is two
buttons and a rule taller and every glyph below them moves down, about
1,300 to 1,500 px in each state that draws it. Seven states leave their
ratchets, and each is raised to its branch measurement by this decision
(ADR 0039); the shortcut reference stays inside its own. Print and Demo
sit over their macOS-captured ratchets on this machine on `main` as well,
and pass with the CI rasterization delta.

## Evidence

`tests/e2e/select-and-hand.spec.ts` picks a route, zooms, takes the Hand,
drags from the route's own handle and from the Quarterback and moves the
field without bending the line or moving the man, double-clicks the route
without adding a break, and finds the route still picked with its panel
open and Undo still disabled; V puts Select back and a drag on the grass
boxes in the line. It ends on screenshots of the field and the rail.
`tests/e2e/phone-select-and-hand.spec.ts`, at 360, 390 and 430 px, checks
the pair is two 44 px buttons over the field, above the sheet's peek and
clear of the map, with the tool row's trash still on the glass; boxes in the
five linemen with one finger without moving the view; takes the Hand and
moves the field from a man with every man where he stood and the five still
picked; finds a tap under the Hand picks nothing; and, back on Select, drags
a man and clears the field with a tap. It ends on a screenshot at each
width. `tests/e2e/editor-interaction.spec.ts` replaces _moves the field
under one finger on the grass_ with the same split on a tablet-sized field.
