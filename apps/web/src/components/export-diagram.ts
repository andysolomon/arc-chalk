import type { PlayDocument } from "@chalk/domain";
import {
  buildRenderScene,
  buildSvgRenderScene,
  defaultPresentation,
  type Presentation,
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
    return renderToStaticMarkup(
      createElement(FieldDiagram, { scene: buildSvgRenderScene(scene) }),
    );
  };
}
