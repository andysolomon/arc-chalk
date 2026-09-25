---
status: accepted
---

# A drag draws what the hand drew, in breaks mode too (amends ADR 0054)

ADR 0054 made a line by hand traceable, behind a _Free draw_ switch that every device
starts with off. Off, the gesture the status bar teaches first — drag the blue dot above
a man — still laid down one straight segment from his stance to where the finger lifted,
however the finger had travelled. A Coach who pulled a wheel, a sail or a rounded Basic
off the dot got a straight line and a dashed aim, and read the editor as able to draw
straight lines only. The switch that would have traced it sat in the inspector, out of
sight of the drag.

Product decision (2026-09-25): a Coach draws a custom route by hand without first finding
a switch. Where a drag means drawing, it draws the shape the hand made.

## Decision

**The pull off the dot is traced in either mode.** The drag is followed from his stance
as ink under the finger, the way ADR 0054 traces a free line. When it lifts in breaks
mode, what it leaves depends on what the hand did:

- A stroke that bent keeps its shape. Its samples stay on the line in hand, marked as
  traced, and the finish fits them exactly as it fits a free stroke (thinned at 2.5 px,
  gentle bends curved, cuts of 40° or more kept sharp).
- A stroke that ran straight — every sample within 6 px on screen of the segment between
  its ends — is the single break a click where it lifted would have placed: snapped to
  the 45° rays while snap is on, Shift inverting, clamped to the field. A quick pull off
  the dot still lands a clean stem, as it did before.
- A press that never moved is a click, and places nothing.

Either way the line stays in hand, as it always has after the pull off the dot: the next
click places the next break, and Done, Enter or a double click finishes it.

**The end of the line in hand can be picked up.** In breaks mode, a press within a man's
reach (17 px, 22 px for a finger) of the end of the line in hand — his stance, before
anything is drawn — takes hold of the line instead of placing a break. Dragged, it
traces on from there under the same rule; lifted where it landed, it places the break a
click there would have. A typed depth is waiting for the next break, so with one typed
the press places that break instead. Everywhere else, a press still places a break and
holding it still bends the segment behind it.

**Free draw keeps its meaning.** On, every press traces and the line is finished the
moment the pointer lifts. The switch now decides how a line ends and whether a press
anywhere on the field traces, not whether a Coach can draw by hand at all.

## Consequences

- `FieldDrawingState` gains `strokeFrom`, the index a stroke under a held pointer set out
  from. It is what tells a stroke lifted in breaks mode apart from the line it continues,
  and the overlay draws a stroke as ink whenever one is being traced, in either mode.
- `liftStroke` settles a stroke lifted in breaks mode; `grabsLineEnd` decides whether a
  press picks the line up; `isStraightStroke` tells a straight pull from a drawn shape.
- The Play still receives breaks and controls, never samples, so a route drawn by hand
  is edited, animated, exported and hashed like any other.
- A held press while a line is in hand no longer opens the long-press menu: a finger
  resting on his stance before it draws is starting the line, not asking about the man.
- The breaks-mode status bar names the new gesture: _drag from the end: draw it by hand_.
