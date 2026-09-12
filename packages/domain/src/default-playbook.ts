import { builtInPlayTypeDefinitions } from "./classifications";
import { highSchoolFieldProfile } from "./field-profile";
import type { Playbook, PlaybookEnvelope } from "./schema";

/** The Playbook shell a fresh device uses until the Coach saves work. */
export const DEFAULT_PLAYBOOK_ID = "playbook_default";

/**
 * An empty Playbook: field profile and play types only. No Plays, Concepts,
 * or example content — the Coach starts from a blank canvas.
 */
export function blankPlaybook(
  playbookId = DEFAULT_PLAYBOOK_ID,
  nowMs = 0,
): Playbook {
  return {
    schemaVersion: 1,
    id: playbookId,
    name: "Playbook",
    defaultFieldProfileId: highSchoolFieldProfile.id,
    fieldProfiles: [structuredClone(highSchoolFieldProfile)],
    playTypes: [...builtInPlayTypeDefinitions],
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

export function blankPlaybookEnvelope(
  playbookId = DEFAULT_PLAYBOOK_ID,
  nowMs = 0,
): PlaybookEnvelope {
  return {
    schemaVersion: 1,
    kind: "chalk-playbook",
    exportedAtMs: nowMs,
    playbook: blankPlaybook(playbookId, nowMs),
    concepts: [],
    formations: [],
    plays: [],
  };
}
