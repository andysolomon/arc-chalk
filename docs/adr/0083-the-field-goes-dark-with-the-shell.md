---
status: accepted
---

# The field goes dark with the shell

ADR 0061 gave the shell a dark theme but kept the field, its minimap and the print
sheet on white paper, and left a dark field on screen undecided. A Coach working at
night in dark mode still looked at a bright white field in the middle of a dark
screen.

## Decision

**Under a dark shell, the field on screen goes dark by default.** That covers the
editor's field and minimap (`.field-wrap`) and the game-day reader (`.reader-field`).
The print preview (`.print-sheet`), exports, the share page and Present are
unchanged: what prints stays on paper. Under a light shell the field is paper, as before.

**Settings → Appearance gains a Field choice: Match theme or Paper.** Match theme is
the default. Paper keeps the field white under a dark shell, the way it was under
ADR 0061. Like the theme, the choice belongs to the device: `localStorage` key
`chalk.field` (only `"paper"` is stored). `apps/web/src/app/theme.ts` sets
`<html data-field="paper">` and keeps it in step across tabs, and the inline script
in `apps/web/index.html` sets it before the first paint.

**It is only CSS, so exports cannot pick it up.** The scene builder in
`@chalk/render` writes colours into SVG presentation attributes, and exports render
the same React markup to a string. On screen, a CSS property outranks a
presentation attribute, so `app.css` does two things:

- The field and minimap take the dark token ramp, through the same rule as
  `:root[data-theme="dark"]`. Seasonal tints do not reach the field.
- Each colour the builder writes is swapped for a dark-ground partner by attribute
  selector (`[fill="#171717" i]` and so on). Paper and ink trade places, so a solid
  man keeps legible text, and the palette and coverage colours brighten just enough
  to hold against the dark. The swaps sit under `:where(...)`, so the selection
  rules still win.

A blanket `filter: invert()` was rejected. It turns yellow dark and shifts every hue,
so a yellow route would disappear on the dark ground.

## Consequences

- A colour added to `@chalk/render`, `field-diagram.tsx` or `field-minimap.tsx`
  needs a partner in the dark-field block in `app.css`. Without one it shows as its
  print colour on the dark ground.
- `tests/e2e/appearance.spec.ts` checks the dark field, Paper, the choice reaching
  another tab, and the boot attribute. It saves `editor-dark.png` and
  `editor-dark-field.png`. `phone-appearance.spec.ts` and `thanksgiving.spec.ts`
  now expect the dark field under a dark shell.
- The parity goldens still run in light, so they are unchanged.
