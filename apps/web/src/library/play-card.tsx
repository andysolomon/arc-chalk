import { CLASSIFICATION_SEPARATOR, type PlayDocument } from "@chalk/domain";
import type { PlaySearchProjection } from "@chalk/local-db";
import {
  buildRenderScene,
  buildSvgRenderScene,
  defaultPresentation,
  type Presentation,
} from "@chalk/render";
import { useEffect, useMemo, useState } from "react";

import type { ChalkLibrary } from "../app/editor-runtime";
import { playFrame } from "../components/export-diagram";
import { FieldDiagram } from "../components/field-diagram";
import { UnitBadge } from "../components/unit-badge";

export function PlayMeta({
  member,
  set,
}: {
  member: PlaySearchProjection;
  /** The set the Play stands in, where the page knows it. */
  set?: string;
}) {
  const type =
    member.playTypeId === undefined
      ? undefined
      : (member.playTypeName ?? member.playTypeId);
  return (
    <span className="playbook-card-type">
      <UnitBadge unit={member.unit} />
      {type === undefined ? "" : `${CLASSIFICATION_SEPARATOR}${type}`}
      {set ? `${CLASSIFICATION_SEPARATOR}${set}` : ""}
      {member.tags[0] && !set
        ? `${CLASSIFICATION_SEPARATOR}${member.tags[0]}`
        : ""}
    </span>
  );
}

/**
 * The Play drawn the way the editor draws it, cropped to what the Play
 * uses: read from the book, never edited here.
 */
function PlayCardDiagram({
  play,
  presentation,
}: {
  play: PlayDocument;
  presentation: Presentation;
}) {
  const scene = useMemo(
    () => buildSvgRenderScene(buildRenderScene(play, { presentation })),
    [play, presentation],
  );
  return <FieldDiagram camera={playFrame(scene)} scene={scene} />;
}

/**
 * One Play of the book, large enough to read: its art at the size of the
 * sheet, what it is, and what the Coach wrote on it. A Play selected on the
 * Playbooks page opens here rather than straight into the editor, so a book
 * can be read without leaving it; the arrows walk the Plays the page is
 * showing, and Open in editor is one press away.
 */
export function PlayCard({
  current,
  library,
  member,
  onActions,
  onClose,
  onOpen,
  onStep,
  place,
  presentation = defaultPresentation,
  set,
}: {
  current: boolean;
  library: ChalkLibrary;
  member: PlaySearchProjection;
  /** Copy, move, step or delete: the Play's sheet, where the page offers it. */
  onActions?: () => void;
  onClose: () => void;
  onOpen: () => void;
  onStep: (step: -1 | 1) => void;
  /** Where this Play is among those showing, one-based. */
  place: { readonly index: number; readonly total: number };
  presentation?: Presentation;
  set?: string;
}) {
  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly play?: PlayDocument;
  }>();
  const key = `${member.playId}:${member.documentHash}`;
  useEffect(() => {
    let cancelled = false;
    void library
      .getPlay(member.playId)
      .then((stored) => {
        if (!cancelled) setLoaded({ key, play: stored?.document });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key });
      });
    return () => {
      cancelled = true;
    };
  }, [key, library, member.playId]);
  const play = loaded?.key === key ? loaded.play : undefined;
  const waiting = loaded?.key !== key;
  const first = place.index <= 1;
  const last = place.index >= place.total;

  return (
    <div className="play-card-backdrop" onClick={onClose} role="presentation">
      <div
        aria-label={member.name}
        aria-modal="true"
        className="play-card"
        data-play-id={member.playId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // The page's Escape goes back to the editor; here it only closes.
          if (event.key === "Escape") {
            event.stopPropagation();
            event.preventDefault();
            onClose();
            return;
          }
          const step =
            event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
          if (step === 0 || (step < 0 ? first : last)) return;
          event.preventDefault();
          onStep(step);
        }}
        role="dialog"
      >
        <div className="play-card-head">
          <div className="play-card-title">
            <strong>{member.name}</strong>
            <PlayMeta member={member} set={set} />
          </div>
          <button
            aria-label="Close"
            className="play-card-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="play-card-art">
          {play ? (
            <PlayCardDiagram play={play} presentation={presentation} />
          ) : (
            <span className="play-card-wait">
              {waiting ? "" : "This play could not be read on this device."}
            </span>
          )}
        </div>
        <PlayCardFacts member={member} />
        <div className="play-card-foot">
          <div aria-label="Plays" className="play-card-steps" role="group">
            <button
              aria-label="Previous play"
              disabled={first}
              onClick={() => onStep(-1)}
              title="Previous play — ←"
              type="button"
            >
              ‹
            </button>
            <span className="play-card-place">
              {place.index} of {place.total}
            </span>
            <button
              aria-label="Next play"
              disabled={last}
              onClick={() => onStep(1)}
              title="Next play — →"
              type="button"
            >
              ›
            </button>
          </div>
          {onActions ? (
            <button
              className="play-card-more"
              onClick={onActions}
              title="Copy, move or delete"
              type="button"
            >
              More…
            </button>
          ) : null}
          <button
            autoFocus
            className="play-card-open"
            onClick={onOpen}
            type="button"
          >
            {current ? "Back to the editor" : "Open in editor"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** What the book knows about the Play beyond its name: only what is set. */
function PlayCardFacts({ member }: { member: PlaySearchProjection }) {
  const notes = member.notes.trim();
  if (!member.personnelLabel && member.tags.length === 0 && !notes) {
    return null;
  }
  return (
    <div className="play-card-facts">
      {member.personnelLabel ? (
        <div className="play-card-fact">
          <span>Personnel</span>
          <strong>{member.personnelLabel}</strong>
        </div>
      ) : null}
      {member.tags.length > 0 ? (
        <div className="play-card-fact">
          <span>Tags</span>
          <span className="play-card-tags">
            {member.tags.map((tag) => (
              <span className="play-card-tag" key={tag}>
                {tag}
              </span>
            ))}
          </span>
        </div>
      ) : null}
      {notes ? <p className="play-card-notes">{notes}</p> : null}
    </div>
  );
}
