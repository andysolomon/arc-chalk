---
status: accepted
---

# Coordinator call sheets are configured, not assumed (additive extension under ADR 0042 and ADR 0047)

The call sheet grouped a mixed library by tag, fell back to Unit · Type or "Other", and
put a ruled notes column beside the names. It knew no call numbers, no coordinator, no
opponent, and mixed Cover 3 in with the offense. GitHub #70 asked for offensive,
defensive and special-teams sheets a coordinator lays out himself, on the plan's stable
codes.

## Decision

A plan's **coordinator call sheet** is the Print & export format for a Game plan source
(ADR 0047), built from the plan's Prepared Revision and laid out by a `CallSheetConfig`
kept per plan on the device (`callSheet.v1`):

- **Template** — Offensive coordinator, Defensive coordinator, Special teams — chosen by
  the plan's unit and changeable. A template is a starting set of columns, not a rule
  about every team.
- **Sections** — which of the plan's sections print, in what order, each with an
  optional title for this sheet, an accent, and a side. The plan's own sections are
  renamed and reordered under Game plans; the sheet follows the plan and keeps the
  Coach's ordering when the plan gains or loses a section.
- **Columns** beside the code and the full call name: read off the Play (personnel,
  formation, type, tags, the call's note) or ruled blank for a pen (protection, motion,
  alert, front, coverage, pressure, check, tendency, adjustment).
- **Density** (normal, compact), **one side or two** (each side its own landscape
  sheet, "Side 1 of 2"), optional **small diagrams**, and the ruled notes column.

Every call prints the same code the wristband and Game Day use; a call listed in two
sections prints twice with one code, and reordering never renumbers. Long names wrap
and are never cut. An accent is a colour, a letter and a rule together, so it survives
a copier. The header carries plan, opponent, game label, unit, and the prepared date
and label. Before printing, `callSheetFit` says which section would flow past a column
at the chosen density, which calls print as missing, and any duplicate code; the
workspace's page count says how many sheets result. Nothing is shrunk or dropped.

Selection and library sources keep the original tag-grouped sheet.

## Parity

Additive: the original's Call sheet menu entry and its tag-grouped output are
unchanged. Recorded in `docs/original-prototype-parity-matrix.md`.

## Not decided here

A coach's retrieval walkthrough on printed OC and DC sheets; the fixtures in
`tests/exports/call-sheet.test.ts` are representative and the walkthrough is to run.
