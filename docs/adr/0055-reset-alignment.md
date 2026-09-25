---
status: accepted
---

# Putting the men back: reset to the chosen set or call, or to base

A Coach picks a set from the Formations browser or a call from the Defenses browser,
then drags men about while he draws. Nothing brought them back short of undoing every
edit since, or re-applying the set — which re-pairs the men by role, adds anyone the
set is missing and drops the ball in the middle of the field. A call was worse: it is
placed rather than realigned, so once one defender moved the field no longer said which
call it had been, and re-picking it replaced every defender and redrew every drop.

Product decision (2026-09-25): the Coach needs a way to reset player positions to the
set or alignment he originally chose, or to a base alignment.

## Decision

**A Play remembers its call as it remembers its set.** `PlayDocument` gains an optional
`defensiveCallSource` — the call's id and which defender stands in which of its slots —
beside `formationSource`. `applyDefensiveCall` records it; a `set-defensive-call-source`
command carries it through undo, diff and sync; deleting a defender forgets his slot the
way deleting a man forgets his in the set. A Play without one reads as it always has.

**Reset to the chosen set or call** moves the men the Play remembers in each slot back to
that slot and changes nothing else — the source, the symbols, the men the set never had,
and the men since deleted (who stay deleted) are left as they are. **Reset to base**
chooses the base alignment: the offense is realigned into it by role, adding nobody, and
the defense is put in it letter by letter, nearest pairs first, so each corner goes to
his own side; the Play then remembers base as what that side is in. A man the alignment
has no place for stays exactly where he is. Either reset moves men rather than
replacing them, so every route, drop and unbound note travels with its man exactly as
applying a set carries it (`moveMenWithTheirLines`, now shared with `applyFormation`).
Each is one transaction and one press of undo.

**The base alignment** is Gun Doubles Right on offense and 4-3 Cover 3 on defense — the
first set and the first call the browsers list, and the looks a staff installs first. A
Playbook-chosen base is left for later; the constant is named once in the domain
(`baseFormation`, `baseDefensiveCall`) so it can become a setting without touching the
reset.

**The ball stays where it is.** Sets and calls are drawn from a ball in the middle of
the field. A reset places them against the ball the Play has now: of where the set was
drawn and the three spots, the one the most still-placed men agree on — each side of the
ball is squeezed by one factor when it is spotted, so two men on a side who still agree
on that factor have not moved. The men the Coach dragged, the centre among them, do not
move the ball or nudge anyone he left alone. When too few men agree, the centre says
where the ball is, as it does for the _Ball on_ control; a side nobody speaks for is
squeezed as spotting the ball there would.

**Where the Coach finds it.** Under the Formation picker (Play setup, or Shadow offense
on a defensive play) and the Defensive call picker (Defensive call, or Shadow defense on
an offensive play), a _Reset to_ row offers the chosen set or call by name and _Base_.
The row appears once the Play remembers a set or call for that side and stays, so the
inspector does not jump the moment a man is dragged; each button is grey when it would
move nobody. The command palette lists all four — _Reset offense to its formation_,
_Reset offense to base — Gun Doubles Right_, _Reset defense to its call_, _Reset defense
to base — 4-3 Cover 3_ — and is how a Play drawn by hand reaches base. A reset of the
shadow shows a hidden shadow, as picking one does. The toast names the set or call and
how many men moved.

## Consequences

- Additive to the original (ADR 0039): no original control, word or command changes. The
  untouched starter Play remembers no set, so the idle inspector — and every parity
  golden — is as it was. Playback's _Reset positions_ (the animation clock) is unrelated
  and unchanged.
- `playDocumentSchema` validates `defensiveCallSource` bindings as it does
  `formationSource`'s: one man per slot, one slot per man, every man on the field. An
  older client strips the field on read; nothing breaks, and resetting that Play's
  defense to its call is simply unavailable until a call is picked again.
- Plays with a call picked before this change do not remember it; their defense resets
  to base, or to the call once it is picked again.
- A chosen set that has since been deleted, or whose slots were renamed, resets only the
  men whose slots it still has; with none, only base is offered.
