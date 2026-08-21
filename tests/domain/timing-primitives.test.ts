import {
  evaluateMovement,
  movementDurationMs,
  pathLength,
} from "@chalk/domain";
import { timingPrimitivePlay } from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

describe("timing primitive golden", () => {
  const vertical = timingPrimitivePlay.paths.find(
    (path) => path.id === "path-vertical",
  )!;
  const horizontal = timingPrimitivePlay.paths.find(
    (path) => path.id === "path-horizontal",
  )!;
  const jet = timingPrimitivePlay.paths.find(
    (path) => path.id === "path-delayed-jet",
  )!;

  it("gives equal-length stems the same duration regardless of heading", () => {
    expect(pathLength(vertical)).toBeCloseTo(10, 8);
    expect(pathLength(horizontal)).toBeCloseTo(10, 8);
    expect(movementDurationMs(vertical)).toBe(movementDurationMs(horizontal));
    expect(evaluateMovement(vertical, 750).durationMs).toBe(
      evaluateMovement(horizontal, 750).durationMs,
    );
  });

  it("holds the original demo jet's 200 ms delay before it moves", () => {
    expect(evaluateMovement(jet, 100).phase).toBe("waiting");
    expect(evaluateMovement(jet, 200).phase).toBe("moving");
    const endMs = 200 + movementDurationMs(jet);
    expect(evaluateMovement(jet, endMs).phase).toBe("holding");
    expect(evaluateMovement(jet, endMs + 400).phase).toBe("complete");
  });

  it("evaluates the same integer timestamp deterministically", () => {
    expect(evaluateMovement(jet, 500)).toEqual(
      evaluateMovement(structuredClone(jet), 500),
    );
  });
});
