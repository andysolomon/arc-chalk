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

/**
 * Below the editor floor a phone paints overlay books two cards across and
 * a play thumbnail tall enough to fill the card. Keep the stylesheet's
 * `max-width` in step with this number.
 */
export const NARROW_BROWSER_MAX_WIDTH = 667;
export const NARROW_BROWSER_QUERY = `(max-width: ${NARROW_BROWSER_MAX_WIDTH}px)`;

/** Desktop virtual row: 78 px thumb, name, type, and padding. */
export const PLAY_CARD_ROW_HEIGHT = 118;
/** Phone virtual row: 148 px thumb plus wrapping name. */
export const NARROW_PLAY_CARD_ROW_HEIGHT = 220;

/** How many cards fit across a scroller this wide. */
export function gridColumnsFor(width: number): number {
  if (!(width > 0)) return 4;
  const across = Math.floor(
    (width - GRID_INSET + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP),
  );
  return Math.max(1, Math.min(MAX_COLUMNS, across));
}

/** Virtual row height for the Playbook grid on this screen. */
export function playCardRowHeightFor(narrow: boolean): number {
  return narrow ? NARROW_PLAY_CARD_ROW_HEIGHT : PLAY_CARD_ROW_HEIGHT;
}
