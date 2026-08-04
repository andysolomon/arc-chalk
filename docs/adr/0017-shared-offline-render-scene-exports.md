---
status: accepted
---

# Generate static outputs through a shared offline RenderScene

Chalk derives the private editor, read-only Share Links, and static exports from one pure `PlayDocument` to `RenderScene` transformation. SVG is the canonical vector serialization, while PNG and PDF are derived without taking screenshots or requiring server rendering.

## Consequences

- A framework-independent render core converts canonical yard geometry and presentation options into a versioned `RenderScene`.
- The editor and Share Links render that scene to SVG DOM; export serializes the same scene to SVG data.
- PNG rasterizes canonical SVG at an explicit output size and pixel density.
- PDF composes vector scenes into versioned print templates for single Plays, Playbooks, position sheets, scout cards, and wristbands.
- Fonts, field markings, strokes, arrowheads, and template measurements are explicit, packaged render assets rather than environment-dependent defaults.
- Locally available image blobs can be resolved without a network connection.
- Multi-page jobs run incrementally in a Web Worker, report progress, support cancellation, and process bounded page batches to cap memory use.
- A content hash covers the input revision, render-core version, template version, and export settings so equivalent jobs regenerate deterministically.
- Beta has no server-side export dependency; animated media export remains deferred.

