/** How close a floating panel may come to the window's edge. */
const MARGIN = 8;

/** How far each panel has been nudged, so its own place can be found again. */
const nudges = new WeakMap<HTMLElement, { x: number; y: number }>();

/**
 * How far to move a span so it lies inside the window. One already inside is
 * left alone, so a sheet laid flush to the glass stays flush; one crossing an
 * edge comes back to the margin, or flush if it is too big for the margin.
 */
function shift(start: number, size: number, extent: number): number {
  if (start >= 0 && start + size <= extent) return 0;
  if (size > extent - MARGIN * 2) return Math.max(0, extent - size) / 2 - start;
  if (start < 0) return MARGIN - start;
  return extent - MARGIN - size - start;
}

/**
 * Keep a floating panel wholly inside the window: nudge it back over an edge
 * it would cross, and cap its height to the window so a tall one scrolls
 * inside itself rather than running off the bottom. A panel laid into the
 * page (a drawer's page, a phone's sheet) is left where it is.
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
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  const room = height - MARGIN * 2;

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
  // Only one taller than the window is capped, so a sheet that fits as
  // drawn keeps its own height.
  if (box.height > height) {
    panel.style.maxHeight = `${room}px`;
    panel.style.overflowY = "auto";
    panel.dataset.viewportCapped = "true";
    box = panel.getBoundingClientRect();
  }
  panel.scrollTop = scrolled;

  const was = nudges.get(panel) ?? { x: 0, y: 0 };
  const x = shift(box.left - was.x, box.width, width);
  const y = shift(box.top - was.y, box.height, height);
  if (x === was.x && y === was.y) return;
  panel.style.translate = x === 0 && y === 0 ? "" : `${x}px ${y}px`;
  if (x === 0 && y === 0) nudges.delete(panel);
  else nudges.set(panel, { x, y });
}

/**
 * The ref for any popover, menu or sheet that floats over the page: it is
 * fitted inside the window when it opens, and again whenever it or the
 * window changes size. Every floating panel takes it, so none runs off the
 * glass however near an edge its anchor sits.
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
