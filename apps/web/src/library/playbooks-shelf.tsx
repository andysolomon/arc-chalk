import { playbookNameKey, tidyPlaybookName } from "@chalk/domain";
import type { PlaybookSummary } from "@chalk/local-db";
import { useState } from "react";

import { agoStamp } from "../components/ago-stamp";
import { sortShelf, type ShelfSort } from "./shelf-order";

function plays(count: number): string {
  return `${count} ${count === 1 ? "play" : "plays"}`;
}

/**
 * A name field and Save: the shelf's New playbook and a book's Rename. A
 * book is found by its name, so a name another book on this device already
 * answers to is refused rather than saved twice.
 */
export function PlaybookNameForm({
  autoFocus = false,
  className,
  initial = "",
  label,
  onCancel,
  onSave,
  placeholder,
  taken,
}: {
  autoFocus?: boolean;
  className: string;
  initial?: string;
  label: string;
  onCancel?: () => void;
  onSave: (name: string) => void | Promise<void>;
  placeholder: string;
  /** The names of the other books on this device. */
  taken: readonly string[];
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const name = tidyPlaybookName(draft);
  const clash = taken.find(
    (other) => playbookNameKey(other) === playbookNameKey(name),
  );
  const canSave =
    !saving && name.length > 0 && clash === undefined && name !== initial;
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(name);
      setDraft(initial === "" ? "" : name);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      aria-label={label}
      className={`playbook-name-form ${className}`}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <input
        aria-describedby={clash ? `${className}-clash` : undefined}
        aria-invalid={clash !== undefined}
        aria-label={label}
        autoFocus={autoFocus}
        maxLength={80}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !onCancel) return;
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }}
        placeholder={placeholder}
        spellCheck={false}
        type="text"
        value={draft}
      />
      <button className="playbook-name-save" disabled={!canSave} type="submit">
        Save
      </button>
      {onCancel ? (
        <button
          className="playbook-name-cancel"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      ) : null}
      {clash ? (
        <span className="playbook-name-clash" id={`${className}-clash`}>
          {clash} is already on this device.
        </span>
      ) : null}
    </form>
  );
}

/** What the shelf can do with a book beyond opening it (issue #166). */
export interface ShelfActions {
  readonly onRename: (playbookId: string, name: string) => Promise<void>;
  readonly onDuplicate: (playbookId: string) => Promise<void>;
  readonly onArchive: (playbookId: string, archived: boolean) => Promise<void>;
  readonly onDelete: (playbookId: string) => Promise<void>;
}

/**
 * The shelf: every Playbook on this device, one card each, and the one that
 * is open marked as such. Chalk opens one book at a time; Open on another
 * card makes it the open one (ADR 0060). Each card says how many of its
 * Plays are offense and how many defense, and offers what else can be done
 * with the book; books put away sit under Archived until they are restored.
 */
export function PlaybooksShelf({
  actions,
  currentPlaybookId,
  now = () => Date.now(),
  onCreate,
  onOpen,
  onSort,
  playbooks,
  savedFronts,
  savedSets,
  sort,
}: {
  actions: ShelfActions;
  currentPlaybookId: string;
  now?: () => number;
  /** Saves a new, empty book under the name given and opens it. */
  onCreate: (name: string) => Promise<void>;
  onOpen: (playbookId: string) => void;
  onSort: (sort: ShelfSort) => void;
  playbooks: readonly PlaybookSummary[];
  /** The sets and the fronts the Coach saved into the open book. */
  savedSets: number;
  savedFronts: number;
  sort: ShelfSort;
}) {
  const [actionsFor, setActionsFor] = useState<string>();
  const [showArchived, setShowArchived] = useState(false);
  const sorted = sortShelf(playbooks, sort);
  const live = sorted.filter(({ archivedAtMs }) => archivedAtMs === undefined);
  const archived = sorted.filter(
    ({ archivedAtMs }) => archivedAtMs !== undefined,
  );
  const acting = playbooks.find(({ id }) => id === actionsFor);

  const card = (book: PlaybookSummary) => {
    const open = book.id === currentPlaybookId;
    const away = book.archivedAtMs !== undefined;
    return (
      <div
        className={`shelf-card${open ? " open" : ""}${away ? " archived" : ""}`}
        data-playbook-id={book.id}
        key={book.id}
      >
        <div className="shelf-spine" aria-hidden="true" />
        <div className="shelf-text">
          <strong>{book.name}</strong>
          <span className="shelf-line shelf-units">
            {plays(book.playCount)}
            {book.playCount > 0
              ? ` · ${book.offenseCount} offense · ${book.defenseCount} defense`
              : ""}
          </span>
          <span className="shelf-line">
            {open && savedSets > 0
              ? `${savedSets} saved ${savedSets === 1 ? "set" : "sets"} · `
              : ""}
            {open && savedFronts > 0
              ? `${savedFronts} saved ${savedFronts === 1 ? "front" : "fronts"} · `
              : ""}
            {away
              ? `Archived ${agoStamp(book.archivedAtMs ?? book.updatedAtMs, now())}`
              : `Edited ${agoStamp(book.updatedAtMs, now())}`}
          </span>
        </div>
        <div className="shelf-buttons">
          {away ? (
            <button
              aria-label={`Restore ${book.name}`}
              className="shelf-open"
              onClick={() => void actions.onArchive(book.id, false)}
              type="button"
            >
              Restore
            </button>
          ) : (
            <button
              aria-label={`Open ${book.name}`}
              className="shelf-open"
              onClick={() => onOpen(book.id)}
              type="button"
            >
              {open ? "Open" : "Open this book"}
            </button>
          )}
          <button
            aria-haspopup="dialog"
            aria-label={`Actions for ${book.name}`}
            className="shelf-more"
            onClick={() => setActionsFor(book.id)}
            title="Rename, duplicate, archive or delete"
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16">
              <circle cx="3" cy="8" r="1.4" />
              <circle cx="8" cy="8" r="1.4" />
              <circle cx="13" cy="8" r="1.4" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div aria-label="Playbooks" className="shelf" role="region">
      <div className="shelf-head">
        <PlaybookNameForm
          className="shelf-new"
          label="New playbook name"
          onSave={onCreate}
          placeholder="Name a new playbook…"
          taken={playbooks.map(({ name }) => name)}
        />
        <label className="playbook-order shelf-sort">
          <span>Sort</span>
          <select
            aria-label="Sort playbooks"
            onChange={(event) => onSort(event.target.value as ShelfSort)}
            value={sort}
          >
            <option value="recent">Recently edited</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      {live.length === 0 && archived.length === 0 ? (
        <div className="playbook-none">
          <strong>No playbooks yet</strong>
          <span>Start a play and it opens a Playbook of its own.</span>
        </div>
      ) : (
        <div className="shelf-grid">{live.map(card)}</div>
      )}
      {archived.length > 0 ? (
        <section aria-label="Archived playbooks" className="shelf-archived">
          <button
            aria-expanded={showArchived}
            className="shelf-archived-toggle"
            onClick={() => setShowArchived((shown) => !shown)}
            type="button"
          >
            <span>Archived</span>
            <span className="browser-count">{archived.length}</span>
          </button>
          {showArchived ? (
            <div className="shelf-grid">{archived.map(card)}</div>
          ) : null}
        </section>
      ) : null}
      {acting ? (
        <ShelfSheet
          actions={actions}
          book={acting}
          key={acting.id}
          lastOnShelf={
            acting.archivedAtMs === undefined &&
            live.filter(({ id }) => id !== acting.id).length === 0
          }
          onClose={() => setActionsFor(undefined)}
          taken={playbooks
            .filter(({ id }) => id !== acting.id)
            .map(({ name }) => name)}
        />
      ) : null}
    </div>
  );
}

/**
 * What can be done with one book: rename it, duplicate it, put it away or
 * bring it back, or delete it — which asks once more, and says what goes
 * with it. The only book left on the shelf stays; a Coach always has one
 * open.
 */
function ShelfSheet({
  actions,
  book,
  lastOnShelf,
  onClose,
  taken,
}: {
  actions: ShelfActions;
  book: PlaybookSummary;
  lastOnShelf: boolean;
  onClose: () => void;
  taken: readonly string[];
}) {
  const [step, setStep] = useState<"menu" | "rename" | "delete">("menu");
  const [busy, setBusy] = useState(false);
  const away = book.archivedAtMs !== undefined;
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="play-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        aria-label={book.name}
        aria-modal="true"
        className="play-sheet"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          if (step === "menu") onClose();
          else setStep("menu");
        }}
        role="dialog"
      >
        <div className="play-sheet-head">
          <strong>
            {step === "delete" ? `Delete “${book.name}”?` : book.name}
          </strong>
          <span>
            {step === "delete"
              ? book.playCount > 0
                ? `Its ${plays(book.playCount)} go to the Trash, and its game plans and saved sets are removed with it. This can’t be undone.`
                : "Its game plans and saved sets are removed with it. This can’t be undone."
              : `${plays(book.playCount)} · ${book.offenseCount} offense · ${book.defenseCount} defense`}
          </span>
        </div>
        {step === "rename" ? (
          <PlaybookNameForm
            autoFocus
            className="shelf-rename"
            initial={book.name}
            label="Playbook name"
            onCancel={() => setStep("menu")}
            onSave={(name) => run(() => actions.onRename(book.id, name))}
            placeholder="Name this playbook…"
            taken={taken}
          />
        ) : step === "delete" ? (
          <div className="play-sheet-actions">
            <button
              autoFocus
              className="play-sheet-danger"
              disabled={busy}
              onClick={() => void run(() => actions.onDelete(book.id))}
              type="button"
            >
              Delete playbook
            </button>
            <button onClick={() => setStep("menu")} type="button">
              Keep it
            </button>
          </div>
        ) : (
          <div className="play-sheet-actions">
            <button autoFocus onClick={() => setStep("rename")} type="button">
              Rename…
            </button>
            <button
              disabled={busy}
              onClick={() => void run(() => actions.onDuplicate(book.id))}
              type="button"
            >
              Duplicate
            </button>
            <button
              disabled={busy || lastOnShelf}
              onClick={() => void run(() => actions.onArchive(book.id, !away))}
              title={
                lastOnShelf
                  ? "The only playbook on the shelf stays — make another first"
                  : undefined
              }
              type="button"
            >
              {away ? "Restore to the shelf" : "Archive"}
            </button>
            <button
              className="play-sheet-danger"
              disabled={busy || lastOnShelf}
              onClick={() => setStep("delete")}
              title={
                lastOnShelf
                  ? "The only playbook on the shelf stays — make another first"
                  : undefined
              }
              type="button"
            >
              Delete…
            </button>
            {lastOnShelf ? (
              <p className="menu-hint">
                The only playbook on the shelf stays. Make another to archive or
                delete this one.
              </p>
            ) : null}
            <button onClick={onClose} type="button">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
