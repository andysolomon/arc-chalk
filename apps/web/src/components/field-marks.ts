export const sceneColors = {
  ink: "#171717",
  blue: "#0072f5",
  red: "#E5484D",
  green: "#398E4A",
  orange: "#C2540A",
  gray: "#8F8F8F",
  yellow: "#F5D90A",
} as const;

/** The original's selection blue, used for halos, guides, and the marquee. */
export const SELECTION_BLUE = "#0072F5";

export function selectionKey(
  kind: "player" | "path" | "label",
  id: string,
): string {
  return `${kind}:${id}`;
}
