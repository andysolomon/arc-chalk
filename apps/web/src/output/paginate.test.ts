import { outputFormat } from "@chalk/exports";
import { describe, expect, it } from "vitest";

import { measureBookPages, pageCount, samePageMap } from "./paginate";

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
});
