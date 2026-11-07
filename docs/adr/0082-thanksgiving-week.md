---
status: accepted
---

# Thanksgiving week tints the shell

The shell has a light and a dark theme (ADR 0061). For Thanksgiving week it puts on
autumn colours in both, then takes them off again by itself.

## Decision

**The week runs by the device's calendar.** It starts on the Monday before the fourth
Thursday of November and ends on the Sunday after, in local time. In 2026 that is
November 23 to 29. `apps/web/src/app/theme.ts` owns the rule (`seasonOn`). The inline
script in `apps/web/index.html` runs the same rule and sets `<html data-season="thanksgiving">`
before the first paint, so the page never flashes the everyday shell first.
`followTheme` checks the calendar again when the tab comes back into view and every
15 minutes, so a Chalk left open starts and ends the week without a reload. There
is no setting. The Coach's Light, Dark or System choice still applies, and the season
tints whichever one is showing.

**It is only tokens.** `:root[data-season="thanksgiving"]` warms the gray ramp toward
parchment and roast and changes the accent from blue to pumpkin (`#b4510e`, which still
carries white text at 5:1). `:root[data-theme="dark"][data-season="thanksgiving"]` does
the same for dark. The accent tokens keep their names (`--blue`, `--blue-text`,
`--blue-strong`), so no rule changed. Status and Unit colours keep their meaning and
their values.

**The field, its minimap and the print sheet stay on paper.** They already redeclare
the light tokens (ADR 0061), so they keep the everyday paper values and the blue
selection. Exports and the share page never read the season.

**Settings says so.** During the week, Appearance adds a line saying autumn colours
are on and the day they end.

## Consequences

- Tests pin the season with `sessionStorage["chalk.season"]` (`"none"` or
  `"thanksgiving"`). The shared e2e fixture and the parity shell set `"none"`, so a run
  in late November checks the same colours and goldens as any other day. A Coach's
  device never sets it.
- `tests/e2e/thanksgiving.spec.ts` fixes the clock and the time zone. It checks
  Thanksgiving Day in light and dark around a white field, checks that an open Chalk
  turns the colours off at midnight on the Sunday, and checks both edges of the week
  in 2026 and 2027. It saves `thanksgiving-light.png` and `thanksgiving-dark.png`.
- A new seasonal palette uses the same pattern: one rule in `theme.ts` and the inline
  script, and one token block per theme.
