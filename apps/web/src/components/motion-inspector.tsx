import { motionCallByKey, motionCalls, type MotionAtSnap } from "@chalk/domain";
import { ROUTE_COACHING_LIMITS } from "@chalk/editor";

/**
 * The head of a line's panel (ADR 0080): whose line it is and what it is —
 * Z, Motion — and nothing else. How it is drawn and how many breaks it has
 * are on the field; a piece of it the Coach narrowed to is the one thing
 * worth saying beside it.
 */
export function LineHeading({
  onDeselect,
  owner,
  scope,
  scopeBadge,
  title,
}: {
  onDeselect: () => void;
  /** The letter of the man whose line it is. */
  owner?: string | undefined;
  /** The piece of the line the panel is narrowed to: Segment 2, Branch 1. */
  scope?: string | undefined;
  scopeBadge?: string | undefined;
  /** What the line is: Route, Alternate 1, Motion, Block, Man. */
  title: string;
}) {
  return (
    <div
      aria-label={owner ? `${owner} — ${title}` : title}
      className="section-heading label-heading route-heading"
      role="group"
    >
      <button
        aria-label="Back to the play"
        className="back-button"
        onClick={onDeselect}
        title="Back to the play — esc"
        type="button"
      >
        ←
      </button>
      {owner ? (
        <span aria-hidden="true" className="player-chip">
          {owner}
        </span>
      ) : null}
      <span className="line-title">{title}</span>
      {scopeBadge ? <span className="scope-tag">{scopeBadge}</span> : null}
      {scope ? <span className="scope-tag scope-tag-blue">{scope}</span> : null}
    </div>
  );
}

/**
 * The Motion panel (ADR 0080). A motion is not a route with a zigzag on it,
 * so it does not get the Route panel with fields taken out: it gets the
 * three things a Coach decides about a man in motion — which motion it is,
 * whether he is still moving at the snap, and a note. It is always drawn as
 * a zigzag; where it goes is dragged on the field.
 */
export function MotionInspector({
  assignment,
  atSnap,
  bare = false,
  note,
  onAssignment,
  onAssignmentCommitted,
  onAtSnap,
  onDelete,
  onDeselect,
  onNote,
  onNoteCommitted,
  onType,
  ownerLetter,
  scopeBadge,
  type,
}: {
  /**
   * Words written on the motion before this panel existed. They print on
   * the field, so they stay in view while there are any, to be cleared.
   */
  assignment: string;
  atSnap: MotionAtSnap;
  /** Without its own heading — the phone sheet's head names it instead. */
  bare?: boolean;
  note: string;
  onAssignment: (value: string) => void;
  onAssignmentCommitted: () => void;
  onAtSnap: (atSnap: MotionAtSnap) => void;
  onDelete: () => void;
  onDeselect: () => void;
  onNote: (value: string) => void;
  onNoteCommitted: () => void;
  onType: (key: string) => void;
  ownerLetter?: string | undefined;
  scopeBadge?: string | undefined;
  /** The type it was drawn as, or nothing for one drawn by hand. */
  type?: string | undefined;
}) {
  const drawnAs = motionCallByKey(type);
  return (
    <div className="label-inspector route-inspector motion-inspector">
      {bare ? null : (
        <LineHeading
          onDeselect={onDeselect}
          owner={ownerLetter}
          scopeBadge={scopeBadge}
          title="Motion"
        />
      )}
      <span className="section-heading">Type</span>
      <div aria-label="Type of motion" className="segments" role="group">
        {motionCalls.map((call) => (
          <button
            aria-pressed={drawnAs?.key === call.key}
            className={drawnAs?.key === call.key ? "active" : undefined}
            key={call.key}
            onClick={() => onType(call.key)}
            title={`${call.about} — redraws the motion from his stance`}
            type="button"
          >
            {call.name}
          </button>
        ))}
      </div>
      <p className="motion-about">
        {drawnAs
          ? `${drawnAs.about}. Drag its breaks on the field to adjust it.`
          : "Drawn by hand. Pick a type to redraw it, or drag its breaks on the field."}
      </p>
      <span className="section-heading">At the snap</span>
      <div aria-label="At the snap" className="segments" role="group">
        <button
          aria-pressed={atSnap === "moving"}
          className={atSnap === "moving" ? "active" : undefined}
          onClick={() => onAtSnap("moving")}
          title="He is still running when the ball is snapped"
          type="button"
        >
          Moving
        </button>
        <button
          aria-pressed={atSnap === "set"}
          className={atSnap === "set" ? "active" : undefined}
          onClick={() => onAtSnap("set")}
          title="He has stopped and is set before the ball is snapped"
          type="button"
        >
          Set
        </button>
      </div>
      {assignment === "" ? null : (
        <input
          aria-label="Assignment"
          maxLength={ROUTE_COACHING_LIMITS.assignment}
          onBlur={onAssignmentCommitted}
          onChange={(event) => onAssignment(event.target.value)}
          placeholder="Assignment"
          spellCheck={false}
          value={assignment}
        />
      )}
      <input
        aria-label="Coaching note"
        maxLength={ROUTE_COACHING_LIMITS.coachingNote}
        onBlur={onNoteCommitted}
        onChange={(event) => onNote(event.target.value)}
        placeholder="Note — prints beside the motion"
        spellCheck={false}
        value={note}
      />
      <div className="help-row">
        <button className="danger" onClick={onDelete} type="button">
          Remove motion
        </button>
      </div>
    </div>
  );
}
