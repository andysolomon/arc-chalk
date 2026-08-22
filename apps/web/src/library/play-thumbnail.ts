import {
  PLAY_THUMBNAIL_RENDERER_VERSION,
  playThumbnailKey,
  yardsToLegacyCanvas,
  type PlayDocument,
  type PlayThumbnailTheme,
} from "@chalk/domain";

const tenth = (value: number): number => Number(value.toFixed(1));

/**
 * A card-sized picture of a Play, keyed by everything that would change it.
 * Geometry is projected in the original's canvas so a Coach reads the same
 * shape he sees on a Formation card.
 */
export function playThumbnailSvg(
  play: PlayDocument,
  theme: PlayThumbnailTheme = "light",
): string {
  const players = play.players.map((player) => {
    const at = yardsToLegacyCanvas(player.position);
    return {
      x: tenth(at.x),
      y: tenth(at.y),
      filled: player.symbol === "square" || player.symbol === "triangle",
      defense: player.unit === "defense",
    };
  });
  const paths = play.paths.map((path) =>
    path.points.map((point) => {
      const at = yardsToLegacyCanvas(point);
      return { x: tenth(at.x), y: tenth(at.y) };
    }),
  );
  const xs = [
    ...players.map(({ x }) => x),
    ...paths.flatMap((path) => path.map(({ x }) => x)),
  ];
  const ys = [
    ...players.map(({ y }) => y),
    ...paths.flatMap((path) => path.map(({ y }) => y)),
  ];
  const middle = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 500;
  const spanX = Math.max(
    360,
    (xs.length ? Math.max(...xs) - Math.min(...xs) : 0) + 80,
  );
  const scaleX = 132 / spanX;
  const top = (ys.length ? Math.min(...ys) : 400) - 16;
  const spanY = Math.max(150, (ys.length ? Math.max(...ys) - top : 0) + 16);
  const scaleY = Math.min(scaleX, 66 / spanY);
  const project = (x: number, y: number) => ({
    x: tenth(70 + (x - middle) * scaleX),
    y: tenth(6 + (y - top) * scaleY),
  });
  const ink = theme === "dark" ? "#f5f5f5" : "#171717";
  const mute = theme === "dark" ? "#8f8f8f" : "#c9c9c9";
  const lines = paths
    .map((path) => {
      const drawn = path.map((point) => project(point.x, point.y));
      if (drawn.length < 2) return "";
      const d = drawn
        .map(
          (point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`,
        )
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="1.2"/>`;
    })
    .join("");
  const dots = players
    .map((player) => {
      const at = project(player.x, player.y);
      const fill = player.filled ? ink : theme === "dark" ? "#171717" : "#fff";
      const stroke = player.defense ? mute : ink;
      return `<circle cx="${at.x}" cy="${at.y}" r="3" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 78" width="140" height="78">${lines}${dots}</svg>`;
}

export function playThumbnailBlob(play: PlayDocument): Blob {
  return new Blob([playThumbnailSvg(play)], { type: "image/svg+xml" });
}

export function thumbnailKeyForPlay(
  play: PlayDocument,
  documentHash: string,
  theme: PlayThumbnailTheme = "light",
): string {
  return playThumbnailKey({
    playId: play.id,
    revisionHash: documentHash,
    rendererVersion: PLAY_THUMBNAIL_RENDERER_VERSION,
    fieldProfileRevision: play.fieldProfile.revision,
    theme,
  });
}
