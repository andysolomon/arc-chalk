import {
  PRODUCT_NAME,
  type Concept,
  type Formation,
  type PlayDocument,
} from "@chalk/domain";

import {
  callSheetGroups,
  conceptNote,
  groupMembers,
  groupRows,
  libraryOrder,
  playCategory,
  playMeta,
  playRows,
  positionGroup,
  progressionStrip,
  quizPlay,
  type LibraryEntry,
  type PositionGroupId,
} from "./coaching-rows";
import {
  cropSvgToScoutCard,
  FIELD_SVG_CSS,
  type DiagramRenderer,
} from "./diagram";

/**
 * The printed documents, built as strings. Each is the original's
 * `printDoc(title, css, body)` — a self-contained HTML page with one `@page`
 * rule, the product footer, and the field stylesheet inlined — so a 40-play
 * book is one concatenation rather than forty DOM inserts, and every sheet
 * can be inspected in a test without opening a window.
 */

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const FOOT_CSS =
  ".__pf{position:fixed;bottom:0;left:0;right:0;text-align:right;" +
  "font-size:8px;letter-spacing:0.6px;text-transform:uppercase;color:#8F8F8F}" +
  ".__pn{position:fixed;bottom:0;left:0;font-size:9px;font-family:ui-monospace,Menlo,monospace;color:#8F8F8F}";

export interface PrintDocumentInput {
  readonly title: string;
  readonly css: string;
  readonly body: string;
  readonly productName?: string;
}

/** The original's `printDoc` wrapper: one page rule, product footer, body. */
export function printDocumentHtml(input: PrintDocumentInput): string {
  const product = input.productName ?? PRODUCT_NAME;
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<title>${escapeHtml(input.title)} — ${escapeHtml(product)}</title>` +
    "<style>*{box-sizing:border-box}body{margin:0;font-family:Helvetica,Arial,sans-serif;" +
    "color:#171717;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    input.css +
    FIELD_SVG_CSS +
    FOOT_CSS +
    "</style></head><body>" +
    input.body +
    `<div class="__pf">${escapeHtml(product)}</div>` +
    "</body></html>"
  );
}

/** Play name and category in the 9px mono corner of every teaching page. */
function pageNameFoot(name: string, category: string): string {
  return `<div class="__pn">${escapeHtml(name || "Untitled play")} · ${escapeHtml(category)}</div>`;
}

/**
 * The install page's own rules. A page is at least a sheet tall rather than
 * exactly one, so a dense assignment table flows onto a second page with its
 * header repeated instead of being clipped at the bottom of the first.
 */
export function installCss(): string {
  return (
    ".pg{position:relative;page-break-after:always;break-after:page;min-height:10in;display:flex;flex-direction:column}" +
    ".pg:last-of-type{page-break-after:auto;break-after:auto}" +
    ".cn{font-size:13px;line-height:18px;color:#4D4D4D;margin:0 0 8px}" +
    ".hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}" +
    ".hd h1{font-size:20px;margin:0;font-weight:600;letter-spacing:-0.4px}" +
    ".hd span{font-size:12px;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace}" +
    ".pg svg{width:100%;height:auto;max-height:52%;display:block;flex:none}" +
    "table{width:100%;border-collapse:collapse;margin-top:10px}" +
    "thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}" +
    "th{font-size:9px;letter-spacing:0.8px;text-transform:uppercase;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace;font-weight:500;text-align:left;padding:0 8px 4px 0}" +
    "td{font-size:12px;line-height:16px;padding:5px 8px 5px 0;border-top:1px solid #EBEBEB;vertical-align:top}" +
    "td.w{font-weight:600;width:0.7in;white-space:nowrap}" +
    ".cv{color:#8F8F8F}" +
    ".ps{margin-top:10px;font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:0.4px}" +
    ".mt{margin-top:auto;padding-top:10px;font-size:10px;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace;display:flex;gap:16px}" +
    ".pno{position:absolute;bottom:0;left:0;right:0;text-align:center;font-size:9px;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace}"
  );
}

export interface InstallBodyOptions {
  readonly note?: string;
  readonly pageNo?: number;
  readonly formations?: readonly Formation[];
}

function assignmentCell(row: {
  readonly assignment: string;
  readonly conversion: string;
}): string {
  return (
    escapeHtml(row.assignment) +
    (row.conversion
      ? ` <span class="cv">— ${escapeHtml(row.conversion)}</span>`
      : "")
  );
}

/** One install page: diagram, Who · Assignment · Coaching point, strip, meta. */
export function installBody(
  play: PlayDocument,
  render: DiagramRenderer,
  options: InstallBodyOptions = {},
): string {
  const rows = playRows(play);
  const strip = progressionStrip(play);
  const meta = playMeta(play, options.formations);
  const body = rows
    .map(
      (row) =>
        `<tr><td class="w">${escapeHtml(row.who)}</td><td>${assignmentCell(row)}</td><td>${escapeHtml(row.note)}</td></tr>`,
    )
    .join("");
  return (
    '<div class="pg">' +
    (options.note ? `<div class="cn">${escapeHtml(options.note)}</div>` : "") +
    `<div class="hd"><h1>${escapeHtml(play.name || "Untitled play")}</h1><span>${escapeHtml(playCategory(play))}</span></div>` +
    render(play, { typePreset: "print" }) +
    (rows.length > 0
      ? '<table><thead><tr><th style="width:0.7in">Who</th><th>Assignment</th><th>Coaching point</th></tr></thead>' +
        `<tbody>${body}</tbody></table>`
      : "") +
    (strip ? `<div class="ps">${escapeHtml(strip)}</div>` : "") +
    `<div class="mt"><span>${escapeHtml(meta.personnel)}</span><span>${escapeHtml(meta.formation)}</span><span>strength ${escapeHtml(meta.strength)}</span><span>${escapeHtml(meta.hash)} hash</span></div>` +
    (options.pageNo === undefined
      ? ""
      : `<div class="pno">${options.pageNo}</div>`) +
    "</div>"
  );
}

export interface TeachingOptions {
  readonly render: DiagramRenderer;
  /** The Concept the open Play belongs to, for its note. */
  readonly concept?: Concept;
  readonly formations?: readonly Formation[];
  readonly productName?: string;
}

/** Install page — letter portrait, one play. */
export function installPageHtml(
  play: PlayDocument,
  options: TeachingOptions,
): string {
  const note = (options.concept?.notes ?? "").trim();
  return printDocumentHtml({
    title: `${play.name || "Play"} — install`,
    css: "@page{size:letter portrait;margin:0.5in}" + installCss(),
    body:
      installBody(play, options.render, {
        note,
        ...(options.formations === undefined
          ? {}
          : { formations: options.formations }),
      }) + pageNameFoot(play.name, playCategory(play)),
    ...(options.productName === undefined
      ? {}
      : { productName: options.productName }),
  });
}

/**
 * Position view — one group at full weight, everyone else faded to 22%
 * instead of removed, and only that group's assignments below in 15px.
 * Returns undefined when nobody on the field belongs to the group.
 */
export function positionViewHtml(
  play: PlayDocument,
  groupId: PositionGroupId,
  options: TeachingOptions,
): string | undefined {
  const group = positionGroup(groupId);
  const members = groupMembers(play, groupId);
  if (members.length === 0) return undefined;
  const rows = groupRows(play, groupId);
  const items = rows
    .map(
      (row) =>
        `<div class="as"><b>${escapeHtml(row.who)}</b><div><div>${escapeHtml(row.assignment)}</div>` +
        (row.conversion
          ? `<div class="cv2">${escapeHtml(row.conversion)}</div>`
          : "") +
        (row.note ? `<div class="nt">${escapeHtml(row.note)}</div>` : "") +
        "</div></div>",
    )
    .join("");
  return printDocumentHtml({
    title: `${play.name || "Play"} — ${group.name}`,
    css:
      "@page{size:letter portrait;margin:0.5in}" +
      installCss() +
      ".sec{font-size:9px;letter-spacing:0.8px;text-transform:uppercase;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace;margin:12px 0 2px}" +
      ".as{display:flex;gap:14px;padding:8px 0;border-top:1px solid #EBEBEB;font-size:15px;line-height:21px;break-inside:avoid}" +
      ".as b{font-weight:600;width:0.8in;flex:none}" +
      ".cv2{font-size:13px;color:#4D4D4D}.nt{font-size:13px;color:#8F8F8F}",
    body:
      `<div class="pg"><div class="hd"><h1>${escapeHtml(play.name || "Untitled play")}</h1><span>${escapeHtml(group.name)}</span></div>` +
      options.render(play, {
        typePreset: "print",
        emphasisPlayerIds: new Set(members.map(({ id }) => id)),
      }) +
      `<div class="sec">${escapeHtml(group.name)} assignments</div>${items}</div>` +
      pageNameFoot(play.name, playCategory(play)),
    ...(options.productName === undefined
      ? {}
      : { productName: options.productName }),
  });
}

/**
 * Quiz — the diagram with assignments stripped and 22px rows to write in,
 * then the answer key on a second page in the same order. Nothing is
 * shuffled: a quiz that shuffles is a memory test, not an assignment check.
 * Returns undefined when there is nothing to quiz.
 */
export function quizHtml(
  play: PlayDocument,
  options: TeachingOptions,
): string | undefined {
  const rows = playRows(play);
  if (rows.length === 0) return undefined;
  const head =
    '<thead><tr><th style="width:0.35in">#</th><th style="width:0.7in">Who</th><th>Assignment</th></tr></thead>';
  const blanks = rows
    .map(
      (row, index) =>
        `<tr><td class="n">${index + 1}</td><td class="w">${escapeHtml(row.who)}</td><td class="bl"></td></tr>`,
    )
    .join("");
  const keys = rows
    .map(
      (row, index) =>
        `<tr><td class="n">${index + 1}</td><td class="w">${escapeHtml(row.who)}</td><td>${assignmentCell(row)}</td></tr>`,
    )
    .join("");
  const stripped = { reads: false, assigns: false, notes: false };
  return printDocumentHtml({
    title: `${play.name || "Play"} — quiz`,
    css:
      "@page{size:letter portrait;margin:0.5in}" +
      installCss() +
      "td.n{font-family:ui-monospace,Menlo,monospace;color:#8F8F8F;width:0.35in}" +
      "td.bl{border-bottom:1px solid #8F8F8F;height:22px}",
    body:
      `<div class="pg"><div class="hd"><h1>${escapeHtml(play.name || "Untitled play")} — quiz</h1><span>${escapeHtml(playCategory(play))}</span></div>` +
      options.render(quizPlay(play), {
        typePreset: "print",
        layers: stripped,
      }) +
      `<table>${head}<tbody>${blanks}</tbody></table></div>` +
      `<div class="pg"><div class="hd"><h1>Answer key</h1><span>${escapeHtml(play.name)}</span></div>` +
      options.render(play, { typePreset: "print" }) +
      `<table>${head}<tbody>${keys}</tbody></table></div>` +
      pageNameFoot(play.name, playCategory(play)),
    ...(options.productName === undefined
      ? {}
      : { productName: options.productName }),
  });
}

/** Slide — 1920×1080 on a dark ground. The one color-heavy output. */
export function slideHtml(
  play: PlayDocument,
  options: TeachingOptions,
): string {
  const points = playRows(play)
    .map((row) => row.note)
    .filter(Boolean)
    .slice(0, 3);
  const note = (options.concept?.notes ?? "").trim();
  const strip = progressionStrip(play);
  return printDocumentHtml({
    title: `${play.name || "Play"} — slide`,
    css:
      "@page{size:20in 11.25in;margin:0}body{background:#171717}" +
      ".sl{width:20in;height:11.25in;display:flex;background:#171717;color:#FFFFFF}" +
      ".dg{width:62%;padding:60px 30px 60px 60px;display:flex;align-items:center}" +
      ".dg svg{width:100%;height:auto;border-radius:6px}" +
      ".tx{width:38%;padding:80px 80px 80px 40px;display:flex;flex-direction:column;justify-content:center;gap:30px}" +
      ".tx h1{font-size:44px;margin:0;font-weight:600;letter-spacing:-1.4px;line-height:1.05}" +
      ".scn{font-size:24px;line-height:34px;color:#D4D4D4;margin:0}" +
      ".sps{font-family:ui-monospace,Menlo,monospace;font-size:24px;letter-spacing:0.5px}" +
      ".pt{font-size:24px;line-height:33px;color:#D4D4D4}" +
      ".__pf{color:#4D4D4D}",
    body:
      `<div class="sl"><div class="dg">${options.render(play, { typePreset: "coach" })}</div>` +
      `<div class="tx"><h1>${escapeHtml(play.name || "Untitled play")}</h1>` +
      (note ? `<p class="scn">${escapeHtml(note)}</p>` : "") +
      (strip ? `<div class="sps">${escapeHtml(strip)}</div>` : "") +
      (points.length > 0
        ? '<div style="display:flex;flex-direction:column;gap:14px">' +
          points
            .map(
              (text) => `<div class="pt">\u2014\u2002${escapeHtml(text)}</div>`,
            )
            .join("") +
          "</div>"
        : "") +
      "</div></div>",
    ...(options.productName === undefined
      ? {}
      : { productName: options.productName }),
  });
}

export interface LibraryOptions {
  readonly render: DiagramRenderer;
  readonly concepts?: readonly Concept[];
  readonly formations?: readonly Formation[];
  readonly productName?: string;
}

/** Wristband — eight 2.1×1.4in cells, two columns, dashed cut lines. */
export function wristbandHtml(
  plays: readonly PlayDocument[],
  options: LibraryOptions,
): string | undefined {
  const picked = plays.slice(0, 8);
  if (picked.length === 0) return undefined;
  const cells = picked
    .map(
      (play) =>
        `<div class="wc"><b>${escapeHtml(play.name)}</b>` +
        options.render(play, {
          typePreset: "print",
          lineWeight: 1.5,
          layers: { text: false, assigns: false, notes: false, reads: false },
        }) +
        `<span>${escapeHtml(playMeta(play, options.formations).personnel)}</span></div>`,
    )
    .join("");
  return printDocumentHtml({
    title: "Wristband",
    css:
      "@page{size:letter portrait;margin:0.5in}" +
      ".wg{display:grid;grid-template-columns:2.1in 2.1in;grid-auto-rows:1.4in;justify-content:start}" +
      ".wc{width:2.1in;height:1.4in;border:0.5px dashed #8F8F8F;padding:3px 6px;display:flex;flex-direction:column;align-items:center;overflow:hidden}" +
      ".wc b{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;align-self:flex-start;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".wc svg{width:1.3in;height:auto;flex:1;min-height:0}" +
      ".wc span{font-size:7px;font-family:ui-monospace,Menlo,monospace;color:#4D4D4D;align-self:flex-start}",
    body: `<div class="wg">${cells}</div>`,
    ...(options.productName === undefined
      ? {}
      : { productName: options.productName }),
  });
}

/**
 * Scout cards — 4-up on letter, opponent looks drawn big with a bold number
 * and a line for the scout team's note. Defensive Plays by default; the open
 * Play when the library has none.
 */
export function scoutCardsHtml(
  plays: readonly PlayDocument[],
  options: LibraryOptions,
): string | undefined {
  if (plays.length === 0) return undefined;
  const cells = plays
    .map(
      (play, index) =>
        `<div class="sc"><div class="no">${index + 1}</div>` +
        cropSvgToScoutCard(
          options.render(play, {
            typePreset: "print",
            pageKind: "card",
            layers: { reads: false, assigns: false, notes: false, text: true },
          }),
        ) +
        `<div class="ln"><span>${escapeHtml(play.name)}</span><i></i></div></div>`,
    )
    .join("");
  return printDocumentHtml({
    title: "Scout cards",
    css:
      "@page{size:letter portrait;margin:0.45in}" +
      ".gr{display:grid;grid-template-columns:1fr 1fr;gap:14px}" +
      ".sc{position:relative;height:2.28in;border:0.5px dashed #8F8F8F;border-radius:4px;padding:6px 8px;display:flex;flex-direction:column;break-inside:avoid;page-break-inside:avoid}" +
      ".sc svg{width:100%;height:auto;flex:1;min-height:0;display:block}" +
      ".no{position:absolute;top:4px;right:9px;font-size:26px;font-weight:600;font-family:ui-monospace,Menlo,monospace}" +
      ".ln{display:flex;align-items:baseline;gap:8px;font-size:9px;font-family:ui-monospace,Menlo,monospace;color:#8F8F8F}" +
      ".ln i{flex:1;border-bottom:1px solid #8F8F8F;font-style:normal}",
    body: `<div class="gr">${cells}</div>`,
    ...(options.productName === undefined
      ? {}
      : { productName: options.productName }),
  });
}

/** Which Plays the scout cards draw: the defensive ones, else the open Play. */
export function scoutCardPlays(
  library: readonly PlayDocument[],
  open: PlayDocument,
): readonly PlayDocument[] {
  const defense = library.filter(
    (play) => play.unit === "defense" || playCategory(play) === "Defense",
  );
  return defense.length > 0 ? defense : [open];
}

/** Practice cards — 2-up, with the progression strip under each diagram. */
export function practiceCardsHtml(
  plays: readonly PlayDocument[],
  options: LibraryOptions,
): string {
  const cells = plays
    .map((play) => {
      const strip = progressionStrip(play);
      return (
        `<div class="card"><div class="cn"><b>${escapeHtml(play.name)}</b><span>${escapeHtml(playCategory(play))}</span></div>` +
        options.render(play) +
        (strip ? `<div class="ps">${escapeHtml(strip)}</div>` : "") +
        "</div>"
      );
    })
    .join("");
  return printDocumentHtml({
    title: "Practice cards",
    css:
      "@page{size:letter portrait;margin:0.35in}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
      ".card{border:1px solid #D4D4D4;border-radius:5px;padding:7px;break-inside:avoid;page-break-inside:avoid}" +
      ".cn{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;font-size:11px}" +
      ".cn b{font-weight:600}.cn span{color:#8F8F8F;font-family:ui-monospace,Menlo,monospace}" +
      ".ps{margin-top:5px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.3px}svg{width:100%;height:auto;display:block}",
    body: `<div class="grid">${cells}</div>`,
    ...(options.productName === undefined
      ? {}
      : { productName: options.productName }),
  });
}

/**
 * The open Play first, then the rest of the library — the original's
 * practice-card order, with the open Play's current revision standing in for
 * its stored copy.
 */
export function practiceCardPlays(
  library: readonly PlayDocument[],
  open: PlayDocument,
): readonly PlayDocument[] {
  return [open, ...library.filter((play) => play.id !== open.id)];
}

/** Call sheet — grouped by tag, category as a fallback, 12 ruled lines. */
export function callSheetHtml(
  plays: readonly PlayDocument[],
  options: Pick<LibraryOptions, "concepts" | "productName">,
): string {
  const groups = callSheetGroups(plays, options.concepts);
  const columns = groups
    .map(
      (group) =>
        `<div class="col"><h2>${escapeHtml(group.name)}</h2>` +
        group.plays
          .map((play) => `<div class="row">${escapeHtml(play.name)}</div>`)
          .join("") +
        "</div>",
    )
    .join("");
  const lines = '<div class="wl"></div>'.repeat(12);
  return printDocumentHtml({
    title: "Call sheet",
    css:
      "@page{size:letter landscape;margin:0.4in}h1{font-size:18px;margin:0 0 12px;font-weight:600}" +
      ".wrap{display:grid;grid-template-columns:1fr 2.4in;gap:22px}" +
      ".cols{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-content:start}" +
      ".col{break-inside:avoid}" +
      ".col h2{font-size:10px;letter-spacing:0.8px;text-transform:uppercase;color:#8F8F8F;margin:0 0 6px;font-weight:500;font-family:ui-monospace,Menlo,monospace}" +
      ".row{font-size:12px;padding:4px 6px;border-bottom:1px solid #EBEBEB}" +
      ".nh{font-size:10px;letter-spacing:0.8px;text-transform:uppercase;color:#8F8F8F;margin:0 0 6px;font-weight:500;font-family:ui-monospace,Menlo,monospace}" +
      ".wl{height:26px;border-bottom:1px solid #EBEBEB}",
    body:
      `<h1>Call sheet</h1><div class="wrap"><div class="cols">${columns}</div>` +
      `<div><div class="nh">In-game notes</div>${lines}</div></div>`,
    ...(options.productName === undefined
      ? {}
      : { productName: options.productName }),
  });
}

export interface PlaybookOptions extends LibraryOptions {
  /** The cover's season line; the caller supplies the year. */
  readonly year: number;
}

/**
 * Full playbook — cover, contents grouped by Concept with page numbers, then
 * one install page per Play in library order. One string, however many
 * Plays. Returns undefined when the library is empty.
 */
export function playbookHtml(
  plays: readonly PlayDocument[],
  options: PlaybookOptions,
): string | undefined {
  const ordered: readonly LibraryEntry[] = libraryOrder(
    plays,
    options.concepts,
  );
  if (ordered.length === 0) return undefined;
  const product = options.productName ?? PRODUCT_NAME;
  const cover =
    `<div class="pg cov"><div class="cm">${escapeHtml(product)}</div><h1>Playbook</h1>` +
    `<div class="cs">${options.year} season · ${ordered.length} plays</div></div>`;
  let contents = `<div class="pg"><div class="hd"><h1>Contents</h1><span>${ordered.length} plays</span></div>`;
  const bodies: string[] = [];
  let pageNo = 3;
  for (const entry of ordered) {
    if (entry.leadsConcept && entry.concept) {
      contents += `<div class="tc">${escapeHtml(entry.concept.name)}</div>`;
    }
    const indented = entry.concept !== undefined && !entry.leadsConcept;
    contents +=
      `<div class="tr"${indented ? ' style="padding-left:14px"' : ""}><span>${escapeHtml(entry.play.name)}</span><i></i>` +
      `<span class="tp">${pageNo}</span></div>`;
    bodies.push(
      installBody(entry.play, options.render, {
        note: conceptNote(entry),
        pageNo,
        ...(options.formations === undefined
          ? {}
          : { formations: options.formations }),
      }),
    );
    pageNo += 1;
  }
  contents += "</div>";
  return printDocumentHtml({
    title: `${product} — playbook`,
    css:
      "@page{size:letter portrait;margin:0.5in}" +
      installCss() +
      ".cov{align-items:center;justify-content:center;text-align:center;gap:10px}" +
      ".cov .cm{font-size:11px;letter-spacing:2px;text-transform:uppercase;font-family:ui-monospace,Menlo,monospace;color:#8F8F8F}" +
      ".cov h1{font-size:44px;margin:0;font-weight:600;letter-spacing:-1.6px}" +
      ".cov .cs{font-size:12px;color:#4D4D4D;font-family:ui-monospace,Menlo,monospace}" +
      ".tc{font-size:9px;letter-spacing:0.8px;text-transform:uppercase;color:#8F8F8F;font-family:ui-monospace,Menlo,monospace;margin:14px 0 2px}" +
      ".tr{display:flex;align-items:baseline;gap:8px;font-size:12px;padding:4px 0}" +
      ".tr i{flex:1;border-bottom:1px dotted #C9C9C9;transform:translateY(-3px);font-style:normal}" +
      ".tr .tp{font-family:ui-monospace,Menlo,monospace;color:#8F8F8F;font-size:11px}",
    body: cover + contents + bodies.join(""),
    productName: product,
  });
}
