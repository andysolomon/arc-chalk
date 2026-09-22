import { describe, expect, it } from "vitest";

import { statusPalette, unitPalette } from "./unit-palette";
import { coverageFills, svgColors as fieldPalette } from "./svg";

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

// Machado, Oliveira & Fernandes (2009) simulation matrices at full severity,
// applied in linear RGB.
const simulation = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const;

const lab = ([r, g, b]: readonly number[]) => {
  const x = (0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047;
  const y = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const z = (0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))] as const;
};
const seen = (hex: string, kind?: keyof typeof simulation) => {
  const rgb = channels(hex).map(linear);
  if (!kind) return lab(rgb);
  return lab(
    simulation[kind].map((row) =>
      row.reduce((sum, m, i) => sum + m * rgb[i]!, 0),
    ),
  );
};
const distance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

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

  it("keeps the units apart for protan, deutan and tritan vision", () => {
    const accents = units.map(({ accent }) => accent);
    for (let i = 0; i < accents.length; i += 1) {
      for (let j = i + 1; j < accents.length; j += 1) {
        for (const kind of [undefined, "protan", "deutan", "tritan"] as const) {
          expect(
            distance(seen(accents[i]!, kind), seen(accents[j]!, kind)),
            `${accents[i]} vs ${accents[j]} (${kind ?? "typical"})`,
          ).toBeGreaterThanOrEqual(20);
        }
      }
    }
  });

  it("stays clear of the field's route and coverage semantics", () => {
    const strokes = [
      fieldPalette.blue,
      fieldPalette.red,
      fieldPalette.green,
      fieldPalette.orange,
      fieldPalette.yellow,
    ];
    for (const { accent } of units) {
      for (const stroke of strokes) {
        expect(
          distance(seen(accent), seen(stroke)),
          `${accent} vs route ${stroke}`,
        ).toBeGreaterThanOrEqual(30);
      }
      for (const fill of Object.values(coverageFills)) {
        expect(
          distance(seen(accent), seen(fill)),
          `${accent} vs coverage ${fill}`,
        ).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it("reserves readable status colours for actual state", () => {
    for (const { accent, tint } of Object.values(statusPalette)) {
      expect(contrast(accent, tint)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent, "#fafafa")).toBeGreaterThanOrEqual(4.5);
    }
  });
});
