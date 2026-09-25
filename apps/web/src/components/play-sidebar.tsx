import type { ReactNode } from "react";

/**
 * The left sidebar (ADR 0058): per-play admin and navigation, so the right
 * inspector can be about assignments alone. Playbook rows go where the
 * header's tabs go; "This play" rows hold what the inspector used to —
 * formation, ball spot, the shadow, play type, layers, the library — each
 * behind a popover anchored to its row on a desktop, or a page inside the
 * drawer on a phone. The footer reaches Print & export, Settings and Help.
 */
export type SidebarGlyph =
  | "plays"
  | "plans"
  | "gameday"
  | "formation"
  | "ball"
  | "shadow"
  | "type"
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
  plays: (
    <>
      <rect height="10" rx="1.5" width="11" x="2.5" y="3" {...stroke} />
      <path d="M5 6.5h6M5 9.5h6" {...stroke} />
    </>
  ),
  plans: (
    <>
      <rect height="10" rx="1.5" width="11" x="2.5" y="3" {...stroke} />
      <path d="M8 3v10M2.5 8h11" {...stroke} />
    </>
  ),
  gameday: (
    <>
      <circle cx="8" cy="8" r="5.5" {...stroke} />
      <path d="M8 5v3.2l2 1.3" {...stroke} />
    </>
  ),
  formation: (
    <>
      <rect height="10" rx="1.5" width="10" x="3" y="3" {...stroke} />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" {...stroke} />
    </>
  ),
  ball: <circle cx="8" cy="8" fill="currentColor" r="2.6" />,
  shadow: <path d="M8 3.2l5 9.6H3z" {...stroke} />,
  type: (
    <>
      <path d="M6 2.5v11M10 2.5v11M3 6h10M3 10h10" {...stroke} />
    </>
  ),
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

function Glyph({ glyph }: { glyph: SidebarGlyph }) {
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
  /** A destination row that is where the Coach already is. */
  readonly current?: boolean;
  /** A key hint at the right, the way a menu shows one. */
  readonly hint?: string;
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
        aria-current={spec.current ? "page" : undefined}
        aria-expanded={detailed ? open : undefined}
        aria-label={
          spec.name ?? (spec.value ? `${spec.label}, ${spec.value}` : undefined)
        }
        aria-haspopup={detailed ? "dialog" : undefined}
        className={`sidebar-row${open || spec.current ? " active" : ""}`}
        onClick={() => {
          if (detailed) onOpen(open ? null : spec.id);
          else spec.onOpen?.();
        }}
        title={spec.title}
        type="button"
        {...dataProps}
      >
        <span className="sidebar-icon">
          <Glyph glyph={spec.icon} />
        </span>
        <span className="sidebar-label">{spec.label}</span>
        {spec.value ? (
          <span className="sidebar-value" title={spec.value}>
            {spec.value}
          </span>
        ) : null}
        {spec.hint ? (
          <kbd aria-hidden="true" className="sidebar-hint">
            {spec.hint}
          </kbd>
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

export function PlaySidebar({
  drawer = false,
  footer,
  onClose,
  onCollapse,
  onOpen,
  open,
  playbook,
  status,
  thisPlay,
}: {
  /** A phone's left drawer rather than a docked column. */
  drawer?: boolean;
  footer: readonly SidebarRowSpec[];
  /** Puts the drawer away. */
  onClose?: () => void;
  /** Folds the docked sidebar (⌥3). */
  onCollapse?: () => void;
  onOpen: (id: string | null) => void;
  /** Which row's control is open, if one is. */
  open: string | null;
  playbook: readonly SidebarRowSpec[];
  /** The phone drawer's last word: the save state. */
  status?: ReactNode;
  thisPlay: readonly SidebarRowSpec[];
}) {
  const rows = [...playbook, ...thisPlay, ...footer];
  const page = drawer
    ? rows.find((row) => row.id === open && row.detail !== undefined)
    : undefined;
  const group = (name: string, items: readonly SidebarRowSpec[]) => (
    <div className="sidebar-group">
      <div className="sidebar-heading">{name}</div>
      {items.map((spec) => (
        <Row
          key={spec.id}
          onOpen={onOpen}
          open={!drawer && open === spec.id}
          spec={spec}
        />
      ))}
    </div>
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
          {group("Playbook", playbook)}
          {group("This play", thisPlay)}
          <span className="sidebar-spacer" />
          <div className="sidebar-group sidebar-footer">
            {footer.map((spec) => (
              <Row
                key={spec.id}
                onOpen={onOpen}
                open={!drawer && open === spec.id}
                spec={spec}
              />
            ))}
            {status ? <div className="sidebar-status">{status}</div> : null}
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
          </div>
        </>
      )}
    </nav>
  );
}
