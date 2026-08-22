import { stockFormations, yardsToLegacyCanvas } from "@chalk/domain";
import { describe, expect, it } from "vitest";

import { formationThumbnail } from "./formation-thumbnail";

/**
 * The original's own cardDots, written in canvas pixels. Production must
 * land on the same tenths after a yards round-trip, or the dots drift down
 * the card.
 */
const originalCardDots = (
  players: readonly { x: number; y: number; filled: boolean }[],
) => {
  const xs = players.map(({ x }) => x);
  const ys = players.map(({ y }) => y);
  const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
  const spanX = Math.max(360, Math.max(...xs) - Math.min(...xs) + 80);
  const scaleX = 132 / spanX;
  const top = Math.min(...ys) - 16;
  const spanY = Math.max(150, Math.max(...ys) - top + 16);
  const scaleY = Math.min(scaleX, 66 / spanY);
  const crowd = new Map<number, number>();
  for (const y of ys) crowd.set(y, (crowd.get(y) ?? 0) + 1);
  const busiest = [...crowd.entries()].sort(
    (left, right) => right[1] - left[1] || left[0] - right[0],
  )[0]![0];
  return {
    dots: players.map((player) => ({
      x: Number((70 + (player.x - middle) * scaleX).toFixed(1)),
      y: Number((6 + (player.y - top) * scaleY).toFixed(1)),
      filled: player.filled,
    })),
    lineOfScrimmage: Number((6 + (busiest - top) * scaleY).toFixed(1)),
  };
};

describe("a formation card's picture", () => {
  it("lands on the original's tenths for a stock set", () => {
    const formation = stockFormations.find(
      ({ id }) => id === "formation_gun_doubles_right",
    )!;
    const canvas = formation.slots.map((slot) => {
      const at = yardsToLegacyCanvas(slot.position);
      return {
        x: Number(at.x.toFixed(1)),
        y: Number(at.y.toFixed(1)),
        filled: slot.symbol === "square" || slot.symbol === "triangle",
      };
    });
    expect(formationThumbnail(formation)).toEqual(originalCardDots(canvas));
  });

  it("keeps the five on the line as one row after the yards round-trip", () => {
    const formation = stockFormations.find(
      ({ id }) => id === "formation_gun_doubles_right",
    )!;
    const shape = formationThumbnail(formation);
    const onTheLine = shape.dots.filter(
      (dot) => dot.y === shape.lineOfScrimmage,
    );
    // Five linemen, snapped to one y. Unrounded conversion noise splits
    // them and the LOS falls on whoever happens to share a float.
    expect(onTheLine.length).toBeGreaterThanOrEqual(5);
  });
});
