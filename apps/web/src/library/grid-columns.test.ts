import { describe, expect, it } from "vitest";

import {
  gridColumnsFor,
  NARROW_BROWSER_MAX_WIDTH,
  NARROW_BROWSER_QUERY,
  NARROW_PLAY_CARD_ROW_HEIGHT,
  PLAY_CARD_ROW_HEIGHT,
  playCardRowHeightFor,
} from "./grid-columns";

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

  it("gives a play card a taller row on a phone than on the desktop book", () => {
    expect(playCardRowHeightFor(false)).toBe(PLAY_CARD_ROW_HEIGHT);
    expect(playCardRowHeightFor(true)).toBe(NARROW_PLAY_CARD_ROW_HEIGHT);
    expect(NARROW_PLAY_CARD_ROW_HEIGHT).toBeGreaterThan(PLAY_CARD_ROW_HEIGHT);
    expect(NARROW_BROWSER_QUERY).toBe(
      `(max-width: ${NARROW_BROWSER_MAX_WIDTH}px)`,
    );
  });
});
