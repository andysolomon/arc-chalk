---
status: accepted
---

# The run game reads the play side off the Play

Coaches testing run plays (issue #164) found that Power, Counter, Jet Sweep and Toss
took several times longer to draw than pass plays and still came out wrong:

- A pull from the Quick blocks mirrored to the puller's own side of the ball. On an
  I-Form Right power the left guard's **Pull — wrap** went left, away from the play.
  The fullback's **Pull — kick** used a lineman's shape: back off the line, then out,
  which from the backfield runs him deeper.
- The pulls sat behind the fold for a back, whose summary listed only
  Drive · Down · Reach · Double.
- A route drawn after pre-snap motion started at the man's stance. The Player panel
  numbered his lines together, so the route read as *Alternate 1* to his motion.
  Drawing the motion also left the playback clock at the snap, which showed him at the
  motion's end and greyed out everyone else.
- With snap on, a break drawn in the tackle box was held to 45° off the last one.
  That laid a pull along the line, behind the men on it. A dragged break lined up with
  a lineman's spot or depth, or with the ball, which is where the centre stands.

## Decision

**The play side is read, not stored.** `playSideOf` reads the Play the way a coach
reads the diagram. First the down blocks: the play side blocks down, away from the
hole. Then the ball carrier's path, which is a back's or a man in motion's base route.
Then any other man already pulling, then the strength of the set (the tight ends on
the line). The man being given the call is left out. When there is nothing to read,
a pull is drawn to his own side as before. Nothing new goes in the document, so
changing the down blocks changes where the next pull goes, and **Flip his block**
still turns any single pull around.

**A pull runs to the play side.** Pull — kick, Pull — wrap and a new **Trap** are
flagged `pull` in the catalogue. For a lineman or a tight end the shape is the
original's, drawn toward the play side instead of outward. From the backfield the
shape is the back's own. A kick-out turns up behind the line inside the end man and
meets the edge just outside him, past the ball. A lead (wrap) turns up through the
hole inside the end man to the second level.

**A back sees the run game first.** His folded Quick blocks list the pulls, the trap,
the cut and the chip first, and the summary names the first four. A lineman's grid is
already open and keeps the original's order, with Trap after the pulls.

**A route is run from where the man is at the snap.** A route drawn by hand, a quick
route and an alternate all start at the end of his last motion, if he has one.
Animation already runs the route from where the motion leaves him, so the path is one
continuous line in the diagram, the export and playback. The Player panel counts a
man's routes among his routes, so motion is named *Motion* and the first route is his
base stem. A playback clock at rest follows the timeline's start when a motion moves
it.

**In the tackle box a break finds the gaps.** The box is the offensive line and anyone
attached to it (a man on the line within 3.5 yards of the end man), with its gaps named
out from the ball: A, B, C and one more outside the end man. A break on an offensive
block, route or motion that lands in the box is not held to 45°. It snaps across the
field to a gap within 12 screen pixels, which is less than half a split at the default
zoom, so a gap never reaches past the man beside it. A dragged break there does not
line up with the men in the box or with the ball. A press that a snap moves off the
pointer no longer counts as a drag that bends the segment.

## Evidence

`tests/e2e/run-game.spec.ts` runs at 1440 × 960 on I-Form Right. With the centre,
right guard and right tackle blocking down, the left guard's wrap ends right of the
right guard. The fullback's summary names the pulls and the trap. His kick-out never
goes deeper and ends outside the Y and past the ball. A jet motion by Z leaves the clock
at rest with nobody faded. His route starts where the motion ends, is named his base
stem, and at the snap in playback he is at the motion's end, not back at his stance.
A pull drawn by hand across the box lands its breaks in the B gap. It saves
`power-right.png`, `jet-sweep.png` and `box-gaps.png`. All three tests fail on the
previous build. `tests/domain/run-game.test.ts` and
`tests/editor/tackle-box-snapping.test.ts` cover the ways the reading and ranking could
be wrong while the picture still looks plausible.
