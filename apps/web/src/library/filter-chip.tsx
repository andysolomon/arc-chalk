import { useEffect, useId, useRef, useState } from "react";

/** One thing a filter can be set to, and how many of the book it finds. */
export interface FilterChoice {
  readonly value: string;
  readonly name: string;
  /** A second line under the name — what 11 personnel puts on the field. */
  readonly detail?: string;
  readonly count?: number;
}

/** The value that leaves a filter open — every chip starts here. */
export const ANY = "all";

/**
 * A filter as a chip that names its own choice. Closed, it reads the axis —
 * Personnel — until something is chosen, and then the choice — 11 — lit.
 * Pressed, it opens a picker with the choices and, once there are enough of
 * them to lose one in, a line to filter them by: a sheet up from the bottom
 * on a phone, a panel under the chip on a desk. All is always the first
 * choice, so a chip is cleared where it was set.
 */
export function FilterChip({
  allName = "All",
  choices,
  focusSearch = true,
  label,
  onPick,
  value,
}: {
  /** What the open choice is called in the picker; "All" unless it needs a noun. */
  allName?: string;
  choices: readonly FilterChoice[];
  /** Whether the picker's filter line takes focus: a keyboard wants it, a finger does not. */
  focusSearch?: boolean;
  label: string;
  onPick: (value: string) => void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = choices.find((choice) => choice.value === value);
  const lit = value !== ANY && chosen !== undefined;
  const lower = label.toLowerCase();
  return (
    <span className="filter-chip">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={lit ? `${label}: ${chosen.name}` : label}
        className={`chip chip-menu${lit ? " active" : ""}${open ? " open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        title={lit ? `${label} — ${chosen.name}` : `Filter by ${lower}`}
        type="button"
      >
        <span className="chip-text">{lit ? chosen.name : label}</span>
        <svg aria-hidden="true" className="chip-caret" viewBox="0 0 8 8">
          <path d="M1.5 3 4 5.5 6.5 3" />
        </svg>
      </button>
      {open ? (
        <ChoicePicker
          allName={allName}
          choices={choices}
          focusSearch={focusSearch}
          label={label}
          onClose={() => setOpen(false)}
          onPick={(next) => {
            setOpen(false);
            onPick(next);
          }}
          value={value}
        />
      ) : null}
    </span>
  );
}

/** Enough choices that a line to filter them by earns its place. */
const SEARCH_FROM = 7;

function ChoicePicker({
  allName,
  choices,
  focusSearch,
  label,
  onClose,
  onPick,
  value,
}: {
  allName: string;
  choices: readonly FilterChoice[];
  focusSearch: boolean;
  label: string;
  onClose: () => void;
  onPick: (value: string) => void;
  value: string;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const lower = label.toLowerCase();
  const searchable = choices.length >= SEARCH_FROM;
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? choices.filter(({ name, detail }) =>
        `${name} ${detail ?? ""}`.toLowerCase().includes(needle),
      )
    : choices;

  // Without a filter line the sheet itself takes focus, so Escape and the
  // arrow keys reach it and a screen reader announces where it landed.
  useEffect(() => {
    if (searchable && focusSearch) return;
    sheetRef.current?.focus();
  }, [focusSearch, searchable]);

  const pickFirst = () => {
    const first = shown[0];
    if (first) onPick(first.value);
  };

  return (
    <>
      <div className="choice-backdrop" onClick={onClose} role="presentation" />
      <div
        aria-label={`Filter ${lower}`}
        aria-modal="true"
        className="choice-sheet"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
        ref={sheetRef}
        role="dialog"
        tabIndex={-1}
      >
        <span aria-hidden="true" className="choice-handle" />
        {searchable ? (
          <input
            aria-controls={listId}
            aria-label={`Filter ${lower}`}
            autoFocus={focusSearch}
            className="choice-search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              pickFirst();
            }}
            placeholder={`Filter ${lower}…`}
            spellCheck={false}
            type="search"
            value={query}
          />
        ) : null}
        <div className="choice-list" id={listId} role="listbox">
          {!needle ? (
            <ChoiceRow
              choice={{ value: ANY, name: allName }}
              onPick={onPick}
              selected={value === ANY}
            />
          ) : null}
          {shown.map((choice) => (
            <ChoiceRow
              choice={choice}
              key={choice.value}
              onPick={onPick}
              selected={choice.value === value}
            />
          ))}
          {shown.length === 0 ? (
            <p className="choice-none">Nothing called that.</p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function ChoiceRow({
  choice,
  onPick,
  selected,
}: {
  choice: FilterChoice;
  onPick: (value: string) => void;
  selected: boolean;
}) {
  return (
    <button
      aria-selected={selected}
      className={`choice-row${selected ? " selected" : ""}`}
      onClick={() => onPick(choice.value)}
      role="option"
      type="button"
    >
      <span className="choice-name">
        {choice.name}
        {choice.detail ? (
          <span className="choice-detail">{choice.detail}</span>
        ) : null}
      </span>
      {choice.count !== undefined ? (
        <span className="choice-count">{choice.count}</span>
      ) : null}
    </button>
  );
}
