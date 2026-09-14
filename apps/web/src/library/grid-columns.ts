/**
 * A card wants about this much width; the grid takes as many columns as the
 * scroller can give at that size, one to six (issue #68). The virtual rows
 * are grouped from the same number, so the row math and the CSS cannot
 * disagree.
 */
const CARD_MIN_WIDTH = 200;
const GRID_GAP = 10;
const GRID_INSET = 32;
const MAX_COLUMNS = 6;

/** How many cards fit across a scroller this wide. */
export function gridColumnsFor(width: number): number {
  if (!(width > 0)) return 4;
  const across = Math.floor(
    (width - GRID_INSET + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP),
  );
  return Math.max(1, Math.min(MAX_COLUMNS, across));
}
