import type { PlayDocument } from "@chalk/domain";
import type { FieldLayers, PageKindId, TypePresetId } from "@chalk/render";

/**
 * What a coaching output asks of the diagram it prints. The original's
 * `svgFor(doc, {page, type, layers, routeW})` — every output renders through
 * the same scene the editor draws, with temporary overrides rather than a
 * second drawing.
 */
export interface DiagramOptions {
  readonly typePreset?: TypePresetId;
  readonly pageKind?: PageKindId;
  readonly layers?: Partial<FieldLayers>;
  /** Route stroke width in frame pixels; wristband thumbnails use 1.5. */
  readonly lineWeight?: number;
  /** The men drawn at full weight; everyone else fades to 22%. */
  readonly emphasisPlayerIds?: ReadonlySet<string>;
  /** Absolute timeline time for an animation frame; absent is the still. */
  readonly atMs?: number;
}

/**
 * Turns a Play into the `<svg>` markup a document embeds. Supplied by the
 * shell, which owns the React renderer; the documents here never touch the
 * DOM, so they can be built and tested without a browser.
 */
export type DiagramRenderer = (
  play: PlayDocument,
  options?: DiagramOptions,
) => string;

/** The original's export frame: the 1000×620 field drawn at 2×. */
export const EXPORT_VIEWBOX = Object.freeze({ width: 1000, height: 620 });
export const EXPORT_SCALE = 2;
export const EXPORT_PIXELS = Object.freeze({
  width: EXPORT_VIEWBOX.width * EXPORT_SCALE,
  height: EXPORT_VIEWBOX.height * EXPORT_SCALE,
});

/**
 * The field markings the live editor paints from its stylesheet. A standalone
 * SVG, a PNG rasterized from it, and a print window are all blank documents,
 * so the same strokes travel with the sheet. Fonts are named with fallbacks
 * so a machine without Geist still sets the numbers in a monospace face.
 */
export const FIELD_SVG_CSS =
  ".field-paper{fill:#fff;stroke:#e5e5e5}" +
  ".field-grid{stroke:#e7e7e7;stroke-width:1}" +
  '[data-field-style="light"] .field-grid{stroke:#f2f2f2}' +
  ".hash{stroke:#ececec;stroke-width:1}" +
  ".line-of-scrimmage{stroke:#4d4d4d;stroke-width:2}" +
  '.yard-numbers{fill:#e9e9e9;font-family:"Geist Mono",ui-monospace,Menlo,monospace;font-size:26px;font-weight:600}' +
  ".yard-numbers text{text-anchor:middle}" +
  'text{font-family:Geist,"Helvetica Neue",Helvetica,Arial,sans-serif}' +
  '[font-family="Geist Mono, monospace"]{font-family:"Geist Mono",ui-monospace,Menlo,monospace}';

/**
 * The markup a renderer returns, made a file of its own: XML namespace,
 * deterministic pixel dimensions, a white ground, and the field stylesheet
 * inlined so the drawing reads the same in any viewer.
 */
export function standaloneSvg(markup: string, scale = EXPORT_SCALE): string {
  const open = markup.match(/^\s*<svg\b[^>]*>/);
  if (!open) throw new Error("A standalone SVG needs an <svg> root.");
  let tag = open[0];
  const viewBox =
    /viewBox="([^"]+)"/.exec(tag)?.[1] ??
    `0 0 ${EXPORT_VIEWBOX.width} ${EXPORT_VIEWBOX.height}`;
  const [, , boxWidth, boxHeight] = viewBox.split(/\s+/).map(Number);
  const width = Math.round((boxWidth ?? EXPORT_VIEWBOX.width) * scale);
  const height = Math.round((boxHeight ?? EXPORT_VIEWBOX.height) * scale);
  // Editor chrome on the root — its class, ARIA role and React bookkeeping —
  // is not part of the file; the field style attribute stays because the
  // stylesheet keys the light grid off it.
  tag = tag.replace(
    /\s(width|height|viewBox|class|role|aria-label|data-base-viewbox|data-react-commits|data-type-preset)="[^"]*"/g,
    "",
  );
  if (!/xmlns=/.test(tag)) {
    tag = tag.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  tag = tag.replace(
    /\s*>$/,
    ` width="${width}" height="${height}" viewBox="${viewBox}">`,
  );
  const rest = markup.slice(open.index! + open[0].length);
  return (
    tag +
    `<style>${FIELD_SVG_CSS}</style>` +
    `<rect width="${boxWidth ?? EXPORT_VIEWBOX.width}" height="${boxHeight ?? EXPORT_VIEWBOX.height}" fill="#fff"/>` +
    rest
  );
}

/**
 * The scout card's crop: the original rewrote the export frame to the lower
 * 410 rows so the opponent's look fills the card. The same crop, applied to
 * whatever frame the renderer drew.
 */
export function cropSvgToScoutCard(markup: string): string {
  return markup.replace(/^\s*<svg\b[^>]*>/, (tag) =>
    tag
      .replace('viewBox="0 0 1000 620"', 'viewBox="0 210 1000 410"')
      .replace('height="1240"', 'height="820"'),
  );
}

export function exportFileName(
  playName: string,
  extension: "svg" | "png",
  clock?: string,
): string {
  const base = playName || "play";
  const suffix = clock ? ` ${clock.replace("−", "-")}` : "";
  return `${base}${suffix}.${extension}`;
}
