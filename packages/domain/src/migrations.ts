import { legacyPlayTypeReference } from "./classifications";
import { migrateLegacyFieldProfile } from "./field-profile";
import {
  movementPathSchema,
  playDocumentSchema,
  playDocumentV1Schema,
  playDocumentV2Schema,
  playEnvelopeSchema,
  playEnvelopeV1Schema,
  type Assignment,
  type MovementPath,
  type PlayDocument,
  type PlayDocumentV1,
  type PlayDocumentV2,
  type PlayEnvelope,
} from "./schema";

export const LEGACY_IMPORT_PLAYBOOK_ID = "playbook_legacy_imports";

export function migratePlayDocumentV1ToV2(
  legacy: PlayDocumentV1,
): PlayDocumentV2 {
  return playDocumentV2Schema.parse({
    ...legacy,
    schemaVersion: 2,
    fieldProfile: migrateLegacyFieldProfile(legacy.fieldProfile),
  });
}

function migratePathAssignment(
  path: PlayDocumentV2["paths"][number],
): Assignment | undefined {
  const text = path.assignment?.trim();
  if (!text) return undefined;
  return {
    id: `assignment_${path.id}`,
    playerId: path.playerId,
    text,
    actions: [
      {
        id: `assignment_action_${path.id}`,
        kind: "movement",
        pathId: path.id,
      },
    ],
  };
}

function currentPath(path: PlayDocumentV2["paths"][number]): MovementPath {
  const current: Partial<PlayDocumentV2["paths"][number]> = { ...path };
  delete current.assignment;
  return movementPathSchema.parse(current);
}

export function migratePlayDocumentV2ToV3(
  legacy: PlayDocumentV2,
): PlayDocument {
  return playDocumentSchema.parse({
    schemaVersion: 3,
    id: legacy.id,
    playbookId: LEGACY_IMPORT_PLAYBOOK_ID,
    name: legacy.name,
    unit: legacy.unit,
    playType: legacyPlayTypeReference(legacy.playType),
    tags: legacy.tags,
    notes: legacy.notes,
    fieldProfile: legacy.fieldProfile,
    players: legacy.players,
    assignments: legacy.paths.flatMap((path) => {
      const assignment = migratePathAssignment(path);
      return assignment ? [assignment] : [];
    }),
    paths: legacy.paths.map(currentPath),
    labels: legacy.labels,
  });
}

export function migratePlayDocument(input: unknown): PlayDocument {
  const current = playDocumentSchema.safeParse(input);
  if (current.success) return current.data;

  const versionTwo = playDocumentV2Schema.safeParse(input);
  if (versionTwo.success) return migratePlayDocumentV2ToV3(versionTwo.data);

  const versionOne = playDocumentV1Schema.parse(input);
  return migratePlayDocumentV2ToV3(migratePlayDocumentV1ToV2(versionOne));
}

/**
 * Upgrades a Play read out of the device database. A stored Play already
 * belongs to one of the Coach's Playbooks, so it keeps that Playbook rather
 * than moving to the legacy-import bucket a standalone file lands in.
 */
export function migrateStoredPlayDocument(
  input: unknown,
  playbookId: string,
): PlayDocument {
  const current = playDocumentSchema.safeParse(input);
  if (current.success) return current.data;
  return playDocumentSchema.parse({
    ...migratePlayDocument(input),
    playbookId,
  });
}

export function migratePlayEnvelope(input: unknown): PlayEnvelope {
  const current = playEnvelopeSchema.safeParse(input);
  if (current.success) return current.data;

  const legacy = playEnvelopeV1Schema.parse(input);
  return playEnvelopeSchema.parse({
    schemaVersion: 2,
    kind: "chalk-play",
    exportedAtMs: legacy.exportedAtMs,
    play: migratePlayDocument(legacy.play),
  });
}
