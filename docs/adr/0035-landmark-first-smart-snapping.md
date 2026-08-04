---
status: accepted
---

# Snap editor input to football landmarks before the yard grid

Chalk provides zoom-independent smart snapping that prioritizes meaningful football landmarks and nearby diagram alignment before a configurable yard grid. Snapping affects transient editing previews and commits ordinary canonical coordinates without entering the Play document as hidden constraints.

## Consequences

- The default positional grid is one quarter yard; Coaches may select `0.25`, `0.5`, `1`, or off.
- Snap priority is ball and line of scrimmage, Field Profile landmarks, alignment with nearby Players or nodes, then the yard grid.
- An approximately eight-screen-pixel activation threshold remains stable across zoom levels.
- Visible guide lines and a subtle visual response disclose which target is active.
- Moving a group preserves its internal spacing and uses the group's relevant anchor for snapping.
- Route tools suggest straight, 45-degree, and 90-degree breaks without forcing them.
- Shift constrains desktop direction and Alt temporarily disables snapping.
- Touch and Pencil workflows expose visible snap and constraint controls rather than requiring keyboard modifiers.
- Snapping updates only transient interaction state until the gesture commits under ADR 0012.
- Snap settings are Coach or device preferences and do not alter the serialized Play document.
- Rendering, animation, sharing, and export consume only committed canonical geometry and contain no snapping behavior.

