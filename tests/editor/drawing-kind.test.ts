import { drawingKindFor } from "@chalk/editor";
import { describe, expect, it } from "vitest";

describe("what a tool draws from the man it starts on (issue #65)", () => {
  it("draws a blitz path from a defender with the Block tool, a block from anyone else", () => {
    expect(drawingKindFor("block", { unit: "defense" })).toBe("blitz");
    expect(drawingKindFor("block", { unit: "offense" })).toBe("block");
    expect(drawingKindFor("route", { unit: "defense" })).toBe("route");
    expect(drawingKindFor("zone", { unit: "defense" })).toBe("zone");
  });
});
