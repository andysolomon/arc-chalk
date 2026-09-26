import { describe, expect, it } from "vitest";

import { pagesFromLayout } from "./paginate";

describe("page numbers read off the layout (issue #72)", () => {
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
