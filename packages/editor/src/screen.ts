/**
 * Whether the screen in front of the Coach can carry the editor at all.
 *
 * The plan asks for the full editor on a desktop and on an iPad, and for a
 * phone to be safe to open rather than a small editor: a Play he can read on
 * the sideline without the risk that a thumb on the glass moves a man he
 * cannot see he has moved. The line between them is drawn here, once, so the
 * shell and its stylesheet cannot disagree about where it is.
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
 * A screen too small in either direction shows the Play instead of the
 * editor. Either, not both: a phone held sideways is wide and shallow, and a
 * shallow editor is no more workable than a narrow one.
 */
export function screenTakesEditor(width: number, height: number): boolean {
  return width >= EDITOR_MIN_SCREEN.width && height >= EDITOR_MIN_SCREEN.height;
}

/**
 * The same question as a media query, for the stylesheet and for the shell to
 * watch as the Coach turns the phone over.
 */
export const editorScreenQuery = `(min-width: ${EDITOR_MIN_SCREEN.width}px) and (min-height: ${EDITOR_MIN_SCREEN.height}px)`;
