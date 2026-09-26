import { unitName, type PlayUnit } from "@chalk/domain";
import type { PlaySearchProjection, PlaybookSummary } from "@chalk/local-db";

import { agoStamp } from "../components/ago-stamp";

function plays(count: number): string {
  return `${count} ${count === 1 ? "play" : "plays"}`;
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
  onOpen,
  playbooks,
  savedSets,
}: {
  currentPlaybookId: string;
  /** The open book's Plays, which is where its unit counts come from. */
  members: readonly PlaySearchProjection[];
  now?: () => number;
  onOpen: (playbookId: string) => void;
  playbooks: readonly PlaybookSummary[];
  /** The sets the Coach saved into the open book. */
  savedSets: number;
}) {
  const byUnit = (unit: PlayUnit) =>
    members.filter((member) => member.unit === unit).length;
  return (
    <div aria-label="Playbooks" className="shelf" role="region">
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
