import type { PlayDocument } from "@chalk/domain";
import type { Camera } from "@chalk/editor";
import {
  buildRenderScene,
  buildSvgRenderScene,
  defaultPresentation,
  type Presentation,
  type SvgRenderScene,
} from "@chalk/render";
import type { DiagramOptions, DiagramRenderer } from "@chalk/exports";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FieldDiagram } from "./field-diagram";

/**
 * The shell's half of the export contract: a Play, rendered through the same
 * scene builder and the same React field the editor draws, to a string.
 * Exports never redraw the Play; they ask the one renderer for it with
 * temporary page, type, layer and weight overrides — the original's `svgFor`.
 */
export function createDiagramRenderer(
  base: Presentation = defaultPresentation,
): DiagramRenderer {
  return (play: PlayDocument, options: DiagramOptions = {}): string => {
    const presentation: Presentation = {
      pageKind: options.pageKind ?? base.pageKind,
      typePreset: options.typePreset ?? base.typePreset,
      layers: { ...base.layers, ...options.layers },
      // A shadow the Coach took off the field stays off the page too.
      ...(base.hideShadow ? { hideShadow: true } : {}),
    };
    const scene = buildRenderScene(play, {
      presentation,
      ...(options.lineWeight === undefined
        ? {}
        : { lineWeight: options.lineWeight }),
      ...(options.emphasisPlayerIds === undefined
        ? {}
        : { emphasis: { playerIds: options.emphasisPlayerIds } }),
      ...(options.atMs === undefined
        ? {}
        : { atMs: options.atMs, playing: true }),
    });
    const svgScene = buildSvgRenderScene(scene);
    return renderToStaticMarkup(
      createElement(FieldDiagram, {
        scene: svgScene,
        ...(options.frame === "play" ? { camera: playFrame(svgScene) } : {}),
      }),
    );
  };
}

/** Grass kept around the play, in frame pixels: about two yards deep. */
const PLAY_FRAME_MARGIN = 24;
/** Never tighter than fifteen yards deep, so a quick game keeps its line. */
const PLAY_FRAME_MIN_HEIGHT = 180;
/** A man's symbol reaches this far from where he stands. */
const PLAYER_REACH = 16;

/**
 * The part of the frame a Play actually uses: every man, every line, every
 * coverage bubble and the line of scrimmage, with a margin, and never
 * shallower than fifteen yards so a quick-game cell is not cropped to a
 * sliver. Pure frame arithmetic on the scene the field draws.
 */
export function playFrame(scene: SvgRenderScene): Camera {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number, reach = 0) => {
    xs.push(x - reach, x + reach);
    ys.push(y - reach, y + reach);
  };
  for (const player of scene.players) {
    add(player.position.x, player.position.y, PLAYER_REACH);
  }
  const addPath = (d: string) => {
    const numbers = d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi)?.map(Number) ?? [];
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      add(numbers[index]!, numbers[index + 1]!);
    }
  };
  for (const path of scene.paths) {
    for (const stroke of path.strokes) addPath(stroke.d);
    for (const branch of path.branches) {
      for (const stroke of branch.strokes) addPath(stroke.d);
    }
    for (const tick of path.ticks) {
      add(tick.x1, tick.y1);
      add(tick.x2, tick.y2);
    }
    const area = path.coverageArea;
    if (area) {
      xs.push(area.center.x - area.radiusX, area.center.x + area.radiusX);
      ys.push(area.center.y - area.radiusY, area.center.y + area.radiusY);
    }
  }
  const scrimmage = scene.field.yardLines.find(
    (line) => line.isLineOfScrimmage,
  );
  if (scrimmage) ys.push(scrimmage.y1);
  if (xs.length === 0 || ys.length === 0) {
    return {
      x: 0,
      y: 0,
      width: scene.viewport.width,
      height: scene.viewport.height,
    };
  }
  const left = Math.min(...xs) - PLAY_FRAME_MARGIN;
  const right = Math.max(...xs) + PLAY_FRAME_MARGIN;
  const top = Math.min(...ys) - PLAY_FRAME_MARGIN;
  const bottom = Math.max(...ys) + PLAY_FRAME_MARGIN;
  const height = Math.max(PLAY_FRAME_MIN_HEIGHT, bottom - top);
  const middle = (top + bottom) / 2;
  return {
    x: left,
    y: middle - height / 2,
    width: right - left,
    height,
  };
}
