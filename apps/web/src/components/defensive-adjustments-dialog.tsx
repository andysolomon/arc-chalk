import { useEffect, useRef, useState } from "react";
import {
  coverableReceivers,
  createStableId,
  defensiveReadKeys,
  defenderCoachingActions,
  type PlayCommand,
  type PlayDocument,
  type Player,
  type DefensiveReadKey,
} from "@chalk/domain";
import {
  defensiveAdjustmentCommand,
  defensiveAdjustmentTargets,
  type DefensiveAdjustment,
} from "@chalk/editor";

function ReadControls({
  document,
  player,
  run,
}: {
  document: PlayDocument;
  player: Player;
  run: (action: DefensiveAdjustment) => void;
}) {
  const actions = defenderCoachingActions(document, player.id);
  const offenseKey = actions.find(
    (action) => action.kind === "read" && action.perspective === "offense-key",
  );
  const defensiveRead = actions.find(
    (action) =>
      action.kind === "read" && action.perspective === "defensive-read",
  );
  const plaster = actions.find((action) => action.kind === "plaster");
  const offense = document.players.filter((man) => man.unit !== "defense");
  const [target, setTarget] = useState(
    defensiveRead &&
      "target" in defensiveRead &&
      defensiveRead.target?.kind === "player"
      ? defensiveRead.target.playerId
      : (offense[0]?.id ?? ""),
  );
  const targetId = offense.some((man) => man.id === target)
    ? target
    : (offense[0]?.id ?? "");
  return (
    <div className="defense-read-fields">
      <label>
        Offense read key
        <select
          aria-label="Offense read key"
          value={offenseKey?.kind === "read" ? offenseKey.read : ""}
          onChange={(event) =>
            run({
              kind: "read",
              playerId: player.id,
              perspective: "offense-key",
              read: (event.target.value || undefined) as
                DefensiveReadKey | undefined,
            })
          }
        >
          <option value="">None</option>
          {defensiveReadKeys.map((read) => (
            <option key={read.key} value={read.key}>
              {read.name}
            </option>
          ))}
        </select>
      </label>
      <p>Marks this defender as the player the offense reads.</p>
      <label>
        Offensive player to watch
        <select
          aria-label="Offensive player to watch"
          disabled={!offense.length}
          value={targetId}
          onChange={(event) => {
            setTarget(event.target.value);
            if (defensiveRead?.kind === "read")
              run({
                kind: "read",
                playerId: player.id,
                perspective: "defensive-read",
                read: defensiveRead.read,
                targetId: event.target.value,
              });
          }}
        >
          {!offense.length ? (
            <option value="">Add a shadow offense first</option>
          ) : null}
          {offense.map((man, index) => (
            <option key={man.id} value={man.id}>
              {man.label || man.role || `Player ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
      <label>
        Defensive read
        <select
          aria-label="Defensive read"
          disabled={!targetId}
          value={defensiveRead?.kind === "read" ? defensiveRead.read : ""}
          onChange={(event) =>
            run({
              kind: "read",
              playerId: player.id,
              perspective: "defensive-read",
              read: (event.target.value || undefined) as
                DefensiveReadKey | undefined,
              targetId,
            })
          }
        >
          <option value="">None</option>
          {defensiveReadKeys.map((read) => (
            <option key={read.key} value={read.key}>
              {read.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        Gives this defender a read responsibility against the offensive player
        above.
      </p>
      <label>
        Plaster on scramble
        <select
          aria-label="Plaster receiver"
          disabled={!offense.length}
          value={
            plaster?.kind === "plaster" && plaster.target?.kind === "player"
              ? plaster.target.playerId
              : ""
          }
          onChange={(event) =>
            run({
              kind: "plaster",
              playerId: player.id,
              targetId: event.target.value || undefined,
            })
          }
        >
          <option value="">Off — keep base coverage</option>
          {coverableReceivers(document).map(({ player: man }) => (
            <option key={man.id} value={man.id}>
              {man.label || man.role || "Receiver"}
            </option>
          ))}
        </select>
      </label>
      <p>
        A dotted alternative shows whom to stay with when the QB scrambles. Base
        coverage stays on the field.
      </p>
    </div>
  );
}

export function DefensiveAdjustmentsDialog({
  document,
  selectedIds,
  onCommand,
  onClose,
  onTips,
}: {
  document: PlayDocument;
  selectedIds: readonly string[];
  onCommand: (command: PlayCommand | undefined) => void;
  onClose: () => void;
  onTips: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scope, setScope] = useState(selectedIds.length ? "selection" : "all");
  const ids = scope === "selection" ? selectedIds : undefined;
  const targets = defensiveAdjustmentTargets(document, ids);
  const [defenderId, setDefenderId] = useState(
    selectedIds[0] ?? targets.all[0]?.id ?? "",
  );
  const defender =
    targets.all.find((man) => man.id === defenderId) ?? targets.all[0];
  const [notice, setNotice] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const run = (action: DefensiveAdjustment) => {
    const command = defensiveAdjustmentCommand(
      document,
      ids,
      action,
      createStableId,
    );
    onCommand(command);
    setNotice(
      command?.kind === "batch"
        ? (command.label ?? "Adjustment applied")
        : "Already set",
    );
  };
  const button = (
    name: string,
    action: DefensiveAdjustment,
    disabled = false,
    pressed?: boolean,
  ) => (
    <button
      key={name}
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      onClick={() => run(action)}
    >
      {name}
    </button>
  );
  const same = (
    value: "depthShade" | "leverage" | "aggressive",
    wanted: string | boolean,
  ) =>
    targets.coverage.length > 0 &&
    targets.coverage.every((man) => man.defensiveTechnique?.[value] === wanted);
  const alignment = (
    position: "corners" | "safeties",
    axis: "depth" | "width",
    choices: readonly number[],
  ) => {
    const men = targets[position];
    const label = `${position === "corners" ? "Corner" : "Safety"} ${axis}`;
    return (
      <label key={label}>
        {label}
        <select
          aria-label={label}
          disabled={!men.length}
          value=""
          onChange={(event) =>
            run({
              kind: "secondary-align",
              position,
              axis,
              yards: Number(event.target.value),
            })
          }
        >
          <option value="" disabled>
            Set yards…
          </option>
          {choices.map((yards) => (
            <option key={yards} value={yards}>
              {yards} yd {axis === "depth" ? "off the ball" : "from the ball"}
            </option>
          ))}
        </select>
      </label>
    );
  };
  return (
    <dialog
      ref={dialog}
      className="defense-dialog"
      aria-label="Defensive adjustments"
      onCancel={onClose}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header>
        <div>
          <span className="section-heading">Coach the defense</span>
          <h2>Defensive adjustments</h2>
        </div>
        <button
          type="button"
          aria-label="Close defensive adjustments"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="defense-scope">
        <label>
          Apply to{" "}
          <select
            aria-label="Adjustment scope"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="all">Entire defense</option>
            <option value="selection" disabled={!selectedIds.length}>
              Selected defenders
            </option>
          </select>
        </label>
        <span>{targets.all.length} defenders</span>
        <button type="button" onClick={onTips}>
          Defensive tips
        </button>
      </div>
      <div className="defense-adjustment-grid">
        <section aria-label="D-line adjustments">
          <h3>
            D-line <small>{targets.front.length} selected</small>
          </h3>
          <p>Move the front before the snap, then choose where it attacks.</p>
          <div className="defense-button-row">
            {button(
              "Shift left",
              { kind: "front-shift", direction: -1 },
              !targets.front.length,
            )}
            {button(
              "Shift right",
              { kind: "front-shift", direction: 1 },
              !targets.front.length,
            )}
            {button(
              "Pinch",
              { kind: "front-spacing", spread: false },
              !targets.front.length,
            )}
            {button(
              "Spread",
              { kind: "front-spacing", spread: true },
              !targets.front.length,
            )}
          </div>
          <div className="defense-button-row">
            {(["left", "right", "in", "out"] as const).map((direction) =>
              button(
                `Slant ${direction}`,
                { kind: "front-slant", direction },
                !targets.front.length,
              ),
            )}
          </div>
          <label>
            Point of attack
            <select
              aria-label="Point of attack"
              value=""
              disabled={!targets.front.length}
              onChange={(event) => {
                const [side, gap] = event.target.value.split(":").map(Number);
                run({
                  kind: "point-of-attack",
                  side: side as -1 | 1,
                  gap: gap as 0 | 1 | 2 | 3,
                });
              }}
            >
              <option value="" disabled>
                Choose a gap…
              </option>
              {([-1, 1] as const).flatMap((side) =>
                ["A", "B", "C", "D"].map((gap, index) => (
                  <option key={`${side}:${index}`} value={`${side}:${index}`}>
                    {side < 0 ? "Left" : "Right"} {gap} gap
                  </option>
                )),
              )}
            </select>
          </label>
          {button("Contain", { kind: "contain" }, !targets.front.length)}
          <p>The widest selected lineman on each side keeps the edge.</p>
        </section>
        <section aria-label="Linebacker adjustments">
          <h3>
            Linebackers <small>{targets.linebackers.length} selected</small>
          </h3>
          <p>Choose pressure, a zone assignment, or a disguised look.</p>
          <div className="defense-button-row">
            {button(
              "Blitz",
              { kind: "linebacker-blitz" },
              !targets.linebackers.length,
            )}
            {button(
              "Hook zone",
              { kind: "linebacker-zone", zone: "hook" },
              !targets.linebackers.length,
            )}
            {button(
              "Curl / flat zone",
              { kind: "linebacker-zone", zone: "curlflat" },
              !targets.linebackers.length,
            )}
            {button(
              "QB spy",
              { kind: "linebacker-zone", zone: "spy" },
              !targets.linebackers.length,
            )}
          </div>
          <div className="defense-button-row">
            {button(
              "Show blitz",
              { kind: "show-blitz", on: true },
              !targets.linebackers.length,
              targets.linebackers.length > 0 &&
                targets.linebackers.every(
                  (man) =>
                    man.defensiveTechnique?.showBlitzFromDepth !== undefined,
                ),
            )}
            {button(
              "Hide blitz look",
              { kind: "show-blitz", on: false },
              !targets.linebackers.some(
                (man) =>
                  man.defensiveTechnique?.showBlitzFromDepth !== undefined,
              ),
            )}
          </div>
          <p>
            Showing blitz brings them to 1½ yards while keeping their post-snap
            assignments.
          </p>
        </section>
        <section aria-label="Coverage adjustments">
          <h3>
            Coverage <small>{targets.coverage.length} selected</small>
          </h3>
          <p>
            Shade the coverage underneath or overtop and commit to an inside or
            outside approach.
          </p>
          <div className="defense-button-row">
            {button(
              "Press",
              { kind: "coverage", technique: "press" },
              !targets.corners.length && !targets.safeties.length,
            )}
            {button(
              "Back off",
              { kind: "coverage", technique: "back-off" },
              !targets.corners.length && !targets.safeties.length,
            )}
            {button(
              "Shade underneath",
              { kind: "coverage", technique: "underneath" },
              !targets.coverage.length,
              same("depthShade", "underneath"),
            )}
            {button(
              "Shade overtop",
              { kind: "coverage", technique: "overtop" },
              !targets.coverage.length,
              same("depthShade", "overtop"),
            )}
            {button(
              "Commit inside",
              { kind: "coverage", technique: "inside" },
              !targets.coverage.length,
              same("leverage", "inside"),
            )}
            {button(
              "Commit outside",
              { kind: "coverage", technique: "outside" },
              !targets.coverage.length,
              same("leverage", "outside"),
            )}
          </div>
          <div className="defense-button-row">
            {button(
              "Aggressive",
              { kind: "coverage", technique: "aggressive" },
              !targets.coverage.length,
              same("aggressive", true),
            )}
            {button(
              "Balanced",
              { kind: "coverage", technique: "balanced" },
              !targets.coverage.length,
              same("aggressive", false),
            )}
            {button(
              "Reset techniques",
              { kind: "coverage", technique: "reset" },
              !targets.coverage.length,
            )}
          </div>
          <p>
            Aggressive brings underneath zones one yard closer. Press / back off
            changes secondary depth; shade changes zone landmarks.
          </p>
        </section>
        <section aria-label="Secondary alignment">
          <h3>Corner & safety spacing</h3>
          <p>
            Depth is off the ball. Width is the distance from the ball on each
            man's current side.
          </p>
          <div className="defense-alignment-fields">
            {alignment("corners", "depth", [1, 2, 3, 4, 5, 6, 7, 8, 10, 12])}
            {alignment(
              "corners",
              "width",
              [6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
            )}
            {alignment(
              "safeties",
              "depth",
              [5, 8, 10, 12, 14, 16, 18, 20, 25, 30],
            )}
            {alignment("safeties", "width", [0, 2, 4, 6, 8, 10, 12, 14, 16])}
          </div>
        </section>
        <section
          className="defense-read-section"
          aria-label="Read keys and plaster"
        >
          <h3>Read keys & plaster</h3>
          <label>
            Defender
            <select
              aria-label="Read defender"
              value={defender?.id ?? ""}
              disabled={!targets.all.length}
              onChange={(event) => setDefenderId(event.target.value)}
            >
              {targets.all.map((man, index) => (
                <option key={man.id} value={man.id}>
                  {man.label || man.role || "Defender"} · {index + 1}
                </option>
              ))}
            </select>
          </label>
          {defender ? (
            <ReadControls
              key={defender.id}
              document={document}
              player={defender}
              run={run}
            />
          ) : (
            <p>Put a defense on the field to assign read keys.</p>
          )}
        </section>
      </div>
      <footer>
        <span role="status">
          {notice || "Each adjustment saves with this play and can be undone."}
        </span>
        <button type="button" onClick={onClose}>
          Done
        </button>
      </footer>
    </dialog>
  );
}
