---
status: accepted
---

# The phone header reads where, then what (amends ADR 0055)

ADR 0055 gave every destination below the editor's floor the phone workspace's
two-row header (issue #92). It worked, but it read as the desktop header wrapped
rather than one laid out for a phone. The destinations, the play's name and More
shared the first row, which left the name 94 px at 360 px wide. The second row
packed the Unit pill, Undo, Redo and Save against the left edge and left the rest
of the row empty, with Save stranded mid-row. The coarse-pointer rules that make
every target a 44 px box (ADR 0045) had stretched the paint with the box: the
current destination drew as a white block laid across the gray track's edges, and
the Unit pill and Save as 44 px slabs rather than the header's 32 px controls.
Undo and Redo were 12 px words whose disabled gray nearly vanished.

Product request (2026-09-25): review the header against the style guide and
design system, and optimise it for mobile.

## Decision

**Two rows, grouped by what they are about.** The first row is where the Coach
is: Editor · Playbooks · Game Day as one segmented control that fills the row —
three equal segments at 13 px — and More at its trailing edge. The second is the
work in hand: the play's name, its Unit pill, Undo and Redo, and Save, anchored
at the trailing edge beneath More. Held sideways (668 px and wider) it is one
row, as before, with More beside Save.

**The name gets the room.** On the second row the name is set at 16 px / 600 —
the Game Day title's size and weight — and takes whatever the row leaves, from a
zero flex basis, so a long name can never push Save onto a third row (a wrapping
row places its items by basis before anything shrinks). Held upright, the pill
says the Unit's word alone, capped at 112 px (88 px below 375 px); its Type is
one tap away in the panel it opens, and returns beside the Unit when the phone is
turned. At 360 px _Untitled play_ now fits whole; at 390 px _Stick — Thunder_
does.

**Every box is 44 px; what is painted inside it is the design system's.** The
current destination is the fine pointer's segment — paper, hairline, a 1 px drop
— inset 3 px inside its 44 px box, so the track reads as one control. The Unit
pill and Save are painted at the wider header's 32 px with 6 px corners inside
their 44 px boxes: the pill with its hairline and Unit dot (ADR 0051), Save in
ink. The segmented-control rule applies under every coarse pointer, since a
tablet's tabs had the same fault; the pill and Save treatment is the phone's
alone.

**Undo and Redo are arrows on a phone.** Hook-back arrows on the rail icons'
18-unit grid and 1.6 stroke, in 44 px boxes that meet, named Undo and Redo for a
screen reader; their titles still say what they would undo or redo. Wider screens
keep the words.

**A finger has no hover.** A tapped control does not stay lit; a press shows
while the finger is down, and a menu's button stays pressed while its panel is
open. Header panels open beneath their 44 px buttons rather than over their lower
edge, and the Unit pill's panel hangs from the header's trailing edge, since from
mid-row it could run off a 360 px screen. The header's padding respects the
safe-area insets, as the tool tray already did.

The header is 100 px tall upright (from 104) and 52 px sideways, as before.

## Preserved

Every destination, command, word, title and shortcut; what the phone header
sheds to More (ADR 0053, ADR 0055); Undo on every destination; the pill's panel
and what it does; the desktop and tablet headers, apart from the coarse-pointer
segmented control.

## Parity evidence

Nothing here applies at the parity viewport (1440 × 960, fine pointer): the phone
rules hang on `.phone-topbar`, the segment rule on `(pointer: coarse)`, and the
two-part pill label and the arrows render only in the phone workspace. Captures of
the seeded Play before and after, on the same machine, are pixel-identical at
1440 × 960 and 1180 × 820 with the pill closed and open. No ratchet moves.

## Evidence

`tests/e2e/phone-editor.spec.ts` now also checks, at 360 × 800, 390 × 844,
430 × 932 and 844 × 390, that the destinations and More share the first row
upright, the name shares the second with Save, Save's trailing edge sits under
More's, and the name is at least 96 px wide. Run under Chromium phone emulation
only; WebKit could not be launched on this machine, and the physical iPhone and
Android checks listed in `docs/evidence/mobile-audit-2026-09-20/README.md` are
still owed.
