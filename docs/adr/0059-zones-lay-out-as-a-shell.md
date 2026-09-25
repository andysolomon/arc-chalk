---
status: accepted
---

# A defense's zones lay out as one shell (parity exception to ADR 0039)

The original draws every zone drop on its own. A quick assignment — Deep 1/3, Deep 1/2,
Middle 1/3, Deep 1/4, Hook, Curl / flat, Robber — is a fixed shape off the defender's
stance with a fixed bubble, whoever else is dropping. Three men called Deep 1/3 get three
bubbles 11 yards wide wherever their stances put them: they overlap, leave gaps, and do
not read as thirds. Adding a fourth man, or sending one on a blitz, changes nobody else.

Arc Play Flag lays its zones out as a set (`lib/play/zones.ts`): deep zones split the
field into halves or thirds by how many are called, flats and curl-flats never stack,
and the layout follows every change because it is derived on each read.

Product decision (2026-09-25): Chalk's zones should work together the same way.

## Decision

**One rule, in the domain.** `layoutZoneShell(play, levels)` lays out a defense's drops
by level, and `settleZoneShell(before, after)` re-lays only the levels whose drops
changed between two versions of a Play. A drop is a defender's zone line ending in a
bubble; its level is its coverage area's type (the default one a drop never sized
draws, when it has none).

| Level      | Coverage types   | Laid out                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deep       | deep             | The field's width in equal shares, left to right in the order the men line up: one owns the middle, two take halves, three thirds, four quarters. One depth, 4 yards behind the deepest of them and never shallower than 13 yards. Each bubble is its share wide less a 1-yard seam, and never wider than a zone can be sized, so a lone deep man owns the middle rather than all of it |
| Underneath | hook, curl, flat | Each stays where it was called to. Bubbles on one row (their depths overlap) that would stack are laid side by side a seam apart, as near as they can be to where each was called, and held between the sidelines. Depth is kept                                                                                                                                                        |
| —          | spy; a man call  | Untouched. A spy watches the quarterback, and a man call ends in an arrow and owns no ground                                                                                                                                                                                                                                                                                            |

An alternate drop, and a zone line stored on an offensive man, are not part of it.

**When it runs.** When the Coach changes who is in the shell: a call from Quick
assignments or the line inspector (`applyLinePresetCommand`), including taking one off
and replacing a drop with a blitz, stunt or man call; and deleting a drop or clearing a
defender's lines (`buildDeleteCommand`). The call and the room made for it are one
command and one undo step. Only the level that changed moves: a hook re-lays the
underneath and leaves the deep shell as the Coach left it.

**What it does not do.** Putting on a defensive call from the catalogue keeps the
original's art exactly; the call's drops join the shell the next time the Coach calls
or clears a zone at their level. Dragging a bubble or sizing it never re-lays anybody.
The shell is stored on the drops like any other edit rather than derived on read, as
Arc Play Flag does it, because a Play owns its snapshot (CONTEXT.md, Play) and every
renderer, export, animation and handle already reads the drop's own points and area.

## Consequences

- A lone Deep 1/3 owns the middle of the field; the preset names say what a man is
  asked to play, and the number of deep men says how the field is shared.
- Calling or clearing a zone at a level can move a bubble the Coach dragged or sized at
  that level. The move is shown and undone in the same step as the call.
- The catalogue's own art classifies a drop by where it ends, so the Cover 3 robber and
  the Tampa 2 mike, both past 13 yards, are deep; adding one more deep man to those
  calls shares the field five or four ways.
- The original's zone radius bounds move from the editor's handles to the domain
  (`ZONE_COVERAGE_RADIUS_BOUNDS`), where the shell and the handles both read them.
- `docs/original-prototype-parity-matrix.md` records this beside ADR 0056.
