import {
  UNCLASSIFIED_PLAY_TYPE_NAME,
  describeReclassifyDrops,
  formatClassification,
  playTypesForUnit,
  playUnits,
  reclassifyPlay,
  unitName,
  type Concept,
  type Formation,
  type PlayCommand,
  type PlayDocument,
  type PlayTypeDefinition,
  type PlayUnit,
  type Playbook,
  type ReclassifyPlan,
} from "@chalk/domain";
import { useState } from "react";

export type AddPlayTypeOutcome =
  | { readonly ok: true; readonly playType: PlayTypeDefinition }
  | { readonly ok: false; readonly reason: string };

/**
 * The header pill that says what the open Play is — Unit, and the Type
 * inside it — bound to the document rather than to a default. The original
 * drew a flat `<select>` seeded with Pass that never wrote back; this reads
 * the Play, writes through a domain command, and so takes part in undo,
 * local save, search, and every print that names a category.
 *
 * Changing the Type inside a Unit is one step. Changing the Unit is one step
 * too, unless it would let go of a Type, Concept or Formation from the old
 * Unit — then the pill names exactly what would be dropped and waits for the
 * Coach to say so. The diagram never changes either way.
 */
export function PlayClassificationControl({
  concepts,
  formations,
  onAddPlayType,
  onApply,
  onDismiss,
  onToggle,
  open,
  play,
  playbook,
}: {
  concepts: readonly Concept[];
  formations: readonly Formation[];
  onAddPlayType: (name: string, unit: PlayUnit) => Promise<AddPlayTypeOutcome>;
  onApply: (command: PlayCommand) => void;
  onDismiss: () => void;
  onToggle: () => void;
  open: boolean;
  play: PlayDocument;
  playbook: Playbook;
}) {
  const label = formatClassification(play);
  return (
    <div className="menu classify-menu">
      <button
        aria-expanded={open}
        aria-label="Play type"
        className={`play-type${open ? " open" : ""}`}
        onClick={onToggle}
        title="Unit and type — what this play is filed as"
        type="button"
      >
        <i />
        <span>{label}</span>
      </button>
      {open ? (
        <ClassificationPanel
          concepts={concepts}
          formations={formations}
          onAddPlayType={onAddPlayType}
          onApply={onApply}
          onDismiss={onDismiss}
          play={play}
          playbook={playbook}
        />
      ) : null}
    </div>
  );
}

function ClassificationPanel({
  concepts,
  formations,
  onAddPlayType,
  onApply,
  onDismiss,
  play,
  playbook,
}: {
  concepts: readonly Concept[];
  formations: readonly Formation[];
  onAddPlayType: (name: string, unit: PlayUnit) => Promise<AddPlayTypeOutcome>;
  onApply: (command: PlayCommand) => void;
  onDismiss: () => void;
  play: PlayDocument;
  playbook: Playbook;
}) {
  const [pending, setPending] = useState<{
    readonly unit: PlayUnit;
    readonly plan: ReclassifyPlan;
  }>();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string>();
  const context = { playTypes: playbook.playTypes, concepts, formations };
  const types = playTypesForUnit(playbook.playTypes, play.unit);
  const currentTypeId = play.playType?.id;
  // A Type the Play carries but the Playbook no longer offers — archived, or
  // from another Coach's export — still shows as what it is.
  const orphanType =
    play.playType && !types.some(({ id }) => id === currentTypeId)
      ? play.playType
      : undefined;

  const chooseUnit = (unit: PlayUnit) => {
    setNotice(undefined);
    if (unit === play.unit) {
      setPending(undefined);
      return;
    }
    const plan = reclassifyPlay(
      play,
      { unit, ...(play.playType ? { playType: play.playType } : {}) },
      context,
    );
    if (!plan) return;
    if (plan.needsConfirmation) {
      setPending({ unit, plan });
      return;
    }
    onApply(plan.command);
  };

  const chooseType = (playType: PlayTypeDefinition | undefined) => {
    setNotice(undefined);
    const plan = reclassifyPlay(
      play,
      {
        unit: play.unit,
        ...(playType
          ? { playType: { id: playType.id, name: playType.name } }
          : {}),
      },
      context,
    );
    if (plan) onApply(plan.command);
    onDismiss();
  };

  const addType = async () => {
    const name = draft.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const outcome = await onAddPlayType(name, play.unit);
      if (!outcome.ok) {
        setNotice(outcome.reason);
        return;
      }
      setDraft("");
      chooseType(outcome.playType);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      aria-label="Play classification"
      className="menu-panel classify-panel"
      role="group"
    >
      <div className="menu-head">UNIT</div>
      <div className="segments classify-units" role="group" aria-label="Unit">
        {playUnits.map((choice) => {
          const on = (pending?.unit ?? play.unit) === choice.id;
          return (
            <button
              aria-pressed={on}
              className={on ? "active" : undefined}
              key={choice.id}
              onClick={() => chooseUnit(choice.id)}
              type="button"
            >
              {choice.name}
            </button>
          );
        })}
      </div>
      {pending ? (
        <div className="classify-confirm" role="alert">
          <p className="menu-hint">
            {describeReclassifyDrops(pending.plan.drops, pending.unit)}
          </p>
          <div className="classify-confirm-row">
            <button
              className="menu-primary"
              onClick={() => {
                onApply(pending.plan.command);
                setPending(undefined);
              }}
              type="button"
            >
              Move to {unitName(pending.unit)}
            </button>
            <button
              className="quiet"
              onClick={() => setPending(undefined)}
              type="button"
            >
              Keep {unitName(play.unit)}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="menu-head">TYPE</div>
          <div className="classify-types" role="group" aria-label="Type">
            <button
              aria-pressed={currentTypeId === undefined}
              className={`menu-item${currentTypeId === undefined ? " active" : ""}`}
              onClick={() => chooseType(undefined)}
              title="Leave the play at its unit with no type"
              type="button"
            >
              <span className="menu-item-name">
                {UNCLASSIFIED_PLAY_TYPE_NAME}
              </span>
            </button>
            {types.map((definition) => (
              <button
                aria-pressed={definition.id === currentTypeId}
                className={`menu-item${definition.id === currentTypeId ? " active" : ""}`}
                key={definition.id}
                onClick={() => chooseType(definition)}
                type="button"
              >
                <span className="menu-item-name">{definition.name}</span>
              </button>
            ))}
            {orphanType ? (
              <button
                aria-pressed
                className="menu-item active"
                title="A type this Playbook no longer offers — the play keeps it until you choose another"
                type="button"
              >
                <span className="menu-item-name">{orphanType.name}</span>
              </button>
            ) : null}
          </div>
          <form
            className="classify-add"
            onSubmit={(event) => {
              event.preventDefault();
              void addType();
            }}
          >
            <input
              aria-label={`New ${unitName(play.unit).toLowerCase()} type`}
              disabled={adding}
              onChange={(event) => {
                setDraft(event.target.value);
                setNotice(undefined);
              }}
              placeholder="New type…"
              spellCheck={false}
              value={draft}
            />
            <button disabled={adding || !draft.trim()} type="submit">
              Add
            </button>
          </form>
          {notice ? (
            <p className="menu-hint classify-notice" role="status">
              {notice}
            </p>
          ) : null}
          <p className="menu-hint">
            Formation, personnel and situation stay their own — this is only
            what the play is filed as.
          </p>
        </>
      )}
    </div>
  );
}
