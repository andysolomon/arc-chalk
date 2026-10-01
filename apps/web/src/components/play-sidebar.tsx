import type { ReactNode } from "react";

/**
 * The left sidebar (ADR 0058, ADR 0074): how this play is set up, so the
 * right inspector can be about assignments alone. "This play" holds the
 * formation, the ball spot and the shadow; Show on field and the Library fold
 * away under "View & library". Each row's control is a popover anchored to
 * the row on a desktop, or a page inside the drawer on a phone. The header's
 * tabs are the navigation, so the sidebar repeats none of them. Its foot is a
 * row of icons — Settings and Help, and Print & export in a phone's drawer,
 * whose header has no room for it.
 */
export type SidebarGlyph =
  | "formation"
  | "ball"
  | "shadow"
  | "layers"
  | "library"
  | "print"
  | "settings"
  | "help";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const glyphs: Record<SidebarGlyph, ReactNode> = {
  formation: (
    <>
      <rect height="10" rx="1.5" width="10" x="3" y="3" {...stroke} />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" {...stroke} />
    </>
  ),
  ball: <circle cx="8" cy="8" fill="currentColor" r="2.6" />,
  shadow: <path d="M8 3.2l5 9.6H3z" {...stroke} />,
  layers: (
    <>
      <circle cx="8" cy="8" r="5.5" {...stroke} />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
    </>
  ),
  library: (
    <>
      <path
        d="M3 3.5h4.2a1.8 1.8 0 0 1 1.8 1.8V13H4.8A1.8 1.8 0 0 1 3 11.2z"
        {...stroke}
      />
      <path
        d="M13 3.5H8.8A1.8 1.8 0 0 0 7 5.3V13h4.2a1.8 1.8 0 0 0 1.8-1.8z"
        {...stroke}
      />
    </>
  ),
  print: (
    <>
      <path
        d="M5 6V3h6v3M4 6h8a1.5 1.5 0 0 1 1.5 1.5V11H11v2H5v-2H2.5V7.5A1.5 1.5 0 0 1 4 6z"
        {...stroke}
      />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.2" {...stroke} />
      <path
        d="M8 2.5v1.8M8 11.7v1.8M2.5 8h1.8M11.7 8h1.8M4.1 4.1l1.3 1.3M10.6 10.6l1.3 1.3M4.1 11.9l1.3-1.3M10.6 5.4l1.3-1.3"
        {...stroke}
      />
    </>
  ),
  help: (
    <>
      <path d="M5.8 6.2a2.3 2.3 0 1 1 3.2 2.1c-.7.3-1 .7-1 1.4" {...stroke} />
      <circle cx="8" cy="12.2" fill="currentColor" r=".8" />
    </>
  ),
};

export function SidebarIcon({ glyph }: { glyph: SidebarGlyph }) {
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
      {glyphs[glyph]}
    </svg>
  );
}

export interface SidebarRowSpec {
  readonly id: string;
  readonly icon: SidebarGlyph;
  readonly label: string;
  /** What it currently says, at the row's right. */
  readonly value?: string;
  readonly title?: string;
  /** The control the row opens — a popover on a desktop, a page in the drawer. */
  readonly detail?: ReactNode;
  /** Runs instead of opening a detail: a browser, a destination, a dialog. */
  readonly onOpen?: () => void;
  /** Sits under the row whether or not it is open. */
  readonly below?: ReactNode;
  /** What assistive tech calls the row, when its label alone would clash. */
  readonly name?: string;
  readonly data?: Readonly<Record<string, string | undefined>>;
}

function Row({
  onOpen,
  open,
  spec,
}: {
  onOpen: (id: string | null) => void;
  open: boolean;
  spec: SidebarRowSpec;
}) {
  const detailed = spec.detail !== undefined;
  const dataProps = Object.fromEntries(
    Object.entries(spec.data ?? {}).map(([key, value]) => [
      `data-${key}`,
      value,
    ]),
  );
  return (
    <div className="sidebar-row-wrap" data-row={spec.id}>
      <button
        aria-expanded={detailed ? open : undefined}
        aria-label={
          spec.name ?? (spec.value ? `${spec.label}, ${spec.value}` : undefined)
        }
        aria-haspopup={detailed ? "dialog" : undefined}
        className={`sidebar-row${open ? " active" : ""}`}
        onClick={() => {
          if (detailed) onOpen(open ? null : spec.id);
          else spec.onOpen?.();
        }}
        title={spec.title}
        type="button"
        {...dataProps}
      >
        <span className="sidebar-icon">
          <SidebarIcon glyph={spec.icon} />
        </span>
        <span className="sidebar-label">{spec.label}</span>
        {spec.value ? (
          <span className="sidebar-value" title={spec.value}>
            {spec.value}
          </span>
        ) : null}
        {detailed || spec.onOpen ? (
          <span aria-hidden="true" className="sidebar-chevron">
            ›
          </span>
        ) : null}
      </button>
      {open && detailed ? (
        <div aria-label={spec.label} className="sidebar-popover" role="group">
          {spec.detail}
        </div>
      ) : null}
      {spec.below}
    </div>
  );
}

/**
 * One icon at the sidebar's foot, the way T3 Code and an editor's activity
 * bar draw theirs: the word is its accessible name and its tooltip.
 */
function FooterIcon({
  onOpen,
  open,
  spec,
}: {
  onOpen: (id: string | null) => void;
  open: boolean;
  spec: SidebarRowSpec;
}) {
  const detailed = spec.detail !== undefined;
  return (
    <button
      aria-expanded={detailed ? open : undefined}
      aria-haspopup={detailed ? "dialog" : undefined}
      aria-label={spec.name ?? spec.label}
      className={`sidebar-foot-icon${open ? " active" : ""}`}
      data-row={spec.id}
      onClick={() => {
        if (detailed) onOpen(open ? null : spec.id);
        else spec.onOpen?.();
      }}
      title={spec.title ?? spec.label}
      type="button"
    >
      <SidebarIcon glyph={spec.icon} />
    </button>
  );
}

export interface SidebarFold {
  readonly label: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly rows: readonly SidebarRowSpec[];
}

export function PlaySidebar({
  drawer = false,
  fold,
  footer,
  onClose,
  onCollapse,
  onOpen,
  open,
  status,
  thisPlay,
}: {
  /** A phone's left drawer rather than a docked column. */
  drawer?: boolean;
  /** Rows tucked under a heading that opens and closes, remembered per device. */
  fold?: SidebarFold;
  /** The icons at the foot. */
  footer: readonly SidebarRowSpec[];
  /** Puts the drawer away. */
  onClose?: () => void;
  /** Folds the docked sidebar (⌥3). */
  onCollapse?: () => void;
  onOpen: (id: string | null) => void;
  /** Which row's control is open, if one is. */
  open: string | null;
  /** The phone drawer's last word: the save state. */
  status?: ReactNode;
  thisPlay: readonly SidebarRowSpec[];
}) {
  const rows = [...thisPlay, ...(fold?.open ? fold.rows : []), ...footer];
  const page = drawer
    ? rows.find((row) => row.id === open && row.detail !== undefined)
    : undefined;
  const footOpen = drawer
    ? undefined
    : footer.find((spec) => spec.id === open && spec.detail !== undefined);
  const row = (spec: SidebarRowSpec) => (
    <Row
      key={spec.id}
      onOpen={onOpen}
      open={!drawer && open === spec.id}
      spec={spec}
    />
  );
  return (
    <nav
      aria-label="Sidebar"
      className={`play-sidebar${drawer ? " sidebar-drawer" : ""}`}
    >
      {drawer ? (
        <div className="sidebar-drawer-head">
          {page ? (
            <button
              className="sidebar-back"
              onClick={() => onOpen(null)}
              type="button"
            >
              <span aria-hidden="true">‹</span> Back
            </button>
          ) : (
            <strong>Chalk</strong>
          )}
          {page ? (
            <span className="sidebar-page-title">{page.label}</span>
          ) : null}
          <button
            aria-label="Close the sidebar"
            className="sidebar-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}
      {page ? (
        <div aria-label={page.label} className="sidebar-page" role="group">
          {page.detail}
        </div>
      ) : (
        <>
          <div className="sidebar-group">
            <div className="sidebar-heading">This play</div>
            {thisPlay.map(row)}
          </div>
          {fold ? (
            <div className="sidebar-group sidebar-fold">
              <button
                aria-expanded={fold.open}
                className="sidebar-heading sidebar-fold-toggle"
                onClick={fold.onToggle}
                type="button"
              >
                <span aria-hidden="true" className="sidebar-fold-chevron">
                  ›
                </span>
                {fold.label}
              </button>
              {fold.open ? fold.rows.map(row) : null}
            </div>
          ) : null}
          <span className="sidebar-spacer" />
          {status ? <div className="sidebar-status">{status}</div> : null}
          <div className="sidebar-foot">
            {footer.map((spec) => (
              <FooterIcon
                key={spec.id}
                onOpen={onOpen}
                open={!drawer && open === spec.id}
                spec={spec}
              />
            ))}
            {onCollapse ? (
              <button
                aria-label="Hide the sidebar"
                className="sidebar-collapse"
                onClick={onCollapse}
                title="Hide the sidebar — ⌥3"
                type="button"
              >
                ‹
              </button>
            ) : null}
            {footOpen ? (
              <div
                aria-label={footOpen.label}
                className="sidebar-popover sidebar-foot-popover"
                role="group"
              >
                {footOpen.detail}
              </div>
            ) : null}
          </div>
        </>
      )}
    </nav>
  );
}
