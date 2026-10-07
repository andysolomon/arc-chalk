---
status: accepted
---

# The header always occupies one row

The iPad portrait header deliberately broke after the play name and type. At
834 CSS px with touch enabled, it occupied 112 px and took drawing space.
The product request on 2026-10-07 requires a single row at every width.
This supersedes the wrapping decisions in ADR 0045 and ADR 0057.

The header never wraps. Up to 1240 px the branding yields space and the name flexes into the remaining
width. Below 1024 px, New play, Reset positions, Present and Print & export
move to More. Larger tablets keep these actions on the row. The
three destinations, type, Undo, Redo, More and Save remain on the tablet row.
Below 668 px, a native view picker replaces the destination tabs, and Undo,
Redo and Play type move to More. The phone's Print & export remains in its
sidebar, preserving one visible home per command. All primary touch controls
keep real 44 px targets. Panels open below the controls, and the existing
safe-area padding and menu scrolling remain.

Desktop appearance at the 1440 px fine-pointer parity viewport is unchanged.
The compact header applies to both touch and mouse input, including an iPad
used with a trackpad. No visual parity ratchet is raised.

Evidence: `tests/e2e/header-single-row.spec.ts` measures one row, in-bounds
controls and non-overlapping boxes at 668–1366 px with both pointer types,
including long names and all three destinations. It exercises New play,
Present, Print & export and Save in light and dark themes at 834×1194.
`tests/e2e/phone-header-single-row.spec.ts` verifies the single row, navigation,
Undo/Redo and classification at 360, 390, 430 and 844 px. Existing phone
workflows use the same native picker, and screenshots are reproducible test
artifacts. The old implementation fails the new 834 px test (112 px header);
the fix measures 56 px. Chromium was run locally. WebKit and a physical iPad
Safari check were not run locally because WebKit dependencies are unavailable.
