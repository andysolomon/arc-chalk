import { describe, expect, it } from "vitest";

import { unitPalette } from "./unit-palette";

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const linear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
};

const units = Object.values(unitPalette);
const INK = "#171717";
const PAPER = "#ffffff";

describe("unit palette (ADR 0051)", () => {
  it("keeps every accent readable as a dot on its tint and as text on paper", () => {
    for (const { accent, tint } of units) {
      expect(contrast(accent, tint)).toBeGreaterThanOrEqual(3);
      expect(contrast(accent, PAPER)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(INK, tint)).toBeGreaterThanOrEqual(12);
    }
  });
});
