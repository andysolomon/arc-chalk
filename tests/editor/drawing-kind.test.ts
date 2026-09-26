import { canDrawFrom, drawingKindFor } from "@chalk/editor";
import { stickThunderPlay } from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

describe("what a tool draws from the man it starts on (issue #65)", () => {
  it("draws a blitz path from a defender with the Block tool, a block from anyone else", () => {
    expect(drawingKindFor("block", { unit: "defense" })).toBe("blitz");
    expect(drawingKindFor("block", { unit: "offense" })).toBe("block");
    expect(drawingKindFor("route", { unit: "defense" })).toBe("route");
    expect(drawingKindFor("zone", { unit: "defense" })).toBe("zone");
  });
});

describe("which tools a man can be drawn from", () => {
  const of = (id: string) =>
    stickThunderPlay.players.find((player) => player.id === id)!;
  const mike = {
    unit: "defense" as const,
    label: "M",
    position: { lateralYards: 0, depthYards: 5 },
  };

  it("draws a receiver or a back his route, motion and block, never a drop", () => {
    for (const id of ["q", "x", "y", "f"]) {
      expect(canDrawFrom("route", of(id))).toBe(true);
      expect(canDrawFrom("motion", of(id))).toBe(true);
      expect(canDrawFrom("block", of(id))).toBe(true);
      expect(canDrawFrom("zone", of(id))).toBe(false);
      expect(canDrawFrom("blitz", of(id))).toBe(false);
    }
  });

  it("draws a lineman his block and nothing else", () => {
    expect(canDrawFrom("block", of("ol2"))).toBe(true);
    for (const tool of ["route", "motion", "zone", "blitz"] as const) {
      expect(canDrawFrom(tool, of("ol2"))).toBe(false);
    }
  });

  it("draws a defender his drop and blitz, never a route", () => {
    expect(canDrawFrom("zone", mike)).toBe(true);
    // Block on a defender is his blitz path.
    expect(canDrawFrom("block", mike)).toBe(true);
    expect(canDrawFrom("blitz", mike)).toBe(true);
    expect(canDrawFrom("route", mike)).toBe(false);
    expect(canDrawFrom("motion", mike)).toBe(false);
  });
});
