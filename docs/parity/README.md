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

The current production comparison for the Editor state is `screenshots/production-slice-editor-desktop-1440x960.png`. Its Play content is rendered from the canonical yard-space `RenderScene`; the shell's remaining field furniture and controls are still incremental parity work.

This is still an initial baseline. Phase 0 remains open until every menu, modal, panel, selection state, supported viewport, output, shortcut, and input workflow has named evidence.
