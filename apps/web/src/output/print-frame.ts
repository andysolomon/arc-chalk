import { paperInches, type OutputPaper } from "@chalk/exports";

import { openPrintWindow } from "../components/print-window";

/**
 * Printing without a pop-up (issue #69): the document is written into a
 * hidden same-origin frame and that frame prints. A blocked window cannot
 * happen here; when it is asked for — "Open in a new tab" — the outcome is
 * reported rather than ignored.
 */
export type PrintOutcome =
  | { readonly ok: true; readonly via: "frame" | "window" }
  | { readonly ok: false; readonly reason: "blocked" | "failed" };

export function printInFrame(
  html: string,
  doc: Document = document,
): Promise<PrintOutcome> {
  return new Promise((resolve) => {
    const frame = doc.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("title", "Print");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    let settled = false;
    const finish = (outcome: PrintOutcome) => {
      if (settled) return;
      settled = true;
      globalThis.setTimeout(() => frame.remove(), 1000);
      resolve(outcome);
    };
    frame.addEventListener("load", () => {
      try {
        const win = frame.contentWindow;
        if (!win) {
          finish({ ok: false, reason: "failed" });
          return;
        }
        win.focus();
        win.print();
        finish({ ok: true, via: "frame" });
      } catch {
        finish({ ok: false, reason: "failed" });
      }
    });
    frame.addEventListener("error", () =>
      finish({ ok: false, reason: "failed" }),
    );
    doc.body.append(frame);
    frame.srcdoc = html;
    globalThis.setTimeout(() => finish({ ok: false, reason: "failed" }), 8000);
  });
}

/** The pop-up path, with its answer kept. */
export function printInWindow(html: string): PrintOutcome {
  return openPrintWindow(html)
    ? { ok: true, via: "window" }
    : { ok: false, reason: "blocked" };
}

export interface PageEstimate {
  readonly pages: number;
  /** Fragments taller than a sheet, by how much, in inches. */
  readonly overflow: readonly {
    readonly page: number;
    readonly inches: number;
  }[];
}

const PX_PER_INCH = 96;

/**
 * How many sheets a previewed document takes, read off its layout: each
 * forced page break starts a sheet, and anything taller than a sheet flows
 * onto more. An estimate from the screen layout, honest about being one.
 */
export function estimatePages(doc: Document, paper: OutputPaper): PageEstimate {
  const { height } = paperInches(paper);
  const innerPx = (height - paper.marginIn * 2) * PX_PER_INCH;
  const body = doc.body;
  if (!body || innerPx <= 0) return { pages: 1, overflow: [] };
  const view = doc.defaultView ?? globalThis.window;
  const breaks = [...body.querySelectorAll<HTMLElement>("*")].filter((node) => {
    const style = view.getComputedStyle(node);
    return (
      style.breakAfter === "page" ||
      style.pageBreakAfter === "always" ||
      style.breakBefore === "page" ||
      style.pageBreakBefore === "always"
    );
  });
  const fragments: number[] = [];
  if (breaks.length === 0) {
    // The preview pads the body with the page's margins; the sheet's own
    // content is what has to fit.
    const style = view.getComputedStyle(body);
    fragments.push(
      body.scrollHeight -
        (parseFloat(style.paddingTop) || 0) -
        (parseFloat(style.paddingBottom) || 0),
    );
  } else {
    let top = body.getBoundingClientRect().top;
    for (const node of breaks) {
      const rect = node.getBoundingClientRect();
      const after =
        view.getComputedStyle(node).breakAfter === "page" ||
        view.getComputedStyle(node).pageBreakAfter === "always";
      const edge = after ? rect.bottom : rect.top;
      fragments.push(Math.max(0, edge - top));
      top = edge;
    }
    const last = body.getBoundingClientRect().bottom - top;
    if (last > 8) fragments.push(last);
  }
  let pages = 0;
  const overflow: { page: number; inches: number }[] = [];
  for (const heightPx of fragments) {
    const sheets = Math.max(1, Math.ceil(heightPx / innerPx));
    if (sheets > 1) {
      overflow.push({
        page: pages + 1,
        inches: Math.round(((heightPx - innerPx) / PX_PER_INCH) * 10) / 10,
      });
    }
    pages += sheets;
  }
  return { pages: Math.max(1, pages), overflow };
}
