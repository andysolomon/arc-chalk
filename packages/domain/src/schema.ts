import * as z from "zod/mini";

export const entityIdSchema = z.string();
export const playUnitSchema = z.enum(["offense", "defense", "special-teams"]);
export const playTypeSchema = z.enum([
  "Run",
  "Pass",
  "RPO",
  "Screen",
  "Coverage",
  "Pressure",
  "Return",
  "Punt",
  "Field Goal",
  "Defense",
  "Special",
]);
export const colorSchema = z.enum([
  "ink",
  "blue",
  "red",
  "green",
  "orange",
  "gray",
  "yellow",
]);

export const pathLineSchema = z.enum(["solid", "dashed", "dotted", "zigzag"]);

export const pathEndingSchema = z.enum([
  "arrow",
  "bar",
  "dot",
  "none",
  "bubble",
  "hook",
  "chevron",
  "diamond",
  "square",
]);

export const coordinateSchema = z.object({
  lateralYards: z.number(),
  depthYards: z.number(),
});

export const pathPointSchema = z.object({
  lateralYards: z.number(),
  depthYards: z.number(),
  control: z.optional(coordinateSchema),
  tick: z.optional(z.boolean()),
  segmentStyle: z.optional(
    z.object({
      line: z.optional(pathLineSchema),
      ending: z.optional(pathEndingSchema),
    }),
  ),
});

export const playerSchema = z.object({
  id: entityIdSchema,
  unit: playUnitSchema,
  position: coordinateSchema,
  symbol: z.enum(["circle", "square", "none"]),
  label: z.string(),
  sublabel: z.string(),
  fill: z.enum(["none", "solid"]),
  color: colorSchema,
  role: z.optional(z.string()),
  group: z.optional(z.string()),
});

export const pathStyleSchema = z.object({
  line: pathLineSchema,
  ending: pathEndingSchema,
  color: colorSchema,
});

export const pathBranchSchema = z.object({
  fromIndex: z.number().check(z.int(), z.nonnegative()),
  points: z.array(pathPointSchema),
  style: pathStyleSchema,
});

export const coverageAreaSchema = z.object({
  type: z.enum(["deep", "curl", "hook", "flat", "spy"]),
  radiusLateralYards: z.number().check(z.positive()),
  radiusDepthYards: z.number().check(z.positive()),
});

export const movementPathSchema = z.object({
  id: entityIdSchema,
  kind: z.enum(["route", "motion", "block", "zone", "blitz", "stunt", "ball"]),
  playerId: entityIdSchema,
  points: z.array(pathPointSchema),
  branches: z.array(pathBranchSchema),
  style: pathStyleSchema,
  variant: z.optional(z.enum(["primary", "alternate"])),
  coverageArea: z.optional(coverageAreaSchema),
  assignment: z.optional(z.string()),
  rule: z.optional(z.string()),
  timing: z.optional(
    z.object({
      delayMs: z.number().check(z.int(), z.nonnegative()),
      durationMs: z.optional(z.number().check(z.int(), z.positive())),
      holdMs: z.number().check(z.int(), z.nonnegative()),
      speedMultiplier: z.optional(z.number().check(z.positive())),
    }),
  ),
});

export const textLabelSchema = z.object({
  id: entityIdSchema,
  position: coordinateSchema,
  text: z.string(),
  color: colorSchema,
  size: z.number().check(z.positive()),
  box: z.enum(["none", "outline", "fill"]),
  boxColor: colorSchema,
  caps: z.optional(z.boolean()),
  unit: z.optional(playUnitSchema),
});

export const fieldProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id: entityIdSchema,
  revision: z.number().check(z.int(), z.positive()),
  name: z.string(),
  lengthYards: z.number().check(z.positive()),
  widthYards: z.number().check(z.positive()),
  endZoneDepthYards: z.number().check(z.nonnegative()),
  hashInsetYards: z.number().check(z.nonnegative()),
  numberInsetYards: z.number().check(z.nonnegative()),
  goalpostWidthYards: z.number().check(z.positive()),
  yardLineIntervalYards: z.number().check(z.positive()),
  minorMarkIntervalYards: z.number().check(z.positive()),
  minorMarkLengthYards: z.number().check(z.positive()),
  numberIntervalYards: z.number().check(z.positive()),
  numberHeightYards: z.number().check(z.positive()),
});

export const legacyFieldProfileSchema = z.object({
  id: entityIdSchema,
  name: z.string(),
  widthYards: z.number().check(z.positive()),
  endZoneDepthYards: z.number().check(z.nonnegative()),
  hashOffsetYards: z.number().check(z.nonnegative()),
});

const playDocumentFields = {
  id: entityIdSchema,
  name: z.string(),
  unit: playUnitSchema,
  playType: playTypeSchema,
  tags: z.array(z.string()),
  notes: z.string(),
  players: z.array(playerSchema),
  paths: z.array(movementPathSchema),
  labels: z.array(textLabelSchema),
};

export const playDocumentV1Schema = z.object({
  schemaVersion: z.literal(1),
  ...playDocumentFields,
  fieldProfile: legacyFieldProfileSchema,
});

export const playDocumentSchema = z.object({
  schemaVersion: z.literal(2),
  ...playDocumentFields,
  fieldProfile: fieldProfileSchema,
});

export const playRevisionSchema = z.object({
  schemaVersion: z.literal(1),
  id: entityIdSchema,
  playId: entityIdSchema,
  parentRevisionId: z.optional(entityIdSchema),
  createdAtMs: z.number().check(z.int(), z.nonnegative()),
  label: z.optional(z.string()),
  documentHash: z.string(),
  document: playDocumentSchema,
});

export const playEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("chalk-play"),
  exportedAtMs: z.number().check(z.int(), z.nonnegative()),
  play: playDocumentSchema,
});

export type Coordinate = z.infer<typeof coordinateSchema>;
export type Color = z.infer<typeof colorSchema>;
export type PathPoint = z.infer<typeof pathPointSchema>;
export type PathLine = z.infer<typeof pathLineSchema>;
export type PathEnding = z.infer<typeof pathEndingSchema>;
export type PathStyle = z.infer<typeof pathStyleSchema>;
export type PathBranch = z.infer<typeof pathBranchSchema>;
export type CoverageArea = z.infer<typeof coverageAreaSchema>;
export type Player = z.infer<typeof playerSchema>;
export type MovementPath = z.infer<typeof movementPathSchema>;
export type TextLabel = z.infer<typeof textLabelSchema>;
export type FieldProfile = z.infer<typeof fieldProfileSchema>;
export type PlayDocumentV1 = z.infer<typeof playDocumentV1Schema>;
export type PlayDocument = z.infer<typeof playDocumentSchema>;
export type PlayRevision = z.infer<typeof playRevisionSchema>;
export type PlayEnvelope = z.infer<typeof playEnvelopeSchema>;
