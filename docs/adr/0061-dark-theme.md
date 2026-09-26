---
status: accepted
---

# A dark theme for the shell, with the field kept on paper

ADR 0029 promised light and dark themes, and ADR 0051 left the dark one undecided. Until
now the shell was light only: `apps/web/src/styles/app.css` named about a dozen colour
tokens, but most rules still used literal grays, whites and blues, so nothing could
change them together.

## Decision

**Settings gains an Appearance tab with System, Light and Dark.** System is the default
and follows `prefers-color-scheme`, including when the device changes while Chalk is
open. The choice belongs to the device, not to a Playbook, so it is stored in
`localStorage` under `chalk.theme`, not in IndexedDB or the synced replica.
`apps/web/src/app/theme.ts` owns the choice and keeps `<html data-theme>` up to date
with the setting, with the device, and with other tabs (through the `storage` event).
A small inline script in `apps/web/index.html` sets the same attribute before the first
paint, so a dark shell never flashes white on load.

**Every colour in the stylesheet is a token, and the grays form one ramp.** A mechanical
pass replaced the literals with tokens: `--paper`, `--canvas`, `--raised`, `--wash`,
`--hover`, `--desk`, `--rule`, `--disabled`, `--faint`, `--muted`, `--muted-strong`,
`--ink-soft`, `--ink-hover`, `--ink` and `--ink-press`, plus `--on-ink` for text on an
ink ground. Hairlines and washes are black at an alpha, written
`rgb(var(--shade) / a)`, so dark turns them white at the same alpha. Elevation shadows
(those with a blur) stay black. Near-identical grays were merged into one step, so light
mode moves by at most a few levels of a channel, which is below what the parity
screenshots detect. `:root[data-theme="dark"]` reverses the ramp. Saturated colours
used as grounds (the selection blue behind white text) keep their value. Used as text
or a ring they switch to a `-text` or `-strong` token that brightens on dark, and the
pale status and Unit tints become dark tints.

**The field, its minimap and the print sheet stay on paper.** They show what prints and
exports, so `.field-diagram`, `.minimap` and `.print-sheet` redeclare the light tokens,
and anything drawn inside them inherits paper values under a dark shell. Exports render
their own markup and never read the page's theme. Present, the share page and the
Playbook cards' turf were already dark and keep their fixed colours. The share page
never sets `data-theme`, so it is unchanged. Formation pictures in the browsers are
sketches rather than pages, so they take the theme; their dots and scrimmage line get
their colours from CSS classes instead of SVG attributes.

## Consequences

- New rules use tokens, never literal colours. A new gray belongs on the ramp in both
  blocks.
- `tests/e2e/appearance.spec.ts` and `tests/e2e/phone-appearance.spec.ts` pick the
  theme, check the shell's computed colours and the field's white paper, check that
  the choice is remembered and reaches other tabs, and check that System follows the
  device. Each saves a screenshot of the dark shell.
- The parity goldens run with `colorScheme: "light"`, so they keep measuring the light
  shell.

## Not decided here

A dark, chalkboard-style field on screen. The thumbnail cache already keys on a theme,
but the field and its exports would need their own palette and their own review.
