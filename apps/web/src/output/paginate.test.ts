import { outputFormat } from "@chalk/exports";
import { describe, expect, it } from "vitest";

import {
  measureBookPages,
  pageCount,
  pagesFromLayout,
  samePageMap,
} from "./paginate";

function bookDocument(heights: readonly [string, number][]): Document {
  const doc = document.implementation.createHTMLDocument("book");
  doc.body.innerHTML = heights
    .map(([id]) => `<div class="pg" data-book-page="${id}"></div>`)
    .join("");
  doc.body
    .querySelectorAll<HTMLElement>("[data-book-page]")
    .forEach((node, index) => {
      const height = heights[index]![1];
      Object.defineProperty(node, "getBoundingClientRect", {
        value: () => ({
          top: 0,
          bottom: height,
          height,
          left: 0,
          right: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => undefined,
        }),
      });
    });
  return doc;
}

describe("page numbers read off the layout (issue #72)", () => {
  it("starts every page element on a sheet and gives a tall one the sheets it takes", () => {
    // Letter portrait, half-inch margins: 960 px of usable height.
    const doc = bookDocument([
      ["cover", 960],
      ["contents", 1500],
      ["divider:Openers", 400],
      ["e0", 1900],
      ["e1", 960],
    ]);
    const map = measureBookPages(doc, outputFormat("binder").paper!);
    expect(map).toEqual({
      cover: { start: 1, sheets: 1 },
      contents: { start: 2, sheets: 2 },
      "divider:Openers": { start: 4, sheets: 1 },
      e0: { start: 5, sheets: 2 },
      e1: { start: 7, sheets: 1 },
    });
    expect(pageCount(map)).toBe(7);
    expect(samePageMap(map, { ...map })).toBe(true);
    expect(samePageMap(map, { ...map, e1: { start: 8, sheets: 1 } })).toBe(
      false,
    );
    expect(samePageMap(undefined, map)).toBe(false);
  });

  it("pushes a piece that would straddle a sheet's foot onto the next sheet, as the printer does", () => {
    // 960 px sheets. Forty rows of 30 px fill 1200 px: by height alone that
    // is two sheets, and it still is — but a 100 px row starting at 900 px
    // cannot straddle, so it moves to the next sheet and the block grows.
    const rows = Array.from({ length: 30 }, (_, index) => ({
      top: index * 30,
      height: 30,
    }));
    const map = pagesFromLayout(
      [
        { id: "a", height: 900, keeps: rows },
        {
          id: "b",
          height: 1000,
          keeps: [...rows, { top: 900, height: 100 }],
        },
        // A piece taller than a sheet cannot be kept whole; it splits.
        { id: "c", height: 1500, keeps: [{ top: 0, height: 1500 }] },
      ],
      960,
    );
    expect(map).toEqual({
      a: { start: 1, sheets: 1 },
      b: { start: 2, sheets: 2 },
      c: { start: 4, sheets: 2 },
    });
    // Two pieces pushed in turn move everything after them by both amounts:
    // a 50 px piece at 940 is pushed 20 px to 960, so the 920 px piece after
    // it lands at 1010, would straddle 1920, and is pushed there in turn;
    // the block spans three sheets, not the two its height alone says.
    const twice = pagesFromLayout(
      [
        {
          id: "d",
          height: 1910,
          keeps: [
            { top: 0, height: 940 },
            { top: 940, height: 50 },
            { top: 990, height: 920 },
          ],
        },
      ],
      960,
    );
    expect(twice.d).toEqual({ start: 1, sheets: 3 });
  });
});
