import { unitName, type PlayUnit } from "@chalk/domain";
import type { PlaySearchProjection, PlaybookSummary } from "@chalk/local-db";
import { useState } from "react";

import { agoStamp } from "../components/ago-stamp";

function plays(count: number): string {
  return `${count} ${count === 1 ? "play" : "plays"}`;
}

/** Names are compared the way a Coach reads them: case and spacing aside. */
const sameName = (left: string, right: string) =>
  left.trim().replace(/\s+/g, " ").toLowerCase() ===
  right.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * A name field and Save: the shelf's New playbook and the open book's
 * Rename. A book is found by its name, so a name another book on this device
 * already answers to is refused rather than saved twice.
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
  const name = draft.trim().replace(/\s+/g, " ");
  const clash = taken.find((other) => sameName(other, name));
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

/**
 * The shelf: every Playbook on this device, one card each, and the one that
 * is open marked as such. Chalk opens one book at a time; Open on another
 * card makes it the open one (ADR 0060).
 */
export function PlaybooksShelf({
  currentPlaybookId,
  members,
  now = () => Date.now(),
  onCreate,
  onOpen,
  playbooks,
  savedSets,
}: {
  currentPlaybookId: string;
  /** The open book's Plays, which is where its unit counts come from. */
  members: readonly PlaySearchProjection[];
  now?: () => number;
  /** Saves a new, empty book under the name given and opens it. */
  onCreate: (name: string) => Promise<void>;
  onOpen: (playbookId: string) => void;
  playbooks: readonly PlaybookSummary[];
  /** The sets the Coach saved into the open book. */
  savedSets: number;
}) {
  const byUnit = (unit: PlayUnit) =>
    members.filter((member) => member.unit === unit).length;
  return (
    <div aria-label="Playbooks" className="shelf" role="region">
      <PlaybookNameForm
        className="shelf-new"
        label="New playbook name"
        onSave={onCreate}
        placeholder="Name a new playbook…"
        taken={playbooks.map(({ name }) => name)}
      />
      {playbooks.length === 0 ? (
        <div className="playbook-none">
          <strong>No playbooks yet</strong>
          <span>Start a play and it opens a Playbook of its own.</span>
        </div>
      ) : (
        <div className="shelf-grid">
          {playbooks.map((book) => {
            const open = book.id === currentPlaybookId;
            return (
              <div
                className={`shelf-card${open ? " open" : ""}`}
                data-playbook-id={book.id}
                key={book.id}
              >
                <div className="shelf-spine" aria-hidden="true" />
                <div className="shelf-text">
                  <strong>{book.name}</strong>
                  <span className="shelf-line">
                    {plays(book.playCount)}
                    {open
                      ? ` · ${byUnit("offense")} ${unitName("offense").toLowerCase()} · ${byUnit("defense")} ${unitName("defense").toLowerCase()}`
                      : ""}
                  </span>
                  <span className="shelf-line">
                    {open && savedSets > 0
                      ? `${savedSets} saved ${savedSets === 1 ? "set" : "sets"} · `
                      : ""}
                    Edited {agoStamp(book.updatedAtMs, now())}
                  </span>
                </div>
                <button
                  aria-label={`Open ${book.name}`}
                  className="shelf-open"
                  onClick={() => onOpen(book.id)}
                  type="button"
                >
                  {open ? "Open" : "Open this book"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
