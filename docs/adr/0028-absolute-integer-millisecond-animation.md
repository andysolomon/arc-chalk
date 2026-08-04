---
status: accepted
---

# Derive animation from an absolute integer-millisecond timeline

Chalk stores animation timing as integer milliseconds around a snap at zero and derives the complete animated scene from an absolute requested time. Playback frame rate, pauses, seeking, and device speed do not alter the resulting geometry.

## Consequences

- Snap time is exactly `0 ms`; pre-snap motion uses negative values and post-snap actions use zero or positive values.
- MovementPath nodes store arrival times rather than inferred player speeds.
- Holds are explicit intervals and do not rely on duplicate or nearly duplicate coordinates.
- Segment progression uses arc-length parameterization so Bézier curvature does not create accidental speed variation.
- Linear interpolation is the default; any optional easing comes from a small versioned built-in set.
- Scrubbing computes the scene directly from the requested absolute time.
- Playback uses `performance.now()` to select absolute timeline time and never accumulates frame-to-frame simulation deltas.
- Pause, resume, dropped frames, and playback-speed changes do not rewrite stored timing or change a scene sampled at the same absolute time.
- The same validated Play revision, absolute time, and renderer version must produce identical canonical animated geometry.

