/**
 * One entry in the catalogue the inspector offers (issue #64): concepts and
 * line calls on offense, the defense's unit calls on defense (ADR 0075).
 * Keyed by its group and key — `concept:<key>`, `coverage:<key>` — so a
 * starred or recent preset can be told apart across the catalogues.
 */
export interface PresetChoice {
  readonly key: string;
  readonly name: string;
  readonly group: "concept" | "line" | "coverage" | "front" | "linebackers";
  readonly hint?: string;
  readonly on: boolean;
  readonly available: boolean;
}

export const PRESET_GROUP_NAMES: Readonly<
  Record<PresetChoice["group"], string>
> = Object.freeze({
  concept: "Concepts",
  line: "Line calls",
  coverage: "Coverages",
  front: "Front calls",
  linebackers: "Linebacker calls",
});
