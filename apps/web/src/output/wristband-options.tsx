import type { GamePlanRevision } from "@chalk/domain";
import {
  wristbandCallsOf,
  wristbandFit,
  wristbandLayouts,
  wristbandSizePresets,
  type WristbandCall,
  type WristbandConfig,
} from "@chalk/exports";
import { useState } from "react";

/**
 * How the inserts are cut (issue #71): a size by its dimensions or the
 * Coach's own, the layout of a cell, and the calls on the band — chosen,
 * ordered by drag or by the arrows, each with a short name if the cell
 * needs one. What will not fit is said before printing.
 */
export function WristbandOptions({
  config,
  onChange,
  revision,
}: {
  config: WristbandConfig;
  onChange: (next: WristbandConfig) => void;
  revision: GamePlanRevision;
}) {
  const rows = wristbandCallsOf(revision);
  const fit = wristbandFit(revision, config);
  const [dragging, setDragging] = useState<string>();
  const on = new Set(config.calls.map(({ callId }) => callId));
  const nameOf = (callId: string) => rows.find((row) => row.callId === callId);
  const setCalls = (calls: readonly WristbandCall[]) =>
    onChange({ ...config, calls });
  const move = (callId: string, to: number) => {
    const from = config.calls.findIndex((call) => call.callId === callId);
    if (from < 0 || to < 0 || to >= config.calls.length || from === to) return;
    const next = [...config.calls];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setCalls(next);
  };
  const dimension = (
    key: "cellWidthIn" | "cellHeightIn" | "columns" | "rows",
    raw: string,
  ) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    const { presetId: _preset, ...rest } = config;
    void _preset;
    onChange({
      ...rest,
      [key]: key === "columns" || key === "rows" ? Math.trunc(value) : value,
    });
  };

  return (
    <div
      className="wristband-options"
      role="group"
      aria-label="Wristband inserts"
    >
      <div className="sub-heading">Insert size</div>
      <select
        aria-label="Size preset"
        onChange={(event) => {
          const preset = wristbandSizePresets.find(
            ({ id }) => id === event.target.value,
          );
          if (!preset) return;
          onChange({
            ...config,
            cellWidthIn: preset.cellWidthIn,
            cellHeightIn: preset.cellHeightIn,
            columns: preset.columns,
            rows: preset.rows,
            presetId: preset.id,
          });
        }}
        value={config.presetId ?? ""}
      >
        <option value="">Your own size</option>
        {wristbandSizePresets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
      <div className="wristband-dims">
        <label>
          Cell width (in)
          <input
            inputMode="decimal"
            onChange={(event) => dimension("cellWidthIn", event.target.value)}
            step="0.05"
            type="number"
            value={config.cellWidthIn}
          />
        </label>
        <label>
          Cell height (in)
          <input
            inputMode="decimal"
            onChange={(event) => dimension("cellHeightIn", event.target.value)}
            step="0.05"
            type="number"
            value={config.cellHeightIn}
          />
        </label>
        <label>
          Across
          <input
            inputMode="numeric"
            onChange={(event) => dimension("columns", event.target.value)}
            type="number"
            value={config.columns}
          />
        </label>
        <label>
          Down
          <input
            inputMode="numeric"
            onChange={(event) => dimension("rows", event.target.value)}
            type="number"
            value={config.rows}
          />
        </label>
      </div>
      <p className="output-note">
        {fit.cellsPerInsert} cells an insert · {config.calls.length}{" "}
        {config.calls.length === 1 ? "call" : "calls"} → {fit.inserts}{" "}
        {fit.inserts === 1 ? "insert" : "inserts"}, one a sheet. Print at 100 %
        and check the one-inch bar with a ruler.
      </p>
      <div className="sub-heading">Cell layout</div>
      <div className="segments">
        {wristbandLayouts.map((layout) => (
          <button
            aria-pressed={config.layout === layout.id}
            className={config.layout === layout.id ? "active" : undefined}
            key={layout.id}
            onClick={() => onChange({ ...config, layout: layout.id })}
            title={layout.hint}
            type="button"
          >
            {layout.name}
          </button>
        ))}
      </div>
      <div className="sub-heading">Calls on the band, in order</div>
      <ol className="wristband-calls" aria-label="Calls on the band">
        {config.calls.map((call, index) => {
          const row = nameOf(call.callId);
          return (
            <li
              className={dragging === call.callId ? "dragging" : undefined}
              draggable
              key={call.callId}
              onDragEnd={() => setDragging(undefined)}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDragStart={(event) => {
                setDragging(call.callId);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", call.callId);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const moved =
                  event.dataTransfer.getData("text/plain") || dragging;
                if (moved) move(moved, index);
                setDragging(undefined);
              }}
            >
              <span className="wristband-grip" aria-hidden="true">
                ⋮⋮
              </span>
              <code>{row?.code.trim() || "—"}</code>
              <input
                aria-label={`Short name for ${row?.name ?? call.callId}`}
                onChange={(event) =>
                  setCalls(
                    config.calls.map((candidate) =>
                      candidate.callId === call.callId
                        ? {
                            callId: call.callId,
                            ...(event.target.value.trim()
                              ? { shortName: event.target.value }
                              : {}),
                          }
                        : candidate,
                    ),
                  )
                }
                placeholder={row?.name ?? "Missing play"}
                value={call.shortName ?? ""}
              />
              <button
                aria-label={`Move ${row?.name ?? call.callId} up`}
                disabled={index === 0}
                onClick={() => move(call.callId, index - 1)}
                type="button"
              >
                ↑
              </button>
              <button
                aria-label={`Move ${row?.name ?? call.callId} down`}
                disabled={index === config.calls.length - 1}
                onClick={() => move(call.callId, index + 1)}
                type="button"
              >
                ↓
              </button>
              <button
                aria-label={`Take ${row?.name ?? call.callId} off the band`}
                onClick={() =>
                  setCalls(
                    config.calls.filter(
                      (candidate) => candidate.callId !== call.callId,
                    ),
                  )
                }
                type="button"
              >
                ×
              </button>
            </li>
          );
        })}
      </ol>
      {rows.some((row) => !on.has(row.callId)) ? (
        <div
          className="wristband-off"
          role="group"
          aria-label="Calls not on the band"
        >
          {rows
            .filter((row) => !on.has(row.callId))
            .map((row) => (
              <button
                key={row.callId}
                onClick={() =>
                  setCalls([...config.calls, { callId: row.callId }])
                }
                type="button"
              >
                + {row.code.trim() || "—"} {row.name}
              </button>
            ))}
        </div>
      ) : null}
      {fit.warnings.length > 0 ? (
        <ul className="call-sheet-warnings" aria-label="Before printing">
          {fit.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : (
        <p className="output-note">
          Every code is unique, every play is in the packet, and every name fits
          its cell.
        </p>
      )}
    </div>
  );
}
