---
status: accepted
---

# An illegal formation offers its fix (amends ADR 0081)

ADR 0081 taught the call in the field's lower left to name what is wrong — _Y and Z are
covered by H — only the end man on the line can catch a pass_ — and left the fixing to
the Coach, a man at a time. The fix is nearly always the same few steps, and a Coach who
has been told _who_ is wrong should not have to work out _where_ each man goes.

Product request (2026-11-14): when the call comes up for an illegal formation, offer an
auto fix in the same toast.

## Decision

**The call carries a _Fix formation_ button, at rest.** Under the faults, the chip offers
_Fix formation_ with what it will do beneath it — _Y and Z step off the line_, _X steps
up on the line_. It is offered once the men are put down, not while one is being
dragged, and the button is the one part of the chip that takes a press. Pressed, the
moves are one command, so one Undo takes them back, and the Undo toast says _Formation
fixed — Y and Z step off the line_.

**The fix is the fewest moves, up or down the field only.** `formationFix` in
`@chalk/editor` changes no man's split, and each man's lines travel with him as they do
when he is dragged:

1. A man of the offense past the ball comes back to the line.
2. A covered man steps a yard off the line (`OFF_THE_LINE_YARDS`), where the shipped
   sets stand their slots (ADR 0081): the end man stays the end, and the man inside him
   becomes a wing.
3. While there are more than four backs, the lettered back nearest the line who stands
   outside an end who is a lineman steps up on the line and becomes the end. The man a
   step off is the one called up, not a wider back behind him; the quarterback is never
   called up, nor a man the fix has just stepped off.

**A fix offered always lands a legal set.** The moves are read again before the button
is shown: if they would still leave a fault, or stand one man on another
(`arrangementFault`), there is no button and the call stands as before. There is no fix
for a twelfth man — which man goes is the Coach's call — nor for a snapper drawn past
the ball.

## Consequences

- The call is still a call, never a block (ADR 0081): nothing moves until the Coach
  presses the fix.
- A Coach who meant a different fix — Z off rather than Y, say — still drags the men
  himself, or undoes the fix.

## Evidence

`tests/e2e/line-alignment.spec.ts` runs at 1440 × 960 on the Stick — Thunder starter. Z
brought up on the line covers Y; the fix is not offered mid-drag, then reads _Y steps
off the line_ (`fix-offered.png`). Pressed, Y stands a yard off the line at his own
split, the chip goes and the status bar reads _LINE 7 · BACKS 4_; the toast's Undo puts Y
back where he stood and the fix is offered again. X then taken off the line is a fifth
back, and the fix calls X back up rather than the wider F or the covered Y
(`formation-fixed.png`). `tests/e2e/phone-line-alignment.spec.ts` taps the same fix on a
phone, upright and sideways, with the call and its button clear of the sheet.
