import * as z from "zod/mini";

export const entityIdSchema = z.string().check(z.minLength(1));
export const nameSchema = z.string().check(z.minLength(1));
export const playUnitSchema = z.enum(["offense", "defense", "special-teams"]);

/** The released prototype-era category vocabulary retained for v1/v2 reads. */
export const legacyPlayTypeSchema = z.enum([
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

export const builtInPlayTypeKeySchema = z.enum([
  "run",
  "pass",
  "rpo",
  "screen",
  "coverage",
  "pressure",
  "return",
  "punt",
  "field-goal",
]);

export const playTypeDefinitionSchema = z.object({
  id: entityIdSchema,
  name: nameSchema,
  unit: playUnitSchema,
  builtInKey: z.optional(builtInPlayTypeKeySchema),
  order: z.number().check(z.int(), z.nonnegative()),
  archived: z.boolean(),
});

/** A name snapshot keeps standalone Play exports understandable after a rename. */
export const playTypeReferenceSchema = z.object({
  id: entityIdSchema,
  name: nameSchema,
});

export const colorSchema = z.enum([
  "ink",
  "blue",
  "red",
  "green",
  "orange",
  "gray",
  "yellow",
]);

export const playerSymbolSchema = z.enum([
  "circle",
  "square",
  "oval",
  "triangle",
  "x",
  "none",
]);
export const playerFillSchema = z.enum(["none", "half", "solid"]);
export const labelBoxSchema = z.enum(["none", "outline", "fill", "circle"]);
export const labelRoleSchema = z.enum([
  "landmark",
  "assignment",
  "progression",
  "adjustment",
  "alert",
  "coaching",
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
  symbol: playerSymbolSchema,
  label: z.string(),
  sublabel: z.string(),
  fill: playerFillSchema,
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

const movementPathFields = {
  id: entityIdSchema,
  kind: z.enum(["route", "motion", "block", "zone", "blitz", "stunt", "ball"]),
  playerId: entityIdSchema,
  points: z.array(pathPointSchema).check(z.minLength(1)),
  branches: z.array(pathBranchSchema),
  style: pathStyleSchema,
  variant: z.optional(z.enum(["primary", "alternate"])),
  coverageArea: z.optional(coverageAreaSchema),
  rule: z.optional(z.string()),
  /**
   * Where this line falls in the quarterback's progression. The Coach's own
   * wording for the man's job is an Assignment (ADR 0011), but the order he
   * reads the lines in, what the line becomes against a coverage, and the
   * point he coaches off it all describe the line, and ride with it.
   */
  readOrder: z.optional(z.number().check(z.int(), z.positive())),
  conversion: z.optional(z.string()),
  coachingNote: z.optional(z.string()),
  timing: z.optional(
    z.object({
      delayMs: z.number().check(z.int(), z.nonnegative()),
      durationMs: z.optional(z.number().check(z.int(), z.positive())),
      holdMs: z.number().check(z.int(), z.nonnegative()),
      speedMultiplier: z.optional(z.number().check(z.positive())),
    }),
  ),
};

/** The v1/v2 path shape stored assignment prose directly on a path. */
export const movementPathV2Schema = z.object({
  ...movementPathFields,
  assignment: z.optional(z.string()),
});

export const movementPathSchema = z.object(movementPathFields);

export const textLabelSchema = z.object({
  id: entityIdSchema,
  position: coordinateSchema,
  text: z.string(),
  color: colorSchema,
  size: z.number().check(z.positive()),
  box: labelBoxSchema,
  boxColor: colorSchema,
  caps: z.optional(z.boolean()),
  mono: z.optional(z.boolean()),
  role: z.optional(labelRoleSchema),
  unit: z.optional(playUnitSchema),
  leader: z.optional(
    z.object({
      endpoint: coordinateSchema,
      line: z.enum(["solid", "dashed"]),
    }),
  ),
  binding: z.optional(
    z.object({
      pathId: entityIdSchema,
      segmentIndex: z.number().check(z.int(), z.nonnegative()),
      progress: z.number().check(z.gte(0), z.lte(1)),
      offset: coordinateSchema,
    }),
  ),
});

export const assignmentTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("player"), playerId: entityIdSchema }),
  z.object({ kind: z.literal("path"), pathId: entityIdSchema }),
  z.object({
    kind: z.literal("landmark"),
    landmark: z.enum([
      "ball",
      "line-of-scrimmage",
      "left-hash",
      "right-hash",
      "left-sideline",
      "right-sideline",
      "goal-line",
    ]),
  }),
  z.object({ kind: z.literal("zone"), label: nameSchema }),
]);

const targetedAssignmentActionFields = {
  id: entityIdSchema,
  target: z.optional(assignmentTargetSchema),
  note: z.optional(z.string()),
};

export const assignmentActionSchema = z.discriminatedUnion("kind", [
  z.object({
    id: entityIdSchema,
    kind: z.literal("movement"),
    pathId: entityIdSchema,
    note: z.optional(z.string()),
  }),
  z.object({ ...targetedAssignmentActionFields, kind: z.literal("block") }),
  z.object({ ...targetedAssignmentActionFields, kind: z.literal("coverage") }),
  z.object({ ...targetedAssignmentActionFields, kind: z.literal("pressure") }),
  z.object({ ...targetedAssignmentActionFields, kind: z.literal("handoff") }),
  z.object({ ...targetedAssignmentActionFields, kind: z.literal("fake") }),
  z.object({ ...targetedAssignmentActionFields, kind: z.literal("kick") }),
  z.object({
    id: entityIdSchema,
    kind: z.literal("other"),
    text: nameSchema,
  }),
]);

export const assignmentSchema = z
  .object({
    id: entityIdSchema,
    playerId: entityIdSchema,
    text: z.string(),
    actions: z.array(assignmentActionSchema),
  })
  .check(
    z.refine(
      (assignment) =>
        assignment.text.trim().length > 0 || assignment.actions.length > 0,
      "An Assignment must contain Coach wording or a structured action.",
    ),
  );

export const fieldProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id: entityIdSchema,
  revision: z.number().check(z.int(), z.positive()),
  name: nameSchema,
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
  name: nameSchema,
  widthYards: z.number().check(z.positive()),
  endZoneDepthYards: z.number().check(z.nonnegative()),
  hashOffsetYards: z.number().check(z.nonnegative()),
});

export const conceptSourceSchema = z.object({
  conceptId: entityIdSchema,
  revision: z.number().check(z.int(), z.positive()),
});

export const formationSlotBindingSchema = z.object({
  slotId: entityIdSchema,
  playerId: entityIdSchema,
});

export const formationSourceSchema = z.object({
  formationId: entityIdSchema,
  revision: z.number().check(z.int(), z.positive()),
  slotBindings: z.array(formationSlotBindingSchema),
});

const releasedPlayDocumentFields = {
  id: entityIdSchema,
  name: nameSchema,
  unit: playUnitSchema,
  playType: legacyPlayTypeSchema,
  tags: z.array(z.string()),
  notes: z.string(),
  players: z.array(playerSchema),
  paths: z.array(movementPathV2Schema),
  labels: z.array(textLabelSchema),
};

export const playDocumentV1Schema = z.object({
  schemaVersion: z.literal(1),
  ...releasedPlayDocumentFields,
  fieldProfile: legacyFieldProfileSchema,
});

export const playDocumentV2Schema = z.object({
  schemaVersion: z.literal(2),
  ...releasedPlayDocumentFields,
  fieldProfile: fieldProfileSchema,
});

const currentPlayDocumentSchema = z.object({
  schemaVersion: z.literal(3),
  id: entityIdSchema,
  playbookId: entityIdSchema,
  name: nameSchema,
  unit: playUnitSchema,
  playType: z.optional(playTypeReferenceSchema),
  personnelLabel: z.optional(z.string()),
  tags: z.array(z.string()),
  notes: z.string(),
  conceptSource: z.optional(conceptSourceSchema),
  formationSource: z.optional(formationSourceSchema),
  fieldProfile: fieldProfileSchema,
  players: z.array(playerSchema),
  assignments: z.array(assignmentSchema),
  paths: z.array(movementPathSchema),
  labels: z.array(textLabelSchema),
});

function addCustomIssue(
  payload: {
    addIssue(issue: {
      code: "custom";
      path: PropertyKey[];
      message: string;
    }): void;
  },
  path: PropertyKey[],
  message: string,
): void {
  payload.addIssue({ code: "custom", path, message });
}

function duplicateIds(items: readonly { readonly id: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { id } of items) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].sort();
}

export const playDocumentSchema = currentPlayDocumentSchema.check(
  z.superRefine((play, payload) => {
    for (const [key, items] of [
      ["players", play.players],
      ["assignments", play.assignments],
      ["paths", play.paths],
      ["labels", play.labels],
    ] as const) {
      for (const id of duplicateIds(items)) {
        addCustomIssue(payload, [key], `Duplicate ${key} ID: ${id}`);
      }
    }

    const playerIds = new Set(play.players.map(({ id }) => id));
    const pathIds = new Set(play.paths.map(({ id }) => id));
    const actionIds = new Set<string>();
    for (const [index, path] of play.paths.entries()) {
      if (!playerIds.has(path.playerId)) {
        addCustomIssue(
          payload,
          ["paths", index, "playerId"],
          `MovementPath references missing Player: ${path.playerId}`,
        );
      }
    }
    for (const [index, label] of play.labels.entries()) {
      if (label.binding && !pathIds.has(label.binding.pathId)) {
        addCustomIssue(
          payload,
          ["labels", index, "binding", "pathId"],
          `Label references missing MovementPath: ${label.binding.pathId}`,
        );
      }
    }
    for (const [assignmentIndex, assignment] of play.assignments.entries()) {
      if (!playerIds.has(assignment.playerId)) {
        addCustomIssue(
          payload,
          ["assignments", assignmentIndex, "playerId"],
          `Assignment references missing Player: ${assignment.playerId}`,
        );
      }
      for (const [actionIndex, action] of assignment.actions.entries()) {
        if (actionIds.has(action.id)) {
          addCustomIssue(
            payload,
            ["assignments", assignmentIndex, "actions", actionIndex, "id"],
            `Duplicate Assignment action ID: ${action.id}`,
          );
        }
        actionIds.add(action.id);
        const target = "target" in action ? action.target : undefined;
        const pathId =
          action.kind === "movement"
            ? action.pathId
            : target?.kind === "path"
              ? target.pathId
              : undefined;
        const playerId =
          target?.kind === "player" ? target.playerId : undefined;
        if (pathId && !pathIds.has(pathId)) {
          addCustomIssue(
            payload,
            ["assignments", assignmentIndex, "actions", actionIndex],
            `Assignment action references missing MovementPath: ${pathId}`,
          );
        }
        if (playerId && !playerIds.has(playerId)) {
          addCustomIssue(
            payload,
            ["assignments", assignmentIndex, "actions", actionIndex],
            `Assignment action references missing Player: ${playerId}`,
          );
        }
      }
    }
    if (play.formationSource) {
      const slotIds = new Set<string>();
      const boundPlayerIds = new Set<string>();
      for (const [
        index,
        binding,
      ] of play.formationSource.slotBindings.entries()) {
        if (slotIds.has(binding.slotId)) {
          addCustomIssue(
            payload,
            ["formationSource", "slotBindings", index, "slotId"],
            `Formation slot is bound more than once: ${binding.slotId}`,
          );
        }
        if (boundPlayerIds.has(binding.playerId)) {
          addCustomIssue(
            payload,
            ["formationSource", "slotBindings", index, "playerId"],
            `Player is bound to more than one Formation slot: ${binding.playerId}`,
          );
        }
        if (!playerIds.has(binding.playerId)) {
          addCustomIssue(
            payload,
            ["formationSource", "slotBindings", index, "playerId"],
            `Formation binding references missing Player: ${binding.playerId}`,
          );
        }
        slotIds.add(binding.slotId);
        boundPlayerIds.add(binding.playerId);
      }
    }
  }),
);

export const formationSlotSchema = z.object({
  id: entityIdSchema,
  unit: playUnitSchema,
  role: nameSchema,
  position: coordinateSchema,
  symbol: playerSymbolSchema,
  label: z.string(),
  sublabel: z.string(),
  fill: playerFillSchema,
  color: colorSchema,
  group: z.optional(z.string()),
});

export const formationRolePairSchema = z.object({
  leftSlotId: entityIdSchema,
  rightSlotId: entityIdSchema,
});

const formationStructureSchema = z.object({
  schemaVersion: z.literal(1),
  id: entityIdSchema,
  playbookId: entityIdSchema,
  revision: z.number().check(z.int(), z.positive()),
  name: nameSchema,
  unit: playUnitSchema,
  description: z.string(),
  family: z.optional(z.string()),
  personnelLabel: z.optional(z.string()),
  strength: z.enum(["left", "right", "balanced"]),
  mirrorFormationId: z.optional(entityIdSchema),
  ball: z.object({
    position: coordinateSchema,
    hash: z.enum(["left", "middle", "right", "custom"]),
  }),
  slots: z.array(formationSlotSchema).check(z.minLength(1)),
  rolePairs: z.array(formationRolePairSchema),
});

export const formationSchema = formationStructureSchema.check(
  z.superRefine((formation, payload) => {
    const slotIds = new Set(formation.slots.map(({ id }) => id));
    for (const id of duplicateIds(formation.slots)) {
      addCustomIssue(payload, ["slots"], `Duplicate Formation slot ID: ${id}`);
    }
    if (formation.mirrorFormationId === formation.id) {
      addCustomIssue(
        payload,
        ["mirrorFormationId"],
        "A Formation cannot be its own mirror counterpart.",
      );
    }
    for (const [index, pair] of formation.rolePairs.entries()) {
      if (pair.leftSlotId === pair.rightSlotId) {
        addCustomIssue(
          payload,
          ["rolePairs", index],
          "A Formation role pair needs two different slots.",
        );
      }
      for (const [key, slotId] of [
        ["leftSlotId", pair.leftSlotId],
        ["rightSlotId", pair.rightSlotId],
      ] as const) {
        if (!slotIds.has(slotId)) {
          addCustomIssue(
            payload,
            ["rolePairs", index, key],
            `Formation role pair references missing slot: ${slotId}`,
          );
        }
      }
    }
  }),
);

export const conceptSchema = z.object({
  schemaVersion: z.literal(1),
  id: entityIdSchema,
  playbookId: entityIdSchema,
  revision: z.number().check(z.int(), z.positive()),
  name: nameSchema,
  unit: playUnitSchema,
  notes: z.string(),
  tags: z.array(z.string()),
});

const playbookStructureSchema = z.object({
  schemaVersion: z.literal(1),
  id: entityIdSchema,
  name: nameSchema,
  defaultFieldProfileId: entityIdSchema,
  fieldProfiles: z.array(fieldProfileSchema).check(z.minLength(1)),
  playTypes: z.array(playTypeDefinitionSchema),
  createdAtMs: z.number().check(z.int(), z.nonnegative()),
  updatedAtMs: z.number().check(z.int(), z.nonnegative()),
});

export const playbookSchema = playbookStructureSchema.check(
  z.superRefine((playbook, payload) => {
    for (const id of duplicateIds(playbook.fieldProfiles)) {
      addCustomIssue(
        payload,
        ["fieldProfiles"],
        `Duplicate Field Profile ID: ${id}`,
      );
    }
    for (const id of duplicateIds(playbook.playTypes)) {
      addCustomIssue(payload, ["playTypes"], `Duplicate Play Type ID: ${id}`);
    }
    const builtInKeys = playbook.playTypes.flatMap(({ builtInKey }) =>
      builtInKey ? [{ id: builtInKey }] : [],
    );
    for (const id of duplicateIds(builtInKeys)) {
      addCustomIssue(
        payload,
        ["playTypes"],
        `Duplicate built-in Play Type key: ${id}`,
      );
    }
    if (
      !playbook.fieldProfiles.some(
        ({ id }) => id === playbook.defaultFieldProfileId,
      )
    ) {
      addCustomIssue(
        payload,
        ["defaultFieldProfileId"],
        `Default Field Profile is missing: ${playbook.defaultFieldProfileId}`,
      );
    }
    if (playbook.updatedAtMs < playbook.createdAtMs) {
      addCustomIssue(
        payload,
        ["updatedAtMs"],
        "Playbook updatedAtMs cannot precede createdAtMs.",
      );
    }
  }),
);

const playRevisionStructureSchema = z.object({
  schemaVersion: z.literal(1),
  id: entityIdSchema,
  playId: entityIdSchema,
  parentRevisionId: z.optional(entityIdSchema),
  createdAtMs: z.number().check(z.int(), z.nonnegative()),
  label: z.optional(z.string()),
  documentHash: z.string().check(z.regex(/^[a-f0-9]{64}$/)),
  document: playDocumentSchema,
});

export const playRevisionSchema = playRevisionStructureSchema.check(
  z.superRefine((revision, payload) => {
    if (revision.playId !== revision.document.id) {
      addCustomIssue(
        payload,
        ["playId"],
        `Revision Play ID does not match its document: ${revision.document.id}`,
      );
    }
    if (revision.parentRevisionId === revision.id) {
      addCustomIssue(
        payload,
        ["parentRevisionId"],
        "A Play revision cannot be its own parent.",
      );
    }
  }),
);

export const playEnvelopeV1Schema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("chalk-play"),
  exportedAtMs: z.number().check(z.int(), z.nonnegative()),
  play: z.union([playDocumentV1Schema, playDocumentV2Schema]),
});

export const playEnvelopeSchema = z.object({
  schemaVersion: z.literal(2),
  kind: z.literal("chalk-play"),
  exportedAtMs: z.number().check(z.int(), z.nonnegative()),
  play: playDocumentSchema,
});

export const publishedPlaySchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: entityIdSchema,
  name: nameSchema,
  unit: playUnitSchema,
  playType: z.optional(playTypeReferenceSchema),
  personnelLabel: z.optional(z.string()),
  fieldProfile: fieldProfileSchema,
  players: z.array(playerSchema),
  paths: z.array(movementPathSchema),
  labels: z.array(textLabelSchema),
});

export const sharePublicationEntrySchema = z.strictObject({
  id: entityIdSchema,
  playRevisionId: entityIdSchema,
  play: publishedPlaySchema,
});

const sharePublicationStructureSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: entityIdSchema,
  title: nameSchema,
  publishedAtMs: z.number().check(z.int(), z.nonnegative()),
  entries: z.array(sharePublicationEntrySchema).check(z.minLength(1)),
  presentation: z.strictObject({
    fieldStyle: z.enum(["lines", "blank"]),
    playback: z.boolean(),
    downloads: z.array(z.enum(["svg", "png", "pdf"])),
  }),
});

export const sharePublicationSchema = sharePublicationStructureSchema.check(
  z.superRefine((publication, payload) => {
    for (const id of duplicateIds(publication.entries)) {
      addCustomIssue(
        payload,
        ["entries"],
        `Duplicate Share Publication entry ID: ${id}`,
      );
    }
  }),
);

const playbookEnvelopeStructureSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("chalk-playbook"),
  exportedAtMs: z.number().check(z.int(), z.nonnegative()),
  playbook: playbookSchema,
  concepts: z.array(conceptSchema),
  formations: z.array(formationSchema),
  plays: z.array(playDocumentSchema),
});

export const playbookEnvelopeSchema = playbookEnvelopeStructureSchema.check(
  z.superRefine((envelope, payload) => {
    const { playbook } = envelope;
    const conceptById = new Map(
      envelope.concepts.map((value) => [value.id, value]),
    );
    const formationById = new Map(
      envelope.formations.map((value) => [value.id, value]),
    );
    const playTypeById = new Map(
      playbook.playTypes.map((value) => [value.id, value]),
    );
    for (const [key, items] of [
      ["concepts", envelope.concepts],
      ["formations", envelope.formations],
      ["plays", envelope.plays],
    ] as const) {
      for (const id of duplicateIds(items)) {
        addCustomIssue(payload, [key], `Duplicate ${key} ID: ${id}`);
      }
    }

    for (const [key, items] of [
      ["concepts", envelope.concepts],
      ["formations", envelope.formations],
      ["plays", envelope.plays],
    ] as const) {
      for (const [index, item] of items.entries()) {
        if (item.playbookId !== playbook.id) {
          addCustomIssue(
            payload,
            [key, index, "playbookId"],
            `${key} entry belongs to another Playbook: ${item.playbookId}`,
          );
        }
      }
    }

    for (const [playIndex, play] of envelope.plays.entries()) {
      if (play.playType) {
        const definition = playTypeById.get(play.playType.id);
        if (!definition) {
          addCustomIssue(
            payload,
            ["plays", playIndex, "playType"],
            `Play references missing Play Type: ${play.playType.id}`,
          );
        } else if (definition.unit !== play.unit) {
          addCustomIssue(
            payload,
            ["plays", playIndex, "playType"],
            `Play Type ${definition.name} belongs to ${definition.unit}, not ${play.unit}.`,
          );
        }
      }
      if (play.conceptSource) {
        const concept = conceptById.get(play.conceptSource.conceptId);
        if (!concept) {
          addCustomIssue(
            payload,
            ["plays", playIndex, "conceptSource"],
            `Play references missing Concept: ${play.conceptSource.conceptId}`,
          );
        } else {
          if (concept.unit !== play.unit) {
            addCustomIssue(
              payload,
              ["plays", playIndex, "conceptSource"],
              `Concept ${concept.name} belongs to ${concept.unit}, not ${play.unit}.`,
            );
          }
          if (play.conceptSource.revision > concept.revision) {
            addCustomIssue(
              payload,
              ["plays", playIndex, "conceptSource", "revision"],
              "Play references a future Concept revision.",
            );
          }
        }
      }
      if (play.formationSource) {
        const formation = formationById.get(play.formationSource.formationId);
        if (!formation) {
          addCustomIssue(
            payload,
            ["plays", playIndex, "formationSource"],
            `Play references missing Formation: ${play.formationSource.formationId}`,
          );
        } else {
          if (formation.unit !== play.unit) {
            addCustomIssue(
              payload,
              ["plays", playIndex, "formationSource"],
              `Formation ${formation.name} belongs to ${formation.unit}, not ${play.unit}.`,
            );
          }
          if (play.formationSource.revision > formation.revision) {
            addCustomIssue(
              payload,
              ["plays", playIndex, "formationSource", "revision"],
              "Play references a future Formation revision.",
            );
          }
          const slotIds = new Set(formation.slots.map(({ id }) => id));
          for (const [
            bindingIndex,
            binding,
          ] of play.formationSource.slotBindings.entries()) {
            if (!slotIds.has(binding.slotId)) {
              addCustomIssue(
                payload,
                [
                  "plays",
                  playIndex,
                  "formationSource",
                  "slotBindings",
                  bindingIndex,
                  "slotId",
                ],
                `Play references missing Formation slot: ${binding.slotId}`,
              );
            }
          }
        }
      }
    }
  }),
);

export type Coordinate = z.infer<typeof coordinateSchema>;
export type Color = z.infer<typeof colorSchema>;
export type PlayUnit = z.infer<typeof playUnitSchema>;
export type LegacyPlayType = z.infer<typeof legacyPlayTypeSchema>;
export type BuiltInPlayTypeKey = z.infer<typeof builtInPlayTypeKeySchema>;
export type PlayTypeDefinition = z.infer<typeof playTypeDefinitionSchema>;
export type PlayTypeReference = z.infer<typeof playTypeReferenceSchema>;
export type PlayerSymbol = z.infer<typeof playerSymbolSchema>;
export type PlayerFill = z.infer<typeof playerFillSchema>;
export type LabelBox = z.infer<typeof labelBoxSchema>;
export type LabelRole = z.infer<typeof labelRoleSchema>;
export type PathPoint = z.infer<typeof pathPointSchema>;
export type PathLine = z.infer<typeof pathLineSchema>;
export type PathEnding = z.infer<typeof pathEndingSchema>;
export type PathStyle = z.infer<typeof pathStyleSchema>;
export type PathBranch = z.infer<typeof pathBranchSchema>;
export type CoverageArea = z.infer<typeof coverageAreaSchema>;
export type Player = z.infer<typeof playerSchema>;
export type MovementPathV2 = z.infer<typeof movementPathV2Schema>;
export type MovementPath = z.infer<typeof movementPathSchema>;
export type TextLabel = z.infer<typeof textLabelSchema>;
export type AssignmentTarget = z.infer<typeof assignmentTargetSchema>;
export type AssignmentAction = z.infer<typeof assignmentActionSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type FieldProfile = z.infer<typeof fieldProfileSchema>;
export type ConceptSource = z.infer<typeof conceptSourceSchema>;
export type FormationSource = z.infer<typeof formationSourceSchema>;
export type PlayDocumentV1 = z.infer<typeof playDocumentV1Schema>;
export type PlayDocumentV2 = z.infer<typeof playDocumentV2Schema>;
export type PlayDocument = z.infer<typeof playDocumentSchema>;
export type FormationSlot = z.infer<typeof formationSlotSchema>;
export type Formation = z.infer<typeof formationSchema>;
export type Concept = z.infer<typeof conceptSchema>;
export type Playbook = z.infer<typeof playbookSchema>;
export type PlayRevision = z.infer<typeof playRevisionSchema>;
export type PlayEnvelopeV1 = z.infer<typeof playEnvelopeV1Schema>;
export type PlayEnvelope = z.infer<typeof playEnvelopeSchema>;
export type PublishedPlay = z.infer<typeof publishedPlaySchema>;
export type SharePublicationEntry = z.infer<typeof sharePublicationEntrySchema>;
export type SharePublication = z.infer<typeof sharePublicationSchema>;
export type PlaybookEnvelope = z.infer<typeof playbookEnvelopeSchema>;
