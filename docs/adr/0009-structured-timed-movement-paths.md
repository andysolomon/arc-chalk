---
status: accepted
---

# Represent routes and motion as structured timed paths

Chalk represents player movement with a domain-level `MovementPath` rather than persisting SVG path strings or raw pointer samples. The same structured geometry drives direct manipulation, deterministic playback, hit testing, Share Links, and static exports.

## Consequences

- A MovementPath contains ordered nodes in canonical yard coordinates with explicit timing.
- Segments are explicitly straight or cubic Bézier. Joins are sharp by default; control handles create intentional curves.
- Pre-snap motion uses negative time and terminates at snap time `0`; post-snap movement begins at `0`.
- Holds and pauses are explicit timeline intervals rather than duplicate or nearly duplicate geometry.
- Stroke style, route family, arrowhead, and other visual semantics are metadata separate from path geometry.
- Freehand pointer input is simplified and fitted into the same editable node-and-segment representation before an interaction commits.
- SVG path data, sampled animation positions, and export primitives are derived outputs and are never the authoritative stored form.

