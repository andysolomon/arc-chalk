import type { ReactElement, ReactNode } from "react";
import { keepInViewport } from "./keep-in-viewport";

/**
 * The left sidebar (ADR 0058, ADR 0074): how this play is set up, so the
 * right inspector can be about assignments alone. "This play" holds the
 * formation, the ball spot and the shadow; Show on field and the Library fold
 * away under "View & library". Each row's control is a popover anchored to
 * the row on a desktop, or a page inside the drawer on a phone. The header's
 * tabs are the navigation, so the sidebar repeats none of them. Its foot is a
 * row of icons — Settings and Help, and Print & export in a phone's drawer,
 * whose header has no room for it. On a desktop the drawing tools head it, so
 * the workspace has one left column rather than a rail beside a sidebar, and
 * folding it leaves a narrow rail of the tools and the sidebar's own icons.
 */
export type SidebarGlyph =
  "ball" | "layers" | "library" | "print" | "settings" | "help" | "sidebar";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const glyphs: Record<SidebarGlyph, ReactNode> = {
  // The ball as it lies on the field: a football, tipped, with its stripes.
  ball: (
    <g transform="rotate(-45 8 8)">
      <path
        d="M1.2 8C3.4 4.6 5.7 3.6 8 3.6s4.6 1 6.8 4.4c-2.2 3.4-4.5 4.4-6.8 4.4S3.4 11.4 1.2 8z"
        {...stroke}
      />
      <path d="M4.3 5.3v5.4M11.7 5.3v5.4" {...stroke} />
    </g>
  ),
  // Show on field: an eye, for what is shown and what is hidden.
  layers: (
    <>
      <path
        d="M1.8 8C3.4 5.2 5.5 3.8 8 3.8s4.6 1.4 6.2 4.2c-1.6 2.8-3.7 4.2-6.2 4.2S3.4 10.8 1.8 8z"
        {...stroke}
      />
      <circle cx="8" cy="8" r="1.9" {...stroke} />
    </>
  ),
  // An open book, its pages falling to the spine.
  library: (
    <path
      d="M8 4.5C6.8 3.6 5 3.3 2.5 3.5v8.5c2.5-.2 4.3.1 5.5 1 1.2-.9 3-1.2 5.5-1V3.5C11 3.3 9.2 3.6 8 4.5zM8 4.5V13"
      {...stroke}
    />
  ),
  print: (
    <>
      <path
        d="M5 6V3h6v3M4 6h8a1.5 1.5 0 0 1 1.5 1.5V11H11v2H5v-2H2.5V7.5A1.5 1.5 0 0 1 4 6z"
        {...stroke}
      />
    </>
  ),
  // A cog: a toothed wheel round its hub.
  settings: (
    <>
      <circle cx="8" cy="8" r="1.9" {...stroke} />
      <path
        d="M6.9 2.2h2.2l.4 1.7 1.5.9 1.7-.5 1.1 1.9-1.3 1.2v1.2l1.3 1.2-1.1 1.9-1.7-.5-1.5.9-.4 1.7H6.9l-.4-1.7-1.5-.9-1.7.5-1.1-1.9 1.3-1.2V7.4L2.2 6.2l1.1-1.9 1.7.5 1.5-.9z"
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
  sidebar: (
    <>
      <rect height="10" rx="2" width="11" x="2.5" y="3" {...stroke} />
      <path d="M6.5 3v10" {...stroke} />
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

/** A row's icon: the glyph it names, or the mark it was handed. */
function rowIcon(icon: SidebarGlyph | ReactElement) {
  return typeof icon === "string" ? <SidebarIcon glyph={icon} /> : icon;
}

export interface SidebarRowSpec {
  readonly id: string;
  /** One of the sidebar's glyphs, or a mark drawn elsewhere: a side's letter. */
  readonly icon: SidebarGlyph | ReactElement;
  readonly label: string;
  /** What it currently says, at the row's right. */
  readonly value?: string;
  readonly title?: string;
  /** The control the row opens — a popover on a desktop, a page in the drawer. */
  readonly detail?: ReactNode;
  /**
   * What stands at the head of that control, after its title: a count, an
   * action, the ? that explains it. The title is the row's label, so every
   * popover opens the same way — name, then controls, then words.
   */
  readonly aside?: ReactNode;
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
        <span className="sidebar-icon">{rowIcon(spec.icon)}</span>
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
        <div
          aria-label={spec.label}
          className="sidebar-popover"
          ref={keepInViewport}
          role="group"
        >
          <div className="sidebar-popover-head">
            <span className="sidebar-popover-title">{spec.label}</span>
            {spec.aside}
          </div>
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
      {rowIcon(spec.icon)}
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
  folded = false,
  footer,
  name,
  onClose,
  onCollapse,
  onExpand,
  onOpen,
  open,
  status,
  thisPlay,
  tools,
}: {
  /** A phone's left drawer rather than a docked column. */
  drawer?: boolean;
  /** Rows tucked under a heading that opens and closes, remembered per device. */
  fold?: SidebarFold;
  /**
   * A docked sidebar folded (⌥3) to a narrow rail: the tools, then each row
   * and foot icon as an icon alone, then the › that opens it again.
   */
  folded?: boolean;
  /** The icons at the foot. */
  footer: readonly SidebarRowSpec[];
  /** The play's name, heading This play where the header has no room for it. */
  name?: ReactNode;
  /** Puts the drawer away. */
  onClose?: () => void;
  /** Folds the docked sidebar (⌥3). */
  onCollapse?: () => void;
  /** Opens the folded sidebar again (⌥3). */
  onExpand?: () => void;
  onOpen: (id: string | null) => void;
  /** Which row's control is open, if one is. */
  open: string | null;
  /** The phone drawer's last word: the save state. */
  status?: ReactNode;
  thisPlay: readonly SidebarRowSpec[];
  /**
   * The drawing tools, at the head of a docked sidebar: a desktop has one
   * left column, and folding it leaves the tools standing as a narrow rail.
   */
  tools?: ReactNode;
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
  const sidebar = (
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
          {/* A page's count, action and ? stand in the head beside its
              title, as they do in a popover's. */}
          {page?.aside ? (
            <div className="sidebar-popover-head sidebar-drawer-aside">
              {page.aside}
            </div>
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
            {name ? <div className="sidebar-name">{name}</div> : null}
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
                ref={keepInViewport}
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
  if (folded) {
    // Folded to a narrow rail: every row and every foot icon stays, drawn as
    // an icon whose control opens beside it, so nothing the sidebar does is
    // lost to the fold. The fold's rows stand with the rest, since the rail
    // has no heading to open them under.
    const railIcon = (spec: SidebarRowSpec, foot: boolean) => {
      const shown = open === spec.id && spec.detail !== undefined;
      const named: SidebarRowSpec = {
        ...spec,
        name:
          spec.name ??
          (spec.value ? `${spec.label}, ${spec.value}` : spec.label),
        title: spec.value
          ? `${spec.label}: ${spec.value}`
          : (spec.title ?? spec.label),
      };
      return (
        <div className="sidebar-rail-item" data-row={spec.id} key={spec.id}>
          <FooterIcon onOpen={onOpen} open={shown} spec={named} />
          {shown ? (
            <div
              aria-label={spec.label}
              className={`sidebar-popover${foot ? " sidebar-foot-popover" : ""}`}
              ref={keepInViewport}
              role="group"
            >
              {spec.detail}
            </div>
          ) : null}
        </div>
      );
    };
    return (
      <div className="sidebar-rail-column">
        {tools}
        <nav aria-label="Folded sidebar" className="sidebar-rail">
          {tools ? <span aria-hidden="true" className="rail-divider" /> : null}
          {[...thisPlay, ...(fold?.rows ?? [])].map((spec) =>
            railIcon(spec, false),
          )}
          <span className="sidebar-spacer" />
          {footer.map((spec) => railIcon(spec, true))}
          <button
            aria-label="Show the sidebar"
            className="sidebar-expand"
            onClick={onExpand}
            title="Show the sidebar — ⌥3"
            type="button"
          >
            ›
          </button>
        </nav>
      </div>
    );
  }
  if (!tools) return sidebar;
  // One column: the tools are their own landmark at its head, so the
  // sidebar's rows keep names of their own.
  return (
    <div className="sidebar-column">
      <div className="sidebar-group sidebar-tools-group">
        <div aria-hidden="true" className="sidebar-heading">
          Tools
        </div>
        {tools}
      </div>
      {sidebar}
    </div>
  );
}
