import {
  defaultEditorFieldWindow,
  LEGACY_FIELD_GEOMETRY,
  legacyDepthSpanToYards,
  type FieldWindow,
} from "@chalk/domain";

/**
 * What prints under the Play — yard lines, hashes, numbers — without moving
 * the players or the routes. The original's five kinds, with their canvas
 * bands converted on the depth scale they were drawn at.
 */
export const pageKindIds = ["full", "half", "card", "book", "blank"] as const;
export type PageKindId = (typeof pageKindIds)[number];

/**
 * How dense the words on the field are. Coach is what the original opens on;
 * Player is the room-readable assignment sheet; Print is copier-safe black.
 */
export const typePresetIds = ["coach", "player", "print"] as const;
export type TypePresetId = (typeof typePresetIds)[number];

/** Which of the four annotation families currently print on the field. */
export const fieldLayerIds = ["reads", "assigns", "notes", "text"] as const;
export type FieldLayerId = (typeof fieldLayerIds)[number];

export interface FieldLayers {
  readonly reads: boolean;
  readonly assigns: boolean;
  readonly notes: boolean;
  readonly text: boolean;
}

export interface Presentation {
  readonly pageKind: PageKindId;
  readonly typePreset: TypePresetId;
  readonly layers: FieldLayers;
  /**
   * Present mode scales the type 1.25× so a room can still read it. The
   * original applies this on top of whichever preset is selected.
   */
  readonly present?: boolean;
}

/** What the original draws for one page kind: lines, light lines, or none. */
export type FieldMarkingStyle = "lines" | "light" | "los" | "blank";

export interface TypeDensity {
  readonly name: string;
  readonly hint: string;
  readonly label: number;
  readonly read: number;
  readonly notes: boolean;
  readonly flat: boolean;
}

export interface PageKindSpec {
  readonly id: PageKindId;
  readonly name: string;
  readonly style: FieldMarkingStyle;
  readonly window: FieldWindow;
}

function depthAtLegacyY(y: number): number {
  return legacyDepthSpanToYards(LEGACY_FIELD_GEOMETRY.lineOfScrimmageY - y);
}

/** The original's half-field band, [196, 620] in its own canvas. */
const halfFieldWindow: FieldWindow = Object.freeze({
  minDepthYards: depthAtLegacyY(620),
  maxDepthYards: depthAtLegacyY(196),
});

/** The original's scout-card band, [268, 620] — LOS only, same grass. */
const scoutCardWindow: FieldWindow = Object.freeze({
  minDepthYards: depthAtLegacyY(620),
  maxDepthYards: depthAtLegacyY(268),
});

export const defaultLayers: FieldLayers = Object.freeze({
  reads: true,
  assigns: true,
  notes: true,
  text: true,
});

export const defaultPresentation: Presentation = Object.freeze({
  pageKind: "full",
  typePreset: "coach",
  layers: defaultLayers,
});

/**
 * The original's TYPE table. Present mode rounds each size after the 1.25×
 * scale rather than scaling the rounded result.
 */
const TYPE = Object.freeze({
  coach: Object.freeze({
    name: "Coach",
    label: 12,
    read: 13,
    notes: true,
    flat: false,
    hint: "Dense — reads, assignments, conversions and notes all on the field.",
  }),
  player: Object.freeze({
    name: "Player",
    label: 15,
    read: 17,
    notes: false,
    hint: "Bigger type, assignments only — what a player reads across a room.",
    flat: false,
  }),
  print: Object.freeze({
    name: "Print",
    label: 13,
    read: 14,
    notes: true,
    flat: true,
    hint: "Pure black, no color fills — survives a copier.",
  }),
});

export const pageKindCatalog: readonly PageKindSpec[] = Object.freeze([
  {
    id: "full",
    name: "Full field",
    style: "lines",
    window: defaultEditorFieldWindow,
  },
  {
    id: "half",
    name: "Half field",
    style: "lines",
    window: halfFieldWindow,
  },
  {
    id: "card",
    name: "Scout card",
    style: "los",
    window: scoutCardWindow,
  },
  {
    id: "book",
    name: "Playbook page",
    style: "light",
    window: defaultEditorFieldWindow,
  },
  {
    id: "blank",
    name: "Blank",
    style: "blank",
    window: defaultEditorFieldWindow,
  },
]);

export const typePresetCatalog: readonly {
  readonly id: TypePresetId;
  readonly name: string;
  readonly hint: string;
}[] = Object.freeze(
  typePresetIds.map((id) => ({
    id,
    name: TYPE[id].name,
    hint: TYPE[id].hint,
  })),
);

export const fieldLayerCatalog: readonly {
  readonly id: FieldLayerId;
  readonly name: string;
}[] = Object.freeze([
  { id: "reads", name: "Reads" },
  { id: "assigns", name: "Assignments" },
  { id: "notes", name: "Notes" },
  { id: "text", name: "Text" },
]);

const pageKindById = Object.fromEntries(
  pageKindCatalog.map((kind) => [kind.id, kind]),
) as Record<PageKindId, PageKindSpec>;

export function pageKindSpec(id: PageKindId): PageKindSpec {
  return pageKindById[id];
}

export function resolveTypeDensity(
  presentation: Presentation = defaultPresentation,
): TypeDensity {
  const preset = TYPE[presentation.typePreset] ?? TYPE.coach;
  if (!presentation.present) return preset;
  return {
    ...preset,
    label: Math.round(preset.label * 1.25),
    read: Math.round(preset.read * 1.25),
  };
}

/**
 * A free label's drawn size follows the type preset, scaled from Coach's 12
 * so a note the Coach set to 11 stays 11 on Coach and grows on Player.
 */
export function labelFontSize(
  size: number,
  typeLabel: number = resolveTypeDensity().label,
): number {
  return Math.max(9, Math.round(size * (typeLabel / 12)));
}

/**
 * Layers the Coach toggled, with the type preset's own notes flag applied.
 * Player type hides conversions and coaching notes even when Notes is on —
 * the toggle still reads on; the field just does not draw them.
 */
export function effectiveLayers(
  presentation: Presentation = defaultPresentation,
): FieldLayers {
  const layers = { ...defaultLayers, ...presentation.layers };
  return {
    reads: layers.reads,
    assigns: layers.assigns,
    notes: layers.notes && resolveTypeDensity(presentation).notes,
    text: layers.text,
  };
}
