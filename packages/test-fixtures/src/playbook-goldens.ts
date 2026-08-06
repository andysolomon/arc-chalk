import {
  builtInPlayTypeDefinitions,
  highSchoolFieldProfile,
  playDocumentSchema,
  playbookEnvelopeSchema,
  stickThunderPlay,
  type Assignment,
  type AssignmentAction,
  type Formation,
  type MovementPath,
  type PlayDocument,
  type PlaybookEnvelope,
  type Player,
} from "@chalk/domain";

const FIXED_TIME = 1_786_000_000_000;

const offenseRoles: Record<string, { role: string; group: string }> = {
  ol0: { role: "LT", group: "offensive-line" },
  ol1: { role: "LG", group: "offensive-line" },
  ol2: { role: "C", group: "offensive-line" },
  ol3: { role: "RG", group: "offensive-line" },
  ol4: { role: "RT", group: "offensive-line" },
  q: { role: "QB", group: "quarterback" },
  x: { role: "X", group: "receiver" },
  f: { role: "H", group: "receiver" },
  h: { role: "RB", group: "running-back" },
  y: { role: "TE", group: "tight-end" },
  z: { role: "Z", group: "receiver" },
};

const offensivePlayers = stickThunderPlay.players.map((player) => ({
  ...structuredClone(player),
  ...offenseRoles[player.id],
}));

const offensiveFormation: Formation = {
  schemaVersion: 1,
  id: "formation_gun_doubles_right",
  playbookId: "playbook_2026_offense",
  revision: 2,
  name: "Gun Doubles Right",
  unit: "offense",
  description: "Balanced 11-personnel gun set with the Y attached right.",
  family: "gun-doubles",
  personnelLabel: "11",
  strength: "right",
  mirrorFormationId: "formation_gun_doubles_left",
  ball: {
    position: { lateralYards: 0, depthYards: 0 },
    hash: "middle",
  },
  slots: offensivePlayers.map((player) => ({
    id: `slot_${player.id}`,
    unit: player.unit,
    role: player.role!,
    position: structuredClone(player.position),
    symbol: player.symbol,
    label: player.label,
    sublabel: "",
    fill: player.fill,
    color: player.color,
    group: player.group,
  })),
  rolePairs: [
    { leftSlotId: "slot_ol0", rightSlotId: "slot_ol4" },
    { leftSlotId: "slot_ol1", rightSlotId: "slot_ol3" },
    { leftSlotId: "slot_x", rightSlotId: "slot_z" },
  ],
};

const offensiveAssignmentText: Record<string, string> = {
  rx: "Push to three yards and win to the flat.",
  rf: "Settle at five yards versus zone; break away versus man.",
  ry: "Release inside and run the over behind the linebackers.",
  rh: "Check protection, then work slowly to the outlet.",
  rz: "Take the top off; convert to the thunder stop versus cushion.",
};

const offensiveAssignments: Assignment[] = stickThunderPlay.paths.map(
  (path) => ({
    id: `assignment_${path.playerId}`,
    playerId: path.playerId,
    text: offensiveAssignmentText[path.id]!,
    actions: [
      {
        id: `action_${path.id}`,
        kind: "movement",
        pathId: path.id,
      },
    ],
  }),
);

export const offensiveStickThunderPlay: PlayDocument = playDocumentSchema.parse(
  {
    ...structuredClone(stickThunderPlay),
    schemaVersion: 3,
    playbookId: "playbook_2026_offense",
    playType: { id: "play_type_pass", name: "Pass" },
    personnelLabel: "11",
    conceptSource: { conceptId: "concept_stick", revision: 3 },
    formationSource: {
      formationId: offensiveFormation.id,
      revision: 1,
      slotBindings: offensivePlayers.map((player) => ({
        slotId: `slot_${player.id}`,
        playerId: player.id,
      })),
    },
    players: offensivePlayers,
    assignments: offensiveAssignments,
  },
);

export const offensivePlaybookGolden: PlaybookEnvelope =
  playbookEnvelopeSchema.parse({
    schemaVersion: 1,
    kind: "chalk-playbook",
    exportedAtMs: FIXED_TIME,
    playbook: {
      schemaVersion: 1,
      id: "playbook_2026_offense",
      name: "2026 Varsity Offense",
      defaultFieldProfileId: highSchoolFieldProfile.id,
      fieldProfiles: [highSchoolFieldProfile],
      playTypes: [
        ...builtInPlayTypeDefinitions,
        {
          id: "play_type_boot",
          name: "Boot",
          unit: "offense",
          order: 9,
          archived: false,
        },
      ],
      createdAtMs: FIXED_TIME - 86_400_000,
      updatedAtMs: FIXED_TIME,
    },
    concepts: [
      {
        schemaVersion: 1,
        id: "concept_stick",
        playbookId: "playbook_2026_offense",
        revision: 3,
        name: "Stick",
        unit: "offense",
        notes: "Create a triangle on the apex defender.",
        tags: ["third-down", "quick-game"],
      },
    ],
    formations: [offensiveFormation],
    plays: [offensiveStickThunderPlay],
  });

const defensivePlayer = (
  id: string,
  role: string,
  group: string,
  lateralYards: number,
  depthYards: number,
  symbol: Player["symbol"] = "none",
): Player => ({
  id,
  unit: "defense",
  position: { lateralYards, depthYards },
  symbol,
  label: role,
  sublabel: "",
  fill: "none",
  color: "ink",
  role,
  group,
});

const defensivePlayers: Player[] = [
  defensivePlayer("def_e_l", "E-L", "defensive-line", -8, 1, "circle"),
  defensivePlayer("def_t_l", "T-L", "defensive-line", -3, 1, "circle"),
  defensivePlayer("def_t_r", "T-R", "defensive-line", 3, 1, "circle"),
  defensivePlayer("def_e_r", "E-R", "defensive-line", 8, 1, "circle"),
  defensivePlayer("def_w", "W", "linebacker", -6, 5, "oval"),
  defensivePlayer("def_m", "M", "linebacker", 2, 5, "oval"),
  defensivePlayer("def_c_l", "C-L", "corner", -22, 7),
  defensivePlayer("def_n", "N", "nickel", -12, 6),
  defensivePlayer("def_s", "S", "safety", 8, 9),
  defensivePlayer("def_c_r", "C-R", "corner", 22, 7),
  defensivePlayer("def_f", "F", "safety", 0, 14),
];

const defensivePath = (
  id: string,
  playerId: string,
  kind: MovementPath["kind"],
  endpoint: { lateralYards: number; depthYards: number },
): MovementPath => {
  const start = defensivePlayers.find(
    (player) => player.id === playerId,
  )!.position;
  return {
    id,
    kind,
    playerId,
    points: [structuredClone(start), endpoint],
    branches: [],
    style: {
      line: kind === "blitz" ? "solid" : "dashed",
      ending: kind === "blitz" ? "arrow" : "bubble",
      color: kind === "blitz" ? "red" : "blue",
    },
    ...(kind === "zone"
      ? {
          coverageArea: {
            type: endpoint.depthYards >= 14 ? "deep" : "curl",
            radiusLateralYards: endpoint.depthYards >= 14 ? 7 : 4,
            radiusDepthYards: endpoint.depthYards >= 14 ? 5 : 3,
          },
        }
      : {}),
  };
};

const defensivePaths: MovementPath[] = [
  defensivePath("path_c_l_third", "def_c_l", "zone", {
    lateralYards: -18,
    depthYards: 16,
  }),
  defensivePath("path_c_r_third", "def_c_r", "zone", {
    lateralYards: 18,
    depthYards: 16,
  }),
  defensivePath("path_f_middle", "def_f", "zone", {
    lateralYards: 0,
    depthYards: 20,
  }),
  defensivePath("path_n_pressure", "def_n", "blitz", {
    lateralYards: -2,
    depthYards: -3,
  }),
  defensivePath("path_m_hook", "def_m", "zone", {
    lateralYards: 2,
    depthYards: 10,
  }),
];

const defensiveFormation: Formation = {
  schemaVersion: 1,
  id: "formation_425_over",
  playbookId: "playbook_2026_defense",
  revision: 4,
  name: "4-2-5 Over",
  unit: "defense",
  description: "Over front with the nickel aligned to passing strength.",
  family: "425",
  personnelLabel: "Nickel",
  strength: "right",
  ball: {
    position: { lateralYards: 0, depthYards: 0 },
    hash: "middle",
  },
  slots: defensivePlayers.map((player) => ({
    id: `slot_${player.id}`,
    unit: player.unit,
    role: player.role!,
    position: structuredClone(player.position),
    symbol: player.symbol,
    label: player.label,
    sublabel: player.sublabel,
    fill: player.fill,
    color: player.color,
    group: player.group,
  })),
  rolePairs: [
    { leftSlotId: "slot_def_e_l", rightSlotId: "slot_def_e_r" },
    { leftSlotId: "slot_def_t_l", rightSlotId: "slot_def_t_r" },
    { leftSlotId: "slot_def_c_l", rightSlotId: "slot_def_c_r" },
  ],
};

const pathByPlayer = new Map(
  defensivePaths.map((path) => [path.playerId, path]),
);
const defensiveAssignments: Assignment[] = defensivePlayers.map((player) => {
  const path = pathByPlayer.get(player.id);
  const pressure = player.id === "def_n";
  const actions: AssignmentAction[] = path
    ? pressure
      ? [
          {
            id: `action_${player.id}`,
            kind: "pressure",
            target: { kind: "landmark", landmark: "ball" },
          },
        ]
      : [
          {
            id: `action_${player.id}`,
            kind: "movement",
            pathId: path.id,
          },
        ]
    : [];
  return {
    id: `assignment_${player.id}`,
    playerId: player.id,
    text: pressure
      ? "Show apex, pressure the near hip of the quarterback."
      : path
        ? "Own the called zone and overlap throws from inside out."
        : "Read the near key and squeeze the fit.",
    actions,
  };
});

export const defensiveCoverThreePlay: PlayDocument = playDocumentSchema.parse({
  schemaVersion: 3,
  id: "play_cover_three_nickel_fire",
  playbookId: "playbook_2026_defense",
  name: "Cover 3 — Nickel Fire",
  unit: "defense",
  playType: { id: "play_type_sim_pressure", name: "Sim Pressure" },
  personnelLabel: "Nickel",
  tags: ["third-down", "field-zone"],
  notes: "Spin late and keep the pressure presentation symmetrical.",
  conceptSource: { conceptId: "concept_cover_three", revision: 2 },
  formationSource: {
    formationId: defensiveFormation.id,
    revision: 4,
    slotBindings: defensivePlayers.map((player) => ({
      slotId: `slot_${player.id}`,
      playerId: player.id,
    })),
  },
  fieldProfile: highSchoolFieldProfile,
  players: defensivePlayers,
  assignments: defensiveAssignments,
  paths: defensivePaths,
  labels: [],
});

export const defensivePlaybookGolden: PlaybookEnvelope =
  playbookEnvelopeSchema.parse({
    schemaVersion: 1,
    kind: "chalk-playbook",
    exportedAtMs: FIXED_TIME,
    playbook: {
      schemaVersion: 1,
      id: "playbook_2026_defense",
      name: "2026 Varsity Defense",
      defaultFieldProfileId: highSchoolFieldProfile.id,
      fieldProfiles: [highSchoolFieldProfile],
      playTypes: [
        ...builtInPlayTypeDefinitions,
        {
          id: "play_type_sim_pressure",
          name: "Sim Pressure",
          unit: "defense",
          order: 9,
          archived: false,
        },
      ],
      createdAtMs: FIXED_TIME - 86_400_000,
      updatedAtMs: FIXED_TIME,
    },
    concepts: [
      {
        schemaVersion: 1,
        id: "concept_cover_three",
        playbookId: "playbook_2026_defense",
        revision: 2,
        name: "Cover 3",
        unit: "defense",
        notes: "Three deep with pattern-match rules underneath.",
        tags: ["single-high", "zone"],
      },
    ],
    formations: [defensiveFormation],
    plays: [defensiveCoverThreePlay],
  });
