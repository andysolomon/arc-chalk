---
status: accepted
---

# A quarterback's call has no alternates and does not fork

ADR 0073 gave the quarterback his own calls (drops, play action, the boot and
sprint-out, the handoff, the zone read, the sneak, the draw) in place of the
route tree. His lines are still `route`-kind, so his panel kept the route tools:
_+ Alternate call_ under his assignments (ADR 0080), and _+ Choice at …_ with its
hint on his selected line. A drop or a boot is his whole call, not a stem he
runs and reads off, and a second dotted call beside it is not something he is
asked to choose between.

## Decision

**The quarterback is offered no alternate.** The Player panel shows
_+ Alternate route_ only to a man who runs routes (a receiver or a back). The
_+ Alternate call_ wording is gone. `addAlternateRouteCommand` returns nothing
for the man `isQuarterback` reads as QB, so no other surface can add one.

**His lines do not fork.** The line inspector hides _+ Choice at …_ and the
choices hint on a quarterback's line. `addRouteChoiceCommand` returns nothing for
a line he owns. A choice already on a saved line keeps _Remove this choice_, so it
can still be taken off.

**He draws no second route by hand.** A route drawn beside one he already has
would be saved as a dotted alternate. `canDrawLine(document, tool, player)` in
`@chalk/editor` adds that rule to `canDrawFrom`, and every way of drawing a line by
hand asks it: the Draw row's _Route_ button (disabled, with a title saying why), the
R key and the command palette, the blue dot (not offered), and `buildDrawCommand`
when the line is finished. With nothing on him he can still draw his own path, and
Motion and Block are unchanged (ADR 0056). To change his call he picks another
quick call, which replaces it, or deletes his line and draws a new one.
