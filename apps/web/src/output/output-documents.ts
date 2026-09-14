import {
  formatClassification,
  frameSequenceTimes,
  planPlay,
  type Concept,
  type Formation,
  type GamePlanRevision,
  type PlayDocument,
} from "@chalk/domain";
import {
  binderHtml,
  bookEntriesOf,
  bookRevisionLine,
  callSheetHtml,
  configuredCallSheetHtml,
  configuredWristbandHtml,
  detailLayers,
  exportFileName,
  frameSequenceManifest,
  frameSequenceName,
  gamePlanCallSheetHtml,
  gamePlanHandoutHtml,
  gamePlanWristbandHtml,
  handoutHtml,
  handoutSheetHtml,
  installPageHtml,
  outputFormat,
  playFileBase,
  playbookHtml,
  positionViewHtml,
  practiceCardsHtml,
  progressionStripFrames,
  progressionStripHtml,
  quizHtml,
  scoutCardsHtml,
  slideHtml,
  standaloneSvg,
  wristbandHtml,
  type BookConfigs,
  type CallSheetConfig,
  type DetailPreset,
  type PageMap,
  type WristbandConfig,
  type DiagramRenderer,
  type OutputFormatId,
  type PositionGroupId,
} from "@chalk/exports";
import {
  defaultPresentation,
  type PageKindId,
  type Presentation,
  type TypePresetId,
} from "@chalk/render";

import { createDiagramRenderer } from "../components/export-diagram";
import { printFieldHtml } from "../components/print-field";

/**
 * What the Coach chose, resolved to the plays it names (issue #69). The
 * workflow states the source before anything is built; this is that
 * statement in data.
 */
export interface ResolvedSource {
  readonly kind: "current" | "selection" | "plan" | "book";
  readonly label: string;
  readonly plays: readonly PlayDocument[];
  /** The plan's packet, when the packet is what prints. */
  readonly revision?: GamePlanRevision;
  /** "prepared 13 Sep 2026" or "current plays" — which copy of the plays. */
  readonly copy?: string;
  readonly unit?: string;
  readonly order: string;
}

export interface OutputOptions {
  readonly detail: DetailPreset;
  readonly mono: boolean;
  /** The field sheet's own page and type, explicit rather than inherited. */
  readonly pageKind: PageKindId;
  readonly typePreset: TypePresetId;
  readonly positionGroup: PositionGroupId;
  /** How a plan's coordinator sheet is laid out (issue #70). */
  readonly callSheet?: CallSheetConfig;
  /** How a plan's wristband inserts are cut (issue #71). */
  readonly wristband?: WristbandConfig;
  /** Binder and handout layouts, and the binder's measured page map (issue #72). */
  readonly books?: BookConfigs;
  readonly pageMap?: PageMap;
}

export interface OutputContext {
  readonly concepts: readonly Concept[];
  readonly formations: readonly Formation[];
  readonly year: number;
}

export type OutputDocument =
  | { readonly kind: "html"; readonly html: string; readonly title: string }
  | {
      readonly kind: "file";
      readonly name: string;
      readonly text: string;
      readonly type: string;
    }
  | {
      readonly kind: "png";
      readonly name: string;
      readonly svg: string;
    }
  | {
      readonly kind: "frames";
      readonly play: PlayDocument;
      readonly count: number;
      readonly svgAt: (atMs: number) => string;
    }
  | { readonly kind: "empty"; readonly reason: string };

/**
 * The renderer every output draws with: the workflow's own detail preset and
 * type, never the editor's hidden layers. Packets fix their own presentation
 * on top (ADR 0042); the field sheet takes its page and type from here.
 */
export function outputRenderer(options: OutputOptions): DiagramRenderer {
  const base: Presentation = {
    ...defaultPresentation,
    pageKind: options.pageKind,
    typePreset: options.mono ? "print" : options.typePreset,
    layers: detailLayers(options.detail),
  };
  return createDiagramRenderer(base);
}

const mono = (html: string | undefined, on: boolean): string | undefined =>
  html && on
    ? html.replace(
        "</head>",
        "<style>@media print{html{filter:grayscale(1)}}</style></head>",
      )
    : html;

/** Builds the chosen output from the resolved source, or says why it cannot. */
export function buildOutputDocument(
  format: OutputFormatId,
  source: ResolvedSource,
  options: OutputOptions,
  context: OutputContext,
): OutputDocument {
  const spec = outputFormat(format);
  const render = outputRenderer(options);
  const plays = source.plays;
  const one = plays[0];
  if (spec.takes === "one" && !one) {
    return { kind: "empty", reason: "Pick a play first." };
  }
  const concept = (play: PlayDocument) =>
    play.conceptSource
      ? context.concepts.find(({ id }) => id === play.conceptSource?.conceptId)
      : undefined;
  const teaching = (play: PlayDocument) => ({
    render,
    formations: context.formations,
    ...(concept(play) ? { concept: concept(play) } : {}),
  });
  const library = {
    render,
    concepts: context.concepts,
    formations: context.formations,
  };
  const html = (
    title: string,
    markup: string | undefined,
    reason = "Nothing to print here yet.",
  ): OutputDocument =>
    markup
      ? { kind: "html", html: mono(markup, options.mono)!, title }
      : { kind: "empty", reason };

  switch (format) {
    case "field": {
      const play = one!;
      return html(
        play.name,
        printFieldHtml({
          playName: play.name,
          category: formatClassification(play),
          svgMarkup: render(play),
        }),
      );
    }
    case "png": {
      const play = one!;
      return {
        kind: "png",
        name: exportFileName(play.name, "png"),
        svg: standaloneSvg(render(play)),
      };
    }
    case "svg": {
      const play = one!;
      return {
        kind: "file",
        name: exportFileName(play.name, "svg"),
        text: standaloneSvg(render(play)),
        type: "image/svg+xml",
      };
    }
    case "install":
      return html(one!.name, installPageHtml(one!, teaching(one!)));
    case "position":
      return html(
        one!.name,
        positionViewHtml(one!, options.positionGroup, teaching(one!)),
        "No one in that group on the field.",
      );
    case "quiz":
      return html(
        one!.name,
        quizHtml(one!, teaching(one!)),
        "Nothing to quiz — draw some routes first.",
      );
    case "slide":
      return html(one!.name, slideHtml(one!, teaching(one!)));
    case "progression": {
      const play = one!;
      const frames = progressionStripFrames(play).map((frame) => ({
        name: frame.name,
        clock: frame.clock,
        svgMarkup: render(play, { atMs: frame.atMs }),
      }));
      return frames.length === 0
        ? { kind: "empty", reason: "This play has no timed routes to step." }
        : html(
            play.name,
            progressionStripHtml({ playName: play.name, frames }),
          );
    }
    case "frames": {
      const play = one!;
      const count = frameSequenceTimes(planPlay(play)).length;
      return count === 0
        ? { kind: "empty", reason: "This play has no timed routes to step." }
        : {
            kind: "frames",
            play,
            count,
            svgAt: (atMs) => standaloneSvg(render(play, { atMs })),
          };
    }
    case "callSheet":
      return html(
        source.label,
        source.revision
          ? options.callSheet
            ? configuredCallSheetHtml(source.revision, options.callSheet, {
                formations: context.formations,
                render,
              })
            : gamePlanCallSheetHtml(source.revision, {})
          : callSheetHtml(plays, { concepts: context.concepts }),
      );
    case "wristband":
      return html(
        source.label,
        source.revision
          ? options.wristband
            ? configuredWristbandHtml(source.revision, options.wristband, {
                render,
              })
            : gamePlanWristbandHtml(source.revision, { render })
          : wristbandHtml(plays, library),
        "Pick some plays first.",
      );
    case "scout":
      return html(source.label, scoutCardsHtml(plays, library));
    case "practice":
      return html(source.label, practiceCardsHtml(plays, library));
    case "binder": {
      if (!options.books) {
        return html(
          source.label,
          source.revision
            ? gamePlanHandoutHtml(source.revision, {
                ...library,
                year: context.year,
              })
            : playbookHtml(plays, { ...library, year: context.year }),
          "The playbook has no saved plays yet.",
        );
      }
      const entries = bookEntriesOf(source);
      if (entries.length === 0) {
        return {
          kind: "empty",
          reason: "The playbook has no saved plays yet.",
        };
      }
      const revisionLine = bookRevisionLine(source.revision);
      return html(
        source.label,
        binderHtml(
          entries,
          options.books.binder,
          {
            render,
            formations: context.formations,
            year: context.year,
            title: source.label,
            ...(source.unit ? { subtitle: source.unit } : {}),
            ...(revisionLine ? { revisionLine } : {}),
          },
          options.pageMap,
        ),
      );
    }
    case "handout": {
      if (!options.books)
        return html(source.label, handoutHtml(plays, library));
      const entries = bookEntriesOf(source);
      if (entries.length === 0) {
        return { kind: "empty", reason: "Pick at least one play." };
      }
      return html(
        source.label,
        handoutSheetHtml(entries, options.books.handout, {
          render,
          formations: context.formations,
          year: context.year,
          title: source.label,
        }),
      );
    }
  }
}

/** The manifest a frame sequence downloads beside its PNGs. */
export function framesManifest(play: PlayDocument): {
  readonly name: string;
  readonly text: string;
  readonly frameName: (index: number) => string;
} {
  return {
    name: `${playFileBase(play.name)}-frames.txt`,
    text: frameSequenceManifest(play),
    frameName: (index) => frameSequenceName(play.name, index),
  };
}
