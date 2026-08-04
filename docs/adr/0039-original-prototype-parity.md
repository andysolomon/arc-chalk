---
status: accepted
---

# Treat the original prototype as the canonical product specification

Chalk's production app is a faithful technical reimplementation of `Chalk Play Editor.dc.html`, not a visual redesign or a reduced MVP. The original prototype is design- and feature-complete and defines the expected Coach experience.

“Faithful” means user-facing identical. A Coach using the production app should not need to relearn, rediscover, or reinterpret anything that already works in the prototype.

## Consequences

- The production app preserves the original visual language, information hierarchy, density, field-first workspace, coaching copy, modes, controls, shortcuts, interactions, and outputs.
- User-facing parity is required at component, screen, workflow, keyboard, pointer, touch, animation, and generated-output levels—not merely as broad feature equivalence.
- Every original feature is in scope. A milestone cannot be complete while silently omitting an original tool, menu action, inspector control, library behavior, animation behavior, presentation mode, or coaching output.
- Reimplementation may replace the single-file internals with the accepted modular React, SVG, IndexedDB, Convex, Clerk, and R2 architecture, but technical boundaries must not reshape the Coach's workflow.
- New beta capabilities are additive extensions expressed in the established design language.
- Verified prototype defects are fixed while preserving the recognizable workflow unless a separate product decision explicitly changes it.
- Visual and behavioral golden captures, a feature-parity matrix, shortcut coverage, output comparisons, and representative interaction recordings are required release evidence.
- Removing, consolidating, renaming, relocating, or materially restyling an existing feature requires explicit product-owner approval.
- Approved defect fixes and additive production capabilities must create the smallest possible user-facing divergence and be recorded as explicit parity exceptions.
- `Chalk Beta Design Prototype.html` is a rejected design exploration and is not a production target.
