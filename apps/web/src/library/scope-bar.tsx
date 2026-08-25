import { LIBRARY_BROADCAST_CARRIES } from "@chalk/domain";

import type { BroadcastOffer } from "./use-playbook-library";

/**
 * Sits across the top of the field, where the change lands. It announces
 * itself politely rather than taking role="status", which belongs to the
 * editor's own toast: two status regions would make "the" status ambiguous,
 * and this one holds a button, which a live region should not.
 *
 * Two moods:
 * armed — every route edit is going to the other versions, with one click
 * back out; offered — an edit just stayed here and could go to them.
 */
export function ScopeBar({
  badge,
  busy,
  conceptName,
  offer,
  onAccept,
  onDismiss,
  onJustThis,
}: {
  badge?: string;
  busy: boolean;
  conceptName?: string;
  offer?: BroadcastOffer;
  onAccept: () => void;
  onDismiss: () => void;
  onJustThis: () => void;
}) {
  if (busy) {
    return (
      <div aria-atomic="true" aria-live="polite" className="scope-bar busy">
        <span>Sending to the other versions…</span>
      </div>
    );
  }
  if (badge) {
    return (
      <div aria-atomic="true" aria-live="polite" className="scope-bar armed">
        <span>
          Editing <strong>{badge.toLowerCase()} versions</strong>
          {conceptName ? ` of ${conceptName}` : ""}
          <span className="scope-bar-note"> · {LIBRARY_BROADCAST_CARRIES}</span>
        </span>
        <button onClick={onJustThis} type="button">
          Just this play
        </button>
      </div>
    );
  }
  if (offer) {
    const what =
      offer.edits === 1
        ? "Changed this play"
        : `${offer.edits} edits to this play`;
    return (
      <div aria-atomic="true" aria-live="polite" className="scope-bar offer">
        <span>{what}</span>
        <button className="primary" onClick={onAccept} type="button">
          Send to the other{" "}
          {offer.others === 1 ? "version" : `${offer.others} versions`}
        </button>
        <button aria-label="Keep it here" onClick={onDismiss} type="button">
          ×
        </button>
      </div>
    );
  }
  return null;
}
