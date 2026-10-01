---
status: accepted
---

# A quarterback is given a quarterback's calls (amends ADR 0034 and ADR 0056)

A Coach who picked his quarterback was offered the receivers' route tree (Go, Slant,
Hitch, Curl, Out, Dig, Post, Corner, Flat, Wheel) and, folded under it, a back's blocks.
None of it is what a quarterback does. ADR 0056 decides what _kind_ of line a man can be
given. A quarterback is "any other offense", so he gets Route, Motion, Block and Ball,
and every quick call was the same as a receiver's. The original names a quarterback's
hand-drawn line _Drop_ or _Boot left / right_ (`lineCallName`), but it never offered him a
call.

## Decision

**The quarterback gets his own catalogue.** `quarterbackCalls` lists twelve calls in the
order he is offered them:

- Pass: **3-step drop**, **5-step drop**, **7-step drop**, **Play action**, **Boot left**,
  **Boot right**, **Sprint out left**, **Sprint out right**.
- Run: **Handoff**, **Zone read**, **QB sneak**, **QB draw**.

Each is his own route-kind line, drawn from where he takes the snap, keyed on the line
as `preset` the way a quick route is. So the field, the roster, the install sheet and
the exports name it (`routeCallName`), and the button for the call he is running is lit.

**Who is the quarterback.** He is the man `assignRoles` reads as `QB`, which is the
same reading that makes the roster say _Quarterback_: a man lettered Q or QB.
`routeCallsFor(play, player)` returns his calls for him and the route tree for anyone
else who runs routes. The Player panel, its line's _Quick call_ menu, and the phone's
quick tray (for him or for his line) all ask it.

**What the panel shows him.** It is headed _Assignments_ and has _Quick pass calls_
and _Quick run calls_ in two columns. The route tree and the folded _Quick blocks_ are
gone. _Flip his assignments_ and _+ Alternate call_ replace the route wording. With
nothing on him, the panel and the roster say _No assignment yet_. He can still draw a
Route, Motion, Block or Ball by hand (ADR 0056 is unchanged).

**How each call is drawn.**

- **Drops** go straight back. A man more than 4½ yards off the ball took the snap in
  the gun or pistol and is already deep, so the same call is shorter:
  under center 2, 3½ and 5 yards; from the gun 1¾, 2½ and 3¼. Every drop is long enough
  to show past the man himself and stays on the painted field (9½ yards behind the line
  at most).
- **Play action** opens to the run side, fakes at the mesh, and sets straight back off
  it. That clears a back lined up behind him.
- **Boot** fakes one way, bends back behind the guard on the side it names, and gets
  3½ yards outside the end of the line (a tight end attached to it counts) while still
  behind it. **Sprint out** goes straight to the same spot without the fake.
- **Handoff** opens to the run side and meets the back at the mesh.
- **Zone read** keeps the ball the other way, outside the backside end of the line and
  4 yards past it.
- **QB sneak** goes into the A gap on the run side. **QB draw** shows pass, then runs up
  through the B gap.

The run side is read the way a pull's play side is (ADR 0065): `playSideOf` first,
then the side a back is offset to, then right. Nothing new is stored, so changing the
down blocks or the back's path changes where the next fake or handoff goes.

**Turned over, a sided call is the other side's.** Each of these mirrors a line: _Flip
his assignments_, _Flip route_, _Flip strength_, and Mirror (the whole Play or a
selection). Each now also changes Boot right to Boot left and Sprint out right to
Sprint out left, and back. _Pass set left_ and _Pass set right_ name their side the same
way, so they trade too. Before this, a mirrored Pass set left still read _Pass set left_
while it set to the right. The line is named and lit as the side it now goes to.
`mirroredCallKey` holds the pairs. Mirroring stays geometry first (ADR 0034): no role or
letter is inferred, and mirroring twice gives back the same Play.

**A long name clears an upright line.** The renderer centres a route's words beside its
last leg. Beside a leg that runs straight up or down the field, a long name such as
5-STEP DROP lay across the line. Within 25° of upright, the words are now moved out
until their nearer end clears the line by 8 pixels. Words that already cleared, and
every leg at any other angle, are drawn exactly where they were.

## Consequences

- A route already on the quarterback stays as it is, named and lit for what it was drawn
  as. A quarterback call reshapes his base stem the way a quick route does.
- A receiver, a back and a tight end are offered what they were before.
- In I-Form the deeper drops run over the spot the fullback stands on at the snap. That
  is where the quarterback goes, and the fullback has left it.

## Evidence

`tests/e2e/quarterback-calls.spec.ts` runs at 1440 × 960. From I-Form Right, the
quarterback is offered his twelve calls and none of the route tree or Quick blocks. His
5-step drop goes 3½ yards straight back and is named on the field, and his line's Quick
call menu offers Boot right and not Slant. His boot right fakes left and ends outside
the tight end, behind the line. Flipped, it ends outside the left tackle as a Boot left,
and flipped back it is Boot right again. Mirroring the whole Play makes it Boot left,
and mirroring back makes it Boot right. The roster reads _Q: Boot right — Quarterback_. X
still runs the route tree. From Gun Doubles Right, the 3-step and 5-step drops are 1¾
and 2½ yards. The handoff goes to the offset back's side, and the zone read keeps it
the other way, outside the left tackle and past the line. The spec saves
`iform-boot-right.png` and `gun-zone-read.png`.

`tests/e2e/phone-quarterback-calls.spec.ts` (390 × 664) taps the quarterback in Stick —
Thunder. It checks that the tray offers his calls and not Slant, Go or Corner, gives him
Boot right from the tray, and finds it named on the field and in the roster. It saves
`phone-boot-right.png`. Both specs fail on the previous build.

`tests/e2e/editor-interaction.spec.ts` used to give the Stick quarterback a Slant and a
Corner to show that a call goes on a man with nothing drawn. It now gives him a 3-step
drop and then Play action. The receiver's folded blocks and the Wheel redraw are shown
on Z.
