import {
  revisionRows,
  type CallRow,
  type GamePlanRevision,
} from "@chalk/domain";

import type { DiagramRenderer } from "./diagram";
import { preparedStamp } from "./game-plan-documents";
import {
  WRISTBAND_DIAGRAM_OPTIONS,
  escapeHtml,
  printDocumentHtml,
} from "./print-documents";

/**
 * Wristband inserts a Coach sizes himself (issue #71): the cell's width and
 * height in inches, how many across and down one insert, which calls go on
 * and in what order, and whether a cell shows the code with the name, the
 * code with the diagram, or both. Every cell wears the plan's stable call
 * code; a short display name is the Coach's own and never replaces it.
 */
export type WristbandLayout = "code-name" | "code-diagram" | "mixed";

export interface WristbandCall {
  readonly callId: string;
  /** A shorter name for a small cell; the full name stays on the call. */
  readonly shortName?: string;
}

export interface WristbandConfig {
  readonly cellWidthIn: number;
  readonly cellHeightIn: number;
  readonly columns: number;
  readonly rows: number;
  readonly layout: WristbandLayout;
  /** The calls on the band, in order; confirmed by the Coach. */
  readonly calls: readonly WristbandCall[];
  /** The size preset this came from, for the menu; dimensions are the truth. */
  readonly presetId?: string;
}

export interface WristbandSizePreset {
  readonly id: string;
  /** Named by its dimensions — no claim about any maker's band. */
  readonly name: string;
  readonly cellWidthIn: number;
  readonly cellHeightIn: number;
  readonly columns: number;
  readonly rows: number;
}

export const wristbandSizePresets: readonly WristbandSizePreset[] =
  Object.freeze([
    {
      id: "2.1x1.4-2x4",
      name: "2.1 × 1.4 in cells, 2 across × 4 down (the original's sheet)",
      cellWidthIn: 2.1,
      cellHeightIn: 1.4,
      columns: 2,
      rows: 4,
    },
    {
      id: "3x1.5-1x3",
      name: "3 × 1.5 in cells, 1 across × 3 down",
      cellWidthIn: 3,
      cellHeightIn: 1.5,
      columns: 1,
      rows: 3,
    },
    {
      id: "2.5x1-2x6",
      name: "2.5 × 1 in cells, 2 across × 6 down",
      cellWidthIn: 2.5,
      cellHeightIn: 1,
      columns: 2,
      rows: 6,
    },
    {
      id: "1.75x1.25-3x5",
      name: "1.75 × 1.25 in cells, 3 across × 5 down",
      cellWidthIn: 1.75,
      cellHeightIn: 1.25,
      columns: 3,
      rows: 5,
    },
  ]);

export const wristbandLayouts: readonly {
  readonly id: WristbandLayout;
  readonly name: string;
  readonly hint: string;
}[] = Object.freeze([
  {
    id: "code-name",
    name: "Code + name",
    hint: "The number big, the name under it",
  },
  {
    id: "code-diagram",
    name: "Code + diagram",
    hint: "The number over the thin diagram",
  },
  {
    id: "mixed",
    name: "Code, name + diagram",
    hint: "All three, for a bigger cell",
  },
]);

/** One call per cell, in plan order: the first listing of each Play. */
export function wristbandCallsOf(
  revision: GamePlanRevision,
): readonly CallRow[] {
  const seen = new Set<string>();
  const out: CallRow[] = [];
  for (const section of revisionRows(revision)) {
    for (const row of section.calls) {
      if (seen.has(row.callId)) continue;
      seen.add(row.callId);
      out.push(row);
    }
  }
  return out;
}

/** The original's band, every call of the plan on it in plan order — to confirm. */
export function defaultWristbandConfig(
  revision: GamePlanRevision,
): WristbandConfig {
  const preset = wristbandSizePresets[0]!;
  return {
    cellWidthIn: preset.cellWidthIn,
    cellHeightIn: preset.cellHeightIn,
    columns: preset.columns,
    rows: preset.rows,
    layout: "code-diagram",
    calls: wristbandCallsOf(revision).map((row) => ({ callId: row.callId })),
    presetId: preset.id,
  };
}

/** A stored band brought up to date: calls the plan no longer has drop out. */
export function reconcileWristbandConfig(
  config: WristbandConfig,
  revision: GamePlanRevision,
): WristbandConfig {
  const known = new Set(wristbandCallsOf(revision).map((row) => row.callId));
  return {
    ...config,
    calls: config.calls.filter((call) => known.has(call.callId)),
  };
}

export interface WristbandCell {
  readonly callId: string;
  readonly code: string;
  readonly name: string;
  readonly shortName?: string;
  readonly row?: CallRow;
}

export interface WristbandInsert {
  readonly index: number;
  readonly total: number;
  readonly cells: readonly WristbandCell[];
}

/** The inserts, as many as the calls need; nothing is left off. */
export function wristbandInserts(
  revision: GamePlanRevision,
  config: WristbandConfig,
): readonly WristbandInsert[] {
  const rows = new Map(
    wristbandCallsOf(revision).map((row) => [row.callId, row]),
  );
  const cells: WristbandCell[] = config.calls.map((call) => {
    const row = rows.get(call.callId);
    return {
      callId: call.callId,
      code: row?.code.trim() || "—",
      name: row?.name ?? "Missing play",
      ...(call.shortName?.trim() ? { shortName: call.shortName.trim() } : {}),
      ...(row ? { row } : {}),
    };
  });
  const per = Math.max(1, Math.trunc(config.columns) * Math.trunc(config.rows));
  const inserts: WristbandInsert[] = [];
  const total = Math.max(1, Math.ceil(cells.length / per));
  for (let index = 0; index < total; index += 1) {
    inserts.push({
      index: index + 1,
      total,
      cells: cells.slice(index * per, (index + 1) * per),
    });
  }
  return inserts;
}

/** About how many characters a cell this wide takes at the cell's type sizes. */
function charsAcross(widthIn: number, ptSize: number): number {
  // Helvetica averages ~0.5 em per character; 72 pt to the inch, 6 px of padding each side.
  return Math.floor(((widthIn - 0.17) * 72) / (ptSize * 0.52));
}

export interface WristbandFit {
  readonly warnings: readonly string[];
  readonly inserts: number;
  readonly cellsPerInsert: number;
}

/**
 * What would go wrong on paper, said first: a code on two cells, a call whose
 * Play is gone, a name that will not fit its cell at this size (say a short
 * name instead of letting it be cut), and a cell too short for a diagram.
 */
export function wristbandFit(
  revision: GamePlanRevision,
  config: WristbandConfig,
): WristbandFit {
  const inserts = wristbandInserts(revision, config);
  const warnings: string[] = [];
  const codes = new Map<string, number>();
  for (const insert of inserts) {
    for (const cell of insert.cells) {
      const key = cell.code.toUpperCase();
      if (key !== "—") codes.set(key, (codes.get(key) ?? 0) + 1);
      if (!cell.row?.play) {
        warnings.push(
          `Call ${cell.code} has no play in the packet and prints as missing.`,
        );
      }
      if (cell.code === "—") warnings.push(`${cell.name} has no call code.`);
      const shown = cell.shortName ?? cell.name;
      const size = config.layout === "code-name" ? 10 : 8;
      const fits =
        charsAcross(config.cellWidthIn, size) *
        (config.layout === "code-name" ? 2 : 1);
      if (shown.length > fits) {
        warnings.push(
          `"${shown}" is ${shown.length} characters; about ${fits} fit a ${config.cellWidthIn} in cell${
            cell.shortName ? "" : " — give it a short name"
          }.`,
        );
      }
    }
  }
  for (const [code, count] of codes) {
    if (count > 1) warnings.push(`Code ${code} is on ${count} cells.`);
  }
  if (config.layout !== "code-name" && config.cellHeightIn < 1) {
    warnings.push(
      `A ${config.cellHeightIn} in cell is too short for a diagram; use Code + name or a taller cell.`,
    );
  }
  if (config.calls.length === 0) warnings.push("No calls are on the band yet.");
  return {
    warnings,
    inserts: inserts.length,
    cellsPerInsert: Math.max(
      1,
      Math.trunc(config.columns) * Math.trunc(config.rows),
    ),
  };
}

export interface ConfiguredWristbandOptions {
  readonly productName?: string;
  readonly render: DiagramRenderer;
}

/**
 * The inserts at their physical size: each on its own sheet with cut guides
 * at the cell edges and crop ticks at the corners, a one-inch calibration
 * bar to hold a ruler against, and the instruction to print at 100 %.
 * Names wrap inside the cell rather than being cut; a name that will not
 * fit is said before printing.
 */
export function configuredWristbandHtml(
  revision: GamePlanRevision,
  config: WristbandConfig,
  options: ConfiguredWristbandOptions,
): string {
  const inserts = wristbandInserts(revision, config);
  const w = config.cellWidthIn;
  const h = config.cellHeightIn;
  const cell = (item: WristbandCell): string => {
    const shown = escapeHtml(item.shortName ?? item.name);
    const missing = !item.row?.play;
    const diagram =
      config.layout !== "code-name" && item.row?.play
        ? options.render(item.row.play, WRISTBAND_DIAGRAM_OPTIONS)
        : "";
    const name =
      config.layout !== "code-diagram" || missing
        ? `<span class="nm">${shown}${missing ? " · missing" : ""}</span>`
        : "";
    return (
      `<div class="wc${missing ? " miss" : ""} ${config.layout}"><b class="cc">${escapeHtml(item.code)}</b>${name}${diagram}` +
      '<i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></div>'
    );
  };
  const body = inserts
    .map(
      (insert) =>
        `<div class="wb"><div class="wl"><span>${escapeHtml(revision.plan.name)} · ${escapeHtml(preparedStamp(revision))}${
          insert.total > 1 ? ` · Insert ${insert.index} of ${insert.total}` : ""
        }</span><span class="cal"><i></i> 1 in — check with a ruler; print at 100 % (Actual size), not Fit to page</span></div>` +
        `<div class="wg">${insert.cells.map(cell).join("")}</div></div>`,
    )
    .join("");
  const code =
    config.layout === "code-name" ? Math.min(26, Math.round(h * 20)) : 12;
  return printDocumentHtml({
    title: `${revision.plan.name} — wristband inserts`,
    css:
      "@page{size:letter portrait;margin:0.5in}" +
      ".wb{page-break-after:always;break-after:page}" +
      ".wb:last-of-type{page-break-after:auto;break-after:auto}" +
      ".wl{display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace;margin:0 0 8px}" +
      ".cal i{display:inline-block;width:1in;height:6px;border:1px solid #171717;border-top:0;vertical-align:middle;margin-right:6px}" +
      `.wg{display:grid;grid-template-columns:repeat(${Math.max(1, Math.trunc(config.columns))},${w}in);grid-auto-rows:${h}in;justify-content:start}` +
      `.wc{position:relative;width:${w}in;height:${h}in;border:0.5px dashed #8F8F8F;padding:0.06in;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box}` +
      `.wc .cc{font-family:ui-monospace,Menlo,monospace;font-weight:700;font-size:${code}pt;line-height:1;flex:none}` +
      ".wc.code-name .cc{font-size:" +
      code +
      "pt}" +
      ".wc .nm{font-size:8pt;line-height:1.15;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;overflow-wrap:anywhere;flex:none}" +
      ".wc.code-name .nm{font-size:10pt}" +
      ".wc svg{width:100%;height:auto;flex:1;min-height:0;display:block}" +
      ".wc.miss{color:#8F8F8F}" +
      ".wc i{position:absolute;width:0.12in;height:0.12in;border:0 solid #171717;pointer-events:none}" +
      ".wc .tl{top:-1px;left:-1px;border-top-width:1px;border-left-width:1px}" +
      ".wc .tr{top:-1px;right:-1px;border-top-width:1px;border-right-width:1px}" +
      ".wc .bl{bottom:-1px;left:-1px;border-bottom-width:1px;border-left-width:1px}" +
      ".wc .br{bottom:-1px;right:-1px;border-bottom-width:1px;border-right-width:1px}",
    body,
    ...(options.productName === undefined
      ? {}
      : { productName: options.productName }),
  });
}

export function readWristbandConfigs(
  value: unknown,
): Readonly<Record<string, WristbandConfig>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, WristbandConfig> = {};
  const layouts = new Set<string>(wristbandLayouts.map(({ id }) => id));
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(max, Math.max(min, v))
      : fallback;
  for (const [planId, raw] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    out[planId] = {
      cellWidthIn: num(r.cellWidthIn, 2.1, 0.5, 7.5),
      cellHeightIn: num(r.cellHeightIn, 1.4, 0.4, 10),
      columns: Math.trunc(num(r.columns, 2, 1, 6)),
      rows: Math.trunc(num(r.rows, 4, 1, 12)),
      layout:
        typeof r.layout === "string" && layouts.has(r.layout)
          ? (r.layout as WristbandLayout)
          : "code-diagram",
      calls: Array.isArray(r.calls)
        ? r.calls.flatMap((c): WristbandCall[] => {
            if (!c || typeof c !== "object") return [];
            const call = c as Record<string, unknown>;
            if (typeof call.callId !== "string") return [];
            return [
              {
                callId: call.callId,
                ...(typeof call.shortName === "string"
                  ? { shortName: call.shortName }
                  : {}),
              },
            ];
          })
        : [],
      ...(typeof r.presetId === "string" ? { presetId: r.presetId } : {}),
    };
  }
  return out;
}
