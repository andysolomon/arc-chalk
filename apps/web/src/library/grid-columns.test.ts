import { describe, expect, it } from "vitest";

import { gridColumnsFor } from "./grid-columns";

describe("how many cards fit across the Playbook browser (issue #68)", () => {
  it("takes one to six columns of at least 200 px, and four before it has measured", () => {
    expect(gridColumnsFor(0)).toBe(4);
    expect(gridColumnsFor(300)).toBe(1);
    expect(gridColumnsFor(475)).toBe(2);
    expect(gridColumnsFor(662)).toBe(3);
    expect(gridColumnsFor(870)).toBe(4);
    expect(gridColumnsFor(1408)).toBe(6);
    expect(gridColumnsFor(2400)).toBe(6);
  });
});
