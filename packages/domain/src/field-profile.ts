import {
  fieldProfileSchema,
  legacyFieldProfileSchema,
  type FieldProfile,
} from "./schema";

const FEET_PER_YARD = 3;
const MAX_LANDMARKS_PER_AXIS = 1_000;
const FOOTBALL_FIELD_WIDTH_YARDS = 160 / FEET_PER_YARD;
const COLLEGE_HASH_INSET_YARDS = 60 / FEET_PER_YARD;
const HIGH_SCHOOL_HASH_INSET_YARDS = (53 + 4 / 12) / FEET_PER_YARD;
const NFL_HASH_INSET_YARDS = (70 + 9 / 12) / FEET_PER_YARD;
const HIGH_SCHOOL_GOALPOST_WIDTH_YARDS = (23 + 4 / 12) / FEET_PER_YARD;
const COLLEGE_AND_NFL_GOALPOST_WIDTH_YARDS = (18 + 6 / 12) / FEET_PER_YARD;

const builtInFieldProfile = (
  values: Pick<
    FieldProfile,
    "id" | "name" | "hashInsetYards" | "numberInsetYards" | "goalpostWidthYards"
  >,
): FieldProfile =>
  fieldProfileSchema.parse({
    schemaVersion: 1,
    revision: 1,
    lengthYards: 100,
    widthYards: FOOTBALL_FIELD_WIDTH_YARDS,
    endZoneDepthYards: 10,
    yardLineIntervalYards: 5,
    minorMarkIntervalYards: 1,
    minorMarkLengthYards: 2 / FEET_PER_YARD,
    numberIntervalYards: 10,
    numberHeightYards: 2,
    ...values,
  });

export const highSchoolFieldProfile = Object.freeze(
  builtInFieldProfile({
    id: "field_high_school",
    name: "High school",
    hashInsetYards: HIGH_SCHOOL_HASH_INSET_YARDS,
    numberInsetYards: 8,
    goalpostWidthYards: HIGH_SCHOOL_GOALPOST_WIDTH_YARDS,
  }),
);

export const collegeFieldProfile = Object.freeze(
  builtInFieldProfile({
    id: "field_college",
    name: "College",
    hashInsetYards: COLLEGE_HASH_INSET_YARDS,
    numberInsetYards: 10,
    goalpostWidthYards: COLLEGE_AND_NFL_GOALPOST_WIDTH_YARDS,
  }),
);

export const nflFieldProfile = Object.freeze(
  builtInFieldProfile({
    id: "field_nfl",
    name: "NFL",
    hashInsetYards: NFL_HASH_INSET_YARDS,
    numberInsetYards: 13,
    goalpostWidthYards: COLLEGE_AND_NFL_GOALPOST_WIDTH_YARDS,
  }),
);

export const builtInFieldProfiles = Object.freeze([
  highSchoolFieldProfile,
  collegeFieldProfile,
  nflFieldProfile,
]);

/**
 * Upgrades the only pre-IndexedDB Field Profile shape. Its misleading
 * `hashOffsetYards` property was populated with feet by the prototype importer.
 */
export function migrateLegacyFieldProfile(input: unknown): FieldProfile {
  const legacy = legacyFieldProfileSchema.parse(input);
  const builtIn = builtInFieldProfiles.find(({ id }) => id === legacy.id);
  if (builtIn) return structuredClone(builtIn);

  return fieldProfileSchema.parse({
    schemaVersion: 1,
    revision: 1,
    id: legacy.id,
    name: legacy.name,
    lengthYards: 100,
    widthYards: legacy.widthYards,
    endZoneDepthYards: legacy.endZoneDepthYards,
    hashInsetYards: legacy.hashOffsetYards / FEET_PER_YARD,
    numberInsetYards: 8,
    goalpostWidthYards: HIGH_SCHOOL_GOALPOST_WIDTH_YARDS,
    yardLineIntervalYards: 5,
    minorMarkIntervalYards: 1,
    minorMarkLengthYards: 2 / FEET_PER_YARD,
    numberIntervalYards: 10,
    numberHeightYards: 2,
  });
}

export interface FieldWindow {
  readonly minDepthYards: number;
  readonly maxDepthYards: number;
}

export const defaultEditorFieldWindow: FieldWindow = Object.freeze({
  minDepthYards: -10,
  maxDepthYards: 30,
});

export interface FieldLandmarks {
  readonly window: FieldWindow;
  readonly sidelines: readonly { readonly lateralYards: number }[];
  readonly yardLines: readonly {
    readonly depthYards: number;
    readonly isLineOfScrimmage: boolean;
  }[];
  readonly hashMarks: readonly {
    readonly lateralYards: number;
    readonly depthYards: number;
    readonly lengthYards: number;
  }[];
  readonly sidelineMarks: readonly {
    readonly side: "left" | "right";
    readonly depthYards: number;
    readonly lengthYards: number;
  }[];
  readonly numbers: readonly {
    readonly lateralYards: number;
    readonly depthYards: number;
    readonly value: number;
    readonly heightYards: number;
  }[];
}

function intervalValues(
  minimum: number,
  maximum: number,
  interval: number,
): number[] {
  const count = Math.floor((maximum - minimum) / interval) + 1;
  if (count > MAX_LANDMARKS_PER_AXIS) {
    throw new RangeError("A Field Profile creates too many field landmarks.");
  }
  const values: number[] = [];
  const first = Math.ceil(minimum / interval) * interval;
  for (let value = first; value <= maximum; value += interval) {
    values.push(Number(value.toFixed(9)));
  }
  return values;
}

function isInterval(value: number, interval: number): boolean {
  const quotient = value / interval;
  return Math.abs(quotient - Math.round(quotient)) < Number.EPSILON * 10;
}

export function buildFieldLandmarks(
  profile: FieldProfile,
  window: FieldWindow = defaultEditorFieldWindow,
): FieldLandmarks {
  const parsedProfile = fieldProfileSchema.parse(profile);
  if (window.minDepthYards >= window.maxDepthYards) {
    throw new RangeError("A Field window must have increasing depth bounds.");
  }
  if (parsedProfile.hashInsetYards > parsedProfile.widthYards / 2) {
    throw new RangeError("Hash marks must remain inside the sidelines.");
  }
  if (parsedProfile.numberInsetYards > parsedProfile.widthYards / 2) {
    throw new RangeError("Field numbers must remain inside the sidelines.");
  }

  const halfWidth = parsedProfile.widthYards / 2;
  const yardLineDepths = intervalValues(
    window.minDepthYards,
    window.maxDepthYards,
    parsedProfile.yardLineIntervalYards,
  );
  const minorDepths = intervalValues(
    window.minDepthYards,
    window.maxDepthYards,
    parsedProfile.minorMarkIntervalYards,
  ).filter((depth) => !isInterval(depth, parsedProfile.yardLineIntervalYards));
  const numberDepths = intervalValues(
    window.minDepthYards,
    window.maxDepthYards,
    parsedProfile.numberIntervalYards,
  ).filter((depth) => depth !== 0);
  const hashFromMidfield = halfWidth - parsedProfile.hashInsetYards;
  const numberFromMidfield = halfWidth - parsedProfile.numberInsetYards;

  return {
    window: { ...window },
    sidelines: [{ lateralYards: -halfWidth }, { lateralYards: halfWidth }],
    yardLines: yardLineDepths.map((depthYards) => ({
      depthYards,
      isLineOfScrimmage: depthYards === 0,
    })),
    hashMarks: minorDepths.flatMap((depthYards) => [
      {
        lateralYards: -hashFromMidfield,
        depthYards,
        lengthYards: parsedProfile.minorMarkLengthYards,
      },
      {
        lateralYards: hashFromMidfield,
        depthYards,
        lengthYards: parsedProfile.minorMarkLengthYards,
      },
    ]),
    sidelineMarks: minorDepths.flatMap((depthYards) => [
      {
        side: "left" as const,
        depthYards,
        lengthYards: parsedProfile.minorMarkLengthYards,
      },
      {
        side: "right" as const,
        depthYards,
        lengthYards: parsedProfile.minorMarkLengthYards,
      },
    ]),
    numbers: numberDepths.flatMap((depthYards) => [
      {
        lateralYards: -numberFromMidfield,
        depthYards,
        value: Math.abs(depthYards),
        heightYards: parsedProfile.numberHeightYards,
      },
      {
        lateralYards: numberFromMidfield,
        depthYards,
        value: Math.abs(depthYards),
        heightYards: parsedProfile.numberHeightYards,
      },
    ]),
  };
}
