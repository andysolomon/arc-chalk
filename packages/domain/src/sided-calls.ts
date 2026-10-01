/**
 * The calls that name the side they go to. Turned over — flipped, mirrored,
 * or the strength flipped — each is the other side's call, so a boot right
 * mirrored is a boot left and is named and lit as one. Every other call is
 * the same call either way. Kept apart from the catalogues, with nothing to
 * import, so the geometry's own mirror can ask it.
 */
const OTHER_SIDE: Readonly<Record<string, string>> = Object.freeze({
  bootleft: "bootright",
  bootright: "bootleft",
  sprintleft: "sprintright",
  sprintright: "sprintleft",
  setleft: "setright",
  setright: "setleft",
});

/** The call a line drawn as `key` is once it is turned over. */
export const mirroredCallKey = (key: string): string => OTHER_SIDE[key] ?? key;
