---
status: accepted
---

# Assignments start from the selected man; the rail keeps Text and Trash (parity exception to ADR 0039)

ADR 0039 makes the original prototype the canonical workflow. The original's left rail
carries seven tools — Select, Player, Route, Motion, Block, Zone drop, Text — and a line
is drawn by picking a tool and then clicking the man it starts from. The Player tool
drops a new man wherever the Coach clicks, and a dragged man goes wherever the pointer
takes him, across the line of scrimmage included.

Product decision (GitHub #110, 2026-09-21): a Coach gives a player an assignment by selecting him
first and working in the inspector. The rail tools existed for free drawing, which is
rare and, since the schema still requires a Player on every path, not something the
production app does at all. Free drawing is set aside for now. Recorded here as a
standing parity exception, alongside ADR 0043 and ADR 0044.

## Decision

**The rail keeps Text and Trash.** Select is the field's one standing mode; Text is the
one tool left, because a note goes on the grass and needs somewhere to start. A second
press on Text puts it down again. Trash, the phone's Done button while a line is being
drawn, and the collapse control stay. The Aa tool-names toggle and the angle-snap button
go with the tools they described; snap still answers to S and to Shift while drawing.

**A line by hand starts from the selected man.** The Player panel gains a _Draw_ row —
Route, Motion, Block for a receiver or back; Block for a lineman; Zone drop and Blitz
for a defender — and the R, M, B, Z keys do the same for the one man selected. The
blue-dot drag above a selected man still draws his route. Quick calls, alternates and
flip are unchanged. The command palette reaches the same four draws by name.

**Eleven a side is the roster.** There is no Player tool. Men arrive with a Formation or
a defensive call and are never added one at a time. Nor are they deleted one at a time:
deleting a selected man clears what he was given — every line drawn from his stance —
and he stays where he stood. The More → Clear… page and formation changes remain the
ways a side is replaced.

**Nobody crosses the ball.** Offense and special teams stand at negative depth,
defense at positive, and a man's centre keeps a yard — about his own symbol's radius —
clear of the line of scrimmage. A drag or nudge that would carry a man across is held
at the line, and the whole selection is held with him so a dragged group keeps its
shape; only the way toward the ball is held, so a man somehow already across it may
always come back. A pasted man lands on his side.

## Amendment (2026-09-22)

Two actions join Text and Trash on the rail; neither draws from a tool, so the decision
stands. **Clear every line** wipes every route, motion, block, drop and blitz with the men
left standing — the same erasure More → Clear… and the palette reach — and sits disabled
with nothing to wipe. **Shadow** shows or hides the other unit under the play (ADR 0053),
named for that unit, pressed while it is on the field, with H as its key; the Layers list
and the inspector's Shadow section are the same switch.

## Consequences

- Guided tours under Help still replay the original's seven-tool rail as they were
  filmed; their captions name tools the editor no longer shows. Reshooting them for
  the selection-first flow is follow-up work.
- The status bar's Select hint now points at the inspector first and the blue dot
  second. Hints for the removed tools are gone.
- `docs/original-prototype-parity-matrix.md` records this exception beside 0043 and 0044.
