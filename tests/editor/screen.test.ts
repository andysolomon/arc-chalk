import { EDITOR_MIN_SCREEN, screenTakesEditor } from "@chalk/editor";
import { describe, expect, it } from "vitest";

describe("which screens the editor is offered on", () => {
  it("draws the line at the size it says it does, in both directions", () => {
    const { width, height } = EDITOR_MIN_SCREEN;
    expect(screenTakesEditor(width, height)).toBe(true);
    expect(screenTakesEditor(width - 1, height)).toBe(false);
    expect(screenTakesEditor(width, height - 1)).toBe(false);
  });
});
