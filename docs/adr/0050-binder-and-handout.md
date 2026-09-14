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
`data-book-page`, and the pieces of it a printer never splits — a contents row, a
table row, the header, the diagram — carry `data-keep` and print with
`break-inside: avoid`. The preview lays the book out at the width that prints, the
gutter taken out of the column as it is on paper, and the workspace reads how many
sheets each element actually takes — the contents included — pushing a piece that
would straddle a sheet's foot onto the next sheet as the printer will, assigns
running page numbers, and rebuilds the book with them. A contents that runs to two
sheets, or a play whose table flows to a second, moves everything after it by
exactly what it takes on paper. Until measured, a number reads "—" rather than a
guess; the printed book carries the measured numbers. `tests/e2e/book-print.spec.ts`
prints a dense hundred-play binder with a one-inch gutter to PDF in Chromium and
requires the measured page count to equal the pages printed.

**Handout** — the selected plays one, two or four to a sheet, Letter or A4, portrait
or landscape: a legible diagram with name and code, then compact assignments (the first
six, with "and N more" said on the card), full assignments, or none, and the coaching
notes if asked. A card is at least its share of the sheet and never clipped: what a
compact card leaves off is counted on the card, and a card with more to show than its
share — full assignments, a long note — grows past it, its overflow visible, and
pushes the cards after it onto another sheet. The diagram keeps a fixed height so the
text, not the picture, decides what grows, and nothing is shrunk to fit. `handoutFit`
says before printing which plays have more than a compact card shows and that a
growing card adds sheets; the preview counts the sheets as laid out, and
`tests/e2e/book-print.spec.ts` checks in Chromium that the last line of a long card
is inside the card and that the sheets grew rather than the text vanishing. A flyer
here is a quick-reference handout for a coach or a player, not a marketing piece.

Scout and practice card presets are unchanged.

## Parity

Additive: the original's Full playbook menu entry and its output are unchanged.
Recorded in `docs/original-prototype-parity-matrix.md`.

## Not decided here

Visual inspection of generated PDFs at final size and a check of printed contents
references on paper, for short and 50+-play books; the fixtures in
`tests/exports/book.test.ts`, the measured pagination test and the Chromium PDF
page-count check stand in until then. Safari's print fragmentation is not checked.
