# Prototype parity evidence

The restored original prototype is the Coach-facing specification. Captures in this directory are evidence for incremental comparison; they do not approve differences.

## Automated canonical prototype capture

The original prototype is served directly from its restored files and exercised in an isolated browser context. Each scenario clears the prototype's owned local state, waits for the seeded `Stick — Thunder` Play and its fonts, enters the requested mode, and compares the full page against the named golden.

```sh
# Verify that the restored original still matches the accepted goldens.
bun run test:parity

# Intentionally regenerate goldens after reviewing the canonical source state.
bun run capture:parity
```

The ordinary `bun run check` path verifies the goldens and never updates them.

## Desktop top-level modes

- Viewport: 1440 × 960 CSS pixels
- Browser: headless Chromium

| Mode | Original golden | Captured state |
|---|---|---|
| Editor | `screenshots/original-editor-desktop-1440x960.png` | Seeded Play, no active selection, Formation/Line call/Concept/Defense/Library inspector visible |
| Demo | `screenshots/original-demo-desktop-1440x960.png` | Tool tour, first Player-tool step, playback paused |
| Present | `screenshots/original-present-desktop-1440x960.png` | Full-window seeded Play, first Concept variation, playback stopped |
| Print | `screenshots/original-print-desktop-1440x960.png` | Letter-landscape field preview using the Print type preset |

## Desktop editor overlays

| State | Original golden |
|---|---|
| More menu | `screenshots/original-editor-more-menu-desktop-1440x960.png` |
| Export menu | `screenshots/original-editor-export-menu-desktop-1440x960.png` |
| Save/version menu | `screenshots/original-editor-save-menu-desktop-1440x960.png` |
| Command palette | `screenshots/original-editor-command-palette-desktop-1440x960.png` |
| Keyboard shortcuts | `screenshots/original-editor-shortcuts-desktop-1440x960.png` |
| Formation browser | `screenshots/original-editor-formations-desktop-1440x960.png` |
| Defense browser | `screenshots/original-editor-defenses-desktop-1440x960.png` |

## Production against the original

`tests/parity/production-shell.spec.ts` captures the production shell and compares it against the **original's own golden**, so the recorded number is the live parity gap rather than an opinion. Each threshold in that file is a ratchet: it records the gap measured when the state was last worked on and may only be lowered. Raising one is a parity regression needing product-owner approval per ADR 0039.

| State | Gap measured | Date |
|---|---|---|
| Editor | 1.85% (25,526 px of 1,382,400) | 2026-08-06 |
| Export menu | 1.74% (24,057 px) | 2026-08-06 (first measurement) |
| Command palette | 1.80% (24,818 px) | 2026-08-06 (first measurement) |
| Save/version menu | 1.81% (25,027 px) | 2026-08-06 (first measurement) |
| More menu | 1.81% (25,040 px) | 2026-08-06 (first measurement) |
| Keyboard shortcuts | 2.64% (36,477 px) | 2026-08-06 |
| Keyboard shortcuts | 3.48% (48,152 px) | 2026-08-06 (first measurement) |
| Editor | 1.89% (26,186 px of 1,382,400) | 2026-08-06 |
| Editor | 2.14% (29,631 px of 1,382,400) | 2026-08-06 (first measurement) |

### Measuring a metric rather than guessing at it

Pixel diffs show *where* production disagrees with the original but not *why*. To read the original's own numbers, load both pages in the parity projects and dump `getBoundingClientRect()` and `getComputedStyle()` for the elements in question. That is how the values below were established; each was a real number read off the original, not an estimate from a screenshot.

Closed so far:

- The header carried `Versions` and `Backup` controls the original does not have. Versions now live in the Save menu as the original's `Snapshot`, and Backup — an approved production extension under the rule above — lives inside the More menu instead of adding a header control.
- The header Save button reads `Save` as the original's does, and the save acknowledgement moved to the end of the status bar where the original shows it. Present mode hides it with the rest of the authoring chrome.
- Inspector body copy for Concept and Defense is no longer truncated.

Metrics matched to the original by measurement:

| Element | Original | Was | Now |
|---|---|---|---|
| Play title width | 410 px | 310 px | 410 px |
| Play Type control x | 794 | 695 | 795 |
| Tool-rail glyph | 18 × 18 at x 19 | 22 × 22 at x 17 | 18 × 18 at x 19 |
| Inspector body width | 256 px | 252 px | 256 px |

### The five chrome overlays

The More menu, Export menu, Save/version menu, command palette and shortcut
reference are built from the original's own item lists, ordering and copy,
which live in `apps/web/src/components/editor-command-surface.ts`. Changing a
label there is a parity change, not a wording preference.

Four of the five sit at or just under the Editor's own gap, because the panel
covers part of the field that production and the original disagree about — what
remains is the shell behind the overlay, not the overlay itself.

The shortcut reference is higher for one reason that is not about the panel:
reaching `Shortcuts ?` scrolls the inspector, and the original's inspector
carries History, Page, Type and layer sections production has not built. The
panel itself matches — its single-line rows measure the original's 28 px and its
three-line rows the original's 62 px.

A command production cannot yet run stays listed and is shown unavailable
rather than accepting a click and doing nothing. The Formation, Defense and
saved-Play entries the original's palette also carries arrive with the browsers.

Two things measured here that were not obvious from a screenshot:

- **Tailwind's preflight sets `line-height: 1.5` where the original inherits
  `normal`.** That stretched every shortcut row from 28 px to 30 px and pushed
  the panel 20 px up. Setting it globally to `normal` made *every* state worse
  (Editor 25,526 → 25,781 px), because the rest of the shell was already built
  against the 1.5 leading; the fix belongs on the panel that needs it.
- The original's shortcut rows are a **17 px line box**, not `normal` — `normal`
  gives 15 px in production's font stack and undershoots by 2 px a row.

Known contributors to the remaining Editor gap:

- **The field renders from a different viewBox aspect than the original's.** The original's field SVG is 1092 px wide with a 1.3 aspect; production's is 1068 px with a 2.03 aspect. Matching the container width alone made the gap *worse* (31,535 px) because the Play scaled with it, so this is a `RenderScene` geometry question rather than a CSS one and is left for the field work.
- Tool-rail glyph shapes below the text tool still differ from the original's.
- Status bar spacing does not match.

The earlier hand-captured comparison is retained as `screenshots/production-slice-editor-desktop-1440x960.png`.

This is still an initial baseline. Phase 0 remains open until every menu, modal, panel, selection state, supported viewport, output, shortcut, and input workflow has named evidence.
