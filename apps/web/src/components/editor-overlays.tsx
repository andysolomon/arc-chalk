import {
  coverageForDrop,
  defensiveFronts,
  formationFamilies,
  formationMeta,
  LEGACY_FIELD_GEOMETRY,
  yardsToLegacyCanvas,
  type DefensiveAssignment,
  type DefensiveCall,
  type Formation,
} from "@chalk/domain";
import { coverageFills } from "@chalk/render";
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

/**
 * What the Coach can do to the one thing he pointed at, where he pointed. The
 * original opens it on a right-click or a long press over a Player or a route,
 * and every item here is also reachable from the keyboard, which ADR 0016
 * requires of a menu that only a pointer can open.
 */
export function ContextMenu({
  actions,
  at,
  onDismiss,
}: {
  actions: ActionMap;
  at: { readonly x: number; readonly y: number } | undefined;
  onDismiss: () => void;
}) {
  if (!at) return null;
  const entries: readonly MenuEntry[] = [
    { id: "duplicate", label: "Duplicate", shortcut: "⌘D" },
    { id: "mirror", label: "Mirror" },
    { id: "bringForward", label: "Bring forward", shortcut: "⌘]" },
    { id: "sendBackward", label: "Send back", shortcut: "⌘[" },
    { id: "deleteSelection", label: "Delete", shortcut: "⌫" },
  ];

  return (
    <div
      className="context-backdrop"
      onContextMenu={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onPointerDown={onDismiss}
    >
      <div
        className="menu-panel context-panel"
        onContextMenu={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        role="menu"
        style={{ left: `${at.x}px`, top: `${at.y}px` }}
      >
        {entries.map((entry) => (
          <MenuItem
            actions={actions}
            entry={entry}
            key={entry.label}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A card carries the shape of a set, not only its name — a Coach reads the
 * picture first. Each one is scaled into its own thumbnail on its own bounds,
 * in the frame the original measured them in, so the arithmetic here is its
 * own rather than a second reading of it.
 */
function formationThumbnail(formation: Formation): {
  readonly dots: readonly {
    readonly x: number;
    readonly y: number;
    readonly filled: boolean;
  }[];
  readonly lineOfScrimmage: number;
} {
  const drawn = formation.slots.map((slot) => ({
    ...yardsToLegacyCanvas(slot.position),
    filled: slot.symbol === "square" || slot.symbol === "triangle",
  }));
  const xs = drawn.map(({ x }) => x);
  const ys = drawn.map(({ y }) => y);
  const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
  const spanX = Math.max(360, Math.max(...xs) - Math.min(...xs) + 80);
  const scaleX = 132 / spanX;
  const top = Math.min(...ys) - 16;
  const spanY = Math.max(150, Math.max(...ys) - top + 16);
  const scaleY = Math.min(scaleX, 66 / spanY);

  // The line is wherever most of them are standing, which is the five up
  // front in every set worth drawing.
  const crowd = new Map<number, number>();
  for (const y of ys) crowd.set(y, (crowd.get(y) ?? 0) + 1);
  const busiest = [...crowd.entries()].sort(
    (left, right) => right[1] - left[1] || left[0] - right[0],
  )[0]![0];

  return {
    dots: drawn.map(({ x, y, filled }) => ({
      x: 70 + (x - middle) * scaleX,
      y: 6 + (y - top) * scaleY,
      filled,
    })),
    lineOfScrimmage: 6 + (busiest - top) * scaleY,
  };
}

function Chips({
  choices,
  onPick,
  value,
}: {
  choices: readonly {
    readonly value: string;
    readonly name: string;
    readonly title: string;
  }[];
  onPick: (value: string) => void;
  value: string;
}) {
  return (
    <div className="chip-row">
      {choices.map((choice) => (
        <button
          aria-pressed={choice.value === value}
          className={`chip${choice.value === value ? " active" : ""}`}
          key={choice.value}
          onClick={() => onPick(choice.value)}
          title={choice.title}
          type="button"
        >
          {choice.name}
        </button>
      ))}
    </div>
  );
}

/**
 * How a Coach narrows a book down to the part of it he reaches for: the whole
 * thing, the ones he starred, or the ones he saved himself. A tab is not a
 * filter chip — it decides which book is open, so it sits above the filters
 * and reads as a segmented control the way the original's does.
 */
function BrowserTabs({
  onPick,
  tabs,
  value,
}: {
  onPick: (value: string) => void;
  tabs: readonly { readonly value: string; readonly name: string }[];
  value: string;
}) {
  return (
    <div className="browser-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          aria-selected={tab.value === value}
          className={`browser-tab${tab.value === value ? " active" : ""}`}
          key={tab.value}
          onClick={() => onPick(tab.value)}
          role="tab"
          type="button"
        >
          {tab.name}
        </button>
      ))}
    </div>
  );
}

/**
 * The star that keeps a set within reach. It sits inside a card that is
 * itself a button, so it stops the click travelling — starring a set is not
 * picking it, and a Coach who stars one does not want it on the field.
 */
function FavoriteStar({
  favorite,
  onToggle,
}: {
  favorite: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorite}
      className={`browser-star${favorite ? " on" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      title={favorite ? "Remove from favorites" : "Add to favorites"}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M8 1.9 9.9 5.8 14.2 6.4 11.1 9.4 11.8 13.7 8 11.7 4.2 13.7 4.9 9.4 1.8 6.4 6.1 5.8 Z" />
      </svg>
    </button>
  );
}

/** Favorites first, and otherwise the order the book already had them in. */
const favoritesFirst = <T,>(
  cards: readonly T[],
  isFavorite: (card: T) => boolean,
): readonly T[] =>
  [...cards].sort(
    (left, right) => Number(isFavorite(right)) - Number(isFavorite(left)),
  );

/**
 * The book of sets. Only one can be on the field, so picking one is a
 * decision rather than a list selection: the original applies it and gets out
 * of the way, and so does this.
 */
export function FormationBrowser({
  currentFormationId,
  favoriteIds,
  formations,
  offensivePlayerCount,
  onClose,
  onPick,
  onPreview,
  onRemove,
  onSave,
  onToggleFavorite,
}: {
  currentFormationId?: string;
  favoriteIds: readonly string[];
  formations: readonly Formation[];
  offensivePlayerCount: number;
  onClose: () => void;
  onPick: (formationId: string) => void;
  onPreview: (formationId?: string) => void;
  onRemove: (formationId: string) => void;
  onSave: (name: string) => void;
  onToggleFavorite: (formationId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [personnel, setPersonnel] = useState("all");
  const [family, setFamily] = useState("all");
  const [tab, setTab] = useState("all");
  const [draftName, setDraftName] = useState("");

  const starred = new Set(favoriteIds);
  const described = formations.map((formation) => {
    const meta = formationMeta(formation.slots, {
      personnelLabel: formation.personnelLabel,
      strength: formation.strength,
    });
    return { formation, ...meta, favorite: starred.has(formation.id) };
  });

  const search = query.trim().toLowerCase();
  const hits = favoritesFirst(
    described.filter(
      (card) =>
        (tab === "all" ||
          (tab === "favorites"
            ? card.favorite
            : card.formation.family === "custom")) &&
        (personnel === "all" || card.personnelLabel === personnel) &&
        (family === "all" || card.formation.family === family) &&
        (!search ||
          `${card.formation.name} ${card.personnelLabel} ${card.strength} ${card.formation.description}`
            .toLowerCase()
            .includes(search)),
    ),
    (card) => card.favorite,
  );

  const canSave = draftName.trim().length > 0 && offensivePlayerCount > 0;
  const saveTitle =
    offensivePlayerCount > 0
      ? "Save the offense on the field as a formation"
      : "Put an offense on the field first";
  const saveHint =
    offensivePlayerCount > 0
      ? `Saves the ${offensivePlayerCount} offensive player${
          offensivePlayerCount === 1 ? "" : "s"
        } on the field — alignment, symbols and labels. Routes are not included.`
      : "Put an offense on the field first, then save it as a formation.";
  const save = () => {
    if (!canSave) return;
    onSave(draftName.trim());
    setDraftName("");
  };

  const personnelLabels = [
    ...new Set(described.map((card) => card.personnelLabel)),
  ].sort();
  const count = (matches: (card: (typeof described)[number]) => boolean) =>
    described.filter(matches).length;

  const groups = formationFamilies
    .map((group) => ({
      ...group,
      cards: hits.filter((card) => card.formation.family === group.key),
    }))
    .filter((group) => group.cards.length > 0);

  return (
    <div
      className="overlay browser-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-label="Formations"
        className="browser"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="browser-head">
          <div className="browser-title">Formations</div>
          <input
            aria-label="Search formations"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search — gun, trips, empty, 12…"
            spellCheck={false}
            value={query}
          />
          <BrowserTabs
            onPick={setTab}
            tabs={[
              { value: "all", name: "All" },
              { value: "favorites", name: "Favorites" },
              { value: "custom", name: "Mine" },
            ]}
            value={tab}
          />
          <button
            className="browser-close"
            onClick={onClose}
            title="Close — esc"
            type="button"
          >
            ×
          </button>
        </div>
        <div className="browser-filter">
          <span>Personnel</span>
          <Chips
            choices={[
              {
                value: "all",
                name: "All",
                title: "Every formation",
              },
              ...personnelLabels.map((label) => {
                const total = count((card) => card.personnelLabel === label);
                return {
                  value: label,
                  name: label,
                  title: `${label} personnel — ${total} formation${total === 1 ? "" : "s"}`,
                };
              }),
            ]}
            onPick={setPersonnel}
            value={personnel}
          />
        </div>
        <div className="browser-filter">
          <span>Set</span>
          <Chips
            choices={[
              {
                value: "all",
                name: "All",
                title: `Every set — ${described.length}`,
              },
              ...formationFamilies
                .filter((group) =>
                  described.some((card) => card.formation.family === group.key),
                )
                .map((group) => ({
                  value: group.key,
                  name: group.shortName,
                  title: `${group.name} — ${count((card) => card.formation.family === group.key)}`,
                })),
            ]}
            onPick={setFamily}
            value={family}
          />
        </div>
        <div className="browser-body">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="browser-group-head">
                <span>{group.name}</span>
                <span className="browser-count">{group.cards.length}</span>
              </div>
              <div className="browser-grid">
                {group.cards.map((card) => {
                  const shape = formationThumbnail(card.formation);
                  const onField = card.formation.id === currentFormationId;
                  return (
                    <div
                      className={`browser-card${onField ? " on-field" : ""}`}
                      key={card.formation.id}
                    >
                      <button
                        className="browser-pick"
                        onBlur={() => onPreview(undefined)}
                        onClick={() => onPick(card.formation.id)}
                        onFocus={() => onPreview(card.formation.id)}
                        onPointerEnter={() => onPreview(card.formation.id)}
                        onPointerLeave={() => onPreview(undefined)}
                        type="button"
                      >
                        <div className="browser-shape">
                          <svg role="presentation" viewBox="0 0 140 74">
                            <line
                              stroke="#E5E5E5"
                              strokeWidth={1}
                              x1={4}
                              x2={136}
                              y1={shape.lineOfScrimmage}
                              y2={shape.lineOfScrimmage}
                            />
                            {shape.dots.map((dot, index) => (
                              <circle
                                cx={dot.x}
                                cy={dot.y}
                                fill={dot.filled ? "#171717" : "#FFFFFF"}
                                key={index}
                                r={3.4}
                                stroke="#171717"
                                strokeWidth={1}
                              />
                            ))}
                          </svg>
                        </div>
                        <span className="browser-name">
                          {card.formation.name}
                        </span>
                        <span className="browser-chip">
                          {card.personnelLabel} · {card.strength.toUpperCase()}
                          {onField ? <em>ON FIELD</em> : null}
                        </span>
                      </button>
                      <FavoriteStar
                        favorite={card.favorite}
                        onToggle={() => onToggleFavorite(card.formation.id)}
                      />
                      {card.formation.family === "custom" ? (
                        <button
                          aria-label={`Remove ${card.formation.name}`}
                          className="browser-remove"
                          onClick={() => onRemove(card.formation.id)}
                          title="Remove this formation"
                          type="button"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {groups.length === 0 ? (
            <p className="browser-empty">
              {tab === "favorites"
                ? "No favorites yet — star a formation to keep it here."
                : tab === "custom"
                  ? "Nothing saved yet. Set an offense on the field and save it below."
                  : "Nothing matches that search and personnel."}
            </p>
          ) : null}
        </div>
        <div className="browser-foot save-foot">
          <input
            aria-label="Save the offense on the field as"
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              save();
            }}
            placeholder="Save the offense on the field as…"
            spellCheck={false}
            value={draftName}
          />
          <button
            className="browser-save"
            disabled={!canSave}
            onClick={save}
            title={saveTitle}
            type="button"
          >
            Save
          </button>
          <span>{saveHint}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * A card for a call carries the front and the secondary in their real
 * relationship, and with assignments on it shows the very lines that will
 * land on the field — so a Coach knows the call at a glance rather than by
 * its name. The arithmetic is the original's own, in the frame it measured in.
 */
function defenseThumbnail(
  call: DefensiveCall,
  withAssignments: boolean,
): {
  readonly defenders: readonly { x: number; y: number }[];
  readonly line: readonly { x: number; y: number }[];
  readonly art: readonly { points: string; stroke: string; dash?: string }[];
  readonly areas: readonly {
    x: number;
    y: number;
    radiusX: number;
    radiusY: number;
    fill: string;
  }[];
  readonly lineOfScrimmage: number;
} {
  const drawn = call.formation.slots.map((slot) =>
    yardsToLegacyCanvas(slot.position),
  );
  const xs = drawn.map(({ x }) => x);
  const ys = drawn.map(({ y }) => y);
  const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
  const spanX = Math.max(760, Math.max(...xs) - Math.min(...xs) + 90);
  const scaleX = 172 / spanX;
  const top = Math.min(...ys) - 22;
  const spanY = Math.max(230, Math.max(...ys) - top + 26);
  const scaleY = Math.min(scaleX * 1.15, 84 / spanY);
  const across = (x: number) => 90 + (x - middle) * scaleX;
  const down = (y: number) => 12 + (y - top) * scaleY;

  const crowd = new Map<number, number>();
  for (const y of ys) crowd.set(y, (crowd.get(y) ?? 0) + 1);
  // Ties go to the deeper row here, where a formation card takes the shallower
  // one: a defensive front stands off the ball, not on it.
  const busiest = [...crowd.entries()].sort(
    (left, right) => right[1] - left[1] || right[0] - left[0],
  )[0]![0];

  const strokes: Record<DefensiveAssignment["kind"], [string, string?]> = {
    drop: ["#0072F5", "2 2"],
    man: ["#0072F5", "1 2"],
    blitz: ["#E5484D", undefined],
  };
  const art = withAssignments
    ? call.assignments.map((assignment) => {
        const [stroke, dash] = strokes[assignment.kind];
        return {
          points: assignment.points
            .map((point) => {
              const at = yardsToLegacyCanvas(point);
              return `${across(at.x)},${down(at.y)}`;
            })
            .join(" "),
          stroke,
          ...(dash === undefined ? {} : { dash }),
        };
      })
    : [];

  const areas = withAssignments
    ? call.assignments.flatMap((assignment) => {
        if (assignment.kind !== "drop") return [];
        const end = assignment.points.at(-1)!;
        const area = coverageForDrop(end);
        const at = yardsToLegacyCanvas(end);
        return [
          {
            x: across(at.x),
            y: down(at.y),
            radiusX:
              area.radiusLateralYards *
              LEGACY_FIELD_GEOMETRY.lateralPixelsPerYard *
              scaleX,
            radiusY:
              area.radiusDepthYards *
              LEGACY_FIELD_GEOMETRY.depthPixelsPerYard *
              scaleY,
            fill: coverageFills[area.type],
          },
        ];
      })
    : [];

  return {
    defenders: drawn.map(({ x, y }) => ({ x: across(x), y: down(y) })),
    // The offense it is lined up against, drawn faintly, because a front only
    // means anything relative to the blockers in front of it.
    line: [428, 464, 500, 536, 572].map((x) => ({
      x: across(x),
      y: down(busiest + 44),
    })),
    art,
    areas,
    lineOfScrimmage: down(busiest + 30),
  };
}

/**
 * The book of calls. A defense is a front and a coverage — that is how it is
 * called, and how it is found — so those are the two ways of narrowing it.
 */
export function DefenseBrowser({
  calls,
  currentCallId,
  favoriteIds,
  onClose,
  onPick,
  onPreview,
  onToggleAssignments,
  onToggleFavorite,
  withAssignments,
}: {
  calls: readonly DefensiveCall[];
  currentCallId?: string;
  favoriteIds: readonly string[];
  onClose: () => void;
  onPick: (callId: string) => void;
  onPreview: (callId?: string) => void;
  onToggleAssignments: () => void;
  onToggleFavorite: (callId: string) => void;
  withAssignments: boolean;
}) {
  const [query, setQuery] = useState("");
  const [front, setFront] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const [tab, setTab] = useState("all");

  const starred = new Set(favoriteIds);
  const search = query.trim().toLowerCase();
  const hits = favoritesFirst(
    calls.filter(
      (call) =>
        (tab === "all" || starred.has(call.formation.id)) &&
        (front === "all" || call.front === front) &&
        (coverage === "all" || call.coverage === coverage) &&
        (!search ||
          `${call.formation.name} ${call.formation.description} ${call.front} ${call.coverage}`
            .toLowerCase()
            .includes(search)),
    ),
    (call) => starred.has(call.formation.id),
  );

  const coverages = [...new Set(calls.map((call) => call.coverage))].sort();
  // With one front picked the useful heading is the coverage, not the front
  // again.
  const groups = (
    front === "all"
      ? defensiveFronts.map((key) => ({
          key,
          name: `${key} front`,
          cards: hits.filter((call) => call.front === key),
        }))
      : coverages.map((key) => ({
          key,
          name: key,
          cards: hits.filter((call) => call.coverage === key),
        }))
  ).filter((group) => group.cards.length > 0);

  return (
    <div
      className="overlay browser-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-label="Defenses"
        className="browser"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="browser-head">
          <div className="browser-title">Defenses</div>
          <input
            aria-label="Search defenses"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search — cover 3, nickel, blitz…"
            spellCheck={false}
            value={query}
          />
          <BrowserTabs
            onPick={setTab}
            tabs={[
              { value: "all", name: "All" },
              { value: "favorites", name: "Favorites" },
            ]}
            value={tab}
          />
          <button
            className="browser-close"
            onClick={onClose}
            title="Close — esc"
            type="button"
          >
            ×
          </button>
        </div>
        <div className="browser-filter">
          <span>Front</span>
          <Chips
            choices={[
              {
                value: "all",
                name: "All",
                title: `Every front — ${calls.length}`,
              },
              ...defensiveFronts
                .filter((key) => calls.some((call) => call.front === key))
                .map((key) => {
                  const total = calls.filter(
                    (call) => call.front === key,
                  ).length;
                  return {
                    value: key,
                    name: key,
                    title: `${key} front — ${total} call${total === 1 ? "" : "s"}`,
                  };
                }),
            ]}
            onPick={setFront}
            value={front}
          />
        </div>
        <div className="browser-filter">
          <span>Coverage</span>
          <Chips
            choices={[
              { value: "all", name: "All", title: "Every call" },
              ...coverages.map((key) => {
                const total = calls.filter(
                  (call) => call.coverage === key,
                ).length;
                return {
                  value: key,
                  name: key,
                  title: `${key} — ${total} call${total === 1 ? "" : "s"}`,
                };
              }),
            ]}
            onPick={setCoverage}
            value={coverage}
          />
        </div>
        <div className="browser-body">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="browser-group-head">
                <span>{group.name}</span>
                <span className="browser-count">{group.cards.length}</span>
              </div>
              <div className="browser-grid three">
                {group.cards.map((call) => {
                  const shape = defenseThumbnail(call, withAssignments);
                  const onField = call.formation.id === currentCallId;
                  return (
                    <div
                      className={`browser-card${onField ? " on-field" : ""}`}
                      key={call.formation.id}
                    >
                      <button
                        className="browser-pick"
                        onBlur={() => onPreview(undefined)}
                        onClick={() => onPick(call.formation.id)}
                        onFocus={() => onPreview(call.formation.id)}
                        onPointerEnter={() => onPreview(call.formation.id)}
                        onPointerLeave={() => onPreview(undefined)}
                        type="button"
                      >
                        <div className="browser-shape">
                          <svg role="presentation" viewBox="0 0 180 96">
                            <line
                              stroke="#E5E5E5"
                              strokeWidth={1}
                              x1={4}
                              x2={176}
                              y1={shape.lineOfScrimmage}
                              y2={shape.lineOfScrimmage}
                            />
                            {shape.line.map((dot, index) => (
                              <circle
                                cx={dot.x}
                                cy={dot.y}
                                fill="#FFFFFF"
                                key={index}
                                r={3}
                                stroke="#D4D4D4"
                                strokeWidth={1}
                              />
                            ))}
                            {shape.art.map((stroke, index) => (
                              <polyline
                                fill="none"
                                key={index}
                                points={stroke.points}
                                stroke={stroke.stroke}
                                strokeDasharray={stroke.dash}
                                strokeWidth={1.2}
                              />
                            ))}
                            {shape.areas.map((area, index) => (
                              <g key={index}>
                                <ellipse
                                  cx={area.x}
                                  cy={area.y}
                                  fill={area.fill}
                                  opacity={0.26}
                                  rx={area.radiusX}
                                  ry={area.radiusY}
                                />
                                <ellipse
                                  cx={area.x}
                                  cy={area.y}
                                  fill="none"
                                  rx={area.radiusX}
                                  ry={area.radiusY}
                                  stroke={area.fill}
                                  strokeDasharray="2.5 2"
                                  strokeWidth={1.2}
                                />
                              </g>
                            ))}
                            {shape.defenders.map((dot, index) => (
                              <circle
                                cx={dot.x}
                                cy={dot.y}
                                fill="#171717"
                                key={index}
                                r={4.6}
                              />
                            ))}
                          </svg>
                        </div>
                        <span className="browser-name">
                          {call.formation.name}
                        </span>
                        <span className="browser-chip">
                          {call.formation.slots.length} men ·{" "}
                          {call.formation.description}
                          {onField ? <em>ON FIELD</em> : null}
                        </span>
                      </button>
                      <FavoriteStar
                        favorite={starred.has(call.formation.id)}
                        onToggle={() => onToggleFavorite(call.formation.id)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {groups.length === 0 ? (
            <p className="browser-empty">
              {tab === "favorites"
                ? "No favorites yet — star a call to keep it here."
                : "No defense matches that."}
            </p>
          ) : null}
        </div>
        <div className="browser-foot">
          <button
            aria-pressed={withAssignments}
            className={`browser-toggle${withAssignments ? " on" : ""}`}
            onClick={onToggleAssignments}
            title="Bring the coverage drops and blitz paths in with the alignment"
            type="button"
          >
            <span aria-hidden="true">{withAssignments ? "✓" : ""}</span>
            <span>With assignments</span>
          </button>
          <span>
            {withAssignments
              ? "Brings the call’s dashed zone drops and red blitz paths in with the alignment."
              : "Just the front and secondary — letter symbols only, so you can draw your own coverage on top."}
          </span>
        </div>
      </div>
    </div>
  );
}
