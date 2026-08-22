/**
 * Wall-clock sample for playback origin. Kept out of the React tree so
 * render stays deterministic (ADR 0028) while event handlers can still
 * stamp an absolute start.
 */
export function readPlaybackNow(): number {
  return performance.now();
}
