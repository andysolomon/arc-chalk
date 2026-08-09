import { useEffect, useRef, useState } from "react";

import {
  clearEntries,
  clearMenuHint,
  exportGroups,
  paletteCommands,
  positionGroups,
  saveItems,
  shortcutRows,
  type ActionMap,
  type MenuEntry,
} from "./editor-command-surface";

function MenuItem({
  actions,
  chevron,
  entry,
  label,
  onDismiss,
  onRun,
}: {
  actions: ActionMap;
  chevron?: boolean;
  entry: MenuEntry;
  label?: string;
  /** Running an item closes the menu, as the original's does. */
  onDismiss?: () => void;
  onRun?: () => void;
}) {
  const action = actions[entry.id];
  const run =
    onRun ??
    (action
      ? () => {
          onDismiss?.();
          action();
        }
      : undefined);

  return (
    <button
      className="menu-item"
      disabled={!run}
      onClick={run}
      title={entry.title}
      type="button"
    >
      <span className="menu-item-name">{label ?? entry.label}</span>
      {chevron ? (
        <span className="menu-chevron" aria-hidden="true">
          ›
        </span>
      ) : null}
      {/* The separator keeps the accessible name from running the label and
          the key together into "Focus modeF". */}
      {entry.shortcut ? (
        <>
          {" "}
          <kbd>{entry.shortcut}</kbd>
        </>
      ) : null}
    </button>
  );
}

export function MoreMenu({
  actions,
  children,
  focused,
  onDismiss,
  onToggle,
  open,
  zonesHidden,
}: {
  actions: ActionMap;
  /** Backup is an approved production extension and lives inside this menu. */
  children?: React.ReactNode;
  focused: boolean;
  onDismiss: () => void;
  onToggle: () => void;
  open: boolean;
  zonesHidden: boolean;
}) {
  const entries: readonly MenuEntry[] = [
    {
      id: focused ? "showPanels" : "focus",
      label: focused ? "Show both panels" : "Focus mode",
      shortcut: "F",
      title: "Hide both panels and give the field the whole window",
    },
    {
      id: "toggleZones",
      label: zonesHidden ? "Show zone areas" : "Hide zone areas",
      shortcut: "⇧Z",
      title: "Coverage bubbles on or off — the drops themselves stay",
    },
    {
      id: "mirror",
      label: "Mirror",
      title: "Mirror the selection — or the whole play — across the field",
    },
    {
      id: "flipStrength",
      label: "Flip strength",
      title:
        "Flip the play and its terminology — swaps X/Z, LEFT/RIGHT, STRONG/WEAK",
    },
    {
      id: "newPlay",
      label: "New play",
      title: "Clear the field and start over",
    },
  ];

  return (
    <div className="menu">
      <button
        aria-expanded={open}
        // The original labels this button only with its tooltip; a screen
        // reader would otherwise hear an ellipsis.
        aria-label="More actions"
        className={`more${open ? " open" : ""}`}
        onClick={onToggle}
        title="More actions"
        type="button"
      >
        ⋯
      </button>
      <div className="menu-panel more-panel" hidden={!open}>
        {entries.map((entry) => (
          <MenuItem
            actions={actions}
            entry={entry}
            key={entry.label}
            onDismiss={onDismiss}
          />
        ))}
        {children}
      </div>
    </div>
  );
}

/**
 * The Clear menu on the tool rail. Each button is greyed by the absence of
 * its own action, which the shell derives from whether the erasure would take
 * anything, so nothing here looks dead and still takes a click.
 */
export function ClearMenu({
  actions,
  onDismiss,
  onToggle,
  open,
}: {
  actions: ActionMap;
  onDismiss: () => void;
  onToggle: () => void;
  open: boolean;
}) {
  return (
    <div className="menu">
      <button
        aria-expanded={open}
        aria-label="Clear a layer"
        className={open ? "open" : undefined}
        onClick={onToggle}
        title="Clear a layer"
        type="button"
      >
        <EraseIcon />
      </button>
      <div className="menu-panel clear-panel" hidden={!open}>
        <div className="menu-heading">Clear</div>
        <div className="clear-grid">
          {clearEntries.map((entry) => (
            <MenuItem
              actions={actions}
              entry={entry}
              key={entry.id}
              onDismiss={onDismiss}
            />
          ))}
        </div>
        <p className="menu-note">{clearMenuHint}</p>
      </div>
    </div>
  );
}

/**
 * The original's eraser, in its own coordinates: a block on a rule with the
 * mark it has just rubbed out. The rail draws every icon at 18 px, so the
 * original's 18-unit grid is carried over rather than re-plotted onto the
 * 24-unit one the drawing tools use.
 */
function EraseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      >
        <path d="M3 15.2 L15 15.2" />
        <path d="M6.4 15.2 L3.6 12.1 L10.2 3.6 L14 6.4 Z" />
        <path d="M7.2 9.1 L11.4 12.2" />
      </g>
    </svg>
  );
}

export function ExportMenu({
  actions,
  onDismiss,
  onToggle,
  open,
  playName,
}: {
  actions: ActionMap;
  onDismiss: () => void;
  onToggle: () => void;
  open: boolean;
  playName: string;
}) {
  return (
    <div className="menu">
      <button
        aria-expanded={open}
        className={`export${open ? " open" : ""}`}
        onClick={onToggle}
        title="Export and print"
        type="button"
      >
        Export
      </button>
      {/* Mounting the panel only while it is open is what returns the menu to
          its top level the next time the Coach opens it. */}
      {open ? (
        <ExportPanel
          actions={actions}
          onDismiss={onDismiss}
          playName={playName}
        />
      ) : null}
    </div>
  );
}

function ExportPanel({
  actions,
  onDismiss,
  playName,
}: {
  actions: ActionMap;
  onDismiss: () => void;
  playName: string;
}) {
  const [submenu, setSubmenu] = useState<"position" | "wristband" | null>(null);
  const [wristband, setWristband] = useState<readonly string[]>([]);

  const back = (
    <button
      aria-label="Back to exports"
      className="menu-back"
      onClick={() => setSubmenu(null)}
      title="Back to exports"
      type="button"
    >
      ‹
    </button>
  );

  return (
    <div className="menu-panel export-panel">
      {submenu === null
        ? exportGroups.map((group) => (
            <div className="menu-group" key={group.head}>
              <div className="menu-head">{group.head}</div>
              {group.items.map((item) => (
                <MenuItem
                  actions={actions}
                  chevron={Boolean(item.submenu)}
                  entry={item}
                  key={item.label}
                  onDismiss={onDismiss}
                  onRun={
                    item.submenu
                      ? () => setSubmenu(item.submenu ?? null)
                      : undefined
                  }
                />
              ))}
            </div>
          ))
        : null}
      {submenu === "position" ? (
        <>
          <div className="menu-subhead">
            {back}
            <div className="menu-head">POSITION VIEW</div>
          </div>
          {positionGroups.map((entry) => (
            <MenuItem
              actions={actions}
              entry={entry}
              key={entry.label}
              onDismiss={onDismiss}
            />
          ))}
          <p className="menu-hint">
            The group prints at full weight — everyone else fades back, so the
            sheet keeps its context.
          </p>
        </>
      ) : null}
      {submenu === "wristband" ? (
        <>
          <div className="menu-subhead">
            {back}
            <div className="menu-head">WRISTBAND</div>
            <span className="menu-count">
              {wristband.length} of 8 cells filled
            </span>
          </div>
          <div className="wristband-rows">
            <button
              className="wristband-row"
              onClick={() =>
                setWristband((picked) =>
                  picked.includes(playName)
                    ? picked.filter((name) => name !== playName)
                    : [...picked, playName],
                )
              }
              type="button"
            >
              <span
                aria-hidden="true"
                className={`wristband-box${
                  wristband.includes(playName) ? " on" : ""
                }`}
              >
                {wristband.includes(playName) ? "✓" : ""}
              </span>
              <span>{playName}</span>
            </button>
          </div>
          <button
            className="menu-primary"
            disabled={!actions.printWristband || wristband.length === 0}
            onClick={actions.printWristband}
            type="button"
          >
            Print the wristband
          </button>
          <p className="menu-hint">
            Eight cells, 2.1 × 1.4 in each — cut lines print dashed.
          </p>
        </>
      ) : null}
    </div>
  );
}

export function SaveMenu({
  actions,
  children,
  onDismiss,
  onSnapshot,
  onToggle,
  open,
  saveLabel,
}: {
  actions: ActionMap;
  /** The versions this Play already has, listed under the menu. */
  children?: React.ReactNode;
  onDismiss: () => void;
  onSnapshot: (label: string) => void;
  onToggle: () => void;
  open: boolean;
  saveLabel: string;
}) {
  return (
    <div className="menu">
      <button
        aria-expanded={open}
        className={`save${saveLabel === "Saved" ? " saved" : ""}`}
        onClick={onToggle}
        type="button"
      >
        {saveLabel}
      </button>
      {open ? (
        <SavePanel
          actions={actions}
          onDismiss={onDismiss}
          onSnapshot={onSnapshot}
        >
          {children}
        </SavePanel>
      ) : null}
    </div>
  );
}

function SavePanel({
  actions,
  children,
  onDismiss,
  onSnapshot,
}: {
  actions: ActionMap;
  children?: React.ReactNode;
  onDismiss: () => void;
  onSnapshot: (label: string) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");

  const cancel = () => {
    setNaming(false);
    setDraft("");
  };

  return (
    <div className="menu-panel save-panel">
      {naming ? (
        <form
          className="snapshot-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            onSnapshot(draft.trim());
            cancel();
          }}
        >
          <input
            aria-label="Snapshot name"
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              cancel();
            }}
            placeholder="What this state is"
            spellCheck={false}
            value={draft}
          />
          <div className="snapshot-actions">
            <button
              className="menu-primary"
              disabled={!draft.trim()}
              type="submit"
            >
              Snapshot
            </button>
            <button className="menu-quiet" onClick={cancel} type="button">
              Cancel
            </button>
          </div>
          <p className="menu-hint">
            Lands in History with that name. No new row in the library.
          </p>
        </form>
      ) : (
        <>
          {saveItems.map((entry) => (
            <MenuItem
              actions={actions}
              entry={entry}
              key={entry.label}
              onDismiss={onDismiss}
              onRun={
                entry.id === "snapshot" ? () => setNaming(true) : undefined
              }
            />
          ))}
          {children}
        </>
      )}
    </div>
  );
}

export function CommandPalette({
  actions,
  onClose,
}: {
  actions: ActionMap;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const hits = paletteCommands.filter(
    (command) => !search || command.label.toLowerCase().includes(search),
  );
  const shown = hits.slice(0, 10);

  const run = (command: MenuEntry) => {
    const action = actions[command.id];
    if (!action) return;
    onClose();
    action();
  };

  return (
    <div
      className="overlay palette-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="palette"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <input
          aria-label="Command palette"
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (hits[0]) run(hits[0]);
            }
          }}
          placeholder="Type a command — formation, defense, export, clear…"
          spellCheck={false}
          value={query}
        />
        <div className="palette-list">
          {shown.map((command, index) => (
            <button
              className={`palette-item${search && index === 0 ? " first" : ""}`}
              disabled={!actions[command.id]}
              key={command.label}
              onClick={() => run(command)}
              type="button"
            >
              <span className="palette-name">{command.label}</span>
              {command.shortcut ? (
                <>
                  {" "}
                  <kbd>{command.shortcut}</kbd>
                </>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ShortcutReference({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
  }, []);

  return (
    <div
      className="overlay shortcuts-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="shortcuts"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <div className="shortcuts-head">
          <div className="shortcuts-title">Keyboard shortcuts</div>
          <button
            className="shortcuts-close"
            onClick={onClose}
            ref={close}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="shortcuts-grid">
          {shortcutRows.map(([what, key]) => (
            <div className="shortcut-row" key={what}>
              <span>{what}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
