import type { OutputFormatId } from "@chalk/exports";
import type { Presentation } from "@chalk/render";

import type { ChalkLibrary } from "../app/editor-runtime";
import type { PlayDocument } from "@chalk/domain";
import type { Concept } from "@chalk/domain";
import type { OutputOptions } from "./output-documents";
import type { PrintOutcome } from "./print-frame";

/** Which plays print, as the Coach chose them. */
export type SourceChoice =
  | { readonly kind: "current" }
  | { readonly kind: "selection"; readonly playIds: readonly string[] }
  | {
      readonly kind: "plan";
      readonly planId: string;
      /** A section of the plan, or the whole plan. */
      readonly sectionId?: string;
      /** The prepared revision, or the plays as they are now. */
      readonly copy: "revision" | "current";
    }
  | { readonly kind: "book" };

export interface OutputSpec {
  readonly source: SourceChoice;
  readonly format: OutputFormatId;
  readonly options: OutputOptions;
}

export interface OutputPorts {
  readonly library: ChalkLibrary;
  /** Every stored play with the open one standing in for its copy. */
  readonly loadLibrary: () => Promise<{
    readonly plays: readonly PlayDocument[];
    readonly concepts: readonly Concept[];
  }>;
  readonly print?: (html: string) => Promise<PrintOutcome>;
  readonly openWindow?: (html: string) => PrintOutcome;
}

export function defaultOutputSpec(
  presentation: Presentation,
  format: OutputFormatId = "field",
  source: SourceChoice = { kind: "current" },
): OutputSpec {
  return {
    source,
    format,
    options: {
      detail: "full",
      mono: false,
      pageKind: presentation.pageKind,
      typePreset: presentation.typePreset,
      positionGroup: "rec",
    },
  };
}
