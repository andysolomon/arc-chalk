---
status: accepted
---

# Store Play geometry relative to the line of scrimmage in yards

Chalk stores all durable Play geometry in a canonical football coordinate system rather than in screen pixels or SVG coordinates. The ball and line of scrimmage define the origin, lateral position is measured from field center, and positive longitudinal position always points toward the opponent's end zone.

## Consequences

- The canonical origin is `(0, 0)` at the ball on the line of scrimmage.
- `x` is lateral yard distance from field center; `y` is longitudinal yard distance from the line of scrimmage.
- Positive `y` always means downfield toward the opponent's end zone, independent of screen orientation.
- Coordinates are rounded to `0.01` yard when an interaction commits. Transient pointer calculations may retain additional precision.
- Zoom, pan, rotation, screen orientation, and the visible field segment are presentation state and do not rewrite Play geometry.
- An optional field context can place the relative Play near yard lines, end zones, or goalposts for special-teams and situational presentation.
- Editing, deterministic animation, Share Links, SVG, PNG, and PDF consume the same canonical geometry through explicit transforms.

