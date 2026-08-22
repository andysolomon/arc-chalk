export const PLAY_THUMBNAIL_RENDERER_VERSION = 1;

export type PlayThumbnailTheme = "light" | "dark" | "high-contrast";

export interface PlayThumbnailKeyParts {
  readonly playId: string;
  readonly revisionHash: string;
  readonly rendererVersion?: number;
  readonly fieldProfileRevision: number;
  readonly theme?: PlayThumbnailTheme;
}

/**
 * A thumbnail is keyed by everything that would change the picture, so a
 * stale derivative can be dropped without touching the Play.
 */
export function playThumbnailKey(parts: PlayThumbnailKeyParts): string {
  const rendererVersion =
    parts.rendererVersion ?? PLAY_THUMBNAIL_RENDERER_VERSION;
  const theme = parts.theme ?? "light";
  return [
    parts.playId,
    parts.revisionHash,
    String(rendererVersion),
    String(parts.fieldProfileRevision),
    theme,
  ].join(":");
}

export function parsePlayThumbnailKey(
  key: string,
): PlayThumbnailKeyParts | undefined {
  const [
    playId,
    revisionHash,
    rendererVersion,
    fieldProfileRevision,
    theme,
  ] = key.split(":");
  if (
    !playId ||
    !revisionHash ||
    rendererVersion === undefined ||
    fieldProfileRevision === undefined
  ) {
    return undefined;
  }
  const revision = Number(fieldProfileRevision);
  const renderer = Number(rendererVersion);
  if (!Number.isInteger(revision) || !Number.isInteger(renderer)) {
    return undefined;
  }
  const resolvedTheme: PlayThumbnailTheme =
    theme === "dark" || theme === "high-contrast" ? theme : "light";
  return {
    playId,
    revisionHash,
    rendererVersion: renderer,
    fieldProfileRevision: revision,
    theme: resolvedTheme,
  };
}
