---
status: accepted
---

# Binder and handout layouts with page numbers read off the layout (additive extension under ADR 0047)

The full-playbook exporter builds a cover, contents and an install page per play on
Letter portrait with fixed margins. Its install pages are allowed to flow onto a second
sheet, yet its contents numbers pages by counting one per play from page three — so a
long contents page or a dense assignment table puts every later reference off by one or
more. It exposes no gutter, no duplex, no handout, no explicit selection and no revision
label. GitHub #72 asked for binder and handout layouts whose pagination is true.

## Decision

Two Print & export formats built from an explicit source (a game plan's packet or
current plays, whole or one section; selected plays in the Coach's order; or the full
playbook by choice), with their layouts kept on the device (`book.v1`):

**Binder** — one play a page with the install page's teaching detail. Letter or A4. A
punch-side gutter in inches; with two-sided on, `@page :left` and `:right` mirror it so
the gutter is always on the bound edge and diagrams and text stay clear of the punches
on both sides. Section divider pages, contents, page numbers and a ruled notes area
are each a choice. Codes print beside the names; the cover carries the plan, unit,
season, play count and the prepared revision.

**Page numbers are measured, not counted.** Every page element carries
`data-book-page`. The preview lays the book out at page width, and the workspace reads
how many sheets each element actually takes — the contents included — assigns running
page numbers, and rebuilds the book with them. A contents that runs to two sheets, or a
play whose table flows to a second, moves everything after it by exactly what it took.
Until measured, a number reads "—" rather than a guess; the printed book carries the
measured numbers.

**Handout** — the selected plays one, two or four to a sheet, Letter or A4, portrait
or landscape: a legible diagram with name and code, then compact assignments (the first
six, with "and N more" said on the card), full assignments, or none, and the coaching
notes if asked. Cards keep their size: what does not fit a compact card is counted,
and a full card flows onto another sheet. Nothing is shrunk to fit, and `handoutFit`
says before printing which plays have more than a compact card shows. A flyer here is
a quick-reference handout for a coach or a player, not a marketing piece.

Scout and practice card presets are unchanged.

## Parity

Additive: the original's Full playbook menu entry and its output are unchanged.
Recorded in `docs/original-prototype-parity-matrix.md`.

## Not decided here

Visual inspection of generated PDFs at final size and a check of printed contents
references on paper, for short and 50+-play books; the fixtures in
`tests/exports/book.test.ts` and the measured pagination test stand in until then.
