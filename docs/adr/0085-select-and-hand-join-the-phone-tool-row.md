---
status: accepted
---

# Select and Hand join the phone's tool row (amends ADR 0079)

ADR 0079 put Select and Hand at the head of the rail on a desktop and a tablet, and, on a
phone whose tool row was full, floated them as a pill by the field's lower left. ADR
0084 then gave the call on the line a _Fix formation_ button, and on a phone the call
stands in the same corner: the pill sat on top of it, and on top of the field's edge on
a short glass.

Product request (2026-11-14): the pointer and hand tools are in the way, and should be
part of the toolbar.

## Decision

**The pair leads the phone's tool row**, in its own well, ahead of Formation, as it
leads the rail everywhere else. It needs no rule after it: the well marks it off. Nothing
of the pair floats over the field any longer, so the count on the line and the map have
the field's lower corners to themselves.

**The row's buttons narrow, never shorten.** The row was full at 44 px a button, so
rather than scroll or drop a tool, every button gives up the same share of width as the
glass narrows: 44 px wide held sideways, 40 at 430 px, 36 at 390, 33 at 360, never below 32. Every button stays 44 px tall (the pair's two, 40 in a 2 px well). The trash stays on
the glass at the row's far end, and the row never scrolls.

## Consequences

- A phone's tool-row buttons are no longer a full 44 px wide upright; a finger's height
  and at least 32 px of width is the rule the phone specs now hold.
- The minimap is the only thing left tucked under the field's corner, and keeps its
  place above the count on the line.

## Evidence

`tests/e2e/phone-select-and-hand.spec.ts`, at 360, 390, 430 and 390 × 664, finds the
pair inside the tool row, ahead of Formation and under the field, with the trash on the
glass and the row not scrolling. `tests/e2e/phone-toolbar.spec.ts` and
`tests/e2e/phone-editor.spec.ts` hold every row button to 44 px tall and at least 32 px
wide. `tests/e2e/phone-line-alignment.spec.ts` ends on the call and its fix in the
corner the pill used to cover.
