import {
  LEGACY_FIELD_GEOMETRY,
  yardsToLegacyCanvas,
  type Coordinate,
} from "@chalk/domain";

import type { Camera, CameraFrame } from "./camera";

/**
 * The original's navigator. It is only worth showing when there is something
 * off screen to find — a slightly tighter threshold than fit, so a nudge off
 * the whole field does not flash a map of a view that is still the field.
 */
export const MINIMAP_SIZE = Object.freeze({ width: 132, height: 82 });
export const MINIMAP_SHOW_RATIO = 0.985;

const scaleX = MINIMAP_SIZE.width / LEGACY_FIELD_GEOMETRY.viewWidth;
const scaleY = MINIMAP_SIZE.height / LEGACY_FIELD_GEOMETRY.viewHeight;

export function minimapIsShown(camera: Camera, frame: CameraFrame): boolean {
  return camera.width < frame.width * MINIMAP_SHOW_RATIO;
}

/** The LOS, drawn faint so the dots read against the field rather than a box. */
export function minimapLineOfScrimmageY(): number {
  return LEGACY_FIELD_GEOMETRY.lineOfScrimmageY * scaleY;
}

export function minimapPlayerDot(position: Coordinate): {
  readonly x: number;
  readonly y: number;
} {
  const at = yardsToLegacyCanvas(position);
  return { x: at.x * scaleX, y: at.y * scaleY };
}

/**
 * The camera as a rectangle on the map. Held inside the frame by half a
 * pixel, and never smaller than the original's 8×6 so a deep zoom still
 * leaves something to grab.
 */
export function minimapViewportRect(camera: Camera): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  const x = Math.max(0.5, camera.x * scaleX);
  const y = Math.max(0.5, camera.y * scaleY);
  return {
    x,
    y,
    width: Math.max(
      8,
      Math.min(MINIMAP_SIZE.width - x - 0.5, camera.width * scaleX),
    ),
    height: Math.max(
      6,
      Math.min(MINIMAP_SIZE.height - y - 0.5, camera.height * scaleY),
    ),
  };
}

/** Where on the 1000×620 frame a press on the map is pointing. */
export function minimapFramePoint(
  client: { readonly x: number; readonly y: number },
  bounds: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
  frame: CameraFrame,
): { readonly x: number; readonly y: number } {
  return {
    x: ((client.x - bounds.left) / bounds.width) * frame.width,
    y: ((client.y - bounds.top) / bounds.height) * frame.height,
  };
}
