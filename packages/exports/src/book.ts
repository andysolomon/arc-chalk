import {
  revisionRows,
  type Formation,
  type GamePlanRevision,
  type PlayDocument,
  type PlayUnit,
} from "@chalk/domain";

import { playMeta, playRows, progressionStrip } from "./coaching-rows";
import type { DiagramRenderer } from "./diagram";
import { preparedStamp } from "./game-plan-documents";
import { PRODUCT_NAME } from "@chalk/domain";
import {
  BOOK_CSS,
  escapeHtml,
  installBody,
  installCss,
  printDocumentHtml,
} from "./print-documents";
import { unitBadgeHtml } from "./unit-badge";

/**
 * Binder and handout layouts (issue #72). A binder is one play a page with
 * teaching detail, a punch-side gutter, mirrored margins for duplex,
 * section dividers, contents and page numbers — and the page numbers are
 * read off the actual layout, not counted one per play. A handout is the
 * selected plays one, two or four to a sheet for a coach or a player.
 */
export type BookKind = "binder" | "handout";
export type BookPaper = "letter" | "a4";
export type BookOrientation = "portrait" | "landscape";

export interface BinderConfig {
  readonly kind: "binder";
  readonly paper: BookPaper;
  /** Extra margin on the punch side, in inches. */
  readonly gutterIn: number;
  /** Mirror the gutter on facing pages for two-sided printing. */
  readonly duplex: boolean;
  readonly dividers: boolean;
  readonly contents: boolean;
  readonly pageNumbers: boolean;
  readonly notesArea: boolean;
}

export interface HandoutConfig {
  readonly kind: "handout";
  readonly paper: BookPaper;
  readonly orientation: BookOrientation;
  readonly up: 1 | 2 | 4;
  readonly assignments: "none" | "compact" | "full";
  readonly notes: boolean;
}

export type BookConfig = BinderConfig | HandoutConfig;

export const defaultBinderConfig: BinderConfig = Object.freeze({
  kind: "binder",
  paper: "letter",
  gutterIn: 0.5,
  duplex: true,
  dividers: true,
  contents: true,
  pageNumbers: true,
  notesArea: false,
});

export const defaultHandoutConfig: HandoutConfig = Object.freeze({
  kind: "handout",
  paper: "letter",
  orientation: "portrait",
  up: 2,
  assignments: "compact",
  notes: true,
});

/** One play in the book, with its code and section when it came from a plan. */
export interface BookEntry {
  readonly id: string;
  readonly play?: PlayDocument;
  readonly name: string;
  readonly code?: string;
  readonly section?: string;
  readonly missing: boolean;
}

export function bookEntriesOf(source: {
  readonly revision?: GamePlanRevision;
  readonly plays: readonly PlayDocument[];
}): readonly BookEntry[] {
  if (source.revision) {
    const seen = new Set<string>();
    const out: BookEntry[] = [];
    for (const section of revisionRows(source.revision)) {
      for (const row of section.calls) {
        if (seen.has(row.callId)) continue;
        seen.add(row.callId);
        out.push({
          id: row.callId,
          ...(row.play ? { play: row.play } : {}),
          name: row.name,
          ...(row.code.trim() ? { code: row.code.trim() } : {}),
          section: section.name,
          missing: row.missing,
        });
      }
    }
    return out;
  }
  return source.plays.map((play) => ({
    id: play.id,
    play,
    name: play.name,
    missing: false,
  }));
}

/** Page numbers as measured: where each page element starts and how many sheets it takes. */
export type PageMap = Readonly<
  Record<string, { readonly start: number; readonly sheets: number }>
>;

export interface BookOptions {
  readonly render: DiagramRenderer;
  readonly formations?: readonly Formation[];
  readonly productName?: string;
  readonly year: number;
  /** The plan the book came from, for the cover and the header. */
  readonly title: string;
  readonly subtitle?: string;
  /** The plan's Unit, as a badge on the cover beside the subtitle. */
  readonly unit?: PlayUnit;
  readonly revisionLine?: string;
}

const pageSize = (paper: BookPaper, orientation: BookOrientation) =>
  `${paper === "a4" ? "A4" : "letter"} ${orientation}`;

/**
 * The margins with the gutter on the punch side. With duplex on, left and
 * right pages mirror so the gutter is always on the bound edge.
 */
export function binderPageCss(config: BinderConfig): string {
  const base = 0.5;
  const inner = base + config.gutterIn;
  if (!config.duplex) {
    return `@page{size:${pageSize(config.paper, "portrait")};margin:${base}in ${base}in ${base}in ${inner}in}`;
  }
  return (
    `@page{size:${pageSize(config.paper, "portrait")};margin:${base}in}` +
    `@page :left{margin-left:${base}in;margin-right:${inner}in}` +
    `@page :right{margin-left:${inner}in;margin-right:${base}in}`
  );
}

/**
 * The pieces of a page that never split across sheets — a contents row, a
 * table row, the header, the diagram — carry `data-keep`, and print with
 * `break-inside: avoid`; the preview's page measure pushes each whole piece
 * onto the next sheet exactly as the printer will.
 */
function keepTogether(html: string): string {
  return html
    .replace(/<tr>/g, "<tr data-keep>")
    .replace(
      /<div class="(tr[^"]*|hd|mt|ps|na|cn)"/g,
      '<div class="$1" data-keep',
    )
    .replace(/<svg /g, "<svg data-keep ");
}

/**
 * The binder. Every page element carries `data-book-page` with an id, so
 * the preview can measure how many sheets each really takes and hand back
 * a page map; with the map, contents rows and page footers carry the
 * numbers that were measured. Without one they read "—" rather than a
 * guess.
 */
export function binderHtml(
  entries: readonly BookEntry[],
  config: BinderConfig,
  options: BookOptions,
  pageMap?: PageMap,
): string {
  const product = options.productName ?? PRODUCT_NAME;
  const number = (id: string): string =>
    pageMap?.[id] ? String(pageMap[id].start) : "—";
  const pages: string[] = [];
  const cover =
    `<div class="pg cov" data-book-page="cover"><div class="cm">${escapeHtml(product)}</div><h1>${escapeHtml(options.title)}</h1>` +
    (options.unit
      ? `<div class="cs">${unitBadgeHtml(options.unit)}</div>`
      : options.subtitle
        ? `<div class="cs">${escapeHtml(options.subtitle)}</div>`
        : "") +
    `<div class="cs">${options.year} season · ${entries.length} ${entries.length === 1 ? "play" : "plays"}${
      options.revisionLine ? ` · ${escapeHtml(options.revisionLine)}` : ""
    }</div></div>`;
  pages.push(cover);
  if (config.contents) {
    let contents = `<div class="pg" data-book-page="contents"><div class="hd"><h1>Contents</h1><span>${entries.length} ${entries.length === 1 ? "play" : "plays"}</span></div>`;
    let section: string | undefined;
    for (const entry of entries) {
      if (entry.section !== section) {
        section = entry.section;
        if (section) contents += `<div class="tc">${escapeHtml(section)}</div>`;
      }
      contents +=
        `<div class="tr${entry.missing ? " miss" : ""}" data-contents-for="${escapeHtml(entry.id)}"><span>` +
        (entry.code
          ? `<span class="cc">${escapeHtml(entry.code)}</span> · `
          : "") +
        `${escapeHtml(entry.name)}${entry.missing ? ' <em class="mp">missing</em>' : ""}</span><i></i>` +
        `<span class="tp">${entry.missing ? "—" : number(entry.id)}</span></div>`;
    }
    contents += "</div>";
    pages.push(contents);
  }
  let section: string | undefined;
  for (const entry of entries) {
    if (config.dividers && entry.section && entry.section !== section) {
      section = entry.section;
      pages.push(
        `<div class="pg div" data-book-page="divider:${escapeHtml(section)}"><div class="dv">${escapeHtml(section)}</div>` +
          `<div class="cs">${entries.filter((e) => e.section === section).length} ${
            entries.filter((e) => e.section === section).length === 1
              ? "play"
              : "plays"
          }</div></div>`,
      );
    }
    if (!entry.play) continue;
    const body = installBody(entry.play, options.render, {
      ...(entry.code ? { code: entry.code } : {}),
      diagram: { typePreset: "print", pageKind: "full" },
      ...(options.formations ? { formations: options.formations } : {}),
      ...(config.notesArea ? { note: "" } : {}),
    });
    const numbered = config.pageNumbers
      ? body.replace(
          /<\/div>\s*$/,
          `<div class="pno">${escapeHtml(number(entry.id))}</div></div>`,
        )
      : body;
    const withArea = config.notesArea
      ? numbered.replace(
          /<div class="mt">/,
          '<div class="na"><div class="nh">Notes</div><div class="wl"></div><div class="wl"></div><div class="wl"></div></div><div class="mt">',
        )
      : numbered;
    pages.push(
      withArea.replace(
        '<div class="pg">',
        `<div class="pg" data-book-page="${escapeHtml(entry.id)}">`,
      ),
    );
  }
  return printDocumentHtml({
    title: `${options.title} — binder`,
    css:
      binderPageCss(config) +
      installCss() +
      BOOK_CSS +
      ".tr .cc,.hd .cc{font-family:ui-monospace,Menlo,monospace;font-weight:600}" +
      ".tr.miss{color:#8F8F8F}" +
      ".mp{font-style:normal;font-size:8px;letter-spacing:0.6px;text-transform:uppercase;color:#E5484D;border:1px solid #E5484D;border-radius:3px;padding:0 3px;margin-left:4px}" +
      ".div{align-items:flex-start;justify-content:center}" +
      ".dv{font-size:32px;font-weight:600;letter-spacing:-1px;border-bottom:3px solid #171717;padding-bottom:8px;margin-bottom:8px}" +
      ".na{margin-top:10px}.na .nh{font-size:9px;letter-spacing:0.8px;text-transform:uppercase;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace}" +
      ".na .wl{height:22px;border-bottom:1px solid #EBEBEB}" +
      ".pg svg{max-height:48%}" +
      "[data-keep]{break-inside:avoid;page-break-inside:avoid}",
    body: keepTogether(pages.join("")),
    productName: product,
  });
}

export interface HandoutFit {
  readonly warnings: readonly string[];
  /** Sheets at the chosen count per sheet; a growing card adds to this. */
  readonly sheets: number;
  /**
   * Cards can outgrow their share of the sheet: full assignments, or notes,
   * are never cut, so the sheet count is a floor and the preview counts the
   * pages actually laid out.
   */
  readonly grows: boolean;
}

const compactRows = 6;

/** Whether a card shows everything it is asked to, or says what it cannot. */
export function handoutFit(
  entries: readonly BookEntry[],
  config: HandoutConfig,
): HandoutFit {
  const warnings: string[] = [];
  const shown = entries.filter((entry) => entry.play);
  if (config.assignments === "compact") {
    const over = shown.filter(
      (entry) => playRows(entry.play!).length > compactRows,
    );
    if (over.length > 0) {
      warnings.push(
        `${over.length} ${over.length === 1 ? "play has" : "plays have"} more than ${compactRows} assignments; the card lists the first ${compactRows} and says how many more. Choose full assignments or 1-up to show them all.`,
      );
    }
  }
  const grows = config.assignments === "full" || config.notes;
  if (config.assignments === "full") {
    warnings.push(
      `Full assignments are never cut: a card that outgrows its ${config.up === 1 ? "sheet" : "share of the sheet"} grows and pushes the cards after it onto another sheet; the diagram is not shrunk to fit. The preview counts the sheets as laid out.`,
    );
  } else if (config.notes) {
    warnings.push(
      "Coaching notes are never cut: a long note grows its card and pushes the cards after it onto another sheet.",
    );
  }
  for (const entry of entries.filter((e) => e.missing)) {
    warnings.push(
      `${entry.code ?? entry.name} prints as missing — the play was deleted before the plan was prepared.`,
    );
  }
  return {
    warnings,
    sheets: Math.max(1, Math.ceil(entries.length / config.up)),
    grows,
  };
}

/**
 * The handout: the selected plays one, two or four to a sheet, each card a
 * legible diagram with name and code, then compact or full assignments and
 * the coaching notes if asked. A card is at least its share of the sheet
 * and never less; what a compact card leaves off is counted, and a card
 * that has more to show than its share grows — nothing is clipped — and
 * pushes the cards after it onto another sheet. The diagram keeps a fixed
 * height so the card's text, not the picture, decides what grows.
 */
export function handoutSheetHtml(
  entries: readonly BookEntry[],
  config: HandoutConfig,
  options: BookOptions,
): string {
  const product = options.productName ?? PRODUCT_NAME;
  const per = config.up;
  const card = (entry: BookEntry): string => {
    if (!entry.play) {
      return `<div class="hc miss"><div class="hh"><span class="cc">${escapeHtml(entry.code ?? "—")}</span><b>${escapeHtml(entry.name)}</b></div><p>Missing play</p></div>`;
    }
    const play = entry.play;
    const rows = playRows(play);
    const shown =
      config.assignments === "compact"
        ? rows.slice(0, compactRows)
        : config.assignments === "full"
          ? rows
          : [];
    const table =
      shown.length > 0
        ? `<table><tbody>${shown
            .map(
              (row) =>
                `<tr><td class="w">${escapeHtml(row.who)}</td><td>${escapeHtml(row.assignment)}${
                  row.conversion
                    ? ` <span class="cv">— ${escapeHtml(row.conversion)}</span>`
                    : ""
                }</td></tr>`,
            )
            .join("")}</tbody></table>` +
          (rows.length > shown.length
            ? `<div class="more">and ${rows.length - shown.length} more — see the binder</div>`
            : "")
        : "";
    const strip = progressionStrip(play);
    const notes =
      config.notes && play.notes.trim()
        ? `<div class="hn">${escapeHtml(play.notes.trim())}</div>`
        : "";
    const meta = playMeta(play, options.formations ?? []);
    return (
      `<div class="hc"><div class="hh"><span class="cc">${escapeHtml(entry.code ?? "")}</span><b>${escapeHtml(play.name)}</b>` +
      `<span class="hm">${escapeHtml([meta.personnel, meta.formation].filter(Boolean).join(" · "))}</span></div>` +
      options.render(play, { typePreset: "print", pageKind: "full" }) +
      (strip ? `<div class="ps">${escapeHtml(strip)}</div>` : "") +
      table +
      notes +
      "</div>"
    );
  };
  const sheets: string[] = [];
  for (let start = 0; start < entries.length; start += per) {
    const cards = entries
      .slice(start, start + per)
      .map(card)
      .join("");
    sheets.push(
      `<div class="hs up${per}" data-book-page="sheet:${start / per + 1}">${cards}</div>`,
    );
  }
  const landscape = config.orientation === "landscape";
  const cols = per === 4 ? 2 : per === 2 && landscape ? 2 : 1;
  const rowsPerSheet = per / cols;
  // The sheet's usable height, and each card's share of it.
  const sheetIn = landscape
    ? config.paper === "a4"
      ? 7.27
      : 7.5
    : config.paper === "a4"
      ? 10.69
      : 10;
  const rowIn =
    Math.round(((sheetIn - (rowsPerSheet - 1) * 0.25) / rowsPerSheet) * 100) /
    100;
  const diagramIn =
    Math.round(rowIn * (rowsPerSheet === 1 ? 0.52 : 0.58) * 100) / 100;
  return printDocumentHtml({
    title: `${options.title} — handout`,
    css:
      `@page{size:${pageSize(config.paper, config.orientation)};margin:0.5in}` +
      ".hs{page-break-after:always;break-after:page;display:grid;gap:0.25in;align-content:start}" +
      ".hs:last-of-type{page-break-after:auto;break-after:auto}" +
      `.hs{grid-template-columns:repeat(${cols},1fr);grid-auto-rows:auto}` +
      // A card is at least its share of the sheet and grows past it rather
      // than clip: overflow stays visible, and a card that will not fit the
      // sheet's remainder moves whole to the next.
      `.hc{break-inside:avoid;page-break-inside:avoid;border:1px solid #EBEBEB;border-radius:6px;padding:8px 10px;box-sizing:border-box;min-height:${rowsPerSheet === 1 ? "auto" : `${rowIn}in`};overflow:visible}` +
      ".hc.miss{color:#8F8F8F}" +
      ".hh{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}" +
      ".hh .cc{font-family:ui-monospace,Menlo,monospace;font-weight:700;font-size:16px}" +
      ".hh b{font-size:14px;font-weight:600;letter-spacing:-0.3px}" +
      ".hh .hm{margin-left:auto;font-size:9px;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace}" +
      `.hc svg{width:100%;height:auto;display:block;max-height:${diagramIn}in}` +
      ".ps{margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.4px}" +
      "table{width:100%;border-collapse:collapse;margin-top:6px}td{font-size:10px;line-height:13px;padding:2px 6px 2px 0;border-top:1px solid #EBEBEB;vertical-align:top}td.w{font-weight:600;width:0.6in;white-space:nowrap}.cv{color:#8F8F8F}" +
      ".more{font-size:9px;color:#8F8F8F;margin-top:4px;font-family:ui-monospace,Menlo,monospace}" +
      ".hn{margin-top:6px;font-size:10px;line-height:14px;color:#4D4D4D;white-space:pre-line}",
    body: sheets.join(""),
    productName: product,
  });
}

export interface BookConfigs {
  readonly binder: BinderConfig;
  readonly handout: HandoutConfig;
}

export const defaultBookConfigs: BookConfigs = Object.freeze({
  binder: defaultBinderConfig,
  handout: defaultHandoutConfig,
});

export function readBookConfigs(value: unknown): BookConfigs {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return defaultBookConfigs;
  const r = value as Record<string, unknown>;
  const b = (r.binder ?? {}) as Record<string, unknown>;
  const h = (r.handout ?? {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    binder: {
      kind: "binder",
      paper: b.paper === "a4" ? "a4" : "letter",
      gutterIn:
        typeof b.gutterIn === "number" && Number.isFinite(b.gutterIn)
          ? Math.min(2, Math.max(0, b.gutterIn))
          : defaultBinderConfig.gutterIn,
      duplex: bool(b.duplex, defaultBinderConfig.duplex),
      dividers: bool(b.dividers, defaultBinderConfig.dividers),
      contents: bool(b.contents, defaultBinderConfig.contents),
      pageNumbers: bool(b.pageNumbers, defaultBinderConfig.pageNumbers),
      notesArea: bool(b.notesArea, defaultBinderConfig.notesArea),
    },
    handout: {
      kind: "handout",
      paper: h.paper === "a4" ? "a4" : "letter",
      orientation: h.orientation === "landscape" ? "landscape" : "portrait",
      up: h.up === 1 || h.up === 4 ? h.up : 2,
      assignments:
        h.assignments === "none" || h.assignments === "full"
          ? h.assignments
          : "compact",
      notes: bool(h.notes, defaultHandoutConfig.notes),
    },
  };
}

/** The prepared line for a plan's cover, or nothing for a selection. */
export function bookRevisionLine(
  revision: GamePlanRevision | undefined,
): string | undefined {
  return revision ? `${preparedStamp(revision)} · ${revision.id}` : undefined;
}
