import type { BookConfigs, BookEntry, HandoutConfig } from "@chalk/exports";
import { handoutFit } from "@chalk/exports";

/**
 * Binder and handout layouts (issue #72): paper, the punch-side gutter and
 * duplex mirroring, dividers, contents, page numbers and a notes area for
 * the binder; paper, orientation, one, two or four to a sheet, assignments
 * and notes for the handout. What a card cannot show is said first.
 */
export function BookOptions({
  configs,
  entries,
  kind,
  onChange,
}: {
  configs: BookConfigs;
  entries: readonly BookEntry[];
  kind: "binder" | "handout";
  onChange: (next: BookConfigs) => void;
}) {
  if (kind === "binder") {
    const binder = configs.binder;
    const set = (patch: Partial<typeof binder>) =>
      onChange({ ...configs, binder: { ...binder, ...patch } });
    return (
      <div className="book-options" role="group" aria-label="Binder layout">
        <div className="sub-heading">Paper</div>
        <div className="segments">
          {(["letter", "a4"] as const).map((paper) => (
            <button
              aria-pressed={binder.paper === paper}
              className={binder.paper === paper ? "active" : undefined}
              key={paper}
              onClick={() => set({ paper })}
              type="button"
            >
              {paper === "letter" ? "Letter" : "A4"}
            </button>
          ))}
        </div>
        <label className="book-gutter">
          Punch-side gutter (in)
          <input
            inputMode="decimal"
            max={2}
            min={0}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value >= 0)
                set({ gutterIn: value });
            }}
            step="0.125"
            type="number"
            value={binder.gutterIn}
          />
        </label>
        {(
          [
            ["duplex", "Two-sided — mirror the gutter on facing pages"],
            ["dividers", "Section divider pages"],
            ["contents", "Contents with page numbers"],
            ["pageNumbers", "Page numbers on every play"],
            ["notesArea", "Ruled notes area under each play"],
          ] as const
        ).map(([key, label]) => (
          <label className="output-check" key={key}>
            <input
              checked={binder[key]}
              onChange={(event) => set({ [key]: event.target.checked })}
              type="checkbox"
            />
            {label}
          </label>
        ))}
        <p className="output-note">
          Page numbers are read off the preview's own layout: a long contents or
          a dense assignment table moves what follows by exactly what it took.
          Text and diagrams stay clear of the gutter on both sides.
        </p>
      </div>
    );
  }
  const handout = configs.handout;
  const set = (patch: Partial<HandoutConfig>) =>
    onChange({ ...configs, handout: { ...handout, ...patch } });
  const fit = handoutFit(entries, handout);
  return (
    <div className="book-options" role="group" aria-label="Handout layout">
      <div className="sub-heading">Paper</div>
      <div className="segments">
        {(["letter", "a4"] as const).map((paper) => (
          <button
            aria-pressed={handout.paper === paper}
            className={handout.paper === paper ? "active" : undefined}
            key={paper}
            onClick={() => set({ paper })}
            type="button"
          >
            {paper === "letter" ? "Letter" : "A4"}
          </button>
        ))}
      </div>
      <div className="segments">
        {(["portrait", "landscape"] as const).map((orientation) => (
          <button
            aria-pressed={handout.orientation === orientation}
            className={
              handout.orientation === orientation ? "active" : undefined
            }
            key={orientation}
            onClick={() => set({ orientation })}
            type="button"
          >
            {orientation === "portrait" ? "Portrait" : "Landscape"}
          </button>
        ))}
      </div>
      <div className="sub-heading">Plays to a sheet</div>
      <div className="segments">
        {([1, 2, 4] as const).map((up) => (
          <button
            aria-pressed={handout.up === up}
            className={handout.up === up ? "active" : undefined}
            key={up}
            onClick={() => set({ up })}
            type="button"
          >
            {up}-up
          </button>
        ))}
      </div>
      <div className="sub-heading">Assignments</div>
      <div className="segments">
        {(
          [
            ["none", "None"],
            ["compact", "Compact"],
            ["full", "Full"],
          ] as const
        ).map(([assignments, label]) => (
          <button
            aria-pressed={handout.assignments === assignments}
            className={
              handout.assignments === assignments ? "active" : undefined
            }
            key={assignments}
            onClick={() => set({ assignments })}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <label className="output-check">
        <input
          checked={handout.notes}
          onChange={(event) => set({ notes: event.target.checked })}
          type="checkbox"
        />
        Coaching notes on the card
      </label>
      <p className="output-note">
        {fit.sheets} {fit.sheets === 1 ? "sheet" : "sheets"} for{" "}
        {entries.length} {entries.length === 1 ? "play" : "plays"}. Cards keep
        their size; what does not fit is counted or flows onto another sheet,
        never shrunk away.
      </p>
      {fit.warnings.length > 0 ? (
        <ul className="call-sheet-warnings" aria-label="Before printing">
          {fit.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
