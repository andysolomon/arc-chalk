---
status: accepted
---

# A screen is a call (amends ADR 0064, ADR 0065 and ADR 0073)

The route tree a back, a receiver and a tight end were offered was the original's ten
(Go, Slant, Hitch, Curl, Out, Dig, Post, Corner, Flat, Wheel). None of them is a
screen, which is the one route a Coach draws _backward_: a step behind the line and out,
caught with blockers in front. A lineman's blocks had a pass set and a chip, but nothing
for what he does on a screen — set, let his man go, and get out in front of the catch —
and the line calls (ADR 0064's six) had no screen either, so a screen was drawn by hand
on every man, every time.

## Decision

**Screen is on the route tree.** `legacyRoutePresets` has an eleventh shape, `screen`,
named _Screen_, offered after Wheel wherever the tree is offered: the Player panel's
_Quick routes_, a route's _Quick call_ menu, and the phone's tray. It is one curve from
the man's own spot, bending back first and ending four and a half yards wide of him and
a yard and a half behind where he stood. One shape serves a receiver's bubble and a
back's release to the flat, because like every route it is measured from the man rather
than the field (ADR 0073 is unchanged: the quarterback keeps his own calls and is not
offered it). The line is named _Screen_ the way any quick route is (ADR 0064).

**Screen release is a block.** `legacyBlockPresets` has `screenrelease`, named _Screen
release_, offered to a lineman among his _Quick blocks_ and to a back or a tight end
under his folded ones. He sets a yard and a half back, ticked where he leaves the set,
then runs dashed to the screen side — three yards across just behind the line, then
five and a half across and past it, ending in a bar for the block. It is a play-side
call like a pull (ADR 0065, `pull: true`), so it goes to whichever side the Play says the
ball is going, not to his own side of the ball.

**A screen route says where the ball is going.** `playSideOf` reads the carrier's path
only off a back, or a man in motion, because a receiver's route on the line says nothing
about a run. A screen is where the ball goes, so a route drawn as _Screen_ is read as
the carrier's path whoever runs it, in the same place in the order: after the down
blocks, before the pulls. A screen release counts with the pulls, as a block drawn to
the play side. Nothing new is stored, so moving the screen moves every release.

**Screen is a line call.** Beside the catalogue's six (`lineCallKeys`), the _Line calls_
catalogue offers _Screen_, keyed `SCREEN_LINE_CALL`. It is not one call on five men:
`screenLineJobs` gives the centre and every lineman on the screen side _Screen release_,
and the rest _Pass set_, each drawn from where he stands. The screen side is the side
the ball is going (`playSideOf`), which with nothing drawn yet is the right. The release
is drawn to that side explicitly, so the centre goes with his play-side guard rather than
to his own side of the ball. The summary names it _Screen_ while every man has the job it
gives him (`screenLineIsOn`); picked again it comes off the whole line, as the six do.
Picked with the screen now on the other side, it is not on — the jobs have changed — so
it redraws rather than coming off.

## Consequences

- A line already drawn as a screen by hand is unchanged and unnamed: it was never a
  call. A route reshaped to _Screen_ is named for it, and the Coach's own words stay,
  as ADR 0064 decides.
- A screen release from the backfield is drawn as its own shape to the play side, not
  as a back's kick-out or lead (ADR 0065 applies only to the pulls).
- The six line calls are still six. The whole-line _Screen_ is a seventh row in the
  catalogue, built from two of them.

## Evidence

`tests/e2e/screen-calls.spec.ts` runs at 1440 × 960 from Gun Doubles Right. The back
is given _Screen_ off the tree, and his line is named on the field, lit on the button,
and ends wide of him and behind where he stood. The right tackle is given _Screen
release_: his line sets back first, gets more than four yards wide to the right, and
ends past the line. _Screen_ from the Line calls catalogue puts five blocks on the line:
the centre, right guard and right tackle release right and the left pair pass set
straight back, and the summary reads _Screen_. It saves `screen-right.png`.

The second test gives the left split end, who stands on the line, _Screen_. The line's
_Screen_ now releases the left tackle, left guard and centre to the left, and the right
pair pass set. It saves `screen-left.png`, and then picks _Screen_ again and finds every
block gone and _No line call yet_. Both tests fail on the previous build, where the tree
has no _Screen_ button.
