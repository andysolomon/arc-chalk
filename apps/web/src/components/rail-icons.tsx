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
  | "formation"
  | "shadow"
  | "shadow-add"
  | "clear-lines"
  | "clear-players"
  | "trash";

/**
 * A set as the browsers draw one: three men on the line and a back behind
 * the middle. Drawn here at full size for Formation, and smaller in the
 * corner Clear every player leaves for its badge.
 */
const SET = [
  [0, 0],
  [5.5, 0],
  [11, 0],
  [5.5, 7.5],
] as const;
const men = (scale: number, x: number, y: number, r = 2 * scale) =>
  SET.map(([dx, dy]) => (
    <circle
      cx={x + dx * scale}
      cy={y + dy * scale}
      key={`${dx}-${dy}`}
      r={r}
      {...stroke}
    />
  ));

/**
 * The add and take-off badges (ADR 0077): a ringed + or − tucked into the
 * glyph's lower right, so every rail button that puts something on the field
 * or takes it off says which, and what.
 */
const badge = (sign: "+" | "-") => (
  <>
    <circle cx="13.6" cy="13.6" r="3.4" {...stroke} />
    <path
      d={sign === "+" ? "M12 13.6h3.2M13.6 12v3.2" : "M12 13.6h3.2"}
      {...stroke}
    />
  </>
);

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
  formation: <>{men(1, 3.5, 5.5)}</>,
  shadow: (
    // The Play's own man and, ghosted beside him, the other unit's: an O
    // and a dashed X, which is what the shadow looks like on the field.
    <>
      <circle cx="6.5" cy="11.5" r="4" {...stroke} />
      <path d="M10.5 3.5 L15.5 8.5" {...stroke} strokeDasharray="2 2" />
      <path d="M15.5 3.5 L10.5 8.5" {...stroke} strokeDasharray="2 2" />
    </>
  ),
  "shadow-add": (
    // The same O and dashed X, drawn smaller to make room for the + that
    // says there is no other unit yet and this puts one on.
    <>
      <circle cx="5" cy="8.5" r="3.2" {...stroke} />
      <path d="M10 2.5 L14.5 7" {...stroke} strokeDasharray="2 2" />
      <path d="M14.5 2.5 L10 7" {...stroke} strokeDasharray="2 2" />
      {badge("+")}
    </>
  ),
  "clear-lines": (
    // A route breaking to the corner, and the − that takes it off.
    <>
      <path d="M2.8 15.5 L2.8 11 L10 4.2" {...stroke} />
      <path d="M6.4 3.6 L10.4 3.8 L10.2 7.8" {...stroke} />
      {badge("-")}
    </>
  ),
  "clear-players": (
    // The Formation glyph, smaller, and the − that takes the men off.
    <>
      {men(0.82, 3, 4, 1.8)}
      {badge("-")}
    </>
  ),
  trash: (
    <>
      <path d="M4 5.5 L14 5.5" {...stroke} />
      <path d="M7 5.5 L7 3.8 L11 3.8 L11 5.5" {...stroke} />
      <path d="M5.5 5.5 L6.3 14.5 L11.7 14.5 L12.5 5.5" {...stroke} />
      <path d="M8 8 L8 12" {...stroke} />
      <path d="M10 8 L10 12" {...stroke} />
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

/**
 * The header's icon buttons (ADR 0057, ADR 0074): Undo and Redo as hook-back
 * arrows, one the mirror of the other; Reset positions as a turn back round
 * the man; Present as the board he is shown on. All on the rail's own 18-unit
 * grid and stroke, so the header and the rail read as one set.
 */
const header = {
  undo: (
    <>
      <path d="M6.5 4 L3.5 7 L6.5 10" {...stroke} />
      <path
        d="M3.5 7 L10.75 7 A3.75 3.75 0 0 1 10.75 14.5 L7.5 14.5"
        {...stroke}
      />
    </>
  ),
  redo: (
    <>
      <path d="M11.5 4 L14.5 7 L11.5 10" {...stroke} />
      <path
        d="M14.5 7 L7.25 7 A3.75 3.75 0 0 0 7.25 14.5 L10.5 14.5"
        {...stroke}
      />
    </>
  ),
  reset: (
    <>
      <path d="M3 9a6 6 0 1 0 1.76-4.24L3 6.5" {...stroke} />
      <path d="M3 3v3.5h3.5" {...stroke} />
      <circle cx="9" cy="9" fill="currentColor" r="1.4" />
    </>
  ),
  present: (
    <>
      <path d="M2 3h14" {...stroke} />
      <path
        d="M3 3v7.5A1.5 1.5 0 0 0 4.5 12h9a1.5 1.5 0 0 0 1.5-1.5V3"
        {...stroke}
      />
      <path d="M6 15.5 9 12.5l3 3" {...stroke} />
      <path d="M7.75 5.25v4.5L11.5 7.5z" {...stroke} />
    </>
  ),
} as const;

export type HeaderGlyph = keyof typeof header;

export function HeaderIcon({ glyph }: { glyph: HeaderGlyph }) {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
      {header[glyph]}
    </svg>
  );
}
