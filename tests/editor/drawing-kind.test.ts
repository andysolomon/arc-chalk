import { canDrawFrom } from "@chalk/editor";
import { describe, expect, it } from "vitest";

describe("which tools a man can be drawn from", () => {
  const mike = {
    unit: "defense" as const,
    label: "M",
    position: { lateralYards: 0, depthYards: 5 },
  };

  it("draws a defender his drop and blitz, never a route", () => {
    expect(canDrawFrom("zone", mike)).toBe(true);
    // Block on a defender is his blitz path.
    expect(canDrawFrom("block", mike)).toBe(true);
    expect(canDrawFrom("blitz", mike)).toBe(true);
    expect(canDrawFrom("route", mike)).toBe(false);
    expect(canDrawFrom("motion", mike)).toBe(false);
  });
});
