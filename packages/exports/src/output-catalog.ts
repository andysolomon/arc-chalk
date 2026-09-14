import type { FieldLayers } from "@chalk/render";

/**
 * The output workflow's catalogue (issue #69): what a Coach can print or save,
 * from which source, on what paper. Choose source → choose format → preview →
 * print or save. Every generator that existed before is reached from here;
 * the quick image exports stay one click away in the menu as well.
 */
export type OutputSourceKind = "current" | "selection" | "plan" | "book";

export type OutputFormatId =
  | "field"
  | "png"
  | "svg"
  | "callSheet"
  | "wristband"
  | "binder"
  | "handout"
  | "practice"
  | "scout"
  | "install"
  | "position"
  | "quiz"
  | "slide"
  | "progression"
  | "frames";

export type OutputGroup = "Diagram" | "Game day" | "Book" | "Teaching";

export interface OutputPaper {
  readonly size: "letter" | "a4" | "slide";
  readonly orientation: "portrait" | "landscape";
  /** All four margins, in inches. */
  readonly marginIn: number;
}

/** How much of the coaching detail prints on each diagram. */
export type DetailPreset = "full" | "coaching" | "diagram";

export interface OutputFormat {
  readonly id: OutputFormatId;
  readonly name: string;
  readonly group: OutputGroup;
  readonly hint: string;
  /** Absent for image downloads, which have no page. */
  readonly paper?: OutputPaper;
  /** How many plays the format is built for. */
  readonly takes: "one" | "many";
  /** Which sources make sense; a plan is the packet's natural source. */
  readonly sources: readonly OutputSourceKind[];
  readonly delivery: "print" | "download";
  /** Whether the detail preset and monochrome apply. */
  readonly styled: boolean;
}

const LETTER_PORTRAIT: OutputPaper = {
  size: "letter",
  orientation: "portrait",
  marginIn: 0.5,
};
const LETTER_LANDSCAPE: OutputPaper = {
  size: "letter",
  orientation: "landscape",
  marginIn: 0.5,
};

const ALL: readonly OutputSourceKind[] = [
  "current",
  "selection",
  "plan",
  "book",
];
const MANY: readonly OutputSourceKind[] = ["selection", "plan", "book"];

export const outputFormats: readonly OutputFormat[] = Object.freeze([
  {
    id: "field",
    name: "Field sheet",
    group: "Diagram",
    hint: "The play on one letter-landscape sheet, as the editor shows it",
    paper: LETTER_LANDSCAPE,
    takes: "one",
    sources: ["current", "selection"],
    delivery: "print",
    styled: true,
  },
  {
    id: "png",
    name: "PNG image",
    group: "Diagram",
    hint: "A 2000 × 1240 picture of the play",
    takes: "one",
    sources: ["current", "selection"],
    delivery: "download",
    styled: true,
  },
  {
    id: "svg",
    name: "SVG image",
    group: "Diagram",
    hint: "The play as vector art, for a slide or a document",
    takes: "one",
    sources: ["current", "selection"],
    delivery: "download",
    styled: true,
  },
  {
    id: "callSheet",
    name: "Coordinator call sheet",
    group: "Game day",
    hint: "Calls by situation with their codes and a notes column",
    paper: { size: "letter", orientation: "landscape", marginIn: 0.4 },
    takes: "many",
    sources: MANY,
    delivery: "print",
    styled: false,
  },
  {
    id: "wristband",
    name: "Wristband",
    group: "Game day",
    hint: "Numbered cells at wrist size, with cut lines",
    paper: LETTER_PORTRAIT,
    takes: "many",
    sources: MANY,
    delivery: "print",
    styled: true,
  },
  {
    id: "practice",
    name: "Practice cards",
    group: "Game day",
    hint: "Two big cards a sheet for the practice field",
    paper: { size: "letter", orientation: "portrait", marginIn: 0.35 },
    takes: "many",
    sources: ALL,
    delivery: "print",
    styled: true,
  },
  {
    id: "scout",
    name: "Scout cards",
    group: "Game day",
    hint: "Opponent looks four to a sheet, with room for the scout team's note",
    paper: { size: "letter", orientation: "portrait", marginIn: 0.45 },
    takes: "many",
    sources: ALL,
    delivery: "print",
    styled: true,
  },
  {
    id: "binder",
    name: "Binder playbook",
    group: "Book",
    hint: "Cover, contents and an install page per play",
    paper: LETTER_PORTRAIT,
    takes: "many",
    sources: MANY,
    delivery: "print",
    styled: true,
  },
  {
    id: "handout",
    name: "Handout",
    group: "Book",
    hint: "Install pages only — a quick reference for a coach or a player",
    paper: LETTER_PORTRAIT,
    takes: "many",
    sources: ALL,
    delivery: "print",
    styled: true,
  },
  {
    id: "install",
    name: "Install page",
    group: "Teaching",
    hint: "Diagram, assignment table and progression on one letter page",
    paper: LETTER_PORTRAIT,
    takes: "one",
    sources: ["current", "selection"],
    delivery: "print",
    styled: true,
  },
  {
    id: "position",
    name: "Position view",
    group: "Teaching",
    hint: "One group at full weight, everyone else faded back",
    paper: LETTER_PORTRAIT,
    takes: "one",
    sources: ["current", "selection"],
    delivery: "print",
    styled: true,
  },
  {
    id: "quiz",
    name: "Quiz + answer key",
    group: "Teaching",
    hint: "The diagram with assignments stripped, and a table to fill in",
    paper: LETTER_PORTRAIT,
    takes: "one",
    sources: ["current", "selection"],
    delivery: "print",
    styled: false,
  },
  {
    id: "slide",
    name: "Slide — 1920×1080",
    group: "Teaching",
    hint: "Dark slide for the meeting-room projector",
    paper: { size: "slide", orientation: "landscape", marginIn: 0 },
    takes: "one",
    sources: ["current", "selection"],
    delivery: "print",
    styled: false,
  },
  {
    id: "progression",
    name: "Progression strip — 4 frames",
    group: "Teaching",
    hint: "The play at four moments across one landscape sheet",
    paper: { size: "letter", orientation: "landscape", marginIn: 0.45 },
    takes: "one",
    sources: ["current", "selection"],
    delivery: "print",
    styled: false,
  },
  {
    id: "frames",
    name: "Frame sequence — PNGs",
    group: "Teaching",
    hint: "A numbered PNG every 0.2 s plus a manifest, for a video tool",
    takes: "one",
    sources: ["current", "selection"],
    delivery: "download",
    styled: false,
  },
]);

export const outputGroups: readonly OutputGroup[] = [
  "Diagram",
  "Game day",
  "Book",
  "Teaching",
];

export function outputFormat(id: OutputFormatId): OutputFormat {
  const found = outputFormats.find((format) => format.id === id);
  if (!found) throw new Error(`Unknown output format ${id}`);
  return found;
}

/** What the workflow knows about the chosen source, before any document. */
export interface SourceFacts {
  readonly kind: OutputSourceKind;
  readonly playCount: number;
  /** A plan source that is not prepared cannot print a packet. */
  readonly prepared?: boolean;
}

export type Acceptance =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Whether a format can be built from the source as it stands. The selection
 * is never replaced on the Coach's behalf; the reason says what to change.
 */
export function acceptSource(
  format: OutputFormat,
  facts: SourceFacts,
): Acceptance {
  if (!format.sources.includes(facts.kind)) {
    const names: Record<OutputSourceKind, string> = {
      current: "the current play",
      selection: "selected plays",
      plan: "a game plan",
      book: "the full playbook",
    };
    return {
      ok: false,
      reason: `${format.name} is built from ${format.sources
        .map((kind) => names[kind])
        .join(" or ")}, not ${names[facts.kind]}.`,
    };
  }
  if (facts.kind === "plan" && facts.prepared === false) {
    return {
      ok: false,
      reason:
        "This plan has not been prepared for a game. Prepare it under Playbooks → Game plans, or choose its current plays.",
    };
  }
  if (facts.playCount === 0) {
    return {
      ok: false,
      reason:
        facts.kind === "selection"
          ? "Pick at least one play."
          : facts.kind === "book"
            ? "The playbook has no saved plays yet."
            : "There is nothing to print here yet.",
    };
  }
  if (format.takes === "one" && facts.playCount > 1) {
    return {
      ok: false,
      reason: `${format.name} prints one play. Pick one, or choose a format that takes several.`,
    };
  }
  return { ok: true };
}

/** The field layers a detail preset turns on — explicit, never inherited. */
export function detailLayers(detail: DetailPreset): FieldLayers {
  switch (detail) {
    case "full":
      return { reads: true, assigns: true, notes: true, text: true };
    case "coaching":
      return { reads: true, assigns: true, notes: false, text: true };
    case "diagram":
      return { reads: false, assigns: false, notes: false, text: false };
  }
}

export const detailPresets: readonly {
  readonly id: DetailPreset;
  readonly name: string;
  readonly hint: string;
}[] = Object.freeze([
  {
    id: "full",
    name: "Full detail",
    hint: "Reads, assignments, notes and text on every diagram",
  },
  {
    id: "coaching",
    name: "Coaching",
    hint: "Reads, assignments and text; the field notes stay off",
  },
  {
    id: "diagram",
    name: "Diagram only",
    hint: "Men and lines, nothing written",
  },
]);

/** "Letter landscape · ½ in margins" — the paper as the sheet will print. */
export function paperLabel(paper: OutputPaper | undefined): string {
  if (!paper) return "Image file — no page";
  const size =
    paper.size === "slide"
      ? "1920 × 1080 slide"
      : `${paper.size === "a4" ? "A4" : "Letter"} ${paper.orientation}`;
  const margin =
    paper.marginIn === 0
      ? "no margins"
      : `${paper.marginIn === 0.5 ? "half-inch" : `${paper.marginIn} in`} margins`;
  return `${size} · ${margin}`;
}

/** Page dimensions in inches, for the preview and for counting pages. */
export function paperInches(paper: OutputPaper): {
  readonly width: number;
  readonly height: number;
} {
  const base =
    paper.size === "slide"
      ? { width: 20, height: 11.25 }
      : paper.size === "a4"
        ? { width: 8.27, height: 11.69 }
        : { width: 8.5, height: 11 };
  return paper.orientation === "landscape" && paper.size !== "slide"
    ? { width: base.height, height: base.width }
    : base;
}

/**
 * Screen-only rules laid over a printed document so the preview shows the
 * sheet: the page's width, its margins, and a rule wherever a page break is
 * forced. The print rules underneath are untouched.
 */
export function previewCss(paper: OutputPaper, mono: boolean): string {
  const { width, height } = paperInches(paper);
  const inner = width - paper.marginIn * 2;
  return (
    "@media screen{html{background:#e9e9e9}" +
    `body{width:${inner}in;min-height:${height - paper.marginIn * 2}in;margin:16px auto;` +
    `padding:${paper.marginIn}in;box-sizing:content-box;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 12px 30px -12px rgba(0,0,0,.3)}` +
    ".__pf{display:none}" +
    "[data-page-break],.pg,.wb{box-shadow:0 1px 0 0 #c9c9c9}" +
    ".pg:last-of-type{box-shadow:none}" +
    (mono ? "html{filter:grayscale(1)}" : "") +
    "}" +
    (mono ? "@media print{html{filter:grayscale(1)}}" : "")
  );
}

/** Slips the preview rules in before the document's head closes. */
export function withPreviewCss(html: string, css: string): string {
  const at = html.indexOf("</head>");
  if (at < 0) return `<style>${css}</style>${html}`;
  return `${html.slice(0, at)}<style>${css}</style>${html.slice(at)}`;
}

/** An output the Coach ran, kept so it can be run again in one click. */
export interface OutputPreset {
  readonly id: string;
  readonly name: string;
  readonly format: OutputFormatId;
  readonly sourceKind: OutputSourceKind;
  readonly detail: DetailPreset;
  readonly mono: boolean;
  readonly atMs: number;
}

export const OUTPUT_PRESET_LIMIT = 6;

/** Most recent first, one entry per format and source, at most six. */
export function rememberPreset(
  presets: readonly OutputPreset[],
  preset: OutputPreset,
): readonly OutputPreset[] {
  return [
    preset,
    ...presets.filter(
      (kept) =>
        kept.format !== preset.format || kept.sourceKind !== preset.sourceKind,
    ),
  ].slice(0, OUTPUT_PRESET_LIMIT);
}

export function readOutputPresets(value: unknown): readonly OutputPreset[] {
  if (!Array.isArray(value)) return [];
  const formats = new Set(outputFormats.map(({ id }) => id));
  const kinds = new Set<string>(ALL);
  const details = new Set<string>(detailPresets.map(({ id }) => id));
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.name !== "string" ||
      typeof record.format !== "string" ||
      !formats.has(record.format as OutputFormatId) ||
      typeof record.sourceKind !== "string" ||
      !kinds.has(record.sourceKind)
    ) {
      return [];
    }
    return [
      {
        id: record.id,
        name: record.name,
        format: record.format as OutputFormatId,
        sourceKind: record.sourceKind as OutputSourceKind,
        detail:
          typeof record.detail === "string" && details.has(record.detail)
            ? (record.detail as DetailPreset)
            : "full",
        mono: record.mono === true,
        atMs: typeof record.atMs === "number" ? record.atMs : 0,
      },
    ];
  });
}
