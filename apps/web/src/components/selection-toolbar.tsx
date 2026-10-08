import {
  coverageCalls,
  ballPosition,
  defensivePositions,
  createStableId,
  type PlayCommand,
  type PlayDocument,
} from "@chalk/domain";
import {
  coverageSelectionCommand,
  doubleTeamSelectionCommand,
  tripsSelectionCommand,
  selectionAssignmentOptions,
  groupSelectionCommand,
  ungroupSelectionCommand,
  alignPlayersCommand,
  type FieldItemRef,
} from "@chalk/editor";
import { useState } from "react";

export function SelectionToolbar({
  document,
  selection,
  onCommand,
  onAdjustDefense,
}: {
  onAdjustDefense?: (ids: readonly string[]) => void;
  document: PlayDocument;
  selection: readonly FieldItemRef[];
  onCommand: (command: PlayCommand | undefined) => void;
}) {
  const [target, setTarget] = useState("");
  const ids = selection
    .filter(({ kind }) => kind === "player")
    .map(({ id }) => id);
  const selectedDefenders = document.players.filter(
    (man) => ids.includes(man.id) && man.unit === "defense",
  );
  if (
    (ids.length < 2 && selectedDefenders.length === 0) ||
    selection.some(({ kind }) => kind !== "player")
  )
    return null;
  const men = document.players.filter(({ id }) => ids.includes(id));
  const options = selectionAssignmentOptions(document, ids);
  const first = men[0];
  const designation =
    first?.groupDesignation &&
    men.every(
      (man) =>
        man.group === first.group &&
        man.groupDesignation?.name === first.groupDesignation?.name,
    )
      ? first.groupDesignation
      : undefined;
  const order = [...men]
    .sort(
      (a, b) =>
        (a.groupDesignation?.order ?? 0) - (b.groupDesignation?.order ?? 0),
    )
    .map(({ id }) => id);
  const side = designation?.name === "Trips left" ? "left" : "right";
  const defenders = document.players.filter(({ unit }) => unit === "defense");
  const positions = defensivePositions(document);
  const ball = ballPosition(document).lateralYards;
  const targetId = defenders.some((man) => man.id === target) ? target : "";
  const ungroup = ungroupSelectionCommand(document, selection);
  return (
    <div
      className="selection-toolbar"
      role="toolbar"
      aria-label="Selected player actions"
    >
      <span className="selection-toolbar-heading">
        {designation?.name ??
          `${men.length} ${men.length === 1 ? "player" : "players"} selected`}
      </span>
      {selectedDefenders.length > 0 && onAdjustDefense ? (
        <button
          type="button"
          onClick={() =>
            onAdjustDefense(selectedDefenders.map((man) => man.id))
          }
        >
          Adjust defense
        </button>
      ) : null}
      {options.trips ? (
        <div
          className="selection-toolbar-actions"
          role="group"
          aria-label="Receiver formation"
        >
          <button
            type="button"
            aria-pressed={designation?.name === "Trips left"}
            onClick={() =>
              onCommand(
                tripsSelectionCommand(document, ids, "left", createStableId),
              )
            }
          >
            Trips left
          </button>
          <button
            type="button"
            aria-pressed={designation?.name === "Trips right"}
            onClick={() =>
              onCommand(
                tripsSelectionCommand(document, ids, "right", createStableId),
              )
            }
          >
            Trips right
          </button>
          {designation?.kind === "trips" ? (
            <>
              <button
                type="button"
                onClick={() =>
                  onCommand(
                    tripsSelectionCommand(
                      document,
                      ids,
                      side,
                      createStableId,
                      [...order].reverse(),
                    ),
                  )
                }
              >
                Reverse order
              </button>
              <div
                className="receiver-order"
                role="group"
                aria-label="Receivers outside to inside"
              >
                {order.map((id, index) => (
                  <label key={index}>
                    #{index + 1}
                    <select
                      aria-label={`Receiver ${index + 1}`}
                      value={id}
                      onChange={(event) => {
                        const swapped = [...order];
                        const other = swapped.indexOf(event.target.value);
                        [swapped[index], swapped[other]] = [
                          swapped[other]!,
                          swapped[index]!,
                        ];
                        onCommand(
                          tripsSelectionCommand(
                            document,
                            ids,
                            side,
                            createStableId,
                            swapped,
                          ),
                        );
                      }}
                    >
                      {men.map((man) => (
                        <option key={man.id} value={man.id}>
                          {man.label || man.role || "Receiver"}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {options.doubleTeam ? (
        <div
          className="selection-toolbar-actions"
          role="group"
          aria-label="Shared block"
        >
          <button
            type="button"
            onClick={() =>
              onCommand(
                doubleTeamSelectionCommand(
                  document,
                  ids,
                  createStableId,
                  targetId || undefined,
                ),
              )
            }
          >
            Double team
          </button>
          <select
            aria-label="Double team target"
            value={targetId}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">Shared point</option>
            {defenders.map((man, index) => (
              <option key={man.id} value={man.id}>
                {man.label || positions[index]?.name || "Defender"} ·{" "}
                {man.position.lateralYards < ball
                  ? "left"
                  : man.position.lateralYards > ball
                    ? "right"
                    : "middle"}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {options.coverage ? (
        <label className="selection-toolbar-actions">
          Scheme
          <select
            aria-label="Selected defensive scheme"
            value={
              coverageCalls.find((call) => call.name === designation?.name)
                ?.key ?? ""
            }
            onChange={(event) =>
              onCommand(
                coverageSelectionCommand(
                  document,
                  ids,
                  event.target.value,
                  createStableId,
                ),
              )
            }
          >
            <option value="" disabled>
              Choose coverage…
            </option>
            {coverageCalls.map((call) => (
              <option key={call.key} value={call.key}>
                {call.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <details className="selection-toolbar-more">
        <summary>Arrange</summary>
        <div>
          <button
            type="button"
            onClick={() =>
              onCommand(
                groupSelectionCommand(document, selection, createStableId),
              )
            }
          >
            Group
          </button>
          <button
            type="button"
            disabled={!ungroup}
            onClick={() => onCommand(ungroup)}
          >
            Ungroup
          </button>
          <button
            type="button"
            onClick={() =>
              onCommand(alignPlayersCommand(document, ids, "depth"))
            }
          >
            Align depth
          </button>
          <button
            type="button"
            onClick={() =>
              onCommand(alignPlayersCommand(document, ids, "splits"))
            }
          >
            Space evenly
          </button>
        </div>
      </details>
      {designation ? (
        <button type="button" onClick={() => onCommand(ungroup)}>
          Remove designation
        </button>
      ) : null}
    </div>
  );
}
