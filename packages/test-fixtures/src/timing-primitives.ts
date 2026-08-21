import {
  highSchoolFieldProfile,
  playDocumentSchema,
  type PlayDocument,
} from "@chalk/domain";

/**
 * Timing goldens for Phase 0.5. Equal-length vertical and horizontal routes
 * prove finding #6 is closed in the evaluator: duration is a function of
 * grass yards, not of the original's anisotropic canvas units. The delayed
 * jet is the original demo's 0.2s fake-handoff hold, migrated to integer ms.
 */
const fixture = {
  schemaVersion: 3,
  id: "play_timing_primitives",
  playbookId: "playbook_golden_primitives",
  name: "Timing primitive coverage",
  unit: "offense",
  playType: { id: "play_type_pass", name: "Pass" },
  tags: ["golden", "timing"],
  notes:
    "Equal 10-yard vertical and horizontal stems plus a delayed jet motion.",
  fieldProfile: highSchoolFieldProfile,
  players: [
    {
      id: "vertical-player",
      unit: "offense" as const,
      position: { lateralYards: -8, depthYards: 0 },
      symbol: "circle" as const,
      label: "V",
      sublabel: "",
      fill: "none" as const,
      color: "ink" as const,
    },
    {
      id: "horizontal-player",
      unit: "offense" as const,
      position: { lateralYards: 8, depthYards: 0 },
      symbol: "circle" as const,
      label: "H",
      sublabel: "",
      fill: "none" as const,
      color: "ink" as const,
    },
    {
      id: "jet-player",
      unit: "offense" as const,
      position: { lateralYards: -12, depthYards: -4 },
      symbol: "circle" as const,
      label: "J",
      sublabel: "",
      fill: "none" as const,
      color: "ink" as const,
    },
  ],
  assignments: [],
  paths: [
    {
      id: "path-vertical",
      kind: "route" as const,
      playerId: "vertical-player",
      points: [
        { lateralYards: -8, depthYards: 0 },
        { lateralYards: -8, depthYards: 10 },
      ],
      branches: [],
      style: {
        line: "solid" as const,
        ending: "arrow" as const,
        color: "ink" as const,
      },
    },
    {
      id: "path-horizontal",
      kind: "route" as const,
      playerId: "horizontal-player",
      points: [
        { lateralYards: 8, depthYards: 0 },
        { lateralYards: 18, depthYards: 0 },
      ],
      branches: [],
      style: {
        line: "solid" as const,
        ending: "arrow" as const,
        color: "ink" as const,
      },
    },
    {
      id: "path-delayed-jet",
      kind: "motion" as const,
      playerId: "jet-player",
      points: [
        { lateralYards: -12, depthYards: -4 },
        { lateralYards: 6, depthYards: -4 },
      ],
      branches: [],
      style: {
        line: "dashed" as const,
        ending: "none" as const,
        color: "ink" as const,
      },
      timing: { delayMs: 200, holdMs: 400 },
    },
  ],
  labels: [],
} satisfies PlayDocument;

export const timingPrimitivePlay = playDocumentSchema.parse(fixture);
