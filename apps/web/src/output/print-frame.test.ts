import { outputFormat } from "@chalk/exports";
import { describe, expect, it, vi } from "vitest";

import { estimatePages } from "./print-frame";

function documentWith(html: string, heights: Record<string, number>): Document {
  const doc = document.implementation.createHTMLDocument("x");
  doc.body.innerHTML = html;
  let cursor = 0;
  for (const node of [
    doc.body,
    ...doc.body.querySelectorAll<HTMLElement>("*"),
  ]) {
    const height = heights[node.className] ?? 0;
    const top = node === doc.body ? 0 : cursor;
    if (node !== doc.body) cursor += height;
    Object.defineProperty(node, "getBoundingClientRect", {
      value: () => ({
        top,
        bottom: node === doc.body ? cursor : top + height,
        height: node === doc.body ? cursor : height,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: top,
        toJSON: () => undefined,
      }),
    });
  }
  Object.defineProperty(doc.body, "scrollHeight", { value: cursor });
  return doc;
}

describe("counting the sheets a preview takes (issue #69)", () => {
  it("starts a sheet at every forced break and flows a tall page onto more", () => {
    const doc = documentWith(
      '<div class="pg">a</div><div class="pg">b</div><div class="pg">c</div>',
      { pg: 900 },
    );
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (node) =>
        ({
          breakAfter:
            (node as HTMLElement).className === "pg" ? "page" : "auto",
          pageBreakAfter: "auto",
          breakBefore: "auto",
          pageBreakBefore: "auto",
        }) as CSSStyleDeclaration,
    );
    // Letter portrait, half-inch margins: 960 px of usable height.
    expect(estimatePages(doc, outputFormat("install").paper!)).toEqual({
      pages: 3,
      overflow: [],
    });
    const dense = documentWith(
      '<div class="pg">a</div><div class="pg tall">b</div>',
      { pg: 900, "pg tall": 1500 },
    );
    vi.spyOn(
      dense.defaultView ?? window,
      "getComputedStyle",
    ).mockImplementation(
      (node) =>
        ({
          breakAfter: (node as HTMLElement).classList.contains("pg")
            ? "page"
            : "auto",
          pageBreakAfter: "auto",
          breakBefore: "auto",
          pageBreakBefore: "auto",
        }) as CSSStyleDeclaration,
    );
    expect(estimatePages(dense, outputFormat("install").paper!)).toEqual({
      pages: 3,
      overflow: [{ page: 2, inches: 5.6 }],
    });
  });
});
