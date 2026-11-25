/** How close a floating panel may come to the edge of its room. */
const MARGIN = 8;

/** How far each panel has been nudged, so its own place can be found again. */
const nudges = new WeakMap<HTMLElement, { x: number; y: number }>();

/** The part of the glass a panel can be seen in: the window, less any clip. */
interface Room {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * How far to move a span so it lies inside its room. One already inside is
 * left alone, so a sheet laid flush to the glass stays flush; one crossing an
 * edge comes back to the margin, or flush if it is too big for the margin.
 */
function shift(start: number, size: number, low: number, high: number): number {
  if (start >= low && start + size <= high) return 0;
  const extent = high - low;
  if (size > extent - MARGIN * 2) {
    return low + Math.max(0, extent - size) / 2 - start;
  }
  if (start < low) return low + MARGIN - start;
  return high - MARGIN - size - start;
}

/**
 * The room a panel has: the window, cut down to the padding box of every
 * ancestor that clips it. A panel inside the field's stage is clipped by the
 * stage, so on a phone held sideways the window's height is not its room
 * (the Arrange menu ran under the tool row). A fixed panel is clipped by
 * nothing but the window; an absolute one only by the boxes at or above
 * the one it is placed in.
 */
function roomFor(panel: HTMLElement): Room {
  let room: Room = {
    left: 0,
    top: 0,
    right: document.documentElement.clientWidth,
    bottom: window.innerHeight,
  };
  let placedIn: Element | null =
    getComputedStyle(panel).position === "fixed" ? null : panel.offsetParent;
  for (
    let at = panel.parentElement;
    at && placedIn && at !== document.body;
    at = at.parentElement
  ) {
    if (at !== placedIn && !at.contains(placedIn)) continue;
    const style = getComputedStyle(at);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      const box = at.getBoundingClientRect();
      const left = box.left + at.clientLeft;
      const top = box.top + at.clientTop;
      room = {
        left: Math.max(room.left, left),
        top: Math.max(room.top, top),
        right: Math.min(room.right, left + at.clientWidth),
        bottom: Math.min(room.bottom, top + at.clientHeight),
      };
    }
    if (at === placedIn) {
      placedIn =
        style.position === "fixed"
          ? null
          : at instanceof HTMLElement
            ? at.offsetParent
            : null;
    }
  }
  return room;
}

/**
 * Keep a floating panel wholly inside its room: nudge it back over an edge
 * it would cross, and cap its height to the room so a tall one scrolls
 * inside itself rather than running off the bottom or under the next layer.
 * A panel laid into the page (a drawer's page, a phone's sheet) is left
 * where it is.
 */
export function fitInViewport(panel: HTMLElement): void {
  if (!panel.isConnected || panel.hidden) return;
  const { position } = getComputedStyle(panel);
  if (position !== "absolute" && position !== "fixed") {
    if (nudges.has(panel)) {
      panel.style.translate = "";
      nudges.delete(panel);
    }
    return;
  }
  const room = roomFor(panel);
  const tallest = room.bottom - room.top - MARGIN * 2;

  // Measure the panel at its own height before deciding whether to cap it,
  // keeping its scroll where the Coach left it.
  const scrolled = panel.scrollTop;
  if (panel.dataset.viewportCapped) {
    panel.style.maxHeight = "";
    panel.style.overflowY = "";
    delete panel.dataset.viewportCapped;
  }
  let box = panel.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return;
  // Only one taller than its room is capped, so a sheet that fits as drawn
  // keeps its own height.
  if (box.height > room.bottom - room.top) {
    panel.style.maxHeight = `${Math.max(tallest, 0)}px`;
    panel.style.overflowY = "auto";
    panel.dataset.viewportCapped = "true";
    box = panel.getBoundingClientRect();
  }
  panel.scrollTop = scrolled;

  const was = nudges.get(panel) ?? { x: 0, y: 0 };
  const x = shift(box.left - was.x, box.width, room.left, room.right);
  const y = shift(box.top - was.y, box.height, room.top, room.bottom);
  if (x === was.x && y === was.y) return;
  panel.style.translate = x === 0 && y === 0 ? "" : `${x}px ${y}px`;
  if (x === 0 && y === 0) nudges.delete(panel);
  else nudges.set(panel, { x, y });
}

/**
 * The ref for any popover, menu or sheet that floats over the page: it is
 * fitted inside its room when it opens, and again whenever it or the
 * window changes size. Every floating panel takes it, so none runs off the
 * glass or under the box that clips it, however near an edge its anchor
 * sits.
 */
export function keepInViewport(
  panel: HTMLElement | null,
): (() => void) | undefined {
  if (!panel) return undefined;
  // Fitted before the first paint, and again before the paint after any
  // change, so a panel is never seen past the edge.
  fitInViewport(panel);
  const refit = () => fitInViewport(panel);
  const watcher = new ResizeObserver(refit);
  watcher.observe(panel);
  window.addEventListener("resize", refit);
  return () => {
    watcher.disconnect();
    window.removeEventListener("resize", refit);
  };
}
