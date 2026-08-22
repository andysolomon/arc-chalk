import { yardsToLegacyCanvas, type Formation } from "@chalk/domain";

/**
 * A card carries the shape of a set, not only its name — a Coach reads the
 * picture first. Each one is scaled into its own thumbnail on its own bounds,
 * in the frame the original measured them in, so the arithmetic here is its
 * own rather than a second reading of it.
 *
 * Canvas coordinates are snapped to a tenth of a pixel before the layout
 * math, matching the original's `toFixed(1)` and keeping a converted line
 * of scrimmage as one row instead of five slightly different ones.
 */
const tenth = (value: number): number => Number(value.toFixed(1));

export function formationThumbnail(formation: Formation): {
  readonly dots: readonly {
    readonly x: number;
    readonly y: number;
    readonly filled: boolean;
  }[];
  readonly lineOfScrimmage: number;
} {
  const drawn = formation.slots.map((slot) => {
    const at = yardsToLegacyCanvas(slot.position);
    return {
      x: tenth(at.x),
      y: tenth(at.y),
      filled: slot.symbol === "square" || slot.symbol === "triangle",
    };
  });
  const xs = drawn.map(({ x }) => x);
  const ys = drawn.map(({ y }) => y);
  const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
  const spanX = Math.max(360, Math.max(...xs) - Math.min(...xs) + 80);
  const scaleX = 132 / spanX;
  const top = Math.min(...ys) - 16;
  const spanY = Math.max(150, Math.max(...ys) - top + 16);
  const scaleY = Math.min(scaleX, 66 / spanY);

  // The line is wherever most of them are standing, which is the five up
  // front in every set worth drawing.
  const crowd = new Map<number, number>();
  for (const y of ys) crowd.set(y, (crowd.get(y) ?? 0) + 1);
  const busiest = [...crowd.entries()].sort(
    (left, right) => right[1] - left[1] || left[0] - right[0],
  )[0]![0];

  return {
    dots: drawn.map(({ x, y, filled }) => ({
      x: tenth(70 + (x - middle) * scaleX),
      y: tenth(6 + (y - top) * scaleY),
      filled,
    })),
    lineOfScrimmage: tenth(6 + (busiest - top) * scaleY),
  };
}
