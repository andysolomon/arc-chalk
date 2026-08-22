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

| Mode    | Original golden                                     | Captured state                                                                                  |
| ------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Editor  | `screenshots/original-editor-desktop-1440x960.png`  | Seeded Play, no active selection, Formation/Line call/Concept/Defense/Library inspector visible |
| Demo    | `screenshots/original-demo-desktop-1440x960.png`    | Tool tour, first Player-tool step, playback paused                                              |
| Present | `screenshots/original-present-desktop-1440x960.png` | Full-window seeded Play, first Concept variation, playback stopped                              |
| Print   | `screenshots/original-print-desktop-1440x960.png`   | Letter-landscape field preview using the Print type preset                                      |

## Desktop editor overlays

| State              | Original golden                                                    |
| ------------------ | ------------------------------------------------------------------ |
| More menu          | `screenshots/original-editor-more-menu-desktop-1440x960.png`       |
| Export menu        | `screenshots/original-editor-export-menu-desktop-1440x960.png`     |
| Save/version menu  | `screenshots/original-editor-save-menu-desktop-1440x960.png`       |
| Command palette    | `screenshots/original-editor-command-palette-desktop-1440x960.png` |
| Keyboard shortcuts | `screenshots/original-editor-shortcuts-desktop-1440x960.png`       |
| Formation browser  | `screenshots/original-editor-formations-desktop-1440x960.png`      |
| Defense browser    | `screenshots/original-editor-defenses-desktop-1440x960.png`        |

## Production against the original

`tests/parity/production-shell.spec.ts` captures the production shell and compares it against the **original's own golden**, so the recorded number is the live parity gap rather than an opinion. Each threshold in that file is a ratchet: it records the gap measured when the state was last worked on and may only be lowered. Raising one is a parity regression needing product-owner approval per ADR 0039.

| State              | Gap measured                   | Date                           |
| ------------------ | ------------------------------ | ------------------------------ |
| Present            | 8.99% (124,322 px)             | 2026-08-21 (field viewBox)     |
| Editor             | 1.65% (22,846 px of 1,382,400) | 2026-08-21 (field viewBox)     |
| Keyboard shortcuts | 2.42% (33,420 px)              | 2026-08-21 (field viewBox)     |
| Demo               | 2.05% (28,317 px)              | 2026-08-21 (field viewBox)     |
| Formations browser | 2.01% (27,730 px)              | 2026-08-21 (field viewBox)     |
| More menu          | 1.67% (23,038 px)              | 2026-08-21 (field viewBox)     |
| Save/version menu  | 1.66% (23,010 px)              | 2026-08-21 (field viewBox)     |
| Command palette    | 1.66% (23,004 px)              | 2026-08-21 (field viewBox)     |
| Export menu        | 1.60% (22,095 px)              | 2026-08-21 (field viewBox)     |
| Defenses browser   | 1.59% (22,033 px)              | 2026-08-21 (field viewBox)     |
| Print              | 0.80% (11,117 px)              | 2026-08-21 (field viewBox)     |
| Editor             | 1.71% (23,685 px of 1,382,400) | 2026-08-21                     |
| Present            | 17.96% (248,333 px)            | 2026-08-21 (first measurement) |
| Print              | 0.84% (11,638 px)              | 2026-08-21 (first measurement) |
| Demo               | 2.12% (29,338 px)              | 2026-08-21 (first measurement) |
| Export menu        | 1.65% (22,859 px)              | 2026-08-21                     |
| Command palette    | 1.72% (23,752 px)              | 2026-08-21                     |
| Save/version menu  | 1.73% (23,849 px)              | 2026-08-21                     |
| More menu          | 1.73% (23,877 px)              | 2026-08-21                     |
| Keyboard shortcuts | 2.50% (34,604 px)              | 2026-08-21                     |
| Editor             | 1.85% (25,526 px of 1,382,400) | 2026-08-06                     |
| Export menu        | 1.74% (24,057 px)              | 2026-08-06 (first measurement) |
| Command palette    | 1.80% (24,818 px)              | 2026-08-06 (first measurement) |
| Save/version menu  | 1.81% (25,027 px)              | 2026-08-06 (first measurement) |
| More menu          | 1.81% (25,040 px)              | 2026-08-06 (first measurement) |
| Keyboard shortcuts | 2.64% (36,477 px)              | 2026-08-06                     |
| Formations browser | 1.98% (27,413 px)              | 2026-08-21                     |
| Formations browser | 2.03% (28,051 px)              | 2026-08-06 (first measurement) |
| Defenses browser   | 1.57% (21,716 px)              | 2026-08-21                     |
| Defenses browser   | 1.65% (22,845 px)              | 2026-08-06 (first measurement) |
| Keyboard shortcuts | 3.48% (48,152 px)              | 2026-08-06 (first measurement) |
| Editor             | 1.89% (26,186 px of 1,382,400) | 2026-08-06                     |
| Editor             | 2.14% (29,631 px of 1,382,400) | 2026-08-06 (first measurement) |

### Measuring a metric rather than guessing at it

Pixel diffs show _where_ production disagrees with the original but not _why_. To read the original's own numbers, load both pages in the parity projects and dump `getBoundingClientRect()` and `getComputedStyle()` for the elements in question. That is how the values below were established; each was a real number read off the original, not an estimate from a screenshot.

Closed so far:

- The header carried `Versions` and `Backup` controls the original does not have. Versions now live in the Save menu as the original's `Snapshot`, and Backup — an approved production extension under the rule above — lives inside the More menu instead of adding a header control.
- The header Save button reads `Save` as the original's does, and the save acknowledgement moved to the end of the status bar where the original shows it. Present mode hides it with the rest of the authoring chrome.
- Inspector body copy for Concept and Defense is no longer truncated.
- History in the inspector lists the Coach's named snapshots — the same versions Save already keeps — instead of the original's 90-second autosave ring. Restoring is the existing undoable restore. The original empty copy about states landing every 90 seconds is not reproduced.
- Present is a full-window field on `#171717` with the play name, `← → variations`, and `esc` back. Type scales 1.25× on top of the current preset. Print is the letter-landscape sheet with title, category, field, "Print this", and `letter landscape · half-inch margins · {type} type`. Export → Print the field is that same print.
- Demo is the original's five guided sequences. Opening a tour in the editor is a new Play; the Play that was open is left unchanged.

Metrics matched to the original by measurement:

| Element              | Original        | Was             | Now             |
| -------------------- | --------------- | --------------- | --------------- |
| Play title width     | 410 px          | 310 px          | 410 px          |
| Play Type control x  | 794             | 695             | 795             |
| Tool-rail glyph      | 18 × 18 at x 19 | 22 × 22 at x 17 | 18 × 18 at x 19 |
| Rail below Text      | Clear/Snap 40×40 at y 808/852; collapse 40×22 at y 896 | (unmeasured)    | same boxes      |
| Inspector body width | 256 px          | 252 px          | 256 px          |

### The five chrome overlays

The More menu, Export menu, Save/version menu, command palette and shortcut
reference are built from the original's own item lists, ordering and copy,
which live in `apps/web/src/components/editor-command-surface.ts`. Changing a
label there is a parity change, not a wording preference.

Four of the five sit at or just under the Editor's own gap, because the panel
covers part of the field that production and the original disagree about — what
remains is the shell behind the overlay, not the overlay itself.

The shortcut reference is higher because reaching `Shortcuts ?` scrolls the
inspector onto History, Page and Type. Those sections are now built. History
lists named snapshots rather than the original's 90-second autosave ring, so
the empty-state copy differs on purpose. The panel itself matches — its
single-line rows measure the original's 28 px and its three-line rows the
original's 62 px.

A command production cannot yet run stays listed and is shown unavailable
rather than accepting a click and doing nothing. The palette carries the
original's Formation and Defense entries for the sets and calls Chalk ships;
a set the Coach saved himself, and a Play he named, reach the palette because
`paletteCommands` is a function of those catalogues rather than a module
constant.

Two things measured here that were not obvious from a screenshot:

- **Tailwind's preflight sets `line-height: 1.5` where the original inherits
  `normal`.** That stretched every shortcut row from 28 px to 30 px and pushed
  the panel 20 px up. Setting it globally to `normal` made _every_ state worse
  (Editor 25,526 → 25,781 px), because the rest of the shell was already built
  against the 1.5 leading; the fix belongs on the panel that needs it.
- The original's shortcut rows are a **17 px line box**, not `normal` — `normal`
  gives 15 px in production's font stack and undershoots by 2 px a row.

Known contributors to the remaining Editor gap:

- Finding #3: production stores correct yards, so Players sit about 1.3% off goldens captured from the uncorrected original.

Status-bar spacing now follows the original's own 30 px bar: `line-height: normal`, no `space-between`, the hint on the left, and the zoom cluster at `gap: 12px`. The hint itself is the original's — at-fit Select copy until the view moves, then the grass-drag line, plus drawing, multi-select, and tool lines. Formation cards put the star in the name row the original does, and thumbnail dots snap to the original's tenth of a pixel so a converted line of scrimmage stays one row. The navigator is the original's 132×82 map, shown once the camera is inside 0.985 of fit.

Tool-rail glyphs below Text (Clear, Snap, Hide-the-tools) measure the original's own boxes: 18 × 18 SVGs at x 19, Clear/Snap 40 × 40 at y 808 / 852, collapse 40 × 22 at y 896. They are no longer a remaining gap.

The field is now the original's 1000×620 frame. Present dropped from 17.96% to 8.99% because that aspect is the whole window; what remains there is the animation scrubber (`0.0s / 3.1s`) and the variation line (`1 / 5 · STICK — THUNDER`). Print hides the tool rail and inspector, so it sits under the Editor's own gap. Demo's remaining gap is the original's cursor having already walked the first clicks before Pause.

The earlier hand-captured comparison is retained as `screenshots/production-slice-editor-desktop-1440x960.png`.

This is still an initial baseline. Phase 0 remains open until every menu, modal, panel, selection state, supported viewport, output, shortcut, and input workflow has named evidence.
