---
status: accepted
---

# Motion by type, and lines that open (amends ADR 0043, ADR 0052 and ADR 0058; parity exception to ADR 0039)

ADR 0043 kept the original's Route panel for every line a man can have, and ADR
0058 left it "restyled and otherwise as ADR 0043 left it". A motion was a route
whose _Kind of line_ had been switched: the panel under it was the Route panel
with fields taken out. Its head read _MOTION · Z · Motion · zigzag · 2 breaks_;
its one coaching field still asked for _Assignment — STICK_; _Flip_ and the
breaks count described a route; and what a Coach actually decides about a man
in motion — how it is drawn, when the ball is snapped — sat folded under
Appearance and Advanced. The _Route | Motion_ switch looked like two tabs and
was in fact a conversion: pressing it redrew the line. And the way from a
man's panel to one of his lines was a small blue _Edit_ beside the line's name.

Product request (2026-10-12): the motion menu is ugly and confusing and has to
be simpler; getting back to it should not mean finding the little Edit button;
and the whole inspector has problems, alternates most of all — _+ Alternate
route_ stood under the quick calls, a screen away from the routes it adds to,
and its help opened inside its own row and squeezed the button to a column one
word wide. The product owner accepted the five changes below.

## Decision

**A motion is given to the man, by type.** A motion is what he does before the
snap and a route what he does after it, so a man can have both and neither is
made out of the other. The Player panel says what he does in the order he
does it: **Pre-snap motion**, then his **Route** (or _Assignments_, or
_Blocking_). With no motion, the first holds the five types on one line — **Jet,
Orbit, Across, Return, Shift** — and one press draws it from his stance; with
one, it holds a row that names it: _Jet · moving at the snap_. The _Kind of
line_ picker no longer offers Motion on a route or Route on a motion
(`lineKindChoices`); it stays where it still chooses something — a back's
route and the ball's flight, a defender's drop, blitz and stunt. A motion by
hand is still drawn from the Draw row or with M (ADR 0052).

**A type is a shape, and the Coach still drags it** (`motion-calls.ts`). Each is
measured from the man's stance, the ball and the quarterback, the way a route
off the tree is measured from the man: a jet runs the lane between the line and
a quarterback in the gun, or behind one under center, to the near guard; an
orbit is one sweep bowed behind the quarterback; an across goes over to the far
slot, clear of whoever is in it; a return goes in level as far as the next man
allows and comes back underneath; a shift is four yards in for a man split wide
and out for one already in close. The type is kept on the line as its `preset`,
names it in the roster (_Jet motion_), and stays lit after a break is dragged,
as a quick route does. A man has one motion: a second type redraws the one he
has.

**Moving or Set replaces a motion's timing.** `atSnap` on a motion says what he
is doing when the ball is snapped. _Set_ is a motion as it has always played —
it finishes `MOTION_GAP_MS` before the snap — and is stored as the key's
absence, so no Play already saved moves. _Moving_ runs right up to the snap,
which moves where the timeline starts. Jet and orbit are given moving; the rest
set. A moving man whose next line starts somewhere other than where the motion
leaves him cannot be in both places, so he is given the breath to get there, as
a set man is.

**His routes start where the motion leaves him.** A route is run from where he
is at the snap (issue #164). When a type is given, changed or taken off — from
the panel, the row's ×, or Delete on the field — the routes that set out from
where he used to be at the snap are carried to where he is now, shape, bends
and forks with them. A route that never started there was drawn that way on
purpose and stays; a motion drawn or dragged by hand moves nothing, as before.

**The Motion panel is three choices.** _Type_, _At the snap_, and one _Note_,
then _Remove motion_. A motion is always a zigzag, so there is no Appearance;
its timing is Moving or Set, so there is no Advanced; Flip, Straighten, the
read, the conversion and the choice are a route's and are not offered. Words
written on a motion's Assignment before this panel existed stay in view while
there are any, since they print on the field.

**A line's panel is headed by whose it is and what it is**: the man's chip and
_Motion_, _Route_, _Alternate 1_, _Block_, _Man_ — the Player panel's head, for
a line. The line style and the breaks count are gone from it, since the field
shows both; _Segment 2_ or _Branch 1_ still stands beside the name when the
panel is narrowed to one. A man's lines are listed the same way — _Route_,
_Alternate 1 · 1 choice_, _Drive_, _Jet · moving at the snap_ — without the
line style after them, the call each was drawn as in the picker beside it.

**A line opens its panel.** In a man's list the row itself is the button (named
_Edit Route_, _Edit Jet · moving at the snap_ for a screen reader); the small
_Edit_ is gone. On a desktop a line clicked on its own on the field brings back
a folded inspector, as a man does (ADR 0058); clicking the grass or Escape puts
it down. The tablet's drawer and the phone's sheet keep their own rules.

**Alternates stand with the routes.** _+ Alternate route_ (_+ Alternate call_
for a quarterback) moves from the foot of the panel to directly under his
routes, and is offered once he has a line to be an alternate to. In any row of
buttons a hint's sentence now opens on a line of its own under the row
(`.help-row`), and a line's own actions are as wide as their words, so _+ Choice
at the end_ is one line.

**A zigzag follows a bend.** The renderer drew a zigzag chord to chord and
ignored a bend the handles, the hit test and the playback all followed, so an
orbit was drawn straight through the quarterback. It is now drawn round the
bend, each tooth square to the curve; a straight zigzag is drawn exactly as it
was.

## Preserved

Every line already saved draws and plays as it did. The Route panel keeps its
coaching fields, choices, Flip, Straighten, Appearance and Advanced; the Draw
row, Free draw and the R, M, B, Z keys; quick routes, blocks and assignments;
the line's _Quick call…_; the × on each row; the context menu; the phone's
quick tray; and an option picked still puts a floating inspector away (ADR
0058, amended 2026-09-29) — a motion type and Moving or Set are options.
_Advanced_ now says _Timing set_ only when timing is set; it said so always.

## Not done

Dragging the end of a motion does not carry the routes that start there; they
are carried only when the motion is given, retyped or removed. Guided tours
under Help still show the panels as they were filmed (ADR 0052).

## Evidence

`tests/e2e/motion-panel.spec.ts` walks the desktop: a type given from the
man's panel, the row that opens the Motion panel and the three choices in it,
Moving and Set moving the timeline's start, a route carried by a retyped
motion and put back when it is taken off, a line clicked on the field bringing
back a folded inspector, and the alternate's help under its row, ending on
screenshots. `tests/e2e/phone-line-inspector.spec.ts` checks the sheet offers a
motion the same three choices and a route no Motion. Isolated, written before
the code: `tests/domain/motion-calls.test.ts` (the shapes against the sets, and
the timeline), `tests/editor/motion-calls.test.ts` (one motion a man, routes
carried and left alone) and `tests/render/zigzag-bend.test.ts` (a zigzag round
a bend, and a straight one unchanged).
