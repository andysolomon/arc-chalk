import {
  idleStylus,
  penInterrupts,
  stylusDown,
  stylusIsPrecise,
  stylusRejects,
  stylusUp,
  touchNavigates,
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

describe("which pointer is in the Coach's hand", () => {
  it("takes a device at its word until something touches it", () => {
    expect(stylusIsPrecise(idleStylus, true)).toBe(false);
    expect(stylusIsPrecise(idleStylus, false)).toBe(true);
  });

  it("calls a Pencil precise on the iPad that calls itself coarse", () => {
    expect(stylusIsPrecise(after("pen"), true)).toBe(true);
    expect(stylusIsPrecise(after("touch"), true)).toBe(false);
    // And it changes hands as often as he does.
    expect(stylusIsPrecise(after("pen", "-pen", "touch"), true)).toBe(false);
    expect(stylusIsPrecise(after("touch", "pen"), true)).toBe(true);
  });

  it("calls a mouse precise on a screen that also takes touch", () => {
    expect(stylusIsPrecise(after("mouse"), true)).toBe(true);
  });
});

describe("the hand holding the Pencil", () => {
  it("ignores what touches the glass while the tip is down", () => {
    const drawing = after("pen");
    expect(stylusRejects(drawing, "touch")).toBe(true);
    // Only the palm: the tip itself, and a mouse, are still heard.
    expect(stylusRejects(drawing, "pen")).toBe(false);
    expect(stylusRejects(drawing, "mouse")).toBe(false);
  });

  it("hears the fingers again once the tip comes up", () => {
    expect(stylusRejects(after("pen", "-pen"), "touch")).toBe(false);
  });

  it("keeps rejecting while a second contact of the same pen is down", () => {
    // Two tips is not a real gesture, but a pointerup that arrives without
    // its pointerdown is: the count must not go negative and let a palm
    // through while the Pencil is still writing.
    expect(stylusRejects(after("pen", "-pen", "-pen", "pen"), "touch")).toBe(
      true,
    );
  });

  it("is not let go of by the hand lifting off", () => {
    // The palm comes and goes several times over one stroke, and every one of
    // those is a pointerup the field hears. None of them is the Pencil.
    expect(stylusRejects(after("touch", "pen", "-touch"), "touch")).toBe(true);
  });

  it("hears the fingers before a Pencil has ever been used", () => {
    expect(stylusRejects(after("touch"), "touch")).toBe(false);
    expect(stylusRejects(after("mouse"), "touch")).toBe(false);
  });
});

describe("what a finger is for", () => {
  it("leaves a finger doing everything until a Pencil comes out", () => {
    expect(touchNavigates(idleStylus, "touch")).toBe(false);
    expect(touchNavigates(after("touch"), "touch")).toBe(false);
  });

  it("gives the field to the finger once a Pencil has been used", () => {
    expect(touchNavigates(after("pen", "-pen"), "touch")).toBe(true);
    // Even after he puts it down and picks up a mouse: the Pencil is what he
    // draws with on this device, and a finger that starts dragging men
    // again after one stroke is the worst of both.
    expect(touchNavigates(after("pen", "-pen", "mouse"), "touch")).toBe(true);
  });

  it("says nothing about the pointers that are not fingers", () => {
    const drawn = after("pen", "-pen");
    expect(touchNavigates(drawn, "pen")).toBe(false);
    expect(touchNavigates(drawn, "mouse")).toBe(false);
  });
});

describe("a Pencil arriving", () => {
  it("interrupts, because the palm landed before the tip did", () => {
    expect(penInterrupts(idleStylus, "pen")).toBe(true);
    expect(penInterrupts(after("touch"), "pen")).toBe(true);
  });

  it("does not interrupt itself while it is already down", () => {
    expect(penInterrupts(after("pen"), "pen")).toBe(false);
  });

  it("is not something a finger or a mouse does", () => {
    expect(penInterrupts(idleStylus, "touch")).toBe(false);
    expect(penInterrupts(idleStylus, "mouse")).toBe(false);
  });
});
