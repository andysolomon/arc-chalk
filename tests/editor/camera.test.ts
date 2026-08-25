import {
  cameraForBounds,
  cameraZoom,
  centreCamera,
  clampCamera,
  fitCamera,
  isAtFit,
  MAX_CAMERA_WIDTH_RATIO,
  MIN_CAMERA_WIDTH_RATIO,
  panCamera,
  zoomCamera,
  type Camera,
} from "@chalk/editor";
import { editorSvgViewport } from "@chalk/render";
import { describe, expect, it } from "vitest";

/** The editor's own frame, which is what the renderer draws into. */
const frame = {
  width: editorSvgViewport.width,
  height: editorSvgViewport.height,
};
/** The original's 70 pixels of room, as a proportion of the frame's width. */
const PADDING_RATIO = 70 / 1000;
const fit = fitCamera(frame);

const showing = (camera: Camera) => ({
  x: Math.round(camera.x),
  y: Math.round(camera.y),
  width: Math.round(camera.width),
});

describe("where the Coach is looking", () => {
  it("starts showing the whole frame, and says so", () => {
    expect(fit).toEqual({
      x: 0,
      y: 0,
      width: editorSvgViewport.width,
      height: editorSvgViewport.height,
    });
    expect(isAtFit(fit, frame)).toBe(true);
    expect(cameraZoom(fit, frame)).toBe(1);
  });

  it("keeps the frame's proportion whatever it is asked for", () => {
    const zoomed = zoomCamera(fit, 0.5, frame);
    expect(zoomed.width / zoomed.height).toBeCloseTo(
      frame.width / frame.height,
      9,
    );
    expect(cameraZoom(zoomed, frame)).toBeCloseTo(2, 9);
    expect(isAtFit(zoomed, frame)).toBe(false);
  });

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

  it("lets the Coach step back off the field, with it left in the middle", () => {
    // One step out from fit, which the status bar reads as 80%.
    const back = zoomCamera(fit, 1.25, frame);
    expect(back.width).toBeCloseTo(frame.width * 1.25, 9);
    expect(cameraZoom(back, frame)).toBeCloseTo(0.8, 9);
    expect(back.x + back.width / 2).toBeCloseTo(frame.width / 2, 6);
    expect(back.y + back.height / 2).toBeCloseTo(frame.height / 2, 6);
    // Nothing of the field is cut off once he is standing back from it.
    expect(back.x).toBeLessThanOrEqual(0);
    expect(back.x + back.width).toBeGreaterThanOrEqual(frame.width);
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

  it("holds the point it is zoomed about under the pointer", () => {
    const anchor = { x: 800, y: 400 };
    const zoomed = zoomCamera(fit, 0.5, frame, anchor);
    // Where the anchor sits within the camera, as a fraction, is unchanged.
    const before = (anchor.x - fit.x) / fit.width;
    const after = (anchor.x - zoomed.x) / zoomed.width;
    expect(after).toBeCloseTo(before, 9);
  });

  it("zooms about the middle when it is not told where", () => {
    const zoomed = zoomCamera(fit, 0.5, frame);
    expect(zoomed.x + zoomed.width / 2).toBeCloseTo(fit.x + fit.width / 2, 9);
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

  it("keeps the whole frame in view when it is showing all of it", () => {
    // At fit there is nothing to pan to, so pushing leaves it where it is
    // apart from the overscroll the Coach is allowed either way.
    const pushed = panCamera(fit, 10_000, 0, frame);
    expect(pushed.width).toBe(frame.width);
    expect(pushed.x).toBeCloseTo(frame.width * (30 / 1000), 6);
  });

  it("puts what it is asked to look at in the middle of what it shows", () => {
    const zoomed = zoomCamera(fit, 0.4, frame);
    const centred = centreCamera(zoomed, { x: 700, y: 300 }, frame);
    expect(centred.x + centred.width / 2).toBeCloseTo(700, 6);
    expect(centred.y + centred.height / 2).toBeCloseTo(300, 6);
    expect(centred.width).toBe(zoomed.width);
  });

  it("shows what it is given with room around it, and centred on it", () => {
    const bounds = { minX: 400, minY: 200, maxX: 600, maxY: 300 };
    const camera = cameraForBounds(bounds, frame);
    expect(camera.x + camera.width / 2).toBeCloseTo(500, 6);
    expect(camera.y + camera.height / 2).toBeCloseTo(250, 6);
    // Wider than what it was given, because it leaves room around it.
    expect(camera.width).toBeGreaterThan(200);
  });

  it("widens to fit something taller than it is wide, rather than cutting it off", () => {
    const tall = { minX: 500, minY: 60, maxX: 520, maxY: 480 };
    const camera = cameraForBounds(tall, frame);
    expect(camera.height).toBeGreaterThanOrEqual(tall.maxY - tall.minY);
  });

  it("does not magnify one man to fill the screen — the room around him decides", () => {
    const oneMan = { minX: 500, minY: 260, maxX: 500, maxY: 260 };
    const camera = cameraForBounds(oneMan, frame);
    expect(camera.width).toBeGreaterThanOrEqual(
      frame.width * MIN_CAMERA_WIDTH_RATIO,
    );
    // Nothing to show but a point, so what is shown is the room left around
    // it, which is the same either way and so decided by the taller axis.
    expect(showing(camera)).toEqual({
      x: Math.round(500 - camera.width / 2),
      y: Math.round(260 - camera.height / 2),
      width: Math.round(camera.width),
    });
    expect(camera.height).toBeCloseTo(frame.width * PADDING_RATIO * 2, 6);
  });

  it("holds a camera handed to it out of shape, whichever way it is wrong", () => {
    const tooWide = clampCamera(
      { x: -9_000, y: 9_000, width: 40_000, height: 3 },
      frame,
    );
    expect(tooWide.width).toBeCloseTo(frame.width * MAX_CAMERA_WIDTH_RATIO, 9);
    expect(tooWide.height).toBeCloseTo(
      frame.height * MAX_CAMERA_WIDTH_RATIO,
      9,
    );
    // Pushed hard off to one side, it comes back to the overscroll of where
    // the frame sits in the middle of a camera wider than it is.
    expect(tooWide.x).toBeCloseTo(
      (frame.width - tooWide.width) / 2 - frame.width * (30 / 1000),
      6,
    );

    // And a camera closer in than anything should ever ask for. Zooming has
    // its own limit, because it has to know the width before it can hold the
    // point under the pointer; this is the one every other caller goes
    // through.
    const tooClose = clampCamera(
      { x: 500, y: 200, width: 1, height: 1 },
      frame,
    );
    expect(tooClose.width).toBeCloseTo(frame.width * MIN_CAMERA_WIDTH_RATIO, 9);
  });
});
