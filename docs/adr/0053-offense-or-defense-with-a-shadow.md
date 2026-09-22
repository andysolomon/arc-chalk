---
status: accepted
---

# A play is offense or defense, with the other side as a shadow (amends ADR 0041 and ADR 0043)

ADR 0041 gave the header pill a Unit segment — Offense, Defense, Special teams — that
moved the open Play between units, naming the Type, Concept and Formation links it
would drop. ADR 0043 folded the other side's picker under a section called _Opponent
look_. Both kept the original's idea that a Play is a canvas whose category can be
changed afterwards.

Product decision (2026-09-21): offense and defense are fundamentally different plays.
A Coach drawing an offensive play is never drawing a defensive one, and the inspector,
the tools and the pill should be that unit's from the first man. The other unit is
still wanted on the field — a look to draw the concept against, or an offense to draw
the call against — but as a shadow the Coach can put on or take off, never as
something the play could turn into. The special-teams play is set aside for now.

## Decision

**Two units, fixed at the start.** `playUnits` is Offense and Defense. A Play is
started as one or the other — _New play_ in the header, the Playbooks page and the More
menu is a choice, _New offensive play_ or _New defensive play_, and the command palette
lists the two — and keeps that unit for good. The header pill still reads
_Unit · Type_ and still writes the Type through `set-play-type`; its panel offers the
unit's Types and nothing else. The `set-unit` command and `reclassifyPlay`'s unit half
remain in the domain for reconciling two versions of one Play and for Playbooks read
from elsewhere; no control issues them.

**The shadow.** On an offensive play the defense is the _Shadow defense_; on a defensive
play the offense is the _Shadow offense_. The section that was _Opponent look_ takes that
name, keeps the other unit's picker (the Defenses browser or the Formations browser),
and adds a _Shown_ / _Hidden_ switch. Hidden is a presentation, not an edit:
`Presentation.hideShadow` takes the other unit's men, the lines they run and the labels
marked as theirs out of the render scene (`withoutShadow` in `@chalk/render`), the
document keeps them, and the layers popover lists the shadow as a fifth switch beside
Reads, Assignments, Notes and Text. Exports built from the editor's presentation follow
it, as the layers do. Picking a call on an offensive play or a formation on a defensive
play shows a hidden shadow again, so the pick lands in view. A new play opens with its
shadow shown. _Select all_ now selects what is drawn, so a hidden shadow or a hidden
layer is not swept into a move or a delete unseen.

**Controls follow the man, not the play.** A selected line offers its owner's kinds — a
shadow defender's drop is still a Zone, Blitz or Stunt on an offensive play. The Player
tool adds men of the play's unit; shadow men arrive through the other unit's picker.

**Special teams set aside.** `playUnitSchema` still accepts `special-teams` on the way
in and reads it as `offense` — a kicking team lines up on the offensive side of the ball
— so an older device, backup, replica or released prototype file loads without a
migration; the released `Special` category imports as an offensive play. The Return,
Punt and Field Goal Types are no longer seeded; a Playbook that already holds them keeps
them, archived under offense, so a play that carries one still reads its name. The
special-teams call-sheet template, game-plan sections, coordinator choice, palette
colour and badge are gone. The side-of-ball rules in `commands.ts` simplify to "the man
decides": with no man who plays both sides, a line's side is its owner's.

## Consequences

- A Coach can no longer reclassify a Play across units. A play drawn on the wrong side
  is redrawn or copied; the diagram is never silently kept under a new unit.
- The e2e and parity specs that opened _Opponent look_ open _Shadow defense_; the
  Defenses-browser screenshot is unchanged behind it.
- The one-line `New play` in the header is a two-item menu; on a phone the More menu
  carries both items where it carried one.
- `Presentation` gains an optional `hideShadow`; every existing presentation literal
  is unchanged and means "shadow shown".
- Special-teams plays a Coach already has become offensive plays. The choice is
  recorded here so it can be reversed with a real special-teams unit later.
