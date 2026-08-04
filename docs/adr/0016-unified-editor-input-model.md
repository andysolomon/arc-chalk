---
status: accepted
---

# Use one accessible input model across mouse, touch, and Pencil

Chalk implements editor gestures through Pointer Events and a shared command pipeline so mouse, touch, and Apple Pencil produce the same domain operations. Keyboard and visible controls provide complete alternatives to pointer gestures.

## Consequences

- Tap or click selects, and dragging a selected object moves it.
- Empty-field drag creates a desktop selection box; Space-drag, middle-drag, and trackpad gestures pan.
- Two-finger pan and pinch-to-zoom navigate on touch devices.
- Apple Pencil draws and edits precisely while touch remains available for viewport navigation.
- Pointer capture keeps an active gesture intact when the pointer leaves its originating element.
- Selection handles remain constant in screen space regardless of zoom, and touch targets are at least 44 by 44 CSS pixels.
- Keyboard users can select, cycle, nudge, delete, undo, redo, duplicate, and invoke every toolbar operation.
- Context menus may accelerate work but never contain functionality unavailable through visible, keyboard-operable controls.
- All modalities dispatch the same preview and commit commands, preserving the transactional behavior in ADR 0012.

