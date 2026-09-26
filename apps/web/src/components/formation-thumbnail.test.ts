import { stockFormations } from "@chalk/domain";
import { describe, expect, it } from "vitest";

import { formationThumbnail } from "./formation-thumbnail";

describe("a formation card's picture", () => {
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
