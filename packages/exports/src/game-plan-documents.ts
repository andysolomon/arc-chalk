import {
  PRODUCT_NAME,
  gamePlanSubtitle,
  planPlayIds,
  revisionRows,
  unitName,
  type CallRow,
  type Concept,
  type Formation,
  type GamePlanRevision,
  type PlayDocument,
} from "@chalk/domain";

import { playMeta } from "./coaching-rows";
import type { DiagramRenderer } from "./diagram";
import {
  BOOK_CSS,
  CALL_SHEET_CSS,
  WRISTBAND_CSS,
  WRISTBAND_DIAGRAM_OPTIONS,
  callSheetBody,
  escapeHtml,
  installBody,
  installCss,
  printDocumentHtml,
} from "./print-documents";

/**
 * The game-day packet. Every sheet here reads one prepared revision and
 * nothing else — not the library, not the open Play — so the wristband a
 * quarterback wears, the sheet the coordinator holds, and the handout in a
 * player's binder all say the same call numbers over the same diagrams, and
 * a Play edited after Thursday's prepare cannot change any of them.
 */

const MISSING_NAME = "Missing play";
const BLANK_CODE = "—";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `13 Sep 2026`, the same on every device and locale. */
function stampDate(atMs: number): string {
  const date = new Date(atMs);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "Prepared 13 Sep 2026 · Thursday" — the same words on every sheet. */
export function preparedStamp(revision: GamePlanRevision): string {
  const date = stampDate(revision.createdAtMs);
  const label = revision.label?.trim();
  return `Prepared ${date}${label ? ` · ${label}` : ""}`;
}

/** The line under a plan's name: opponent, unit, and when it was prepared. */
function planLine(revision: GamePlanRevision): string {
  return [
    gamePlanSubtitle(revision.plan),
    unitName(revision.plan.unit),
    preparedStamp(revision),
  ]
    .filter((part) => part.length > 0)
    .join(" · ");
}

const codeOf = (row: CallRow): string => row.code.trim() || BLANK_CODE;

function callRowHtml(row: CallRow): string {
  const flag = row.missing ? ' <em class="mp">missing</em>' : "";
  const note = row.note ? `<div class="rn">${escapeHtml(row.note)}</div>` : "";
  return (
    `<div class="row${row.missing ? " miss" : ""}"><span class="cc">${escapeHtml(codeOf(row))}</span>` +
    `<span>${escapeHtml(row.name)}${flag}</span>${note}</div>`
  );
}

export interface GamePlanSheetOptions {
  readonly productName?: string;
}

/**
 * Call sheet — one column per section in plan order, each call as its code
 * and name, the ruled notes column beside them. A call that answers in two
 * situations prints in both with the same code; a Play that is gone prints
 * as missing rather than leaving a number silent.
 */
export function gamePlanCallSheetHtml(
  revision: GamePlanRevision,
  options: GamePlanSheetOptions = {},
): string {
  const columns = revisionRows(revision)
    .map(
      (section) =>
        `<div class="col"><h2>${escapeHtml(section.name)}</h2>` +
        section.calls.map(callRowHtml).join("") +
        "</div>",
    )
    .join("");
  const heading =
    `<h1>${escapeHtml(revision.plan.name)}</h1>` +
    `<div class="sub">${escapeHtml(planLine(revision))}</div>`;
  return printDocumentHtml({
    title: `${revision.plan.name} — call sheet`,
    css:
      CALL_SHEET_CSS +
      "h1{margin-bottom:4px}" +
      ".sub{font-size:10px;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace;margin:0 0 12px}" +
      ".row{display:flex;flex-wrap:wrap;gap:0 8px;align-items:baseline}" +
      ".row .cc{font-family:ui-monospace,Menlo,monospace;font-weight:600;min-width:2.2em}" +
      ".row .rn{flex-basis:100%;font-size:9px;color:#8F8F8F;padding-left:calc(2.2em + 8px)}" +
      ".row.miss{color:#8F8F8F}" +
      ".mp{font-style:normal;font-size:8px;letter-spacing:0.6px;text-transform:uppercase;color:#E5484D;border:1px solid #E5484D;border-radius:3px;padding:0 3px;margin-left:4px}",
    body: callSheetBody(heading, columns),
    ...(options.productName === undefined
      ? {}
      : { productName: options.productName }),
  });
}

export interface GamePlanWristbandOptions extends GamePlanSheetOptions {
  readonly render: DiagramRenderer;
  /** How many cells the band has; the original's sheet cuts eight. */
  readonly cells?: number;
}

/** The first call for a Play, so a cell can wear its code. */
function firstCallByPlay(revision: GamePlanRevision): Map<string, CallRow> {
  const byPlay = new Map<string, CallRow>();
  for (const section of revisionRows(revision)) {
    for (const row of section.calls) {
      if (!byPlay.has(row.playId)) byPlay.set(row.playId, row);
    }
  }
  return byPlay;
}

/**
 * Wristband — the plan's Plays in plan order, each cell wearing its call
 * code over the thin diagram, cut at the band's cell count.
 */
export function gamePlanWristbandHtml(
  revision: GamePlanRevision,
  options: GamePlanWristbandOptions,
): string {
  const limit = Math.max(1, Math.trunc(options.cells ?? 8));
  const rows = firstCallByPlay(revision);
  const cells = planPlayIds(revision.plan)
    .slice(0, limit)
    .map((playId) => {
      const row = rows.get(playId);
      const code = row ? codeOf(row) : BLANK_CODE;
      const play = row?.play;
      if (!play) {
        return (
          `<div class="wc miss"><b><span class="cc">${escapeHtml(code)}</span> ${escapeHtml(row?.name ?? MISSING_NAME)}</b>` +
          `<span>${MISSING_NAME.toLowerCase()}</span></div>`
        );
      }
      return (
        `<div class="wc"><b><span class="cc">${escapeHtml(code)}</span> ${escapeHtml(play.name)}</b>` +
        options.render(play, WRISTBAND_DIAGRAM_OPTIONS) +
        `<span>${escapeHtml(playMeta(play).personnel)}</span></div>`
      );
    })
    .join("");
  return printDocumentHtml({
    title: `${revision.plan.name} — wristband`,
    css:
      WRISTBAND_CSS +
      ".wc .cc{font-family:ui-monospace,Menlo,monospace;color:#171717;margin-right:2px}" +
      ".wc.miss{color:#8F8F8F;justify-content:space-between}",
    body: `<div class="wg">${cells}</div>`,
    ...(options.productName === undefined
      ? {}
      : { productName: options.productName }),
  });
}

export interface GamePlanHandoutOptions extends GamePlanSheetOptions {
  readonly render: DiagramRenderer;
  readonly concepts?: readonly Concept[];
  readonly formations?: readonly Formation[];
  /** The cover's season line; the caller supplies the year. */
  readonly year: number;
}

/**
 * Handout — a bound packet: cover, contents by section with call codes and
 * page numbers, then one install page per Play in plan order with its code
 * beside the name. A Play that is gone is listed in the contents as missing
 * and gets no page; a plan with no calls is a cover and an empty contents.
 */
export function gamePlanHandoutHtml(
  revision: GamePlanRevision,
  options: GamePlanHandoutOptions,
): string {
  const product = options.productName ?? PRODUCT_NAME;
  const plan = revision.plan;
  const sections = revisionRows(revision);
  const rows = firstCallByPlay(revision);
  // One page per distinct Play, in plan order; the page number is fixed
  // before the contents are written so every listing of a reused call can
  // point at it.
  const pageOf = new Map<string, number>();
  const pages: { readonly play: PlayDocument; readonly code: string }[] = [];
  let pageNo = 3;
  for (const playId of planPlayIds(plan)) {
    const row = rows.get(playId);
    if (!row?.play) continue;
    pageOf.set(playId, pageNo);
    pages.push({ play: row.play, code: codeOf(row) });
    pageNo += 1;
  }
  const cover =
    `<div class="pg cov"><div class="cm">${escapeHtml(product)}</div><h1>${escapeHtml(plan.name)}</h1>` +
    `<div class="cs">${escapeHtml(planLine(revision))}</div>` +
    `<div class="cs">${options.year} season · ${plan.calls.length} ${plan.calls.length === 1 ? "call" : "calls"}</div></div>`;
  let contents = `<div class="pg"><div class="hd"><h1>Contents</h1><span>${plan.calls.length} ${plan.calls.length === 1 ? "call" : "calls"}</span></div>`;
  for (const section of sections) {
    contents += `<div class="tc">${escapeHtml(section.name)}</div>`;
    for (const row of section.calls) {
      const page = pageOf.get(row.playId);
      contents +=
        `<div class="tr${row.missing ? " miss" : ""}"><span><span class="cc">${escapeHtml(codeOf(row))}</span> · ${escapeHtml(row.name)}` +
        (row.missing ? ' <em class="mp">missing</em>' : "") +
        `</span><i></i><span class="tp">${page === undefined ? BLANK_CODE : page}</span></div>`;
    }
  }
  contents += "</div>";
  const bodies = pages.map(({ play, code }, index) =>
    installBody(play, options.render, {
      code,
      pageNo: index + 3,
      ...(options.formations === undefined
        ? {}
        : { formations: options.formations }),
    }),
  );
  return printDocumentHtml({
    title: `${plan.name} — handout`,
    css:
      "@page{size:letter portrait;margin:0.5in}" +
      installCss() +
      BOOK_CSS +
      ".tr .cc{font-family:ui-monospace,Menlo,monospace;font-weight:600}" +
      ".tr.miss{color:#8F8F8F}" +
      ".mp{font-style:normal;font-size:8px;letter-spacing:0.6px;text-transform:uppercase;color:#E5484D;border:1px solid #E5484D;border-radius:3px;padding:0 3px;margin-left:4px}",
    body: cover + contents + bodies.join(""),
    productName: product,
  });
}
