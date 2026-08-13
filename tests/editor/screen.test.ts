import {
  EDITOR_MIN_SCREEN,
  editorScreenQuery,
  screenTakesEditor,
} from "@chalk/editor";
import { describe, expect, it } from "vitest";

/** The screens the plan names, in CSS pixels, as their browsers report them. */
const screens = {
  desktop: [1440, 960],
  ipadPortrait: [834, 1194],
  ipadLandscape: [1194, 834],
  ipadMiniPortrait: [744, 1133],
  phonePortrait: [390, 844],
  phoneLandscape: [932, 430],
} as const;

describe("which screens the editor is offered on", () => {
  it("gives the editor to a desktop and to an iPad either way up", () => {
    expect(screenTakesEditor(...screens.desktop)).toBe(true);
    expect(screenTakesEditor(...screens.ipadPortrait)).toBe(true);
    expect(screenTakesEditor(...screens.ipadLandscape)).toBe(true);
    // Including the smallest iPad, which the plan's device matrix names.
    expect(screenTakesEditor(...screens.ipadMiniPortrait)).toBe(true);
  });

  it("gives a phone the Play to read, held either way", () => {
    expect(screenTakesEditor(...screens.phonePortrait)).toBe(false);
    // Turned sideways a phone is wide enough and nowhere near deep enough,
    // and a shallow editor is no more workable than a narrow one.
    expect(screenTakesEditor(...screens.phoneLandscape)).toBe(false);
  });

  it("draws the line at the size it says it does, in both directions", () => {
    const { width, height } = EDITOR_MIN_SCREEN;
    expect(screenTakesEditor(width, height)).toBe(true);
    expect(screenTakesEditor(width - 1, height)).toBe(false);
    expect(screenTakesEditor(width, height - 1)).toBe(false);
  });

  it("asks the same question of the browser that it answers here", () => {
    expect(editorScreenQuery).toBe(
      `(min-width: ${EDITOR_MIN_SCREEN.width}px) and (min-height: ${EDITOR_MIN_SCREEN.height}px)`,
    );
    // The editor needs room for a field wider than the panels beside it.
    expect(EDITOR_MIN_SCREEN.width).toBeGreaterThan(2 * 292);
  });
});
