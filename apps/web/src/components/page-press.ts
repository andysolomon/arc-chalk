import { type RefObject, useEffect, useEffectEvent } from "react";

/**
 * The one module that listens for a press anywhere on the page. The lint in
 * eslint.config.js refuses a page-wide press listener in any other file.
 */

/**
 * Layers that stand over every panel: a dialog, a menu's panel, the field's
 * context menu and a toast. A press on one is not a press past a panel.
 */
const OVER_EVERY_PANEL = ".overlay, .menu-panel, .context-backdrop, .toast";

const within = (
  refs: readonly RefObject<Element | null>[],
  target: EventTarget | null,
): boolean =>
  target instanceof Node &&
  refs.some(({ current }) => current?.contains(target));

/**
 * Closes a panel on a press anywhere past the elements in `inside`. Put the
 * panel's own toggle in `inside` too, so the toggle can close it itself.
 *
 * It hears the press in the capture phase, before any handler can stop it.
 * A field handle stops its press, and a listener that waited for the press
 * to bubble never heard it, so the panel stayed open (#240). It ignores the
 * press that opened the panel, which is still crossing the page when the
 * panel starts to listen (#211).
 */
export function useDismissOnPressOutside(
  open: boolean,
  inside: readonly RefObject<Element | null>[],
  dismiss: () => void,
): void {
  const onPress = useEffectEvent((event: PointerEvent) => {
    if (within(inside, event.target)) return;
    if (
      event.target instanceof Element &&
      event.target.closest(OVER_EVERY_PANEL)
    ) {
      return;
    }
    dismiss();
  });
  useEffect(() => {
    if (!open) return;
    const armedAt = performance.now();
    const listener = (event: PointerEvent) => {
      if (event.timeStamp >= armedAt) onPress(event);
    };
    window.addEventListener("pointerdown", listener, true);
    return () => window.removeEventListener("pointerdown", listener, true);
  }, [open]);
}

/**
 * A panel that comes out mid-press can rise under the pointer. A phone's
 * sheet always does. The mouse events that end the press would then land on
 * whatever the panel put there: the mousedown takes the caret from a note
 * just placed, and the click picks a meaning or a size. They belong to the
 * press on the field, so they go nowhere. The next press lets the guard go,
 * and a click from a key (detail 0) is never swallowed.
 */
export function swallowRestOfPress(panel: RefObject<Element | null>): void {
  const types = ["mousedown", "mouseup", "click"] as const;
  const swallow = (event: MouseEvent) => {
    if (event.detail === 0) return;
    if (!within([panel], event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  for (const type of types) {
    window.addEventListener(type, swallow, { capture: true });
  }
  window.addEventListener(
    "pointerdown",
    () => {
      for (const type of types) {
        window.removeEventListener(type, swallow, { capture: true });
      }
    },
    { capture: true, once: true },
  );
}
