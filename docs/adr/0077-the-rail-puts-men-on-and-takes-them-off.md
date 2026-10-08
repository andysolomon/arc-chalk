---
status: accepted
---

# The rail puts men on and takes them off (amends ADR 0052 and ADR 0074)

A new play opened on a blank field with nothing on it saying what to do
next. The set was a row in the sidebar (Formation, or Defensive call) and a
key (⇧⌘F, ⇧⌘D); the rail beside the field held Text, Clear every line, the
shadow's on/off and the trash. On a play with no other unit yet, the shadow
button changed a setting nobody could see, and nothing on the rail could
take the men off short of More → Clear….

Product request (2026-10-07): whenever a Coach starts a new play he should
be offered a formation; if the canvas is blank for whatever reason he
should be able to put players on quickly from a formation, on the rail,
since the rail holds little. The rail should clear every route, clear every
player, add the shadow opponent, remove what is selected, and add or change
the formation, each with an obvious, clean icon.

## Decision

**A new play opens on its set.** New offensive play opens the Formations
browser and New defensive play the Defenses browser, from the header, More,
the palette, or an empty book's page, once the blank Play is the one in the
editor. Picking a card puts the set on; closing the browser leaves the field
blank. A browser the Coach opened meanwhile is left as it is. The Formations
page's _new play in this set_ already puts its set on, so it opens nothing.

**The rail, top to bottom:** what goes on the field, a rule, what comes off
it, and at the foot the selection.

- **Formation** — three men on the line and a back: _Add or change the
  formation — ⇧⌘F_ on an offensive play, _Add or change the defense — ⇧⌘D_
  on a defensive one. It opens the same browser as the sidebar's row.
- **Shadow** — while the other unit has nobody on the field the O and
  dashed X carry a ringed **+** and the button reads _Add a shadow defense_
  (or _offense_), opening that unit's browser. Once he is there it is the
  on/off toggle it was, pressed while the shadow is shown (ADR 0053).
- **Text** — unchanged (ADR 0052).
- **Clear every line** — a route breaking to the corner with a ringed
  **−**. It takes every route, block, drop and blitz and leaves every man,
  as before; only its glyph changes, from the eraser.
- **Clear every player** — the Formation glyph with the ringed **−**. A new
  erasure, `players`, takes every man on both sides of the ball with his
  lines, his Assignment and his slot in the set or call, and leaves the
  notes. The palette lists it as _Clear every player_. More → Clear… keeps
  its six scopes.
- **Delete selection** — the trash, unchanged: a line, a note, or what a
  man was given (eleven a side is the roster, ADR 0052).

The **+** and **−** are one family: a ringed sign in the glyph's lower
right says the button puts something on or takes it off, and the glyph says
what. Each clear is grey when it would take nothing, says in the toast what
went (ADR 0064 amended), and is one press of undo.

The empty roster's hint reads _Pick a formation from the tools or the
sidebar to start._

## Preserved

The sidebar's Formation and Defensive call rows and their Reset rows; ⇧⌘F,
⇧⌘D and H; every Clear scope, its words and greying; the shadow's toggle,
its picker and the Layers list; the trash's name, ⌫ and behavior; Text and
T; Done on a phone; the collapse control and ⌥2; the Demo's rail, which
replays the original's tools as filmed.

## Parity evidence

Measured against the original's goldens at 1440 × 960 in
`tests/parity/production-shell.spec.ts`, on one Linux machine, this branch
against `main` (pixels differing out of 1,382,400): Editor 31,316 → 31,487;
More menu 32,307 → 32,474; Export menu 32,589 → 32,760; Save menu 31,584 →
31,755; command palette 32,579 → 32,734; shortcut reference 51,602 →
51,757; Formations 32,915 → 33,107; Defenses 26,619 → 26,811; Present and
Print unchanged at 107,153 and 31,460; Demo 28,928 → 28,919. The seeded Play
has no defense, so every state that draws the rail shows its two new
buttons, the rule and the add-a-shadow glyph — about 170 px each. Every
state stays inside its ratchet, so no ratchet moves. Print and Demo sit over
their macOS-captured ratchets on this machine on `main` as well, and pass
with the CI rasterization delta.

## Evidence

`tests/e2e/toolbar.spec.ts` starts an offensive play on the browser it
opens, closes one unpicked to a blank field, adds the shadow defense from
the rail and toggles it, changes the set, trashes the Mike's drop, clears
every line and every player, and undoes the clear; a defensive play starts
on its call and adds its shadow offense from the rail. Each test ends on a
screenshot of the field and of the rail. `tests/e2e/phone-toolbar.spec.ts`
checks the six buttons are 44 px and on the glass at 390 px, starts a play
from More on the Formations browser, adds the shadow defense, clears every
player and puts a set back on, ending on a screenshot. The shared
`startNewPlay` fixture closes the browser a new play opens on, so the specs
that start from a blank play still do. Chromium's desktop and phone
projects were run locally; the WebKit iPad and iPhone projects were not,
as WebKit is not installed on that machine.
