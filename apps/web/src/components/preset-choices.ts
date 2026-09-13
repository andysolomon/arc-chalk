/**
 * One entry in the concepts-and-line-calls catalogue the inspector offers
 * (issue #64). Keyed `concept:<key>` or `line:<key>` so a starred or recent
 * preset can be told apart across the two catalogues.
 */
export interface PresetChoice {
  readonly key: string;
  readonly name: string;
  readonly group: "concept" | "line";
  readonly hint?: string;
  readonly on: boolean;
  readonly available: boolean;
}

export const PRESET_GROUP_NAMES: Readonly<
  Record<PresetChoice["group"], string>
> = Object.freeze({ concept: "Concepts", line: "Line calls" });
