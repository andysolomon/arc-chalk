import { highSchoolFieldProfile } from "@chalk/domain";
import { snapPosition, type SnapReference } from "@chalk/editor";
import { describe, expect, it } from "vitest";

/**
 * Even splits in isolation (ADR 0073). Dragging a tackle back to the split
 * the rest of his line keeps, and seeing the splits measured, is
 * `tests/e2e/line-alignment.spec.ts`. This is the way the spacing could go
 * wrong where that journey would not notice:
 *
 * - a lineman is pulled to a split the backfield makes, because the men a
 *   split is read from were not kept to his own row.
 */

const screenScale = {
  lateralPixelsPerYard: 18.3,
  depthPixelsPerYard: 12,
} as const;

const player = (
  id: string,
  lateralYards: number,
  depthYards: number,
): SnapReference => ({
  id,
  kind: "player",
  label: id.toUpperCase(),
  position: { lateralYards, depthYards },
});

describe("even splits", () => {
  it("does not pull a lineman to a split the backfield makes", () => {
    const { point, guides } = snapPosition({
      point: { lateralYards: 4.8, depthYards: -1.5 },
      fieldProfile: highSchoolFieldProfile,
      references: [
        player("lt", -4, -1.5),
        player("lg", -2, -1.5),
        player("c", 0, -1.5),
        player("rg", 2, -1.5),
        // Three yards apart, six deep: RG + 3 and H − 2 both sit at 5.
        player("f", 4, -6),
        player("h", 7, -6),
      ],
      screenScale,
      settings: { enabled: true, grid: "off" },
    });
    expect(point.lateralYards).toBe(4.8);
    expect(guides.some(({ source }) => source === "equal-spacing")).toBe(false);
  });
});
