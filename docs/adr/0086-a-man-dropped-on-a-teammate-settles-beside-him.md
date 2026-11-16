---
status: accepted
---

# A man dropped on a teammate settles beside him (amends ADR 0073)

ADR 0073 kept the Arrange menu from standing one man on another, but left the drag
free: a Coach could carry H onto the left tackle, let go, and leave one circle half
over the other.

Product request (2026-11-15): you shouldn't be able to just place a player on top of
another player. The field should adjust.

## Decision

**A move ends clear of every teammate.** If a drag or a keyboard nudge would leave a
moving man's mark covering the mark of a man of his own unit who stays put (closer than
two 13-pixel radii, 26 frame units), the move goes to the nearest spot where every mark
is clear. Candidate spots are straight out from the man he landed on; level with where he
was dropped, so a man laid on the line stays on it; and where two men's edges cross, for
a drop wedged between two. If no candidate is free, the move walks out in rings until it
finds one.

**The drag shows where he will land.** The push runs inside the move preview, so while
he is held over the tackle he is already drawn beside him, and letting go lands him
exactly there. A push drops the snap guides, as a sideline hold already did.

**The other side of the ball is left alone.** A defender head-up on a receiver, or a
nose on the centre, is a press or a technique, not a mistake.

**The push keeps every other hold.** It never puts a man past a sideline, off the drawn
frame, or across the line of scrimmage. A group moves as one: the whole translation is
pushed until no man in it covers a teammate who stays put.

## Consequences

- Men already drawn on top of each other in a saved play stay that way until one of them
  is moved. Moving one pushes him clear.
- A keyboard nudge into a teammate stops short at his edge rather than passing through
  him.

## Evidence

`tests/e2e/drop-clear-of-teammates.spec.ts` drags H onto the left tackle on the seeded
Stick — Thunder. While he is held, and again after he is let go, no two men are under 26
frame units apart and H is flush beside the tackle. A second drop wedges him between the
centre and the quarterback, and he comes out clear of both. The field after the first
drop is the run's artifact, `h-beside-the-tackle.png`.
