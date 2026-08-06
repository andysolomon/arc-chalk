import {
  highSchoolFieldProfile,
  playDocumentSchema,
  type PlayDocument,
} from "@chalk/domain";

const fixture = {
  schemaVersion: 3,
  id: "play_path_primitives",
  playbookId: "playbook_golden_primitives",
  name: "Path primitive coverage",
  unit: "offense",
  playType: { id: "play_type_pass", name: "Pass" },
  tags: ["golden"],
  notes: "Exercises every beta path kind, line style, and ending.",
  fieldProfile: highSchoolFieldProfile,
  players: [
    ["route-player", "offense", -18, 0],
    ["motion-player", "offense", -10, -3],
    ["block-player", "offense", -2, 0],
    ["zone-player", "defense", 6, 6],
    ["blitz-player", "defense", 12, 5],
    ["stunt-player", "defense", 18, 2],
    ["ball-player", "offense", 0, -4],
  ].map(([id, unit, lateralYards, depthYards]) => ({
    id: id as string,
    unit: unit as "offense" | "defense",
    position: {
      lateralYards: lateralYards as number,
      depthYards: depthYards as number,
    },
    symbol: "circle" as const,
    label: "",
    sublabel: "",
    fill: "none" as const,
    color: "ink" as const,
  })),
  assignments: [],
  paths: [
    {
      id: "path-route",
      kind: "route",
      playerId: "route-player",
      points: [
        { lateralYards: -18, depthYards: 0 },
        {
          lateralYards: -16,
          depthYards: 8,
          control: { lateralYards: -12, depthYards: 3 },
          segmentStyle: { ending: "diamond" },
        },
        {
          lateralYards: -8,
          depthYards: 12,
          segmentStyle: { line: "dotted" },
        },
      ],
      branches: [
        {
          fromIndex: 1,
          points: [{ lateralYards: -20, depthYards: 15 }],
          style: { line: "dashed", ending: "square", color: "ink" },
        },
      ],
      style: { line: "solid", ending: "hook", color: "ink" },
    },
    {
      id: "path-motion",
      kind: "motion",
      variant: "alternate",
      playerId: "motion-player",
      points: [
        { lateralYards: -10, depthYards: -3 },
        { lateralYards: 2, depthYards: -3 },
      ],
      branches: [],
      style: { line: "zigzag", ending: "arrow", color: "ink" },
    },
    {
      id: "path-block",
      kind: "block",
      playerId: "block-player",
      points: [
        { lateralYards: -2, depthYards: 0 },
        { lateralYards: 1, depthYards: 3, tick: true },
      ],
      branches: [],
      style: { line: "solid", ending: "bar", color: "green" },
    },
    {
      id: "path-zone",
      kind: "zone",
      playerId: "zone-player",
      points: [
        { lateralYards: 6, depthYards: 6 },
        { lateralYards: 3, depthYards: 13 },
      ],
      branches: [],
      style: { line: "dashed", ending: "bubble", color: "blue" },
      coverageArea: {
        type: "curl",
        radiusLateralYards: 5.25,
        radiusDepthYards: 2.5,
      },
    },
    {
      id: "path-blitz",
      kind: "blitz",
      playerId: "blitz-player",
      points: [
        { lateralYards: 12, depthYards: 5 },
        { lateralYards: 8, depthYards: -1 },
      ],
      branches: [],
      style: { line: "solid", ending: "arrow", color: "red" },
    },
    {
      id: "path-stunt",
      kind: "stunt",
      playerId: "stunt-player",
      points: [
        { lateralYards: 18, depthYards: 2 },
        { lateralYards: 14, depthYards: -1 },
        { lateralYards: 10, depthYards: -3 },
      ],
      branches: [],
      style: { line: "solid", ending: "chevron", color: "orange" },
    },
    {
      id: "path-ball",
      kind: "ball",
      playerId: "ball-player",
      points: [
        { lateralYards: 0, depthYards: -4 },
        { lateralYards: 8, depthYards: 10 },
      ],
      branches: [],
      style: { line: "dotted", ending: "dot", color: "gray" },
    },
  ],
  labels: [],
} satisfies PlayDocument;

export const footballPathPrimitivePlay = playDocumentSchema.parse(fixture);
