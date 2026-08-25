import {
  buildLibraryTree,
  libraryDisclosureDefault,
  libraryScopeHint,
  libraryScopeTargets,
  type LibraryConceptRow,
  type LibraryEditScope,
} from "@chalk/domain";
import { useEffect, useMemo, useState } from "react";

import type { LibrarySnapshot } from "../app/editor-runtime";
import { membersToRows } from "./library-actions";

export function LibraryPanel({
  currentPlayId,
  onBrowse,
  onCancelVariation,
  onCommitVariation,
  onDelete,
  onDetach,
  onLoad,
  onNoteCommit,
  onPush,
  onSave,
  onScope,
  onStartVariation,
  onToggleOpen,
  onTogglePick,
  onVariationDraft,
  pickIds,
  report,
  savedFlash,
  scope,
  snapshot,
  storedOpen,
  variationDraft,
  variationOpen,
}: {
  currentPlayId: string;
  onBrowse: () => void;
  onCancelVariation: () => void;
  onCommitVariation: () => void;
  onDelete: (playId: string, confirm: boolean) => void;
  onDetach: (playId: string) => void;
  onLoad: (playId: string) => void;
  onNoteCommit: (conceptId: string, notes: string, tags: string) => void;
  onPush: (conceptId: string) => void;
  onSave: () => void;
  onScope: (scope: LibraryEditScope) => void;
  onStartVariation: () => void;
  onToggleOpen: (conceptId: string) => void;
  onTogglePick: (playId: string) => void;
  onVariationDraft: (value: string) => void;
  pickIds: readonly string[];
  report?: string;
  savedFlash: boolean;
  scope: LibraryEditScope;
  snapshot: LibrarySnapshot;
  storedOpen: Readonly<Record<string, boolean>>;
  variationDraft: string;
  variationOpen: boolean;
}) {
  const [hoverId, setHoverId] = useState<string>();
  const [armedId, setArmedId] = useState<string>();
  const [noteConceptId, setNoteConceptId] = useState<string>();
  const members = useMemo(
    () => membersToRows(snapshot.members),
    [snapshot.members],
  );
  const tree = useMemo(
    () => buildLibraryTree(members, snapshot.concepts),
    [members, snapshot.concepts],
  );
  const current = members.find((member) => member.playId === currentPlayId);
  const family = members.filter((member) =>
    current?.conceptId
      ? member.conceptId === current.conceptId
      : member.playId === currentPlayId,
  );
  const targets = libraryScopeTargets(scope, currentPlayId, family, pickIds);
  const hint = libraryScopeHint(
    scope,
    targets.length,
    family.length,
    current !== undefined,
  );
  const noteConcept = snapshot.concepts.find(({ id }) => id === noteConceptId);
  const targetIds = new Set(targets.map((member) => member.playId));
  const familyIds = new Set(family.map((member) => member.playId));

  useEffect(() => {
    if (!armedId) return undefined;
    const timer = window.setTimeout(() => setArmedId(undefined), 6_000);
    return () => window.clearTimeout(timer);
  }, [armedId]);

  return (
    <section className="inspector-section library-panel">
      <div className="section-heading library-heading">
        <span>
          Library
          {snapshot.members.length ? ` · ${snapshot.members.length}` : ""}
        </span>
        <span>
          <button
            onClick={onSave}
            title="Update the play you have open"
            type="button"
          >
            {savedFlash ? "Saved" : "Save"}
          </button>
          <button
            className="link-button"
            onClick={onStartVariation}
            title="Keep what is on the field as another version of this concept"
            type="button"
          >
            + Variation
          </button>
        </span>
      </div>
      <div className="scope-line">
        <span className="scope-label">Applies to</span>
        <div className="segments scope">
          <button
            className={scope === "play" ? "active" : undefined}
            onClick={() => onScope("play")}
            type="button"
          >
            This play
          </button>
          <button
            className={scope === "concept" ? "active" : undefined}
            disabled={family.length < 2}
            onClick={() => onScope("concept")}
            title="Tap a dot in the list below to narrow it down"
            type="button"
          >
            {family.length > 1
              ? `All ${family.length} versions`
              : "All versions"}
          </button>
        </div>
      </div>
      <p>{hint}</p>
      {report ? <p className="library-report">{report}</p> : null}
      {noteConcept ? (
        <NoteFields
          notes={noteConcept.notes}
          onCancel={() => setNoteConceptId(undefined)}
          onCommit={(notes, tags) => {
            onNoteCommit(noteConcept.id, notes, tags);
            setNoteConceptId(undefined);
          }}
          tags={noteConcept.tags.join(", ")}
        />
      ) : null}
      {variationOpen ? (
        <input
          aria-label="Variation name"
          autoFocus
          className="library-inline"
          onBlur={onCancelVariation}
          onChange={(event) => onVariationDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommitVariation();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancelVariation();
            }
          }}
          placeholder="What tells it apart — Gun Trips Right"
          spellCheck={false}
          value={variationDraft}
        />
      ) : null}
      {tree.length > 0 ? (
        <div className="library-tree">
          {tree.map((row) => (
            <ConceptBlock
              armedId={armedId}
              currentPlayId={currentPlayId}
              hoverId={hoverId}
              key={row.key}
              onArm={setArmedId}
              onDelete={onDelete}
              onDetach={onDetach}
              onHover={setHoverId}
              onLoad={onLoad}
              onNote={(conceptId) => setNoteConceptId(conceptId)}
              onPush={onPush}
              onToggle={() => row.conceptId && onToggleOpen(row.conceptId)}
              onToggleTarget={onTogglePick}
              targetOf={(playId) =>
                playId === currentPlayId || !familyIds.has(playId)
                  ? undefined
                  : targetIds.has(playId)
              }
              open={
                row.conceptId
                  ? libraryDisclosureDefault(
                      row.conceptId,
                      current?.conceptId,
                      storedOpen,
                    )
                  : false
              }
              row={row}
            />
          ))}
        </div>
      ) : (
        <p>No saved plays yet. Name the play in the header and press Save.</p>
      )}
      <button className="library-browse" onClick={onBrowse} type="button">
        Browse Playbook
      </button>
    </section>
  );
}

function NoteFields({
  notes,
  onCancel,
  onCommit,
  tags,
}: {
  notes: string;
  onCancel: () => void;
  onCommit: (notes: string, tags: string) => void;
  tags: string;
}) {
  const [noteDraft, setNoteDraft] = useState(notes);
  const [tagDraft, setTagDraft] = useState(tags);
  const commit = () => onCommit(noteDraft, tagDraft);
  return (
    <div className="library-note">
      <input
        aria-label="Concept note"
        autoFocus
        onBlur={commit}
        onChange={(event) => setNoteDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder="What this concept is for"
        spellCheck={false}
        value={noteDraft}
      />
      <input
        aria-label="Concept tags"
        onBlur={commit}
        onChange={(event) => setTagDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder="Tags — 3rd down, red zone"
        spellCheck={false}
        value={tagDraft}
      />
    </div>
  );
}

function ConceptBlock({
  armedId,
  currentPlayId,
  hoverId,
  onArm,
  onDelete,
  onDetach,
  onHover,
  onLoad,
  onNote,
  onPush,
  onToggle,
  onToggleTarget,
  open,
  row,
  targetOf,
}: {
  armedId?: string;
  currentPlayId: string;
  hoverId?: string;
  onArm: (playId?: string) => void;
  onDelete: (playId: string, confirm: boolean) => void;
  onDetach: (playId: string) => void;
  onHover: (playId?: string) => void;
  onLoad: (playId: string) => void;
  onNote: (conceptId: string | undefined) => void;
  onPush: (conceptId: string) => void;
  onToggle: () => void;
  onToggleTarget: (playId: string) => void;
  open: boolean;
  row: LibraryConceptRow;
  /** Whether edits land on this play too; undefined when it is not a sibling of the open play. */
  targetOf: (playId: string) => boolean | undefined;
}) {
  const current = currentPlayId === row.head.playId;
  const hovering = hoverId === row.head.playId;
  const armed = armedId === row.head.playId;
  return (
    <div>
      <div
        className={`library-row${current ? " current" : ""}`}
        onBlur={() => onHover(undefined)}
        onClick={() => onLoad(row.head.playId)}
        onFocus={() => onHover(row.head.playId)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onLoad(row.head.playId);
          }
        }}
        onMouseEnter={() => onHover(row.head.playId)}
        onMouseLeave={() => onHover(undefined)}
        role="button"
        tabIndex={0}
      >
        <button
          className="library-caret"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          title="Show the versions of this concept"
          type="button"
        >
          {row.variations.length ? (open ? "▾" : "▸") : ""}
        </button>
        <TargetDot
          current={current}
          label={row.name}
          onToggle={() => onToggleTarget(row.head.playId)}
          target={targetOf(row.head.playId)}
        />
        <strong title={row.notes ? `${row.name} — ${row.notes}` : row.name}>
          {row.name}
        </strong>
        {armed ? (
          <DeleteAsk
            ask={
              row.variations.length
                ? "Delete concept — versions stay?"
                : "Delete play?"
            }
            onCancel={() => onArm(undefined)}
            onConfirm={() => onDelete(row.head.playId, true)}
          />
        ) : (
          <span className="library-row-meta">
            {hovering ? (
              <>
                {row.conceptId ? (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onNote(row.conceptId);
                    }}
                    title="A note and tags for this concept"
                    type="button"
                  >
                    note
                  </button>
                ) : null}
                {row.variations.length > 0 && row.conceptId ? (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onPush(row.conceptId!);
                    }}
                    title="Push this alignment down to its versions — their routes stay attached"
                    type="button"
                  >
                    push
                  </button>
                ) : null}
              </>
            ) : row.tags[0] ? (
              <span className="library-tag">{row.tags[0]}</span>
            ) : (
              <span>{row.playTypeName}</span>
            )}
            {row.variations.length > 0 ? (
              <span className="library-count">{row.variations.length}</span>
            ) : null}
            <button
              className="library-remove"
              onClick={(event) => {
                event.stopPropagation();
                onArm(row.head.playId);
                onDelete(row.head.playId, false);
              }}
              title={
                row.variations.length
                  ? "Delete this concept"
                  : "Delete this play"
              }
              type="button"
            >
              ×
            </button>
          </span>
        )}
      </div>
      {open && row.variations.length > 0 ? (
        <div className="library-vars">
          {row.variations.map((variation) => {
            const on = currentPlayId === variation.playId;
            const acts = hoverId === variation.playId;
            const varArmed = armedId === variation.playId;
            return (
              <div
                className={`library-row variation${on ? " current" : ""}`}
                key={variation.playId}
                onClick={() => onLoad(variation.playId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onLoad(variation.playId);
                  }
                }}
                onMouseEnter={() => onHover(variation.playId)}
                onMouseLeave={() => onHover(undefined)}
                role="button"
                tabIndex={0}
              >
                <TargetDot
                  current={on}
                  label={variation.label}
                  onToggle={() => onToggleTarget(variation.playId)}
                  small
                  target={targetOf(variation.playId)}
                />
                <span className="library-var-name">{variation.label}</span>
                {varArmed ? (
                  <DeleteAsk
                    ask="Delete variation?"
                    onCancel={() => onArm(undefined)}
                    onConfirm={() => onDelete(variation.playId, true)}
                  />
                ) : (
                  <span className="library-row-meta">
                    {acts ? (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onDetach(variation.playId);
                        }}
                        title="Make this its own concept — it keeps its full name"
                        type="button"
                      >
                        detach
                      </button>
                    ) : null}
                    <button
                      className="library-remove"
                      onClick={(event) => {
                        event.stopPropagation();
                        onArm(variation.playId);
                        onDelete(variation.playId, false);
                      }}
                      title="Delete this variation"
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The row's dot. Blue is the play that is open; for its siblings the dot is
 * a switch — filled when edits land there too, hollow when they don't.
 */
function TargetDot({
  current,
  label,
  onToggle,
  small,
  target,
}: {
  current: boolean;
  label: string;
  onToggle: () => void;
  small?: boolean;
  target: boolean | undefined;
}) {
  const size = small ? "library-dot small" : "library-dot";
  if (current) return <span className={`${size} open`} />;
  if (target === undefined) {
    return <span className={size} style={{ opacity: small ? 0 : 1 }} />;
  }
  return (
    <button
      aria-label={`${target ? "Stop sending" : "Send"} edits to ${label}`}
      aria-pressed={target}
      className={`${size} target${target ? " on" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      title={target ? "Edits land here too" : "Edits stay off this version"}
      type="button"
    />
  );
}

function DeleteAsk({
  ask,
  onCancel,
  onConfirm,
}: {
  ask: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <span className="library-delete-ask">
      <span>{ask}</span>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onConfirm();
        }}
        type="button"
      >
        Delete
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onCancel();
        }}
        type="button"
      >
        Keep
      </button>
    </span>
  );
}
