import { LEGACY_FIELD_GEOMETRY } from "@chalk/domain";
import {
  fitCamera,
  isAtFit,
  minimapFramePoint,
  minimapIsShown,
  MINIMAP_SHOW_RATIO,
  MINIMAP_SIZE,
  minimapLineOfScrimmageY,
  minimapPlayerDot,
  minimapViewportRect,
  zoomCamera,
} from "@chalk/editor";
import { editorSvgViewport } from "@chalk/render";
import { describe, expect, it } from "vitest";

const frame = {
  width: editorSvgViewport.width,
  height: editorSvgViewport.height,
};
const fit = fitCamera(frame);

describe("the navigator", () => {
  it("stays away until the view has left the field, not merely left fit", () => {
    expect(minimapIsShown(fit, frame)).toBe(false);
    // Fit itself uses 0.995. A camera between the two must not flash a map
    // of a view that is still the field — the original's own 0.985 line.
    const between = {
      ...fit,
      width: frame.width * 0.99,
      height: frame.height * 0.99,
    };
    expect(isAtFit(between, frame)).toBe(false);
    expect(minimapIsShown(between, frame)).toBe(false);
    expect(MINIMAP_SHOW_RATIO).toBe(0.985);

    const further = zoomCamera(fit, 0.8, frame);
    expect(further.width).toBeLessThan(frame.width * MINIMAP_SHOW_RATIO);
    expect(minimapIsShown(further, frame)).toBe(true);
  });

  it("puts a man on the map where the original's canvas put him", () => {
    const onTheBall = minimapPlayerDot({ lateralYards: 0, depthYards: 0 });
    expect(onTheBall.x).toBeCloseTo(
      (LEGACY_FIELD_GEOMETRY.midfieldX * MINIMAP_SIZE.width) /
        LEGACY_FIELD_GEOMETRY.viewWidth,
      9,
    );
    expect(onTheBall.y).toBeCloseTo(minimapLineOfScrimmageY(), 9);
    expect(minimapLineOfScrimmageY()).toBeCloseTo(
      (430 * MINIMAP_SIZE.height) / 620,
      9,
    );
  });

  it("draws the camera as a rectangle that cannot fall off the map", () => {
    const zoomed = zoomCamera(fit, 0.5, frame);
    const rect = minimapViewportRect(zoomed);
    expect(rect.x).toBeGreaterThanOrEqual(0.5);
    expect(rect.y).toBeGreaterThanOrEqual(0.5);
    expect(rect.x + rect.width).toBeLessThanOrEqual(MINIMAP_SIZE.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(MINIMAP_SIZE.height);
    expect(rect.width).toBeGreaterThanOrEqual(8);
    expect(rect.height).toBeGreaterThanOrEqual(6);
  });

  it("reads a press in the original's 1000×620 frame", () => {
    const at = minimapFramePoint(
      { x: 50, y: 30 },
      { left: 10, top: 10, width: 132, height: 82 },
      frame,
    );
    expect(at.x).toBeCloseTo(((50 - 10) / 132) * frame.width, 9);
    expect(at.y).toBeCloseTo(((30 - 10) / 82) * frame.height, 9);
  });
});
