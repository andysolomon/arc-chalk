import type { ReactNode } from "react";

import type { PageKindId } from "@chalk/render";

/**
 * Settings' own drawings: one 16-unit glyph per tab, the theme choices, and
 * a thumbnail of each Page kind — so a Coach can see what a choice puts on
 * the field before he picks it.
 */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export type SettingsGlyph =
  | "field"
  | "playbook"
  | "history"
  | "print"
  | "appearance"
  | "account"
  | "about"
  | "close"
  | "system"
  | "light"
  | "dark"
  | "check";

const glyphs: Record<SettingsGlyph, ReactNode> = {
  field: (
    <>
      <rect height="11" rx="1.5" width="13" x="1.5" y="2.5" {...stroke} />
      <path d="M8 2.5v11M4.5 6.5v3M11.5 6.5v3" {...stroke} />
    </>
  ),
  playbook: (
    <>
      <path
        d="M3 2.5h8.5a1.5 1.5 0 0 1 1.5 1.5v9.5H4.5A1.5 1.5 0 0 1 3 12z"
        {...stroke}
      />
      <path d="M3 12a1.5 1.5 0 0 1 1.5-1.5H13" {...stroke} />
      <path d="M6.5 5.5h3.5" {...stroke} />
    </>
  ),
  history: (
    <>
      <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" {...stroke} />
      <path d="M2.5 2.5v2.5H5" {...stroke} />
      <path d="M8 5.5V8l1.8 1.3" {...stroke} />
    </>
  ),
  print: (
    <>
      <path d="M4.5 6V2.5h7V6" {...stroke} />
      <rect height="5.5" rx="1.5" width="13" x="1.5" y="6" {...stroke} />
      <path d="M4.5 10h7v3.5h-7z" {...stroke} />
    </>
  ),
  appearance: (
    <>
      <circle cx="8" cy="8" r="5.5" {...stroke} />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
    </>
  ),
  account: (
    <>
      <circle cx="8" cy="5.5" r="2.75" {...stroke} />
      <path d="M2.75 13.5a5.25 5.25 0 0 1 10.5 0" {...stroke} />
    </>
  ),
  about: (
    <>
      <circle cx="8" cy="8" r="5.5" {...stroke} />
      <path d="M8 7.25v3.5" {...stroke} />
      <circle cx="8" cy="5.1" fill="currentColor" r="0.8" />
    </>
  ),
  close: <path d="M4 4l8 8M12 4l-8 8" {...stroke} />,
  system: (
    <>
      <rect height="8.5" rx="1.5" width="12" x="2" y="2.5" {...stroke} />
      <path d="M5.5 13.5h5M8 11v2.5" {...stroke} />
    </>
  ),
  light: (
    <>
      <circle cx="8" cy="8" r="2.75" {...stroke} />
      <path
        d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1"
        {...stroke}
      />
    </>
  ),
  dark: (
    <path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z" {...stroke} />
  ),
  check: <path d="M3.5 8.5l3 3 6-7" {...stroke} />,
};

export function SettingsIcon({ glyph }: { glyph: SettingsGlyph }) {
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
      {glyphs[glyph]}
    </svg>
  );
}

/** The four men every thumbnail stands on its field: three up, one back. */
const men = (
  <g fill="currentColor">
    <circle cx="26" cy="20" r="1.8" />
    <circle cx="32" cy="20" r="1.8" />
    <circle cx="38" cy="20" r="1.8" />
    <circle cx="32" cy="26" r="1.8" />
  </g>
);

const yardLines = (xs: readonly number[], opacity: number) => (
  <g opacity={opacity} stroke="currentColor" strokeWidth="1">
    {xs.map((x) => (
      <path d={`M${x} 3V37`} key={x} />
    ))}
  </g>
);

/**
 * A thumbnail of what each Page kind draws under the play: every yard line,
 * the half nearest the ball, the line of scrimmage alone, the light lines a
 * printed playbook wants, or nothing at all.
 */
export function PageKindThumb({ kind }: { kind: PageKindId }) {
  return (
    <svg aria-hidden="true" className="page-thumb" viewBox="0 0 64 40">
      <rect
        fill="none"
        height="36"
        opacity="0.35"
        rx="3"
        stroke="currentColor"
        width="62"
        x="1"
        y="2"
      />
      {kind === "full"
        ? yardLines([8, 14, 20, 26, 32, 38, 44, 50, 56], 0.3)
        : null}
      {kind === "half" ? yardLines([12, 22, 32, 42, 52], 0.3) : null}
      {kind === "card" ? (
        <path
          d="M4 17.5H60"
          opacity="0.55"
          stroke="currentColor"
          strokeDasharray="2 2"
        />
      ) : null}
      {kind === "book" ? yardLines([12, 22, 32, 42, 52], 0.14) : null}
      {men}
    </svg>
  );
}

/** A tiny window in each theme, so System reads as half of each. */
export function ThemeThumb({ theme }: { theme: "system" | "light" | "dark" }) {
  const pane = (fill: string, ink: string, x: number, width: number) => (
    <g>
      <rect fill={fill} height="40" width={width} x={x} y="0" />
      <rect
        fill={ink}
        height="3"
        opacity="0.5"
        rx="1.5"
        width="14"
        x={x + 6}
        y="8"
      />
      <rect
        fill={ink}
        height="3"
        opacity="0.25"
        rx="1.5"
        width="22"
        x={x + 6}
        y="15"
      />
      <rect
        fill={ink}
        height="3"
        opacity="0.25"
        rx="1.5"
        width="18"
        x={x + 6}
        y="22"
      />
    </g>
  );
  return (
    <svg aria-hidden="true" className="theme-thumb" viewBox="0 0 64 40">
      <defs>
        <clipPath id={`theme-thumb-${theme}`}>
          <rect height="40" rx="5" width="64" />
        </clipPath>
      </defs>
      <g clipPath={`url(#theme-thumb-${theme})`}>
        {theme === "light" ? pane("#fafafa", "#171717", 0, 64) : null}
        {theme === "dark" ? pane("#181818", "#ededed", 0, 64) : null}
        {theme === "system" ? (
          <>
            {pane("#fafafa", "#171717", 0, 32)}
            {pane("#181818", "#ededed", 32, 32)}
          </>
        ) : null}
      </g>
    </svg>
  );
}
