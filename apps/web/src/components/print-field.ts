import { PRODUCT_NAME } from "@chalk/domain";

/**
 * What Export → Print the field, and Print preview's "Print this", send to
 * the printer. Letter landscape, half-inch margins — the original's
 * `exportPdf`.
 */
export interface PrintFieldOptions {
  readonly playName: string;
  readonly category: string;
  readonly svgMarkup: string;
  readonly productName?: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PAGE_CSS =
  "@page{size:letter landscape;margin:0.5in}" +
  ".hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}" +
  ".hd h1{font-size:20px;margin:0;font-weight:600}" +
  ".hd span{font-size:12px;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace}" +
  "svg{width:100%;height:auto;display:block}";

/**
 * Field markings in the live editor are CSS classes. The print window is a
 * blank document, so the same strokes have to travel with the sheet — the
 * original bakes them into the SVG; this is the same colours, carried as a
 * stylesheet so the clone can stay a clone.
 */
const FIELD_CSS =
  ".field-paper{fill:#fff;stroke:#e5e5e5}" +
  ".field-grid{stroke:#e7e7e7;stroke-width:1}" +
  '.field-diagram[data-field-style="light"] .field-grid{stroke:#f2f2f2}' +
  ".hash{stroke:#ececec;stroke-width:1}" +
  ".line-of-scrimmage{stroke:#4d4d4d;stroke-width:2}" +
  '.yard-numbers{fill:#e9e9e9;font-family:"Geist Mono",ui-monospace,Menlo,monospace;font-size:26px;font-weight:600}' +
  ".yard-numbers text{text-anchor:middle}";

const FOOT_CSS =
  ".__pf{position:fixed;bottom:0;left:0;right:0;text-align:right;" +
  "font-size:8px;letter-spacing:0.6px;text-transform:uppercase;color:#8F8F8F}" +
  ".__pn{position:fixed;bottom:0;left:0;font-size:9px;font-family:ui-monospace,Menlo,monospace;color:#8F8F8F}";

/**
 * The print window's document, matching the original's `printDoc` wrapper
 * around the field sheet. Callers that need to inspect the HTML — tests —
 * go through here rather than opening a window.
 */
export function printFieldHtml(options: PrintFieldOptions): string {
  const product = options.productName ?? PRODUCT_NAME;
  const title = options.playName || "Play";
  const body =
    `<div class="hd"><h1>${escapeHtml(options.playName)}</h1>` +
    `<span>${escapeHtml(options.category)}</span></div>` +
    options.svgMarkup +
    `<div class="__pf">${escapeHtml(product)}</div>`;
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<title>${escapeHtml(title)} \u2014 ${escapeHtml(product)}</title>` +
    "<style>*{box-sizing:border-box}body{margin:0;font-family:Helvetica,Arial,sans-serif;" +
    "color:#171717;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    PAGE_CSS +
    FIELD_CSS +
    FOOT_CSS +
    "</style></head><body>" +
    body +
    "</body></html>"
  );
}

/**
 * A clone of the live field SVG, reset to the full frame so the sheet is
 * the Play rather than whatever camera crop the Coach was working in.
 */
export function svgMarkupForPrint(
  svg: SVGSVGElement,
  viewport: { readonly width: number; readonly height: number },
): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `0 0 ${viewport.width} ${viewport.height}`);
  clone.removeAttribute("class");
  // Selection, handles, the draw-a-route dot, and in-progress gestures are
  // the editor. The original's exportSvgString never had them; stripping the
  // marked chrome is how a clone of the live field becomes that sheet.
  clone
    .querySelectorAll("[data-print-chrome]")
    .forEach((node) => node.remove());
  return clone.outerHTML;
}

export function openPrintField(
  options: PrintFieldOptions,
  open: typeof globalThis.open = (...args) => globalThis.open(...args),
): void {
  const popup = open("", "_blank");
  if (!popup) return;
  popup.document.write(printFieldHtml(options));
  popup.document.close();
  globalThis.setTimeout(() => {
    try {
      popup.focus();
      popup.print();
    } catch {
      // A blocked print dialog is a no-op, as the original's is.
    }
  }, 400);
}
