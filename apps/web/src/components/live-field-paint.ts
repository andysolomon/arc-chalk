import type { Camera } from "@chalk/editor";
import type { PaintLoopSample } from "@chalk/editor";
import type { SvgPathStroke } from "@chalk/render";

export interface LiveMovePaint {
  readonly dx: number;
  readonly dy: number;
  readonly playerIds: readonly string[];
  readonly pathIds: readonly string[];
  readonly labelIds: readonly string[];
}

export interface LivePlaybackPaint {
  readonly players: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
  }[];
  readonly trails: readonly { readonly pathId: string; readonly d: string }[];
}

export interface LiveFieldPaint {
  readonly move?: LiveMovePaint;
  readonly pathStrokes?: readonly SvgPathStroke[];
  readonly camera?: Camera;
  readonly metrics?: PaintLoopSample;
  readonly playback?: LivePlaybackPaint;
}

const PLAYER = "data-scene-player";
const PATH_GROUP = "data-scene-path-group";
const PATH_STROKE = "data-scene-path";
const LABEL = "data-scene-label";
const BASE_X = "data-base-x";
const BASE_Y = "data-base-y";
const BASE_VIEWBOX = "data-base-viewbox";
const LIVE_PAINT = "data-live-paint";

function query(
  svg: SVGSVGElement,
  attribute: string,
  id: string,
): Element | null {
  const escaped =
    typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
  return svg.querySelector(`[${attribute}="${escaped}"]`);
}

function writeMetrics(svg: SVGSVGElement, metrics: PaintLoopSample): void {
  svg.setAttribute("data-paint-frames", String(metrics.frames));
  svg.setAttribute("data-fps", metrics.fps.toFixed(2));
  svg.setAttribute("data-frame-p95-ms", metrics.p95FrameMs.toFixed(2));
  svg.setAttribute(
    "data-input-to-paint-p95-ms",
    metrics.p95InputToPaintMs.toFixed(2),
  );
  svg.setAttribute("data-frame-within-budget", String(metrics.sustainedFps));
  svg.setAttribute(
    "data-input-to-paint-within-budget",
    String(metrics.inputToPaintWithinBudget),
  );
}

/**
 * Clears a previous live translation so a new one is not stacked on it.
 * Players go back to the committed base transform React drew; path and
 * label groups drop the extra translate the last frame applied.
 */
export function clearLiveFieldPaint(svg: SVGSVGElement): void {
  for (const player of svg.querySelectorAll(`[${PLAYER}]`)) {
    const x = player.getAttribute(BASE_X);
    const y = player.getAttribute(BASE_Y);
    if (x === null || y === null) continue;
    player.setAttribute("transform", `translate(${x} ${y})`);
  }
  for (const path of svg.querySelectorAll(`[${PATH_GROUP}]`)) {
    path.removeAttribute("transform");
  }
  for (const label of svg.querySelectorAll(`[${LABEL}]`)) {
    label.removeAttribute("transform");
  }
  const baseViewBox = svg.getAttribute(BASE_VIEWBOX);
  if (baseViewBox) svg.setAttribute("viewBox", baseViewBox);
  svg.removeAttribute(LIVE_PAINT);
}

/**
 * Patches only the SVG that a live gesture moved. Camera is a pan/pinch
 * override: omit it so React's committed viewBox (data-base-viewbox) stays
 * in charge of wheel and keyboard zoom.
 */
export function applyLiveFieldPaint(
  svg: SVGSVGElement,
  paint: LiveFieldPaint | undefined,
): void {
  clearLiveFieldPaint(svg);
  if (!paint) return;

  if (paint.camera) {
    svg.setAttribute(
      "viewBox",
      `${paint.camera.x} ${paint.camera.y} ${paint.camera.width} ${paint.camera.height}`,
    );
  }

  if (paint.move) {
    const { dx, dy, playerIds, pathIds, labelIds } = paint.move;
    svg.setAttribute(LIVE_PAINT, "move");
    for (const id of playerIds) {
      const player = query(svg, PLAYER, id);
      if (!player) continue;
      const x = Number(player.getAttribute(BASE_X) ?? 0);
      const y = Number(player.getAttribute(BASE_Y) ?? 0);
      player.setAttribute("transform", `translate(${x + dx} ${y + dy})`);
    }
    const groupTranslate = `translate(${dx} ${dy})`;
    for (const id of pathIds) {
      query(svg, PATH_GROUP, id)?.setAttribute("transform", groupTranslate);
    }
    for (const id of labelIds) {
      query(svg, LABEL, id)?.setAttribute("transform", groupTranslate);
    }
  }

  if (paint.pathStrokes) {
    svg.setAttribute(LIVE_PAINT, svg.getAttribute(LIVE_PAINT) ?? "handle");
    for (const stroke of paint.pathStrokes) {
      query(svg, PATH_STROKE, stroke.id)?.setAttribute("d", stroke.d);
    }
  }

  if (paint.playback) {
    svg.setAttribute(LIVE_PAINT, svg.getAttribute(LIVE_PAINT) ?? "playback");
    for (const player of paint.playback.players) {
      const node = query(svg, PLAYER, player.id);
      if (!node) continue;
      node.setAttribute(BASE_X, String(player.x));
      node.setAttribute(BASE_Y, String(player.y));
      node.setAttribute("transform", `translate(${player.x} ${player.y})`);
    }
    for (const trail of paint.playback.trails) {
      query(svg, PATH_STROKE, trail.pathId)?.setAttribute("d", trail.d);
    }
  }

  if (paint.metrics && paint.metrics.frames > 0) {
    writeMetrics(svg, paint.metrics);
  }
}
