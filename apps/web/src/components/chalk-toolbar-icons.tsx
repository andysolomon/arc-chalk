import type { ReactNode } from "react";

/** Arc Chalk toolbar study: 24-unit glyphs sized by CSS, accessible button owns the label. */
export type ChalkToolbarGlyph =
  | "concept"
  | "add-text"
  | "clear-lines"
  | "clear-players"
  | "delete-selection"
  | "finish-route";

/**
 * The take-off mark (ADR 0077): an × in the glyph's lower right, the same
 * size and place on both clears, so the pair reads as what goes and that it
 * goes.
 */
const off = <path d="M15.5 15.5l5 5M20.5 15.5l-5 5" />;

const shapes: Record<ChalkToolbarGlyph, ReactNode> = {
  concept: (
    // A man and the route he is given: off the line, then the break.
    <>
      <circle cx="6.5" cy="18.5" r="2.3" />
      <path d="M6.5 16V8.5H17" />
      <path d="M13.5 5l3.5 3.5-3.5 3.5" />
    </>
  ),
  "add-text": (
    <>
      <path d="M4.5 5.5h15M12 5.5v13.5" />
      <path d="M8.5 19h7" strokeOpacity=".5" />
    </>
  ),
  "clear-lines": (
    // The route alone, with no man under it, and the ×: the lines go and
    // the men stay.
    <>
      <path d="M4.5 20v-9.5h8" />
      <path d="M9.5 7l3.5 3.5-3.5 3.5" />
      {off}
    </>
  ),
  "clear-players": (
    // The man, and the ×.
    <>
      <circle cx="9.5" cy="9.5" r="5" />
      {off}
    </>
  ),
  "delete-selection": (
    <>
      <path d="M5 6.5h14M9 6.5v-2h6v2M7 6.5l1 13h8l1-13M10 10.5v5.5M14 10.5v5.5" />
    </>
  ),
  "finish-route": (
    <>
      <path d="M4.5 12.5l5 5L19.5 7" />
    </>
  ),
};

export function ChalkToolbarIcon({ glyph }: { glyph: ChalkToolbarGlyph }) {
  return (
    <svg
      aria-hidden="true"
      className="chalk-toolbar-icon"
      focusable="false"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes[glyph]}
    </svg>
  );
}

/**
 * The two sides of the ball as their letters: O and D. The side the Play is
 * drawn for is the solid letter; the other side, the shadow it is drawn
 * against, is the same letter in outline. Each is in its unit's colour
 * (ADR 0051), and an outline goes grey while its men are off the field. The
 * rail's two buttons and the sidebar's two rows draw the same four letters,
 * so one mark means one thing in the column.
 */
export function UnitLetter({
  off: offField = false,
  shadow = false,
  size = 20,
  unit,
}: {
  /** A shadow that is hidden, or not in the play yet. */
  off?: boolean;
  /** The other side's letter, in outline. */
  shadow?: boolean;
  size?: number;
  unit: "offense" | "defense";
}) {
  return (
    <svg
      aria-hidden="true"
      className="unit-letter"
      data-off={offField ? "true" : undefined}
      data-shadow={shadow ? "true" : undefined}
      data-unit={unit}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinejoin="miter"
      strokeWidth={shadow ? 1.5 : 3.8}
      viewBox="0 0 24 24"
      width={size}
    >
      {unit === "offense" ? (
        shadow ? (
          <>
            <ellipse cx="12" cy="12" rx="7.8" ry="9.4" />
            <ellipse cx="12" cy="12" rx="4.4" ry="6" />
          </>
        ) : (
          <ellipse cx="12" cy="12" rx="6.2" ry="7.8" />
        )
      ) : shadow ? (
        <>
          <path d="M4.4 2.6h5.7a9.4 9.4 0 0 1 0 18.8H4.4z" />
          <path d="M7.8 6h2.3a6 6 0 0 1 0 12H7.8z" />
        </>
      ) : (
        <path d="M6.1 4.2h4a7.8 7.8 0 0 1 0 15.6h-4z" />
      )}
    </svg>
  );
}
