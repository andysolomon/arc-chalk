import type { PageMap } from "./book";

/** One page element as laid out, with the pieces of it that never split. */
export interface BookBlockLayout {
  readonly id: string;
  readonly height: number;
  /** Top and height of each `data-keep` piece, relative to the block's top. */
  readonly keeps: readonly { readonly top: number; readonly height: number }[];
}

/**
 * Page numbers from a layout (issue #72): every page element starts a new
 * sheet, and one taller than a sheet takes as many as it needs. A piece
 * that would straddle a sheet's foot is pushed whole onto the next sheet,
 * carrying everything after it down by the same amount — the printer's
 * `break-inside: avoid` — so a dense assignment table or a long contents
 * moves everything after it by exactly what it takes on paper.
 */
export function pagesFromLayout(
  blocks: readonly BookBlockLayout[],
  innerPx: number,
): PageMap {
  const map: Record<string, { start: number; sheets: number }> = {};
  if (innerPx <= 0) return map;
  let page = 1;
  for (const block of blocks) {
    let pushed = 0;
    for (const keep of block.keeps) {
      if (keep.height <= 0 || keep.height > innerPx) continue;
      const top = keep.top + pushed;
      const sheetTop = Math.floor(top / innerPx) * innerPx;
      if (top + keep.height > sheetTop + innerPx + 0.5) {
        pushed += sheetTop + innerPx - top;
      }
    }
    const sheets = Math.max(
      1,
      Math.ceil((block.height + pushed - 1) / innerPx),
    );
    map[block.id] = { start: page, sheets };
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
