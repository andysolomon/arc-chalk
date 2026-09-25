import {
  routePresetNames,
  routePresetPoints,
  stockConcepts,
  type ConceptDefinition,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

const conceptNamed = (key: string): ConceptDefinition => {
  const concept = stockConcepts.find((value) => value.key === key);
  if (!concept) throw new Error(`No such concept: ${key}`);
  return concept;
};

describe("the route tree", () => {
  it("offers the shapes the original offers, and draws each from the man's own spot", () => {
    expect(routePresetNames.map(({ key }) => key)).toEqual([
      "go",
      "slant",
      "hitch",
      "curl",
      "out",
      "dig",
      "post",
      "corner",
      "flat",
      "wheel",
    ]);
    const stance = { lateralYards: -20, depthYards: 0 };
    const go = routePresetPoints("go", stance)!;
    expect(go[0]).toEqual(stance);
    expect(go.at(-1)!.depthYards).toBeGreaterThan(13);
  });

  it("turns the same call the other way for the man on the other side", () => {
    const left = routePresetPoints("out", {
      lateralYards: -20,
      depthYards: 0,
    })!;
    const right = routePresetPoints("out", {
      lateralYards: 20,
      depthYards: 0,
    })!;
    // Out breaks toward a man's own sideline, so it is away from the middle
    // whichever side he stands on.
    expect(left.at(-1)!.lateralYards).toBeLessThan(-20);
    expect(right.at(-1)!.lateralYards).toBeGreaterThan(20);
    expect(left.at(-1)!.lateralYards).toBeCloseTo(
      -right.at(-1)!.lateralYards,
      9,
    );
  });

  it("breaks a slant and a dig toward the middle from either side", () => {
    for (const key of ["slant", "dig"]) {
      const left = routePresetPoints(key, {
        lateralYards: -20,
        depthYards: 0,
      })!;
      expect(left.at(-1)!.lateralYards).toBeGreaterThan(-20);
      const right = routePresetPoints(key, {
        lateralYards: 20,
        depthYards: 0,
      })!;
      expect(right.at(-1)!.lateralYards).toBeLessThan(20);
    }
  });

  it("bends the wheel, and only the wheel", () => {
    const stance = { lateralYards: 20, depthYards: 0 };
    const wheel = routePresetPoints("wheel", stance)!;
    expect(wheel.some((point) => point.control)).toBe(true);
    for (const { key } of routePresetNames.filter((p) => p.key !== "wheel")) {
      expect(routePresetPoints(key, stance)!.some((p) => p.control)).toBe(
        false,
      );
    }
  });

  it("knows nothing about a call it does not have", () => {
    expect(
      routePresetPoints("banana", { lateralYards: 0, depthYards: 0 }),
    ).toBeUndefined();
  });

  it("has no job for a position a concept says nothing about", () => {
    const stance = { lateralYards: -20, depthYards: 0 };
    expect(conceptNamed("mesh").jobFor("LT", stance)).toBeUndefined();
    expect(conceptNamed("mesh").jobFor("QB", stance)).toBeUndefined();
    expect(conceptNamed("mesh").jobFor("X", stance)).toBeDefined();
  });
});
