import {
  cameraForBounds,
  cameraZoom,
  fitCamera,
  isAtFit,
  MAX_CAMERA_WIDTH_RATIO,
  MIN_CAMERA_WIDTH_RATIO,
  panCamera,
  zoomCamera,
} from "@chalk/editor";
import { editorSvgViewport } from "@chalk/render";
import { describe, expect, it } from "vitest";

/** The editor's own frame, which is what the renderer draws into. */
const frame = {
  width: editorSvgViewport.width,
  height: editorSvgViewport.height,
};
const fit = fitCamera(frame);

describe("where the Coach is looking", () => {
  it("will not go closer than the limit, or further back than it", () => {
    let camera = fit;
    for (let step = 0; step < 20; step += 1)
      camera = zoomCamera(camera, 0.5, frame);
    expect(camera.width).toBeCloseTo(frame.width * MIN_CAMERA_WIDTH_RATIO, 9);

    let out = camera;
    for (let step = 0; step < 20; step += 1) out = zoomCamera(out, 2, frame);
    expect(out.width).toBeCloseTo(frame.width * MAX_CAMERA_WIDTH_RATIO, 9);
    expect(cameraZoom(out, frame)).toBeCloseTo(1 / MAX_CAMERA_WIDTH_RATIO, 9);
    expect(isAtFit(out, frame)).toBe(true);
  });

  it("gives him the same nudge either way of the middle when he is stood back", () => {
    const back = zoomCamera(fit, 1.25, frame);
    const middle = (frame.width - back.width) / 2;
    const pushed = panCamera(back, -10_000, 0, frame);
    const other = panCamera(back, 10_000, 0, frame);
    expect(pushed.x).toBeCloseTo(middle - frame.width * (30 / 1000), 6);
    expect(other.x).toBeCloseTo(middle + frame.width * (30 / 1000), 6);
    // The field never leaves the view, however hard it is pushed.
    expect(pushed.x + pushed.width).toBeGreaterThan(frame.width);
    expect(other.x).toBeLessThan(0);
  });

  it("lets the Coach push a little past the edge, and no further", () => {
    const zoomed = zoomCamera(fit, 0.5, frame);
    const pushed = panCamera(zoomed, -10_000, -10_000, frame);
    expect(pushed.x).toBeCloseTo(-frame.width * (30 / 1000), 6);
    expect(pushed.y).toBeCloseTo(-frame.height * (20 / 620), 6);

    const other = panCamera(zoomed, 10_000, 10_000, frame);
    expect(other.x).toBeCloseTo(
      frame.width - zoomed.width + frame.width * (30 / 1000),
      6,
    );
  });

  it("widens to fit something taller than it is wide, rather than cutting it off", () => {
    const tall = { minX: 500, minY: 60, maxX: 520, maxY: 480 };
    const camera = cameraForBounds(tall, frame);
    expect(camera.height).toBeGreaterThanOrEqual(tall.maxY - tall.minY);
  });
});
