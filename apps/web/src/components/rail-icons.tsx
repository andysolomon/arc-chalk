import type { ReactNode } from "react";

/**
 * The original's `toolIcon` — one 18-unit drawing per rail button, stamped
 * with width/height attributes and stroke on each mark rather than a wrapping
 * group. A group with `stroke` on it outlines the Text "T"; the original's T
 * has no stroke. The rail draws every icon at 18 px, so the original's grid
 * is carried over rather than re-plotted.
 */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export type RailGlyph =
  | "select"
  | "player"
  | "route"
  | "motion"
  | "block"
  | "zone"
  | "text"
  | "snap"
  | "erase";

const icons: Record<RailGlyph, ReactNode> = {
  select: (
    <path
      d="M4.5 2.5 L4.5 14.5 L8 11.6 L10 16 L12 15.1 L10 10.8 L14.5 10.5 Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  player: <circle cx="9" cy="9" r="5.5" {...stroke} />,
  route: (
    <>
      <path d="M3.5 15 L9.5 15 L9.5 5" {...stroke} />
      <path d="M6.5 7.5 L9.5 4 L12.5 7.5" {...stroke} />
    </>
  ),
  motion: (
    <>
      <path d="M2.5 12.5 L10.5 12.5" {...stroke} strokeDasharray="2.5 2.5" />
      <path d="M9.5 9 L13 12.5 L9.5 16" {...stroke} />
    </>
  ),
  block: (
    <>
      <path d="M9 15.5 L9 6.5" {...stroke} />
      <path d="M4.5 6.5 L13.5 6.5" {...stroke} strokeWidth="2" />
    </>
  ),
  zone: (
    <>
      <path d="M3 15.5 L7.5 10" {...stroke} strokeDasharray="2.5 2.5" />
      <circle cx="11" cy="6.5" r="4" {...stroke} />
    </>
  ),
  text: (
    <text
      fill="currentColor"
      fontSize="13"
      fontWeight="500"
      textAnchor="middle"
      x="9"
      y="13.5"
    >
      T
    </text>
  ),
  snap: (
    <>
      <path d="M4 3.5 L4 14.5 L15 14.5" {...stroke} />
      <path
        d="M4 8.5 A6 6 0 0 1 10 14.5"
        {...stroke}
        strokeDasharray="2.5 2.5"
      />
    </>
  ),
  erase: (
    <>
      <path d="M3 15.2 L15 15.2" {...stroke} />
      <path d="M6.4 15.2 L3.6 12.1 L10.2 3.6 L14 6.4 Z" {...stroke} />
      <path d="M7.2 9.1 L11.4 12.2" {...stroke} />
    </>
  ),
};

export function RailIcon({ glyph }: { glyph: RailGlyph }) {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
      {icons[glyph]}
    </svg>
  );
}
