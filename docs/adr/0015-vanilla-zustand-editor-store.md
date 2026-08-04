---
status: accepted
---

# Back a Chalk-owned EditorStore with vanilla Zustand

Chalk separates pure domain state from transient editor-session state and exposes both through a Chalk-owned `EditorStore` interface. Vanilla Zustand is the thin subscription implementation; React, persistence, synchronization, and provider SDKs remain outside domain commands.

## Consequences

- `PlayDocument` and its commands are framework-independent TypeScript.
- Durable document state, transient pointer interaction, viewport, selection, and playback-control state have explicit boundaries.
- React components subscribe through narrow selectors so changing one Player or MovementPath does not rerender the field.
- Pointer movement updates only transient interaction state; pointer release dispatches one domain command and durable transaction.
- The animation clock does not update React state every frame. A frame loop samples canonical geometry and updates only affected SVG presentation nodes.
- TanStack Query manages remote request state only and does not own the editor document.
- Domain code never imports Zustand, React, Dexie, TanStack Query, Clerk, or a provider SDK.
- Zustand can be replaced behind `EditorStore` without changing domain commands or serialized Play documents.

