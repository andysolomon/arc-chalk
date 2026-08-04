# Phase 4 — Coaching outputs

Read `plans/README.md` first. Phases 1–2 give you the structure this phase reads:
`role`, personnel, strength, concept families, tags.

## The problem

Exports today are the diagram plus two document types (practice cards 2-up, call sheet).
A structured play should be able to become every piece of paper a coaching staff makes,
without the diagram being redrawn or hand-arranged. This is where the product stops being
a drawing tool.

## Shared mechanics

All of these go through the existing `printDoc(title, css, body)` and
`exportSvgString(doc)` helpers — a new window with inlined CSS, `@page` sizing, and
`print-color-adjust:exact`. Rules for every output:

- 12pt / 12px minimum body text, no exceptions.
- The Print typography preset from Phase 3 (pure black, no color fills) unless the output
  is explicitly a color piece.
- Every page carries the play or concept name and the category in a 9px mono footer.
- Never render a page that is more than 60% empty — if content underruns, use the larger
  layout variant.
- One `@page` rule per document, and nothing else print-related.

Restructure the Export menu into three groups with 10px mono #8F8F8F group headings:

```
DIAGRAM      PNG · SVG · Print the field
TEACHING     Install page · Position view · Quiz · Slide
FIELD        Wristband · Scout card · Practice cards · Call sheet
BOOK         Full playbook
```

## The outputs

### Install page — letter portrait, one play

Top 55%: the diagram at full width. Below it, a three-column assignment table driven by
`role`, one row per player who has a route or block: **Who · Assignment · Coaching point**.
Read numbers become a numbered progression strip under the table (`1 STICK → 2 FLAT →
3 DIG → CHECK`), rendered as text, not as an SVG diagram. Concept note from Phase 2 sits
at the top in 13px. Bottom strip: personnel, formation, strength, hash.

### Position view — letter portrait, one position group

A picker (Receivers / Backs / Line / QB / Defense) selects a group. The diagram renders
with that group's players and routes at full weight and everyone else at 22% opacity —
same `buildCanvas`, an opacity argument. Below: only that group's assignments, in larger
type (15px), with their conversion rules spelled out. This is the sheet a position coach
hands out.

### Quiz — letter portrait

The same diagram with all assignment text, read numbers, and notes stripped, plus a
numbered answer table with the Assignment column blank and 22px rows to write in. A second
page prints the filled version as the answer key. Randomise nothing — coaches need the
same order as the install page.

### Slide — 1920×1080 landscape, one play

Diagram left 62%, teaching right 38%: play name at 44px, concept note at 22px,
progression strip, three coaching points max. Dark ground (#171717) with the field in
white, because it is projected. This is the only color-heavy output.

### Wristband — letter portrait, 8 cells

Eight 2.1×1.4in cells, two columns, cut lines as 0.5px #8F8F8F dashes. Each cell: play
name at 9px/600 uppercase, a thumbnail diagram at ~1.3in wide with labels off and routes
at 1.5px, and personnel in 7px mono. Selection UI is a checkbox list of the library
(concepts collapsed) with a live count — "8 of 8 cells filled".

### Scout card — index-card proportion, 4-up on letter

The existing `card` page preset, but as its own document: opponent formation drawn large,
no reads, no assignments, a bold hand-written-looking play number in the corner (type, not
drawn), and space for the scout team's own note. Pull from the Defense category by default.

### Practice cards / Call sheet — upgrade in place

Practice cards keep the 2-up grid but gain the progression strip and honor annotation
layers. Call sheet gains grouping by Phase 2 **tags** instead of category, with category
as a fallback, and a right-hand column of 12 blank ruled lines for in-game notes.

### Full playbook — letter portrait, multi-page

Cover (team name, season, play count), then a table of contents grouped by concept with
page numbers, then one install page per play in library order, concepts kept together.
Page numbers bottom-center in 9px mono. Must survive a 40-play book without the browser
choking — build the body as one string, not 40 DOM inserts.

## Done when

- [ ] Every output in the menu produces a page with no clipped content and no empty
      second page.
- [ ] Install page assignment rows come from `role`, in football order (QB, backs,
      receivers, line), not document order.
- [ ] Position view dims the other groups instead of deleting them.
- [ ] Quiz answer key matches the quiz row-for-row.
- [ ] Wristband cells are physically 2.1×1.4in when printed at 100%.
- [ ] Call sheet groups by tag, falls back to category, and has room to write.
- [ ] A 40-play playbook renders in under 3 seconds and paginates correctly.
