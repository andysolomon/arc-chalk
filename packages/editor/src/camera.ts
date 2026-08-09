/**
 * Where the Coach is looking. The scene is drawn in one fixed frame — the
 * same one the renderer has always used — and the camera is a rectangle of
 * that frame shown on screen. Nothing about the Play changes when it moves,
 * which is why this lives beside the interaction machine rather than in it:
 * panning is not an edit, and none of it is undoable.
 */

export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CameraFrame {
  readonly width: number;
  readonly height: number;
}

/**
 * How far in the Coach can go, as the original had it: a fifth of the frame
 * across. He cannot go out past the whole frame, because there is nothing
 * out there to see.
 */
export const MIN_CAMERA_WIDTH_RATIO = 0.2;

/**
 * How far past the edge of the frame the camera may be pushed, so a Player
 * standing on the sideline can be brought off it rather than being pinned
 * under the frame's own edge. The original's 30 and 20 pixels of a 1000×620
 * frame, kept as proportions so they hold at any frame size.
 */
const OVERSCROLL = Object.freeze({ x: 30 / 1000, y: 20 / 620 });

export function fitCamera(frame: CameraFrame): Camera {
  return { x: 0, y: 0, width: frame.width, height: frame.height };
}

/** Whether the camera is showing the whole frame, near enough. */
export function isAtFit(camera: Camera, frame: CameraFrame): boolean {
  return camera.width >= frame.width * 0.995;
}

/**
 * Holds a camera to what there is to look at: never narrower than the limit,
 * never wider than the frame, and never further out than the overscroll
 * allows. The height follows the width, because the frame the camera looks at
 * is drawn at one proportion and the element showing it keeps that proportion.
 */
export function clampCamera(camera: Camera, frame: CameraFrame): Camera {
  const width = Math.max(
    frame.width * MIN_CAMERA_WIDTH_RATIO,
    Math.min(frame.width, camera.width),
  );
  const height = (width / frame.width) * frame.height;
  const marginX =
    Math.max(0, (width - frame.width) / 2) + frame.width * OVERSCROLL.x;
  const marginY =
    Math.max(0, (height - frame.height) / 2) + frame.height * OVERSCROLL.y;
  const hold = (value: number, low: number, high: number) =>
    Math.max(Math.min(low, high), Math.min(Math.max(low, high), value));
  return {
    width,
    height,
    x: hold(camera.x, -marginX, frame.width - width + marginX),
    y: hold(camera.y, -marginY, frame.height - height + marginY),
  };
}

/**
 * Zooms about a point, which stays under the pointer while everything else
 * moves past it. That is what makes scrolling to zoom feel like the field is
 * being pushed and pulled rather than replaced.
 */
export function zoomCamera(
  camera: Camera,
  factor: number,
  frame: CameraFrame,
  anchor?: { readonly x: number; readonly y: number },
): Camera {
  const width = Math.max(
    frame.width * MIN_CAMERA_WIDTH_RATIO,
    Math.min(frame.width, camera.width * factor),
  );
  const height = (width / frame.width) * frame.height;
  const at = anchor ?? {
    x: camera.x + camera.width / 2,
    y: camera.y + camera.height / 2,
  };
  return clampCamera(
    {
      width,
      height,
      x: at.x - (at.x - camera.x) * (width / camera.width),
      y: at.y - (at.y - camera.y) * (height / camera.height),
    },
    frame,
  );
}

export function panCamera(
  camera: Camera,
  byX: number,
  byY: number,
  frame: CameraFrame,
): Camera {
  return clampCamera(
    { ...camera, x: camera.x + byX, y: camera.y + byY },
    frame,
  );
}

export function centreCamera(
  camera: Camera,
  on: { readonly x: number; readonly y: number },
  frame: CameraFrame,
): Camera {
  return clampCamera(
    {
      ...camera,
      x: on.x - camera.width / 2,
      y: on.y - camera.height / 2,
    },
    frame,
  );
}

export interface FrameBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** The room the original leaves around what it has been asked to show. */
const PADDING = 70 / 1000;

/**
 * A camera that shows what it was given, with room around it. Asked to show
 * something taller than it is wide, it widens to fit the height, because the
 * camera keeps the frame's proportion and the height is what would otherwise
 * be cut off.
 */
export function cameraForBounds(
  bounds: FrameBounds,
  frame: CameraFrame,
): Camera {
  const padding = frame.width * PADDING;
  const aspect = frame.width / frame.height;
  const width = Math.max(
    frame.width * MIN_CAMERA_WIDTH_RATIO,
    Math.min(
      frame.width,
      Math.max(
        bounds.maxX - bounds.minX + padding * 2,
        (bounds.maxY - bounds.minY + padding * 2) * aspect,
      ),
    ),
  );
  const height = (width / frame.width) * frame.height;
  return clampCamera(
    {
      width,
      height,
      x: (bounds.minX + bounds.maxX) / 2 - width / 2,
      y: (bounds.minY + bounds.maxY) / 2 - height / 2,
    },
    frame,
  );
}

/**
 * How much bigger one frame unit is drawn than it would be at fit. Anything
 * meant to stay the same size on screen — a handle, a hit tolerance — divides
 * by this, so zooming in does not also make the grab targets bigger.
 */
export function cameraZoom(camera: Camera, frame: CameraFrame): number {
  return frame.width / camera.width;
}
