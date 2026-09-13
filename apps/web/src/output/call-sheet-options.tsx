import type { GamePlan, GamePlanRevision } from "@chalk/domain";
import {
  callSheetColumns,
  callSheetFit,
  callSheetTemplates,
  type CallSheetAccent,
  type CallSheetColumnId,
  type CallSheetConfig,
  type CallSheetSection,
} from "@chalk/exports";

const accents: readonly {
  readonly id: CallSheetAccent;
  readonly name: string;
}[] = [
  { id: "none", name: "None" },
  { id: "a", name: "Blue" },
  { id: "b", name: "Green" },
  { id: "c", name: "Orange" },
  { id: "d", name: "Purple" },
];

/**
 * The coordinator sheet's layout (issue #70): template, the sections that
 * print in the order they print with a title, an accent and a side, the
 * columns beside code and name, density, sides, thumbnails, and the ruled
 * notes column. What will not fit is said before printing.
 */
export function CallSheetOptions({
  config,
  onChange,
  plan,
  revision,
}: {
  config: CallSheetConfig;
  onChange: (next: CallSheetConfig) => void;
  plan: GamePlan;
  revision: GamePlanRevision;
}) {
  const fit = callSheetFit(revision, config);
  const nameOf = (sectionId: string) =>
    plan.sections.find(({ id }) => id === sectionId)?.name ?? "Section";
  const update = (index: number, patch: Partial<CallSheetSection>) =>
    onChange({
      ...config,
      sections: config.sections.map((section, at) =>
        at === index ? { ...section, ...patch } : section,
      ),
    });
  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= config.sections.length) return;
    const next = [...config.sections];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    onChange({ ...config, sections: next });
  };
  const remove = (index: number) =>
    onChange({
      ...config,
      sections: config.sections.filter((_, at) => at !== index),
    });
  const left = plan.sections.filter(
    (section) =>
      !config.sections.some(({ sectionId }) => sectionId === section.id),
  );
  const toggleColumn = (id: CallSheetColumnId) =>
    onChange({
      ...config,
      columns: config.columns.includes(id)
        ? config.columns.filter((column) => column !== id)
        : [...config.columns, id],
    });

  return (
    <div
      className="call-sheet-options"
      role="group"
      aria-label="Call sheet layout"
    >
      <div className="sub-heading">Template</div>
      <div className="segments">
        {callSheetTemplates.map((template) => (
          <button
            aria-pressed={config.template === template.id}
            className={config.template === template.id ? "active" : undefined}
            key={template.id}
            onClick={() =>
              onChange({
                ...config,
                template: template.id,
                columns: template.columns,
              })
            }
            title={template.hint}
            type="button"
          >
            {template.id.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="sub-heading">Sections, in print order</div>
      <ol className="call-sheet-sections" aria-label="Sections on the sheet">
        {config.sections.map((section, index) => (
          <li key={section.sectionId}>
            <input
              aria-label={`Title for ${nameOf(section.sectionId)}`}
              onChange={(event) =>
                update(index, {
                  ...(event.target.value.trim()
                    ? { title: event.target.value }
                    : { title: undefined }),
                })
              }
              placeholder={nameOf(section.sectionId)}
              value={section.title ?? ""}
            />
            <select
              aria-label={`Accent for ${nameOf(section.sectionId)}`}
              onChange={(event) =>
                update(index, { accent: event.target.value as CallSheetAccent })
              }
              value={section.accent}
            >
              {accents.map((accent) => (
                <option key={accent.id} value={accent.id}>
                  {accent.name}
                </option>
              ))}
            </select>
            {config.sides === 2 ? (
              <select
                aria-label={`Side for ${nameOf(section.sectionId)}`}
                onChange={(event) =>
                  update(index, { side: event.target.value === "2" ? 2 : 1 })
                }
                value={section.side}
              >
                <option value={1}>Side 1</option>
                <option value={2}>Side 2</option>
              </select>
            ) : null}
            <button
              aria-label={`Move ${nameOf(section.sectionId)} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
              type="button"
            >
              ↑
            </button>
            <button
              aria-label={`Move ${nameOf(section.sectionId)} down`}
              disabled={index === config.sections.length - 1}
              onClick={() => move(index, 1)}
              type="button"
            >
              ↓
            </button>
            <button
              aria-label={`Leave ${nameOf(section.sectionId)} off the sheet`}
              onClick={() => remove(index)}
              type="button"
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      {left.length > 0 ? (
        <div className="call-sheet-left">
          {left.map((section) => (
            <button
              key={section.id}
              onClick={() =>
                onChange({
                  ...config,
                  sections: [
                    ...config.sections,
                    {
                      sectionId: section.id,
                      accent: "none",
                      side: config.sides,
                    },
                  ],
                })
              }
              type="button"
            >
              + {section.name}
            </button>
          ))}
        </div>
      ) : null}
      <p className="output-note">
        Sections are renamed and reordered for the plan under Playbooks → Game
        plans; a title here changes this sheet only.
      </p>
      <div className="sub-heading">Columns beside code and call</div>
      <div className="call-sheet-columns" role="group" aria-label="Columns">
        {callSheetColumns.map((column) => (
          <label key={column.id} title={column.hint}>
            <input
              checked={config.columns.includes(column.id)}
              onChange={() => toggleColumn(column.id)}
              type="checkbox"
            />
            {column.name}
            {column.source === "blank" ? <small> · blank</small> : null}
          </label>
        ))}
      </div>
      <div className="sub-heading">Density and sides</div>
      <div className="segments">
        {(["normal", "compact"] as const).map((density) => (
          <button
            aria-pressed={config.density === density}
            className={config.density === density ? "active" : undefined}
            key={density}
            onClick={() => onChange({ ...config, density })}
            type="button"
          >
            {density === "normal" ? "Normal" : "Compact"}
          </button>
        ))}
      </div>
      <div className="segments">
        {([1, 2] as const).map((sides) => (
          <button
            aria-pressed={config.sides === sides}
            className={config.sides === sides ? "active" : undefined}
            key={sides}
            onClick={() => onChange({ ...config, sides })}
            type="button"
          >
            {sides === 1 ? "One side" : "Two sides"}
          </button>
        ))}
      </div>
      <label className="output-check">
        <input
          checked={config.thumbnails}
          onChange={(event) =>
            onChange({ ...config, thumbnails: event.target.checked })
          }
          type="checkbox"
        />
        Small diagrams beside each call
      </label>
      <label className="output-check">
        <input
          checked={config.notesColumn}
          onChange={(event) =>
            onChange({ ...config, notesColumn: event.target.checked })
          }
          type="checkbox"
        />
        Ruled notes column
      </label>
      {fit.warnings.length > 0 ? (
        <ul className="call-sheet-warnings" aria-label="Before printing">
          {fit.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : (
        <p className="output-note">
          Every section fits a column at this density — {fit.rowsPerColumn}{" "}
          calls each.
        </p>
      )}
    </div>
  );
}
