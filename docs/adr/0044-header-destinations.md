---
status: accepted
---

# Editor, Playbooks and Game Day as the header's destinations (parity exception to ADR 0039)

The original prototype's header offers four tabs — Editor, Demo, Present, Print — and
keeps the Playbook browser at the bottom of the inspector and New play inside the More
menu. Its tool rail carries an eraser glyph whose menu says nothing about scope until it
is open, and names its tools only in tooltips. A coordinator preparing a game reaches
the plans that matter to him through More → Game plans… (ADR 0042), three levels down
from anything he looks at on Saturday.

Product decision (GitHub #65, 2026-09-13): clarify navigation and separate frequent
drawing from occasional management, without moving drawing into settings. Recorded here
as a standing parity exception. Every command, its words and its shortcut are unchanged.

## Decision

**Destinations.** The header's tab strip reads **Editor · Playbooks · Game Day**, in the
original's footprint. Playbooks is the Playbook browser and the Game plans workspace as
two pages of one destination, no longer dialogs over the field; opening a Play from
either steps back into the editor with it. Game Day is where a prepared plan is read
(the reader itself is GitHub #67). Escape leaves either destination for the editor.

**Actions.** _New play_ is a labeled header button and a button on the Playbooks page,
as well as its More-menu entry. _Present_ is a labeled header button beside it; esc still
returns. The Export menu becomes **Print & export** and leads with _Print preview_, which
is the original's Print tab; the thirteen outputs beneath it keep their groups, order and
copy. **Help** holds _Demo — guided tour_, the five tutorials by their Demo tab names,
_Keyboard shortcuts_ and _Command palette_; the Demo view is unchanged once open, and
a tutorial opens it on that tour. A first blank field points at Help → Demo from the
status bar.

**Rail.** Select, Player, Route, Motion, Block, Zone drop and Text stay one click away
with their keys and glyphs. _Clear_ leaves the rail for a **Clear…** page of the More
menu that names the six scopes, explains them, and says Undo brings any of it back; a
scope that would take nothing is greyed, as before. Snap stays as its compact toggle.
An _Aa_ control at the foot of the rail shows each tool's name beside its glyph, a tap
away and remembered per device, so no one has to hover or hold to learn what a glyph
is. The rail widens to 108 px while named.

**Contextual names.** Block reads **Blitz** while a defender is selected, because that
is what the press draws: the drawing machine now starts a `blitz` path from a defender
with the Block tool — solid red to an arrow, the same path the player panel's presets
draw — where it drew a `block` with a bar ending before. Nothing else is renamed.

## Preserved

The command palette runs every action it did and adds the destinations and the tour.
The blue-dot route gesture, the shortcut table, tool state across menus and rail, and
the Present and Print views' own chrome are untouched. The inspector's Help section and
its `?` controls remain.

## Parity evidence

The header strip and its right-hand buttons differ from the original's on purpose in
every desktop state that shows the header. Measured on the same Linux machine before
and after (pixels differing from the original's goldens, 1,382,400 px frames): Editor
16,097 → 16,592; More menu 17,169 → 18,341; Export menu 16,623 → 17,877; Save menu
16,319 → 16,814; command palette 16,496 → 16,980; Formations 25,324 → 25,846; Defenses
19,574 → 20,096; Demo 22,075 → 22,141; Print 11,553 → 11,937; shortcuts 33,817 → 34,301;
Present unchanged at 104,148 (it has no header). Every state stays under its ratchet in
`tests/parity/production-shell.spec.ts` except Print and the shortcut reference, which
were already over their macOS-captured ratchets on this machine on `main` and pass with
the CI rasterization delta. No ratchet was raised. Recorded in
`docs/original-prototype-parity-matrix.md` and `docs/parity/README.md`.
