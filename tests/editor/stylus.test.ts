import {
  idleStylus,
  stylusDown,
  stylusRejects,
  stylusUp,
  type StylusState,
} from "@chalk/editor";
import { describe, expect, it } from "vitest";

/** The pointers, in the order they touched the glass. */
const after = (...pointers: readonly string[]): StylusState =>
  pointers.reduce(
    (state, pointer) =>
      pointer.startsWith("-")
        ? stylusUp(state, pointer.slice(1))
        : stylusDown(state, pointer),
    idleStylus,
  );

describe("the hand holding the Pencil", () => {
  it("keeps rejecting while a second contact of the same pen is down", () => {
    // Two tips is not a real gesture, but a pointerup that arrives without
    // its pointerdown is: the count must not go negative and let a palm
    // through while the Pencil is still writing.
    expect(stylusRejects(after("pen", "-pen", "-pen", "pen"), "touch")).toBe(
      true,
    );
  });
});
