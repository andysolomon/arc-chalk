import { buildRenderScene, buildSvgRenderScene } from "@chalk/render";
import type { PlayDocument } from "@chalk/domain";
import type { ConflictInboxItem, SyncOrchestrator } from "@chalk/sync";
import { combinePlayDocuments } from "@chalk/sync";
import { useEffect, useMemo, useState } from "react";

export function ConflictInboxHost({
  sync,
  onClose,
}: {
  readonly sync: SyncOrchestrator;
  readonly onClose: () => void;
}) {
  const [conflicts, setConflicts] = useState<readonly ConflictInboxItem[]>([]);
  useEffect(() => {
    void sync.listConflicts().then(setConflicts);
  }, [sync]);
  return (
    <ConflictInbox
      conflicts={conflicts}
      onClose={onClose}
      onResolve={async (id, resolution, options) => {
        await sync.resolveConflict(id, resolution, options);
        setConflicts(await sync.listConflicts());
        if ((await sync.listConflicts()).length === 0) onClose();
      }}
    />
  );
}

export function ConflictInbox({
  conflicts,
  onClose,
  onResolve,
}: {
  readonly conflicts: readonly ConflictInboxItem[];
  readonly onClose: () => void;
  readonly onResolve: SyncOrchestrator["resolveConflict"];
}) {
  const [activeId, setActiveId] = useState(conflicts[0]?.id);
  const [mode, setMode] = useState<"compare" | "combine">("compare");
  const [base, setBase] = useState<"local" | "remote">("local");
  const [pickedPlayers, setPickedPlayers] = useState<readonly string[]>([]);
  const [pickedPaths, setPickedPaths] = useState<readonly string[]>([]);
  const [pickedLabels, setPickedLabels] = useState<readonly string[]>([]);
  const [pickedAssignments, setPickedAssignments] = useState<readonly string[]>(
    [],
  );
  const active = conflicts.find((item) => item.id === activeId) ?? conflicts[0];

  if (!active) {
    return (
      <div
        className="overlay shortcuts-overlay"
        role="dialog"
        aria-label="Conflict Inbox"
      >
        <div className="palette conflict-inbox">
          <p className="version-empty">No unresolved conflicts.</p>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const local = active.localDocument;
  const remote = active.remoteDocument;
  const donor = base === "local" ? remote : local;
  const receiver = base === "local" ? local : remote;

  return (
    <div
      className="overlay shortcuts-overlay"
      role="dialog"
      aria-label="Conflict Inbox"
    >
      <div className="palette conflict-inbox">
        <header className="conflict-head">
          <strong>Conflict Inbox</strong>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="version-empty">
          Both branches are kept. Unrelated Plays keep syncing.
        </p>
        <ul className="conflict-list">
          {conflicts.map((conflict) => (
            <li key={conflict.id}>
              <button
                className={conflict.id === active.id ? "first" : ""}
                type="button"
                onClick={() => {
                  setActiveId(conflict.id);
                  setMode("compare");
                }}
              >
                {conflict.playName}
              </button>
            </li>
          ))}
        </ul>
        <div className="conflict-compare">
          <BranchPreview
            label="This device"
            document={local}
            deviceLabel={active.localDeviceLabel}
            updatedAtMs={active.localUpdatedAtMs ?? active.createdAtMs}
            selected={base === "local"}
            onSelect={() => setBase("local")}
          />
          <BranchPreview
            label="Other device"
            document={remote}
            deviceLabel={active.remoteDeviceLabel}
            updatedAtMs={active.remoteUpdatedAtMs ?? active.createdAtMs}
            selected={base === "remote"}
            onSelect={() => setBase("remote")}
          />
        </div>
        {mode === "combine" && donor && receiver ? (
          <div className="conflict-combine">
            <p>
              Copy from the other branch onto{" "}
              {base === "local" ? "this device" : "the other device"}.
            </p>
            <EntityPicks
              label="Players"
              items={donor.players.map((player) => ({
                id: player.id,
                name: player.label || player.role || player.id,
              }))}
              selected={pickedPlayers}
              onChange={setPickedPlayers}
            />
            <EntityPicks
              label="Routes"
              items={donor.paths.map((path) => ({
                id: path.id,
                name: path.kind,
              }))}
              selected={pickedPaths}
              onChange={setPickedPaths}
            />
            <EntityPicks
              label="Notes"
              items={donor.labels.map((label) => ({
                id: label.id,
                name: label.text || "Note",
              }))}
              selected={pickedLabels}
              onChange={setPickedLabels}
            />
            <EntityPicks
              label="Assignments"
              items={donor.assignments.map((assignment) => ({
                id: assignment.id,
                name: assignment.text || assignment.id,
              }))}
              selected={pickedAssignments}
              onChange={setPickedAssignments}
            />
          </div>
        ) : null}
        <div className="conflict-actions">
          <button
            type="button"
            onClick={() => void onResolve(active.id, "local")}
            disabled={!local}
          >
            Use this device&apos;s version
          </button>
          <button
            type="button"
            onClick={() => void onResolve(active.id, "remote")}
            disabled={!remote}
          >
            Use the other version
          </button>
          <button
            type="button"
            onClick={() => void onResolve(active.id, "keep-both")}
          >
            Keep both as separate Plays
          </button>
          {mode === "combine" ? (
            <button
              type="button"
              disabled={!receiver || !donor}
              onClick={() => {
                if (!receiver || !donor) return;
                const combined = combinePlayDocuments(receiver, donor, {
                  playerIds: pickedPlayers,
                  pathIds: pickedPaths,
                  labelIds: pickedLabels,
                  assignmentIds: pickedAssignments,
                });
                void onResolve(active.id, "combine", { combined });
              }}
            >
              Save combined Play
            </button>
          ) : (
            <button type="button" onClick={() => setMode("combine")}>
              Combine manually
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BranchPreview({
  label,
  document,
  deviceLabel,
  updatedAtMs,
  selected,
  onSelect,
}: {
  readonly label: string;
  readonly document?: PlayDocument;
  readonly deviceLabel?: string;
  readonly updatedAtMs: number;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <section
      className={selected ? "conflict-branch selected" : "conflict-branch"}
    >
      <button type="button" onClick={onSelect}>
        <strong>{label}</strong>
        <span>
          {deviceLabel ?? "Unknown device"} ·{" "}
          {new Date(updatedAtMs).toLocaleString()}
        </span>
        {document ? (
          <span>
            {document.players.length}P · {document.paths.length}R
          </span>
        ) : (
          <span>Diagram unavailable</span>
        )}
      </button>
      {document ? <MiniPlayPreview document={document} /> : null}
    </section>
  );
}

function MiniPlayPreview({ document }: { readonly document: PlayDocument }) {
  const scene = useMemo(
    () => buildSvgRenderScene(buildRenderScene(document)),
    [document],
  );
  return (
    <svg
      aria-hidden="true"
      className="conflict-mini"
      viewBox={`0 0 ${scene.viewport.width} ${scene.viewport.height}`}
    >
      {scene.players.map((player) => (
        <circle
          key={player.id}
          cx={player.position.x}
          cy={player.position.y}
          r={7}
        />
      ))}
    </svg>
  );
}

function EntityPicks({
  label,
  items,
  selected,
  onChange,
}: {
  readonly label: string;
  readonly items: readonly { readonly id: string; readonly name: string }[];
  readonly selected: readonly string[];
  readonly onChange: (ids: readonly string[]) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      {items.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            checked={selected.includes(item.id)}
            onChange={(event) => {
              onChange(
                event.target.checked
                  ? [...selected, item.id]
                  : selected.filter((id) => id !== item.id),
              );
            }}
          />
          {item.name}
        </label>
      ))}
    </fieldset>
  );
}
