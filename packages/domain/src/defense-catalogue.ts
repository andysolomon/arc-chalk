import { STOCK_PLAYBOOK_ID } from "./formation-catalogue";
import { legacyCanvasToYards } from "./geometry";
import type { Coordinate, Formation } from "./schema";

/**
 * A defense is a front and a coverage — that is how it is called, and how it
 * is found. Unlike a formation, a call draws itself: each defender's zone
 * drop, man assignment or blitz path is part of the call rather than
 * something the Coach adds afterwards.
 *
 * As with the sets, everything here is written in the canvas pixels the
 * original drew it in, so each number can be read straight off the frozen
 * specification and converted once on the axis it belongs to.
 */

export type DefensiveAssignmentKind = "drop" | "man" | "blitz";

export interface DefensiveAssignment {
  readonly kind: DefensiveAssignmentKind;
  /** The defender running it, named by his slot rather than by his place in a list. */
  readonly slotId: string;
  /** Beginning at his stance, so the line starts on the man. */
  readonly points: readonly Coordinate[];
}

export interface DefensiveCall {
  readonly formation: Formation;
  readonly front: string;
  readonly coverage: string;
  readonly assignments: readonly DefensiveAssignment[];
}

interface LegacyDefender {
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

/** `[defender index, [[x, y], …]]`, which is how the original stores its art. */
type LegacyLine = readonly [number, readonly (readonly [number, number])[]];

interface LegacyDefense {
  readonly key: string;
  readonly name: string;
  readonly front: string;
  readonly coverage: string;
  readonly description: string;
  readonly players: readonly LegacyDefender[];
  readonly drops?: readonly LegacyLine[];
  readonly mans?: readonly LegacyLine[];
  readonly blitzes?: readonly LegacyLine[];
}

const at = (x: number, y: number, label: string): LegacyDefender => ({
  x,
  y,
  label,
});

const legacyDefenses: readonly LegacyDefense[] = [
  {
    key: "43-c3",
    name: "4-3 Cover 3",
    front: "4-3",
    coverage: "Cover 3",
    description: "3 deep",
    players: [
      at(392, 404, "E"),
      at(452, 404, "T"),
      at(548, 404, "T"),
      at(608, 404, "E"),
      at(414, 344, "W"),
      at(500, 338, "M"),
      at(586, 344, "S"),
      at(140, 372, "C"),
      at(860, 372, "C"),
      at(500, 196, "F"),
      at(704, 302, "$"),
    ],
    drops: [
      [
        7,
        [
          [140, 372],
          [152, 236],
        ],
      ],
      [
        8,
        [
          [860, 372],
          [848, 236],
        ],
      ],
      [
        9,
        [
          [500, 196],
          [500, 160],
        ],
      ],
      [
        4,
        [
          [414, 344],
          [354, 300],
        ],
      ],
      [
        5,
        [
          [500, 338],
          [542, 294],
        ],
      ],
      [
        6,
        [
          [586, 344],
          [638, 300],
        ],
      ],
      [
        10,
        [
          [704, 302],
          [762, 260],
        ],
      ],
    ],
  },
  {
    key: "nickel-c2",
    name: "Nickel Cover 2",
    front: "Nickel",
    coverage: "Cover 2",
    description: "2 deep",
    players: [
      at(392, 404, "E"),
      at(452, 404, "T"),
      at(548, 404, "T"),
      at(608, 404, "E"),
      at(452, 344, "W"),
      at(560, 344, "M"),
      at(752, 366, "N"),
      at(140, 392, "C"),
      at(860, 392, "C"),
      at(300, 206, "F"),
      at(700, 206, "S"),
    ],
    drops: [
      [
        7,
        [
          [140, 392],
          [188, 332],
        ],
      ],
      [
        8,
        [
          [860, 392],
          [812, 332],
        ],
      ],
      [
        9,
        [
          [300, 206],
          [258, 182],
        ],
      ],
      [
        10,
        [
          [700, 206],
          [742, 182],
        ],
      ],
      [
        4,
        [
          [452, 344],
          [428, 292],
        ],
      ],
      [
        5,
        [
          [560, 344],
          [588, 292],
        ],
      ],
      [
        6,
        [
          [752, 366],
          [792, 318],
        ],
      ],
    ],
  },
  {
    key: "fire-zone",
    name: "Fire Zone Blitz",
    front: "Nickel",
    coverage: "Fire zone",
    description: "5 rush",
    players: [
      at(392, 404, "E"),
      at(452, 404, "T"),
      at(548, 404, "T"),
      at(608, 404, "E"),
      at(432, 350, "W"),
      at(568, 350, "M"),
      at(140, 372, "C"),
      at(860, 372, "C"),
      at(500, 190, "F"),
      at(700, 316, "$"),
    ],
    blitzes: [
      [
        5,
        [
          [568, 350],
          [556, 412],
          [538, 442],
        ],
      ],
      [
        9,
        [
          [700, 316],
          [654, 390],
          [626, 436],
        ],
      ],
    ],
    drops: [
      [
        6,
        [
          [140, 372],
          [152, 244],
        ],
      ],
      [
        7,
        [
          [860, 372],
          [848, 244],
        ],
      ],
      [
        8,
        [
          [500, 190],
          [500, 156],
        ],
      ],
      [
        4,
        [
          [432, 350],
          [380, 306],
        ],
      ],
    ],
  },
  {
    key: "43-c2",
    name: "4-3 Cover 2",
    front: "4-3",
    coverage: "Cover 2",
    description: "2 deep",
    players: [
      at(392, 404, "E"),
      at(452, 404, "T"),
      at(548, 404, "T"),
      at(608, 404, "E"),
      at(414, 344, "W"),
      at(500, 338, "M"),
      at(586, 344, "S"),
      at(140, 392, "C"),
      at(860, 392, "C"),
      at(300, 214, "F"),
      at(700, 214, "S"),
    ],
    drops: [
      [
        7,
        [
          [140, 392],
          [196, 338],
        ],
      ],
      [
        8,
        [
          [860, 392],
          [804, 338],
        ],
      ],
      [
        9,
        [
          [300, 214],
          [266, 176],
        ],
      ],
      [
        10,
        [
          [700, 214],
          [734, 176],
        ],
      ],
      [
        4,
        [
          [414, 344],
          [364, 300],
        ],
      ],
      [
        5,
        [
          [500, 338],
          [500, 288],
        ],
      ],
      [
        6,
        [
          [586, 344],
          [636, 300],
        ],
      ],
    ],
  },
  {
    key: "43-tampa2",
    name: "4-3 Tampa 2",
    front: "4-3",
    coverage: "Tampa 2",
    description: "M runs",
    players: [
      at(392, 404, "E"),
      at(452, 404, "T"),
      at(548, 404, "T"),
      at(608, 404, "E"),
      at(414, 344, "W"),
      at(500, 338, "M"),
      at(586, 344, "S"),
      at(140, 392, "C"),
      at(860, 392, "C"),
      at(300, 214, "F"),
      at(700, 214, "S"),
    ],
    drops: [
      [
        7,
        [
          [140, 392],
          [196, 338],
        ],
      ],
      [
        8,
        [
          [860, 392],
          [804, 338],
        ],
      ],
      [
        9,
        [
          [300, 214],
          [266, 176],
        ],
      ],
      [
        10,
        [
          [700, 214],
          [734, 176],
        ],
      ],
      [
        5,
        [
          [500, 338],
          [500, 218],
        ],
      ],
      [
        4,
        [
          [414, 344],
          [364, 300],
        ],
      ],
      [
        6,
        [
          [586, 344],
          [636, 300],
        ],
      ],
    ],
  },
  {
    key: "43-c4",
    name: "4-3 Quarters",
    front: "4-3",
    coverage: "Cover 4",
    description: "4 deep",
    players: [
      at(392, 404, "E"),
      at(452, 404, "T"),
      at(548, 404, "T"),
      at(608, 404, "E"),
      at(414, 344, "W"),
      at(500, 338, "M"),
      at(586, 344, "S"),
      at(140, 376, "C"),
      at(860, 376, "C"),
      at(372, 236, "F"),
      at(628, 236, "S"),
    ],
    drops: [
      [
        7,
        [
          [140, 376],
          [150, 238],
        ],
      ],
      [
        8,
        [
          [860, 376],
          [850, 238],
        ],
      ],
      [
        9,
        [
          [372, 236],
          [350, 182],
        ],
      ],
      [
        10,
        [
          [628, 236],
          [650, 182],
        ],
      ],
      [
        4,
        [
          [414, 344],
          [368, 306],
        ],
      ],
      [
        5,
        [
          [500, 338],
          [500, 296],
        ],
      ],
      [
        6,
        [
          [586, 344],
          [632, 306],
        ],
      ],
    ],
  },
  {
    key: "nickel-c1",
    name: "Nickel Cover 1",
    front: "Nickel",
    coverage: "Cover 1",
    description: "man free",
    players: [
      at(392, 404, "E"),
      at(452, 404, "T"),
      at(548, 404, "T"),
      at(608, 404, "E"),
      at(452, 344, "W"),
      at(560, 344, "M"),
      at(752, 362, "N"),
      at(140, 380, "C"),
      at(860, 380, "C"),
      at(500, 196, "F"),
      at(668, 318, "$"),
    ],
    drops: [
      [
        9,
        [
          [500, 196],
          [500, 152],
        ],
      ],
    ],
    mans: [
      [
        7,
        [
          [140, 380],
          [152, 296],
        ],
      ],
      [
        8,
        [
          [860, 380],
          [848, 296],
        ],
      ],
      [
        6,
        [
          [752, 362],
          [770, 296],
        ],
      ],
      [
        10,
        [
          [668, 318],
          [682, 258],
        ],
      ],
      [
        4,
        [
          [452, 344],
          [438, 298],
        ],
      ],
      [
        5,
        [
          [560, 344],
          [574, 298],
        ],
      ],
    ],
  },
  {
    key: "nickel-c6",
    name: "Nickel Cover 6",
    front: "Nickel",
    coverage: "Cover 6",
    description: "quarter-half",
    players: [
      at(392, 404, "E"),
      at(452, 404, "T"),
      at(548, 404, "T"),
      at(608, 404, "E"),
      at(452, 344, "W"),
      at(560, 344, "M"),
      at(752, 362, "N"),
      at(140, 392, "C"),
      at(860, 376, "C"),
      at(320, 216, "F"),
      at(636, 238, "S"),
    ],
    drops: [
      [
        7,
        [
          [140, 392],
          [194, 340],
        ],
      ],
      [
        9,
        [
          [320, 216],
          [280, 178],
        ],
      ],
      [
        8,
        [
          [860, 376],
          [850, 240],
        ],
      ],
      [
        10,
        [
          [636, 238],
          [658, 184],
        ],
      ],
      [
        4,
        [
          [452, 344],
          [420, 300],
        ],
      ],
      [
        5,
        [
          [560, 344],
          [588, 300],
        ],
      ],
      [
        6,
        [
          [752, 362],
          [790, 318],
        ],
      ],
    ],
  },
  {
    key: "dime-c3",
    name: "Dime Cover 3",
    front: "Dime",
    coverage: "Cover 3",
    description: "6 DB",
    players: [
      at(392, 404, "E"),
      at(452, 404, "T"),
      at(548, 404, "T"),
      at(608, 404, "E"),
      at(500, 340, "M"),
      at(300, 356, "D"),
      at(700, 356, "N"),
      at(140, 372, "C"),
      at(860, 372, "C"),
      at(500, 196, "F"),
      at(780, 296, "$"),
    ],
    drops: [
      [
        7,
        [
          [140, 372],
          [152, 240],
        ],
      ],
      [
        8,
        [
          [860, 372],
          [848, 240],
        ],
      ],
      [
        9,
        [
          [500, 196],
          [500, 158],
        ],
      ],
      [
        4,
        [
          [500, 340],
          [500, 292],
        ],
      ],
      [
        5,
        [
          [300, 356],
          [262, 314],
        ],
      ],
      [
        6,
        [
          [700, 356],
          [738, 314],
        ],
      ],
      [
        10,
        [
          [780, 296],
          [818, 258],
        ],
      ],
    ],
  },
  {
    key: "34-c3",
    name: "3-4 Cover 3",
    front: "3-4",
    coverage: "Cover 3",
    description: "3 deep",
    players: [
      at(440, 404, "E"),
      at(500, 404, "N"),
      at(560, 404, "E"),
      at(380, 368, "B"),
      at(620, 368, "B"),
      at(452, 336, "W"),
      at(548, 336, "M"),
      at(140, 372, "C"),
      at(860, 372, "C"),
      at(500, 196, "F"),
      at(700, 300, "$"),
    ],
    blitzes: [
      [
        4,
        [
          [620, 368],
          [604, 408],
          [590, 440],
        ],
      ],
    ],
    drops: [
      [
        7,
        [
          [140, 372],
          [152, 240],
        ],
      ],
      [
        8,
        [
          [860, 372],
          [848, 240],
        ],
      ],
      [
        9,
        [
          [500, 196],
          [500, 158],
        ],
      ],
      [
        5,
        [
          [452, 336],
          [410, 296],
        ],
      ],
      [
        6,
        [
          [548, 336],
          [590, 296],
        ],
      ],
      [
        3,
        [
          [380, 368],
          [344, 326],
        ],
      ],
      [
        10,
        [
          [700, 300],
          [742, 262],
        ],
      ],
    ],
  },
  {
    key: "bear-c0",
    name: "Bear Front Cover 0",
    front: "Bear",
    coverage: "Cover 0",
    description: "all out",
    players: [
      at(392, 404, "E"),
      at(452, 404, "T"),
      at(500, 404, "N"),
      at(548, 404, "T"),
      at(608, 404, "E"),
      at(430, 346, "W"),
      at(570, 346, "M"),
      at(140, 384, "C"),
      at(860, 384, "C"),
      at(740, 356, "N"),
      at(300, 356, "$"),
    ],
    blitzes: [
      [
        5,
        [
          [430, 346],
          [452, 406],
          [466, 438],
        ],
      ],
      [
        6,
        [
          [570, 346],
          [552, 406],
          [540, 438],
        ],
      ],
    ],
    mans: [
      [
        7,
        [
          [140, 384],
          [152, 300],
        ],
      ],
      [
        8,
        [
          [860, 384],
          [848, 300],
        ],
      ],
      [
        9,
        [
          [740, 356],
          [758, 296],
        ],
      ],
      [
        10,
        [
          [300, 356],
          [284, 296],
        ],
      ],
    ],
  },
];

const callId = (key: string) => `defense_${key.replaceAll("-", "_")}`;
const slotId = (key: string, index: number) => `${callId(key)}_s${index}`;

/**
 * A defender is drawn as his letter and nothing else — no shape around it —
 * which is what the original's "none" symbol means and what tells a Coach at
 * a glance which side of the ball he is looking at.
 */
function build(defense: LegacyDefense): DefensiveCall {
  const id = callId(defense.key);
  const formation: Formation = {
    schemaVersion: 1,
    id,
    playbookId: STOCK_PLAYBOOK_ID,
    revision: 1,
    name: defense.name,
    unit: "defense",
    description: defense.description,
    family: defense.front,
    strength: "balanced",
    ball: { position: { lateralYards: 0, depthYards: 0 }, hash: "middle" },
    slots: defense.players.map((player, index) => ({
      id: slotId(defense.key, index),
      unit: "defense" as const,
      // A defender plays a letter, and the same letter twice — two corners,
      // two ends — so his side is what tells the two of them apart.
      role: `${player.label}${player.x < 500 ? "-L" : player.x > 500 ? "-R" : ""}`,
      position: legacyCanvasToYards(player),
      symbol: "none" as const,
      label: player.label,
      sublabel: "",
      fill: "none" as const,
      color: "ink" as const,
    })),
    rolePairs: [],
  };

  const lines = (
    kind: DefensiveAssignmentKind,
    list: readonly LegacyLine[] = [],
  ): DefensiveAssignment[] =>
    list.map(([index, points]) => ({
      kind,
      slotId: slotId(defense.key, index),
      points: points.map(([x, y]) => legacyCanvasToYards({ x, y })),
    }));

  return {
    formation,
    front: defense.front,
    coverage: defense.coverage,
    assignments: [
      ...lines("drop", defense.drops),
      ...lines("man", defense.mans),
      ...lines("blitz", defense.blitzes),
    ],
  };
}

export const stockDefensiveCalls: readonly DefensiveCall[] = Object.freeze(
  legacyDefenses.map(build),
);

/** The order a call sheet lists fronts in, lightest box last. */
export const defensiveFronts: readonly string[] = Object.freeze([
  "4-3",
  "3-4",
  "Bear",
  "Nickel",
  "Dime",
]);
