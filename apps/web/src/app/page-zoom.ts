/**
 * Keeps two fingers from zooming the whole editor on a phone. The field
 * reads its own pinch through pointer events and zooms its camera; anywhere
 * else a pinch should do nothing at all, since the rail, the inspector and
 * the sheets are laid out for the screen and never want magnifying.
 *
 * `maximum-scale=1.0` in the viewport meta is not enough: iOS Safari has
 * ignored it since iOS 10, so the page is held still three ways —
 * `touch-action` keeps pan but drops pinch and double-tap zoom, Safari's
 * proprietary `gesture*` events are refused, and a touchmove with more than
 * one finger is refused wherever it lands. None of that stops pointer
 * events, so the field's own pinch still arrives.
 */
export function lockPageZoom(target: Document = document): () => void {
  const root = target.documentElement;
  const previousTouchAction = root.style.touchAction;
  root.style.touchAction = "pan-x pan-y";

  const refuse = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };
  const refuseMultiTouch = (event: TouchEvent) => {
    if (event.touches.length > 1) refuse(event);
  };
  const options: AddEventListenerOptions = { passive: false };

  target.addEventListener("gesturestart", refuse, options);
  target.addEventListener("gesturechange", refuse, options);
  target.addEventListener("gestureend", refuse, options);
  target.addEventListener("touchmove", refuseMultiTouch, options);

  return () => {
    root.style.touchAction = previousTouchAction;
    target.removeEventListener("gesturestart", refuse, options);
    target.removeEventListener("gesturechange", refuse, options);
    target.removeEventListener("gestureend", refuse, options);
    target.removeEventListener("touchmove", refuseMultiTouch, options);
  };
}
