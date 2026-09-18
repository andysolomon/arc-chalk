import { useId, useState } from "react";

import { PRESET_GROUP_NAMES, type PresetChoice } from "./preset-choices";

/**
 * The inspector's progressive disclosure (issue #64). The idle panel used to
 * show everything at once — six line calls, ten concepts, the whole library,
 * field profiles, five page layouts, three type presets, four layer toggles
 * — and the coach's next action sat below the fold. A Disclosure keeps a
 * section's heading and a one-line summary in view and unfolds the controls
 * on request; whether it stands open is remembered per device.
 */
export function Disclosure({
  badge,
  children,
  id,
  onToggle,
  open,
  summary,
  title,
}: {
  badge?: string;
  children: React.ReactNode;
  id: string;
  onToggle: (id: string) => void;
  open: boolean;
  /** What the section currently says, shown beside the heading when folded. */
  summary?: string;
  title: string;
}) {
  const bodyId = useId();
  return (
    <section
      className={`inspector-section disclosure${open ? " open" : ""}`}
      data-disclosure={id}
    >
      <div className="section-heading disclosure-heading">
        <button
          aria-controls={bodyId}
          aria-expanded={open}
          className="disclosure-toggle"
          onClick={() => onToggle(id)}
          type="button"
        >
          <span aria-hidden="true" className="disclosure-caret">
            {open ? "▾" : "▸"}
          </span>
          <span>{title}</span>
          {badge ? <span className="scope-tag">{badge}</span> : null}
        </button>
        {!open && summary ? (
          <span className="disclosure-summary" title={summary}>
            {summary}
          </span>
        ) : null}
      </div>
      {open ? <div id={bodyId}>{children}</div> : null}
    </section>
  );
}

/**
 * Short contextual help. The original explains each panel in a paragraph
 * that is always there; here the sentence is a tap or a hover away, so the
 * controls come first and the words are still the Coach's to read.
 */
export function Hint({
  about,
  children,
}: {
  /** What the help is about, for the button's name. */
  about: string;
  children: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const bodyId = useId();
  return (
    <span className="hint">
      <button
        aria-controls={bodyId}
        aria-expanded={shown}
        aria-label={`About ${about}`}
        className="hint-toggle"
        onClick={() => setShown((value) => !value)}
        title="What this does"
        type="button"
      >
        ?
      </button>
      {shown ? (
        <p className="hint-body" id={bodyId}>
          {children}
        </p>
      ) : null}
    </span>
  );
}

/**
 * The searchable catalogue of concepts and line calls. It replaces the two
 * button grids that stood in the idle panel: the same calls, one intentional
 * action away, with the ones the Coach starred and reached for lately at the
 * top. Enter takes the first match; Escape goes back to the play.
 */
export function PresetPicker({
  choices,
  favorites,
  initialGroup,
  onClose,
  onPick,
  onToggleFavorite,
  recents,
}: {
  choices: readonly PresetChoice[];
  favorites: readonly string[];
  initialGroup?: PresetChoice["group"];
  onClose: () => void;
  onPick: (choice: PresetChoice) => void;
  onToggleFavorite: (key: string) => void;
  recents: readonly string[];
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<PresetChoice["group"] | "all">(
    initialGroup ?? "all",
  );

  const search = query.trim().toLowerCase();
  const matches = (choice: PresetChoice) =>
    (group === "all" || choice.group === group) &&
    (!search ||
      choice.name.toLowerCase().includes(search) ||
      (choice.hint ?? "").toLowerCase().includes(search));
  const byKey = new Map(choices.map((choice) => [choice.key, choice]));
  const starred = favorites.flatMap((key) => {
    const choice = byKey.get(key);
    return choice && matches(choice) ? [choice] : [];
  });
  const recent = recents.flatMap((key) => {
    const choice = byKey.get(key);
    return choice && matches(choice) && !favorites.includes(key)
      ? [choice]
      : [];
  });
  const sections: { readonly name: string; readonly items: PresetChoice[] }[] =
    [];
  if (starred.length) sections.push({ name: "Favorites", items: starred });
  if (recent.length) sections.push({ name: "Recent", items: recent });
  for (const kind of ["concept", "line"] as const) {
    const items = choices.filter(
      (choice) => choice.group === kind && matches(choice),
    );
    if (items.length) sections.push({ name: PRESET_GROUP_NAMES[kind], items });
  }
  const first = sections[0]?.items[0];

  const pick = (choice: PresetChoice) => {
    if (!choice.available) return;
    onPick(choice);
    onClose();
  };

  return (
    <div
      className="overlay browser-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-label="Concepts and line calls"
        className="browser preset-picker"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="browser-head">
          <div className="browser-title">Concepts &amp; line calls</div>
          <input
            aria-label="Search concepts and line calls"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              } else if (event.key === "Enter" && first) {
                event.preventDefault();
                pick(first);
              }
            }}
            placeholder="Search — stick, slide, reach…"
            spellCheck={false}
            value={query}
          />
          <button
            aria-label="Close"
            className="browser-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="browser-filter">
          <span>Show</span>
          <div className="chip-row">
            {(
              [
                ["all", "All"],
                ["concept", "Concepts"],
                ["line", "Line calls"],
              ] as const
            ).map(([id, name]) => (
              <button
                className={group === id ? "active" : undefined}
                key={id}
                onClick={() => setGroup(id)}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="browser-body preset-body">
          {sections.length === 0 ? (
            <p className="playbook-empty">Nothing matches that search.</p>
          ) : null}
          {sections.map((section) => (
            <div className="preset-group" key={section.name}>
              <div className="menu-head">{section.name.toUpperCase()}</div>
              {section.items.map((choice) => {
                const star = favorites.includes(choice.key);
                return (
                  <div
                    className={`preset-row${choice === first && search ? " first" : ""}`}
                    key={`${section.name}:${choice.key}`}
                  >
                    <button
                      aria-pressed={choice.on}
                      className={`preset-choice${choice.on ? " active" : ""}`}
                      disabled={!choice.available}
                      onClick={() => pick(choice)}
                      title={
                        choice.hint ??
                        (choice.on
                          ? `Click again to take ${choice.name} off`
                          : choice.name)
                      }
                      type="button"
                    >
                      <span className="preset-name">{choice.name}</span>
                      <span className="preset-kind">
                        {PRESET_GROUP_NAMES[choice.group]}
                        {choice.on ? " · on the field" : ""}
                      </span>
                    </button>
                    <button
                      aria-label={
                        star ? `Unstar ${choice.name}` : `Star ${choice.name}`
                      }
                      aria-pressed={star}
                      className={`preset-star${star ? " on" : ""}`}
                      onClick={() => onToggleFavorite(choice.key)}
                      title={
                        star
                          ? "Take it off Favorites"
                          : "Keep it under Favorites"
                      }
                      type="button"
                    >
                      {star ? "★" : "☆"}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Show on the field — the four layer toggles, moved off the idle panel into
 * a popover the Coach opens when he means to change what is drawn. They
 * still change exports too, as they did.
 */
export function LayersPopover({
  layers,
  onToggle,
  open,
  onOpenChange,
}: {
  layers: readonly {
    readonly id: string;
    readonly name: string;
    readonly on: boolean;
  }[];
  onToggle: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shown = layers.filter(({ on }) => on).length;
  return (
    <div className="menu layers-menu">
      <button
        aria-expanded={open}
        aria-haspopup="true"
        className={`inspector-bar-button${open ? " open" : ""}`}
        onClick={() => onOpenChange(!open)}
        title="Show on the field — reads, assignments, notes, text"
        type="button"
      >
        Layers{shown < layers.length ? ` ${shown}/${layers.length}` : ""}
      </button>
      {open ? (
        <div
          aria-label="Show on the field"
          className="menu-panel layers-panel"
          role="group"
        >
          <div className="menu-head">SHOW ON THE FIELD</div>
          <div className="layer-toggles">
            {layers.map((layer) => (
              <button
                aria-pressed={layer.on}
                className={layer.on ? "active" : undefined}
                key={layer.id}
                onClick={() => onToggle(layer.id)}
                title={
                  layer.on
                    ? `Hide ${layer.name.toLowerCase()} everywhere, exports included`
                    : `Show ${layer.name.toLowerCase()} again`
                }
                type="button"
              >
                <span className="layer-dot" />
                {layer.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
