import {
  cameraZoom,
  fitCamera,
  isAtFit,
  MAX_CAMERA_WIDTH_RATIO,
  MIN_CAMERA_WIDTH_RATIO,
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
});
