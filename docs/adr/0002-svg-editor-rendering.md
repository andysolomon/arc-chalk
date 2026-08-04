---
status: accepted
---

# Use optimized SVG for editor rendering

Chalk uses SVG as the editor, playback, sharing, and vector-export rendering architecture because a football Play has a modest object count and requires crisp scaling, precise text, inspectable geometry, reliable hit targets, and authoritative vector output. Canvas and WebGL were rejected because their export, accessibility, text, and hit-testing complexity is not justified by Chalk's scene size.

## Consequences

- Pointer and animation loops update only affected SVG elements on animation frames instead of cloning the full Play or rebuilding the full React tree per pointer event.
- One immutable domain mutation is committed when an interaction completes, preserving undo and synchronization semantics.
- Renderer layers must be independently memoizable and benchmarked against the 60 FPS and p95 input-to-paint budgets.
- Static exports and Share Links reuse the same yard-based geometry and rendering rules as the editor.
