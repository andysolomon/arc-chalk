import {
  paperInches,
  pagesFromLayout,
  type BookBlockLayout,
  type OutputPaper,
  type PageMap,
} from "@chalk/exports";

export { pageCount, pagesFromLayout, samePageMap } from "@chalk/exports";

const PX_PER_INCH = 96;

/**
 * The layout the page numbers are read from: every element marked
 * `data-book-page`, and inside it every `data-keep` piece — a contents row,
 * a table row, the header, the diagram — that the printer moves whole onto
 * the next sheet rather than cut.
 */
export function collectBookLayout(doc: Document): readonly BookBlockLayout[] {
  if (!doc.body) return [];
  return [...doc.body.querySelectorAll<HTMLElement>("[data-book-page]")].map(
    (node) => {
      const rect = node.getBoundingClientRect();
      const keeps = [...node.querySelectorAll<HTMLElement>("[data-keep]")]
        .filter((keep) => keep.parentElement?.closest("[data-keep]") === null)
        .map((keep) => {
          const own = keep.getBoundingClientRect();
          return { top: own.top - rect.top, height: own.height };
        });
      return {
        id: node.getAttribute("data-book-page")!,
        height: rect.height,
        keeps,
      };
    },
  );
}

/** Page numbers read off the preview's own layout. */
export function measureBookPages(doc: Document, paper: OutputPaper): PageMap {
  const { height } = paperInches(paper);
  const innerPx = (height - paper.marginIn * 2) * PX_PER_INCH;
  return pagesFromLayout(collectBookLayout(doc), innerPx);
}
