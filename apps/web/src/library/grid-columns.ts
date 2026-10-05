/**
 * A card wants about this much width; the grid takes as many columns as the
 * scroller can give at that size, one to six (issue #68). The virtual rows
 * are grouped from the same number, so the row math and the CSS cannot
 * disagree.
 */
const CARD_MIN_WIDTH = 200;
/**
 * On a book's own page a card is where the Coach reads the Play, so it is
 * half again as wide as a pick in the dialog over the editor: four across a
 * desk rather than six.
 */
export const PAGE_CARD_MIN_WIDTH = 300;
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

/**
 * The space under each row of cards. Rows are a fixed height and the card
 * fills what is left, so a row never runs into the next one before the
 * virtualizer has measured it.
 */
export const PLAY_CARD_ROW_GAP = 10;
/** Desktop virtual row: 78 px thumb, name, unit and type, and the gap. */
export const PLAY_CARD_ROW_HEIGHT = 150;
/** Phone virtual row: 148 px thumb plus a name of up to two lines. */
export const NARROW_PLAY_CARD_ROW_HEIGHT = 240;
/**
 * The Playbooks page on a phone lists Plays rather than tiling them: a small
 * diagram beside the name, so a screen holds a page of the book rather than
 * two pictures of it.
 */
export const PLAY_LIST_ROW_HEIGHT = 92;

/** How many cards fit across a scroller this wide. */
export function gridColumnsFor(
  width: number,
  minWidth: number = CARD_MIN_WIDTH,
): number {
  if (!(width > 0)) return 4;
  const across = Math.floor(
    (width - GRID_INSET + GRID_GAP) / (minWidth + GRID_GAP),
  );
  return Math.max(1, Math.min(MAX_COLUMNS, across));
}

/** A card's padding across, and what its name and meta take under the art. */
const PAGE_CARD_PADDING_X = 18;
const PAGE_CARD_CHROME_Y = 72;

/**
 * Virtual row height for a book's own page: the art keeps the play sheet's
 * sixteen by nine at whatever width the column gives it, so a wide card
 * shows a bigger Play rather than more turf around a small one.
 */
export function pageCardRowHeightFor(width: number, columns: number): number {
  if (!(width > 0)) return PLAY_CARD_ROW_HEIGHT;
  const column = (width - GRID_INSET - (columns - 1) * GRID_GAP) / columns;
  const art = ((column - PAGE_CARD_PADDING_X) * 9) / 16;
  return Math.round(art + PAGE_CARD_CHROME_Y + PLAY_CARD_ROW_GAP);
}

/** Virtual row height for the Playbook grid on this screen. */
export function playCardRowHeightFor(narrow: boolean): number {
  return narrow ? NARROW_PLAY_CARD_ROW_HEIGHT : PLAY_CARD_ROW_HEIGHT;
}
