import { paperInches, type OutputPaper, type PageMap } from "@chalk/exports";

const PX_PER_INCH = 96;

/**
 * Page numbers read off the preview's own layout (issue #72): every element
 * marked `data-book-page` starts a new sheet, and one taller than a sheet
 * takes as many as it needs, so a long contents or a dense assignment table
 * moves everything after it by exactly what it took.
 */
export function measureBookPages(doc: Document, paper: OutputPaper): PageMap {
  const { height } = paperInches(paper);
  const innerPx = (height - paper.marginIn * 2) * PX_PER_INCH;
  const map: Record<string, { start: number; sheets: number }> = {};
  if (!doc.body || innerPx <= 0) return map;
  let page = 1;
  for (const node of doc.body.querySelectorAll<HTMLElement>(
    "[data-book-page]",
  )) {
    const id = node.getAttribute("data-book-page")!;
    const rect = node.getBoundingClientRect();
    const sheets = Math.max(1, Math.ceil((rect.height - 1) / innerPx));
    map[id] = { start: page, sheets };
    page += sheets;
  }
  return map;
}

export function samePageMap(a: PageMap | undefined, b: PageMap): boolean {
  if (!a) return false;
  const keys = Object.keys(b);
  if (keys.length !== Object.keys(a).length) return false;
  return keys.every(
    (key) =>
      a[key]?.start === b[key]!.start && a[key]?.sheets === b[key]!.sheets,
  );
}

/** The last page a map reaches. */
export function pageCount(map: PageMap): number {
  return Object.values(map).reduce(
    (max, entry) => Math.max(max, entry.start + entry.sheets - 1),
    0,
  );
}
