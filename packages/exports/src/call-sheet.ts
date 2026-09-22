import {
  revisionRows,
  type CallRow,
  type Formation,
  type GamePlan,
  type GamePlanRevision,
  type PlayUnit,
  type SectionRows,
} from "@chalk/domain";

import { playMeta } from "./coaching-rows";
import type { DiagramRenderer } from "./diagram";
import { WRISTBAND_DIAGRAM_OPTIONS } from "./print-documents";
import { preparedStamp } from "./game-plan-documents";
import { escapeHtml, printDocumentHtml } from "./print-documents";
import { unitBadgeHtml } from "./unit-badge";

/**
 * A coordinator's call sheet, configured rather than assumed (issue #70):
 * which sections print, in what order and with what accent, which columns
 * stand beside the code and the name, how dense, and on one side or two.
 * Every call wears the same stable code the wristband and Game Day use.
 */
export type CallSheetTemplateId = "oc" | "dc";

/**
 * A column is either read off the Play — personnel, formation, type, tags,
 * the call's note — or left blank for a pen: alert, check, adjustment,
 * tendency. The words are a starting point; a Coach picks his own.
 */
export type CallSheetColumnId =
  | "personnel"
  | "formation"
  | "type"
  | "tags"
  | "note"
  | "alert"
  | "protection"
  | "motion"
  | "front"
  | "coverage"
  | "pressure"
  | "check"
  | "tendency"
  | "adjustment";

export interface CallSheetColumn {
  readonly id: CallSheetColumnId;
  readonly name: string;
  /** Read off the Play, or ruled blank for the coordinator's pen. */
  readonly source: "play" | "blank";
  readonly hint: string;
}

export const callSheetColumns: readonly CallSheetColumn[] = Object.freeze([
  {
    id: "personnel",
    name: "Personnel",
    source: "play",
    hint: "The play's personnel label",
  },
  {
    id: "formation",
    name: "Formation",
    source: "play",
    hint: "The formation the play was drawn from",
  },
  {
    id: "type",
    name: "Type",
    source: "play",
    hint: "Run, Pass, RPO… as classified",
  },
  {
    id: "tags",
    name: "Tags",
    source: "play",
    hint: "The play's tags, comma-separated",
  },
  {
    id: "note",
    name: "Call note",
    source: "play",
    hint: "The note written on the call in the plan",
  },
  {
    id: "protection",
    name: "Protection",
    source: "blank",
    hint: "Ruled blank",
  },
  { id: "motion", name: "Motion", source: "blank", hint: "Ruled blank" },
  { id: "alert", name: "Alert", source: "blank", hint: "Ruled blank" },
  { id: "front", name: "Front", source: "blank", hint: "Ruled blank" },
  { id: "coverage", name: "Coverage", source: "blank", hint: "Ruled blank" },
  { id: "pressure", name: "Pressure", source: "blank", hint: "Ruled blank" },
  { id: "check", name: "Check", source: "blank", hint: "Ruled blank" },
  { id: "tendency", name: "Tendency", source: "blank", hint: "Ruled blank" },
  {
    id: "adjustment",
    name: "Adjustment",
    source: "blank",
    hint: "Ruled blank",
  },
]);

export type CallSheetAccent = "none" | "a" | "b" | "c" | "d";

export interface CallSheetSection {
  readonly sectionId: string;
  /** Printed in place of the plan's section name when set. */
  readonly title?: string;
  readonly accent: CallSheetAccent;
  /** Which side of a two-sided sheet; ignored on one side. */
  readonly side: 1 | 2;
}

export type CallSheetDensity = "normal" | "compact";

export interface CallSheetConfig {
  readonly template: CallSheetTemplateId;
  /** The sections that print, in the order they print. */
  readonly sections: readonly CallSheetSection[];
  /** Sections the Coach left off on purpose; they are not put back. */
  readonly omitted: readonly string[];
  readonly columns: readonly CallSheetColumnId[];
  readonly density: CallSheetDensity;
  readonly sides: 1 | 2;
  readonly thumbnails: boolean;
  /** The ruled notes column on the right, as the original had. */
  readonly notesColumn: boolean;
}

export interface CallSheetTemplate {
  readonly id: CallSheetTemplateId;
  readonly name: string;
  readonly unit: PlayUnit;
  /** Section names a fresh plan of this unit tends to carry, for matching. */
  readonly columns: readonly CallSheetColumnId[];
  readonly hint: string;
}

export const callSheetTemplates: readonly CallSheetTemplate[] = Object.freeze([
  {
    id: "oc",
    name: "Offensive coordinator",
    unit: "offense",
    columns: ["personnel", "formation", "alert"],
    hint: "Opening script, base runs and concepts, down and distance, red zone, short yardage, two-minute",
  },
  {
    id: "dc",
    name: "Defensive coordinator",
    unit: "defense",
    columns: ["formation", "tags", "check"],
    hint: "Fronts, coverages and pressures by look, down and distance, red zone, backed up, two-minute",
  },
  // The special-teams sheet went with the special-teams unit (ADR 0053).
]);

export function callSheetTemplate(id: CallSheetTemplateId): CallSheetTemplate {
  return callSheetTemplates.find((template) => template.id === id)!;
}

/** The template a plan's unit points at, and a config built from the plan. */
export function defaultCallSheetConfig(plan: GamePlan): CallSheetConfig {
  const template =
    callSheetTemplates.find((candidate) => candidate.unit === plan.unit) ??
    callSheetTemplates[0]!;
  return {
    template: template.id,
    sections: plan.sections.map((section, index) => ({
      sectionId: section.id,
      accent: "none",
      side: index < Math.ceil(plan.sections.length / 2) ? 1 : 2,
    })),
    omitted: [],
    columns: template.columns,
    density: "normal",
    sides: 1,
    thumbnails: false,
    notesColumn: true,
  };
}

/**
 * A stored config brought up to date with the plan it prints: sections the
 * plan no longer has drop out, new ones join at the end, unknown columns are
 * dropped. A section the Coach left off stays off. Nothing else is changed
 * on the Coach's behalf.
 */
export function reconcileCallSheetConfig(
  config: CallSheetConfig,
  plan: GamePlan,
): CallSheetConfig {
  const known = new Set(plan.sections.map(({ id }) => id));
  const kept = config.sections.filter((section) =>
    known.has(section.sectionId),
  );
  const listed = new Set(kept.map(({ sectionId }) => sectionId));
  const omitted = config.omitted.filter(
    (id) => known.has(id) && !listed.has(id),
  );
  const off = new Set(omitted);
  const added = plan.sections
    .filter(({ id }) => !listed.has(id) && !off.has(id))
    .map((section): CallSheetSection => ({
      sectionId: section.id,
      accent: "none",
      side: 2,
    }));
  const columns = new Set(callSheetColumns.map(({ id }) => id));
  return {
    ...config,
    sections: [...kept, ...added],
    omitted,
    columns: config.columns.filter((id) => columns.has(id)),
  };
}

const densityRows: Record<CallSheetDensity, number> = {
  normal: 18,
  compact: 26,
};

export interface CallSheetFit {
  readonly warnings: readonly string[];
  /** Calls per column a side holds at this density before it flows. */
  readonly rowsPerColumn: number;
}

/**
 * Whether the sheet holds its calls without a section flowing off the
 * page, judged before any layout: each side gives every printed section a
 * column, and a column holds so many rows at each density. A section with
 * more says so, and the sheet flows onto another sheet rather than
 * shrinking or dropping calls.
 */
export function callSheetFit(
  revision: GamePlanRevision,
  config: CallSheetConfig,
): CallSheetFit {
  const rowsPerColumn = densityRows[config.density];
  const sections = new Map(
    revisionRows(revision).map((section) => [
      section.sectionId ?? "unsectioned",
      section,
    ]),
  );
  const warnings: string[] = [];
  for (const chosen of config.sections) {
    const section = sections.get(chosen.sectionId);
    if (!section) continue;
    const calls = section.calls.length;
    if (calls > rowsPerColumn) {
      warnings.push(
        `${chosen.title ?? section.name} lists ${calls} calls; a column holds ${rowsPerColumn} at ${config.density} density, so it flows onto another sheet.`,
      );
    }
    if (calls === 0) {
      warnings.push(
        `${chosen.title ?? section.name} has no calls and prints empty.`,
      );
    }
  }
  const missing = revision.plan.calls.filter((call) =>
    revision.missingPlayIds.includes(call.playId),
  );
  if (missing.length > 0) {
    warnings.push(
      `${missing.length} ${missing.length === 1 ? "call" : "calls"} (${missing
        .map((call) => call.code || "no code")
        .join(
          ", ",
        )}) print as missing — the play was deleted before the plan was prepared.`,
    );
  }
  const duplicates = new Map<string, number>();
  for (const call of revision.plan.calls) {
    const key = call.code.trim().toUpperCase();
    if (!key) continue;
    duplicates.set(key, (duplicates.get(key) ?? 0) + 1);
  }
  for (const [code, count] of duplicates) {
    if (count > 1) warnings.push(`Code ${code} is on ${count} calls.`);
  }
  return { warnings, rowsPerColumn };
}

/** What a column shows for one call, or blank for a ruled write-in. */
export function callSheetCell(
  column: CallSheetColumnId,
  row: CallRow,
  formations: readonly Formation[],
): string {
  const play = row.play;
  switch (column) {
    case "personnel":
      return play ? playMeta(play, formations).personnel : "";
    case "formation":
      return play ? playMeta(play, formations).formation : "";
    case "type":
      return play?.playType?.name ?? "";
    case "tags":
      return play ? play.tags.join(", ") : "";
    case "note":
      return row.note ?? "";
    default:
      return "";
  }
}

const accentInk: Record<CallSheetAccent, string> = {
  none: "#8F8F8F",
  a: "#2f6fd6",
  b: "#2b8a4a",
  c: "#c2410c",
  d: "#7c3aed",
};

const CONFIGURED_CSS =
  "@page{size:letter landscape;margin:0.4in}" +
  "body{font-size:12px}" +
  ".side{page-break-after:always;break-after:page;min-height:7.6in;display:flex;flex-direction:column}" +
  ".side:last-of-type{page-break-after:auto;break-after:auto}" +
  ".hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;border-bottom:2px solid #171717;padding-bottom:6px}" +
  ".hd h1{font-size:18px;margin:0;font-weight:600}" +
  ".hd .meta{font-size:10px;color:#4D4D4D;font-family:ui-monospace,Menlo,monospace;text-align:right}" +
  ".wrap{display:grid;gap:18px;align-content:start;flex:1}" +
  ".wrap.notes{grid-template-columns:1fr 2.2in}" +
  ".cols{column-count:2;column-gap:18px}" +
  ".compact .cols{column-count:3}" +
  ".col{break-inside:avoid;border-top:3px solid var(--accent,#8F8F8F);margin-bottom:14px;display:inline-block;width:100%}" +
  ".col h2{font-size:10px;letter-spacing:0.8px;text-transform:uppercase;color:var(--accent,#8F8F8F);margin:4px 0 4px;font-weight:600;font-family:ui-monospace,Menlo,monospace}" +
  ".col h2 .tag{display:inline-block;border:1px solid currentColor;border-radius:3px;padding:0 4px;margin-right:6px;font-size:8px}" +
  "table{width:100%;border-collapse:collapse}" +
  "th{font-size:8px;letter-spacing:0.6px;text-transform:uppercase;color:#8F8F8F;font-weight:500;text-align:left;padding:0 4px 3px 0;font-family:ui-monospace,Menlo,monospace}" +
  "td{vertical-align:top;padding:3px 4px 3px 0;border-bottom:1px solid #EBEBEB;word-wrap:break-word;overflow-wrap:anywhere}" +
  ".compact td{padding:1px 4px 1px 0;font-size:11px}" +
  "td.cc{font-family:ui-monospace,Menlo,monospace;font-weight:700;width:2.4em;white-space:nowrap}" +
  "td.nm{font-weight:500;min-width:1.4in}" +
  "td.bl{border-bottom:1px solid #C9C9C9;min-width:0.8in}" +
  "td.pl{width:0.9in}" +
  "td.th{width:1.1in}td.th svg{width:1in;height:auto;display:block}" +
  ".miss{color:#8F8F8F}.mp{font-style:normal;font-size:8px;letter-spacing:0.6px;text-transform:uppercase;color:#E5484D;border:1px solid #E5484D;border-radius:3px;padding:0 3px;margin-left:4px}" +
  ".nh{font-size:10px;letter-spacing:0.8px;text-transform:uppercase;color:#8F8F8F;margin:0 0 6px;font-weight:500;font-family:ui-monospace,Menlo,monospace}" +
  ".wl{height:24px;border-bottom:1px solid #EBEBEB}" +
  ".foot{margin-top:auto;padding-top:6px;font-size:9px;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace;display:flex;justify-content:space-between}";

export interface ConfiguredCallSheetOptions {
  readonly productName?: string;
  readonly formations?: readonly Formation[];
  /** Needed only when thumbnails are on. */
  readonly render?: DiagramRenderer;
}

function sectionHtml(
  section: SectionRows,
  chosen: CallSheetSection,
  config: CallSheetConfig,
  options: ConfiguredCallSheetOptions,
  index: number,
): string {
  const columns = config.columns.map((id) =>
    callSheetColumns.find((c) => c.id === id)!,
  );
  const head =
    "<tr><th>#</th><th>Call</th>" +
    (config.thumbnails ? "<th></th>" : "") +
    columns.map((column) => `<th>${escapeHtml(column.name)}</th>`).join("") +
    "</tr>";
  const rows = section.calls
    .map((row) => {
      const flag = row.missing ? ' <em class="mp">missing</em>' : "";
      const thumb =
        config.thumbnails && options.render && row.play
          ? `<td class="th">${options.render(row.play, WRISTBAND_DIAGRAM_OPTIONS)}</td>`
          : config.thumbnails
            ? '<td class="th"></td>'
            : "";
      const cells = columns
        .map((column) =>
          column.source === "blank"
            ? '<td class="bl"></td>'
            : `<td class="pl">${escapeHtml(callSheetCell(column.id, row, options.formations ?? []))}</td>`,
        )
        .join("");
      return (
        `<tr class="${row.missing ? "miss" : ""}"><td class="cc">${escapeHtml(row.code.trim() || "—")}</td>` +
        `<td class="nm">${escapeHtml(row.name)}${flag}</td>${thumb}${cells}</tr>`
      );
    })
    .join("");
  const label =
    chosen.accent === "none"
      ? ""
      : `<span class="tag">${String.fromCharCode(64 + index + 1)}</span>`;
  return (
    `<div class="col" style="--accent:${accentInk[chosen.accent]}"><h2>${label}${escapeHtml(chosen.title ?? section.name)}</h2>` +
    `<table><thead>${head}</thead><tbody>${rows}</tbody></table></div>`
  );
}

/**
 * The configured sheet: one landscape sheet per side, each side's sections
 * in the order chosen, every call as its stable code and full name, the
 * columns read off the Play or ruled blank, and the header naming plan,
 * opponent, unit, and the prepared date and label. Long names wrap; nothing
 * is cut. A section accent prints as a colour, a letter and a rule, so it
 * survives a copier.
 */
export function configuredCallSheetHtml(
  revision: GamePlanRevision,
  config: CallSheetConfig,
  options: ConfiguredCallSheetOptions = {},
): string {
  const bySection = new Map(
    revisionRows(revision).map((section) => [
      section.sectionId ?? "unsectioned",
      section,
    ]),
  );
  const chosen = config.sections.filter((section) =>
    bySection.has(section.sectionId),
  );
  const sides = config.sides === 2 ? [1, 2] : [1];
  const template = callSheetTemplate(config.template);
  // The count is what this sheet prints, a call counted once however many
  // sections list it; sections the Coach left off are said so, never
  // counted as printed.
  const printed = new Set(
    chosen.flatMap((section) =>
      bySection.get(section.sectionId)!.calls.map((row) => row.callId),
    ),
  ).size;
  const total = revision.plan.calls.length;
  const count =
    printed === total
      ? `${total} calls`
      : `${printed} of ${total} calls — ${total - printed} left off this sheet`;
  // Each part escaped on its own: the Unit is a badge, not text.
  const meta = [
    escapeHtml(revision.plan.opponent ? `vs ${revision.plan.opponent}` : ""),
    escapeHtml(revision.plan.gameLabel ?? ""),
    unitBadgeHtml(revision.plan.unit),
    escapeHtml(preparedStamp(revision)),
  ]
    .filter((part) => part.length > 0)
    .join(" · ");
  const body = sides
    .map((side) => {
      const here = chosen.filter(
        (section) => config.sides === 1 || section.side === side,
      );
      const columns = here
        .map((section, index) =>
          sectionHtml(
            bySection.get(section.sectionId)!,
            section,
            config,
            options,
            index,
          ),
        )
        .join("");
      const notes =
        config.notesColumn && side === 1
          ? `<div><div class="nh">In-game notes</div>${'<div class="wl"></div>'.repeat(12)}</div>`
          : "";
      return (
        `<div class="side${config.density === "compact" ? " compact" : ""}">` +
        `<div class="hd"><h1>${escapeHtml(revision.plan.name)} — ${escapeHtml(template.name)}</h1><div class="meta">${meta}${
          sides.length > 1 ? `<br>Side ${side} of ${sides.length}` : ""
        }</div></div>` +
        `<div class="wrap${notes ? " notes" : ""}"><div class="cols">${columns}</div>${notes}</div>` +
        `<div class="foot"><span>${count} · codes as on the wristband and Game Day</span><span>${escapeHtml(revision.id)}</span></div>` +
        "</div>"
      );
    })
    .join("");
  return printDocumentHtml({
    title: `${revision.plan.name} — ${template.name} call sheet`,
    css: CONFIGURED_CSS,
    body,
    ...(options.productName === undefined
      ? {}
      : { productName: options.productName }),
  });
}

export function readCallSheetConfigs(
  value: unknown,
): Readonly<Record<string, CallSheetConfig>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, CallSheetConfig> = {};
  const templates = new Set(callSheetTemplates.map(({ id }) => id));
  const columns = new Set(callSheetColumns.map(({ id }) => id));
  const accents = new Set<string>(["none", "a", "b", "c", "d"]);
  for (const [planId, raw] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (
      typeof r.template !== "string" ||
      !templates.has(r.template as CallSheetTemplateId)
    )
      continue;
    out[planId] = {
      template: r.template as CallSheetTemplateId,
      sections: Array.isArray(r.sections)
        ? r.sections.flatMap((s): CallSheetSection[] => {
            if (!s || typeof s !== "object") return [];
            const sec = s as Record<string, unknown>;
            if (typeof sec.sectionId !== "string") return [];
            return [
              {
                sectionId: sec.sectionId,
                ...(typeof sec.title === "string" ? { title: sec.title } : {}),
                accent:
                  typeof sec.accent === "string" && accents.has(sec.accent)
                    ? (sec.accent as CallSheetAccent)
                    : "none",
                side: sec.side === 2 ? 2 : 1,
              },
            ];
          })
        : [],
      columns: Array.isArray(r.columns)
        ? r.columns.filter(
            (c): c is CallSheetColumnId =>
              typeof c === "string" && columns.has(c as CallSheetColumnId),
          )
        : [],
      omitted: Array.isArray(r.omitted)
        ? r.omitted.filter((id): id is string => typeof id === "string")
        : [],
      density: r.density === "compact" ? "compact" : "normal",
      sides: r.sides === 2 ? 2 : 1,
      thumbnails: r.thumbnails === true,
      notesColumn: r.notesColumn !== false,
    };
  }
  return out;
}
