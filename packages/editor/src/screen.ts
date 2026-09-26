/**
 * Whether the screen in front of the Coach can carry the full editor.
 *
 * A desktop and an iPad get the full editor; a phone gets the same editor
 * laid out for it (issue #92, ADR 0055) — a two-row header, the tools along
 * the bottom, the inspector as a sheet. The line between them is drawn here,
 * once, so the shell and its stylesheet cannot disagree about where it is.
 */

/**
 * What the editor's own chrome costs, in CSS pixels: the tool rail and the
 * inspector across, the top bar and the status bar down. Taken from the
 * stylesheet's narrow layout, which is the smallest they ever are.
 */
const CHROME = Object.freeze({ across: 56 + 278, down: 56 + 30 });

/**
 * The smallest screen the editor is offered on. Across, the field must be at
 * least as wide as the panels beside it — below that the Play is a strip
 * between two columns of controls, and the panels are what he came for last.
 * Down, the field wants the depth of a backfield and a receiver's stem.
 */
export const EDITOR_MIN_SCREEN = Object.freeze({
  width: CHROME.across * 2,
  height: CHROME.down + 354,
});

/**
 * A screen too small in either direction gets the phone layout. Either, not
 * both: a phone held sideways is wide and shallow, and a shallow full editor
 * is no more workable than a narrow one.
 */
export function screenTakesEditor(width: number, height: number): boolean {
  return width >= EDITOR_MIN_SCREEN.width && height >= EDITOR_MIN_SCREEN.height;
}

/**
 * The same question as a media query, for the stylesheet and for the shell to
 * watch as the Coach turns the phone over.
 */
export const editorScreenQuery = `(min-width: ${EDITOR_MIN_SCREEN.width}px) and (min-height: ${EDITOR_MIN_SCREEN.height}px)`;
