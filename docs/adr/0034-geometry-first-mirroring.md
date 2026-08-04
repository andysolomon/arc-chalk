---
status: accepted
---

# Mirror geometry separately from explicit role-pair swaps

Chalk mirrors Play geometry across field center without guessing that football role labels should change. Formations may define explicit left/right role pairs, which a Coach can apply through a separate previewed operation.

## Consequences

- Mirroring negates canonical `x` coordinates while preserving canonical `y` coordinates and animation times.
- Coaches may mirror the entire Play or the current selection.
- Players, MovementPaths, zones, landmarks, and annotation anchors participate in the geometric transform.
- Text positions and alignment mirror, but glyphs remain readable and are not reflected.
- Geometry-only mirroring is the default command.
- A Formation may define explicit role pairs such as `LT ↔ RT`, `LWR ↔ RWR`, or `LCB ↔ RCB`.
- `Mirror and swap paired roles` is a separate command with a preview and a list of unpaired roles.
- Chalk never infers role pairing from spelling, prefixes, suffixes, position group, or screen location.
- The operation is one undoable domain transaction.
- Mirroring the same scope twice must reproduce the original canonical document exactly, including stable IDs and timing.

