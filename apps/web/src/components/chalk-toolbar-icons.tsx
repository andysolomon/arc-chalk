import type { ReactNode } from "react";

/** Arc Chalk toolbar study: 24-unit glyphs sized by CSS, accessible button owns the label. */
export type ChalkToolbarGlyph =
  | "formation"
  | "shadow-add"
  | "shadow-toggle"
  | "add-text"
  | "clear-lines"
  | "clear-players"
  | "delete-selection"
  | "finish-route";

const shapes: Record<ChalkToolbarGlyph, ReactNode> = {
  formation: (
    <>
      <circle cx="5" cy="7" r="2.1" />
      <circle cx="12" cy="7" r="2.1" />
      <circle cx="19" cy="7" r="2.1" />
      <path d="M3.5 11.5h17" strokeOpacity=".5" />
      <circle cx="12" cy="17" r="2.3" />
    </>
  ),
  "shadow-add": (
    <>
      <circle cx="8" cy="13" r="4" />
      <circle cx="15" cy="8" r="3.4" strokeDasharray="2.1 2.1" />
      <path d="M17.5 16v6M14.5 19h6" />
    </>
  ),
  "shadow-toggle": (
    <>
      <circle cx="9" cy="14" r="4.4" />
      <circle cx="15" cy="8" r="4.4" strokeDasharray="2.5 2.2" />
    </>
  ),
  "add-text": (
    <>
      <path d="M4.5 5.5h15M12 5.5v13.5" />
      <path d="M8.5 19h7" strokeOpacity=".5" />
    </>
  ),
  "clear-lines": (
    <>
      <path d="M4.5 19v-6l9-8" />
      <path d="M9.5 5h4v4" />
      <path d="M15.5 18.5h5.5" />
    </>
  ),
  "clear-players": (
    <>
      <circle cx="4.5" cy="7" r="1.9" />
      <circle cx="10.5" cy="7" r="1.9" />
      <circle cx="16.5" cy="7" r="1.9" />
      <circle cx="10.5" cy="15" r="2" />
      <path d="M16 18.5h5.5" />
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
