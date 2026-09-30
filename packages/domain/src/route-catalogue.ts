import {
  containPoints,
  curlFlatLandmark,
  DEFAULT_DEFENSIVE_FIELD,
  defensiveFieldOf,
  gapBlitzPoints,
  hookLandmark,
  isOnDefensiveFront,
  robberLandmark,
  rushPoints,
  slantPoints,
  spillPoints,
  spyLandmark,
  squeezePoints,
  twistPoints,
  type DefensiveField,
} from "./defensive-field";
import { legacyDepthSpanToYards, legacyLateralSpanToYards } from "./geometry";
import type { Coordinate, PathPoint, PlayDocument, Player } from "./schema";

/**
 * The route tree, and the block and defensive calls drawn the same way. The
 * concepts built from it live in `concepts.ts`.
 *
 * A preset is a shape measured from the man's own spot rather than a place on
 * the field, so the same call lands correctly on a variation that lines him
 * up somewhere else. Its across-the-field numbers are signed by which way is
 * *outward* for the man running it — toward his own sideline — so one entry
 * covers a receiver on either side of the ball.
 *
 * All of it is written in the canvas pixels the original drew it in, and
 * converted once on the axis each number belongs to.
 */

/** Which way is out for a man, and which way is in. */
export type Handedness = { readonly outward: 1 | -1 };

export function handednessOf(stance: Coordinate): Handedness {
  return { outward: stance.lateralYards < 0 ? -1 : 1 };
}

/**
 * `[outward, inward, depth]` in canvas pixels, relative to the man. Depth is
 * written the way the original's canvas runs — upfield is negative — so it is
 * negated on the way in and every number here can be checked against the
 * frozen specification as written.
 */
type LegacyOffset = readonly [number, number, number];

interface LegacyPreset {
  readonly name: string;
  readonly points: readonly LegacyOffset[];
  /** Curve control points, by the index of the break they bend the way to. */
  readonly controls?: Readonly<Record<number, LegacyOffset>>;
}

/**
 * The ten shapes the original offers, plus the wheel, which is the only one
 * of them that bends.
 */
const legacyRoutePresets: Readonly<Record<string, LegacyPreset>> = {
  go: { name: "Go", points: [[0, 0, -168]] },
  slant: {
    name: "Slant",
    points: [
      [0, 0, -36],
      [0, 110, -132],
    ],
  },
  hitch: {
    name: "Hitch",
    points: [
      [0, 0, -76],
      [0, 18, -60],
    ],
  },
  curl: {
    name: "Curl",
    points: [
      [0, 0, -136],
      [0, 26, -110],
    ],
  },
  out: {
    name: "Out",
    points: [
      [0, 0, -120],
      [88, 0, -120],
    ],
  },
  dig: {
    name: "Dig",
    points: [
      [0, 0, -120],
      [0, 120, -120],
    ],
  },
  post: {
    name: "Post",
    points: [
      [0, 0, -136],
      [0, 88, -220],
    ],
  },
  corner: {
    name: "Corner",
    points: [
      [0, 0, -136],
      [88, 0, -220],
    ],
  },
  flat: {
    name: "Flat",
    points: [
      [0, 0, -12],
      [104, 0, -38],
    ],
  },
  wheel: {
    name: "Wheel",
    points: [
      [88, 0, -26],
      [108, 0, -190],
    ],
    controls: { 0: [48, 0, -2], 1: [118, 0, -95] },
  },
};

export const routePresetNames: readonly {
  readonly key: string;
  readonly name: string;
}[] = Object.freeze(
  Object.entries(legacyRoutePresets).map(([key, { name }]) => ({ key, name })),
);

function offsetToYards(
  offset: LegacyOffset,
  { outward }: Handedness,
): Coordinate {
  const [out, inward, depth] = offset;
  return {
    lateralYards: legacyLateralSpanToYards(out * outward + inward * -outward),
    // Upfield is negative in the frame these were written in.
    depthYards: legacyDepthSpanToYards(-depth),
  };
}

const shifted = (stance: Coordinate, by: Coordinate): Coordinate => ({
  lateralYards: stance.lateralYards + by.lateralYards,
  depthYards: stance.depthYards + by.depthYards,
});

/**
 * A preset drawn from a point. The first point is that point exactly, so the
 * line starts on the man — or, when a call is being run on from the end of
 * what he has already, on the break it continues from.
 *
 * Which way is outward is his rather than the anchor's, because a line that
 * has already crossed the formation is still a line he is running from his
 * own side of the ball.
 */
export function routePresetPoints(
  key: string,
  from: Coordinate,
  hand: Handedness = handednessOf(from),
): readonly PathPoint[] | undefined {
  const preset = legacyRoutePresets[key];
  if (!preset) return undefined;
  return [
    from,
    ...preset.points.map((offset, index) => {
      const control = preset.controls?.[index];
      return {
        ...shifted(from, offsetToYards(offset, hand)),
        ...(control
          ? { control: shifted(from, offsetToYards(control, hand)) }
          : {}),
      };
    }),
  ];
}

/**
 * How a man blocks, and how a defender plays. Both are shapes from his own
 * spot like a route is, with one difference that belongs to blocking: a
 * handful of calls carry a real field direction rather than mirroring about
 * the ball, because "set left" means left whichever side of the centre a man
 * lines up on.
 */
interface LegacyLinePreset {
  readonly name: string;
  readonly points: readonly LegacyOffset[];
  readonly controls?: Readonly<Record<number, LegacyOffset>>;
  /** Breaks the original marks with a tick, by the index of the break. */
  readonly ticks?: readonly number[];
  readonly line: "solid" | "dashed" | "dotted";
  readonly ending: "arrow" | "bar" | "dot" | "bubble" | "chevron";
  /** Left is left: the shape is not mirrored to the side the man is on. */
  readonly absolute?: boolean;
  /**
   * He pulls: the shape runs to the play side rather than out from his own
   * side of the ball, wherever the Play says the run is going (issue #164).
   */
  readonly pull?: boolean;
}

const legacyBlockPresets: Readonly<Record<string, LegacyLinePreset>> = {
  drive: { name: "Drive", points: [[0, 0, -30]], line: "solid", ending: "bar" },
  down: {
    name: "Down",
    points: [[-30, 0, -26]],
    line: "solid",
    ending: "bar",
  },
  reach: {
    name: "Reach",
    points: [[32, 0, -24]],
    line: "solid",
    ending: "bar",
  },
  doubl: {
    name: "Double",
    points: [
      [16, 0, -20],
      [16, 0, -46],
    ],
    line: "solid",
    ending: "bar",
  },
  climb: {
    name: "Down / climb",
    points: [
      [-28, 0, -24],
      [-46, 0, -58],
    ],
    ticks: [0],
    line: "solid",
    ending: "bar",
  },
  kick: {
    name: "Pull — kick",
    points: [
      [24, 0, 18],
      [86, 0, -6],
      [104, 0, -30],
    ],
    controls: { 0: [8, 0, 20] },
    line: "dashed",
    ending: "bar",
    pull: true,
  },
  wrap: {
    name: "Pull — wrap",
    points: [
      [20, 0, 20],
      [92, 0, 10],
      [112, 0, -34],
    ],
    controls: { 0: [6, 0, 22] },
    line: "dashed",
    ending: "bar",
    pull: true,
  },
  // A short pull along the line that kicks out the first man past the
  // centre on the play side, inside out.
  trap: {
    name: "Trap",
    points: [
      [16, 0, 14],
      [72, 0, -24],
    ],
    controls: { 0: [4, 0, 16] },
    line: "dashed",
    ending: "bar",
    pull: true,
  },
  cut: { name: "Cut", points: [[26, 0, -14]], line: "solid", ending: "dot" },
  passset: {
    name: "Pass set",
    points: [[0, 0, 22]],
    line: "solid",
    ending: "bar",
  },
  setleft: {
    name: "Pass set left",
    points: [[-16, 0, 18]],
    line: "solid",
    ending: "bar",
    absolute: true,
  },
  setright: {
    name: "Pass set right",
    points: [[16, 0, 18]],
    line: "solid",
    ending: "bar",
    absolute: true,
  },
  chip: {
    name: "Chip & release",
    points: [
      [22, 0, -16],
      [62, 0, -52],
    ],
    ticks: [0],
    line: "solid",
    ending: "arrow",
  },
};

/**
 * What a defender is asked to do, drawn out. A drop that owns ground carries
 * the area with it; a man assignment and a rush do not.
 *
 * The original draws every one of them as a fixed shape off the man's stance.
 * A man call and the deep drops still are — the man call lines up on its
 * receiver and the deep shell shares the field out (ADR 0059) — but the rest
 * are aimed at the field (ADR 0064, issue #165): an underneath zone at its
 * landmark, a spy over the quarterback, and pressure through a gap in the
 * offensive line, so a safety rolled down to curl/flat lands at ten yards
 * rather than at his own eighteen.
 */
type DefensivePresetGroup = "front" | "pressure" | "coverage";

interface LegacyDefensivePreset extends Omit<LegacyLinePreset, "points"> {
  readonly kind: "zone" | "blitz" | "stunt";
  readonly group: DefensivePresetGroup;
  readonly area?: readonly [number, number, string];
  /** The original's shape, for a call still drawn off the man's stance. */
  readonly points?: readonly LegacyOffset[];
  /**
   * Where the call goes on this field, after his stance. Given the lateral
   * radius of the ground it owns, so a bubble can be held off the sideline.
   */
  readonly aim?: (
    stance: Coordinate,
    field: DefensiveField,
    radiusLateralYards: number,
  ) => readonly PathPoint[];
  /** Played by two men: whoever is given it, his partner is given it too. */
  readonly pair?: boolean;
  /** Still named on a line drawn with it, but no longer offered. */
  readonly retired?: boolean;
}

const legacyDefensivePresets: Readonly<Record<string, LegacyDefensivePreset>> =
  {
    hook: {
      name: "Hook",
      kind: "zone",
      group: "coverage",
      aim: (stance, field) => [hookLandmark(stance, field)],
      line: "dashed",
      ending: "bubble",
      area: [52, 27, "hook"],
    },
    curlflat: {
      name: "Curl / flat",
      kind: "zone",
      group: "coverage",
      aim: (stance, field, radius) => [curlFlatLandmark(stance, field, radius)],
      line: "dashed",
      ending: "bubble",
      area: [64, 30, "curl"],
    },
    deep3: {
      name: "Deep 1/3",
      kind: "zone",
      group: "coverage",
      points: [[0, 0, -124]],
      line: "dashed",
      ending: "bubble",
      area: [104, 44, "deep"],
    },
    deep2: {
      name: "Deep 1/2",
      kind: "zone",
      group: "coverage",
      points: [[-30, 0, -118]],
      line: "dashed",
      ending: "bubble",
      area: [132, 48, "deep"],
    },
    mid3: {
      name: "Middle 1/3",
      kind: "zone",
      group: "coverage",
      points: [[0, 0, -136]],
      line: "dashed",
      ending: "bubble",
      area: [96, 42, "deep"],
    },
    robber: {
      name: "Robber",
      kind: "zone",
      group: "coverage",
      aim: (_stance, field) => [robberLandmark(field)],
      line: "dashed",
      ending: "bubble",
      area: [70, 32, "curl"],
    },
    man: {
      name: "Man",
      kind: "zone",
      group: "coverage",
      points: [[0, 0, -30]],
      line: "dotted",
      ending: "arrow",
    },
    quarter: {
      name: "Deep 1/4",
      kind: "zone",
      group: "coverage",
      points: [[-14, 0, -120]],
      line: "dashed",
      ending: "bubble",
      area: [78, 44, "deep"],
    },
    spy: {
      name: "QB spy",
      kind: "zone",
      group: "coverage",
      aim: (_stance, field) => [spyLandmark(field)],
      line: "dotted",
      ending: "bubble",
      area: [44, 24, "spy"],
    },
    agap: {
      name: "A gap",
      kind: "blitz",
      group: "pressure",
      aim: (stance, field) => gapBlitzPoints(stance, field, 0),
      line: "solid",
      ending: "arrow",
    },
    bgap: {
      name: "B gap",
      kind: "blitz",
      group: "pressure",
      aim: (stance, field) => gapBlitzPoints(stance, field, 1),
      line: "solid",
      ending: "arrow",
    },
    cgap: {
      name: "C gap",
      kind: "blitz",
      group: "pressure",
      aim: (stance, field) => gapBlitzPoints(stance, field, 2),
      line: "solid",
      ending: "arrow",
    },
    dgap: {
      name: "D gap",
      kind: "blitz",
      group: "pressure",
      aim: (stance, field) => gapBlitzPoints(stance, field, 3),
      line: "solid",
      ending: "arrow",
    },
    rush: {
      name: "Rush",
      kind: "blitz",
      group: "front",
      aim: rushPoints,
      line: "solid",
      ending: "arrow",
    },
    contain: {
      name: "Contain",
      kind: "blitz",
      group: "front",
      aim: containPoints,
      line: "solid",
      ending: "arrow",
    },
    slantin: {
      name: "Slant in",
      kind: "stunt",
      group: "front",
      aim: (stance, field) => slantPoints(stance, field, -1),
      line: "solid",
      ending: "chevron",
    },
    slantout: {
      name: "Slant out",
      kind: "stunt",
      group: "front",
      aim: (stance, field) => slantPoints(stance, field, 1),
      line: "solid",
      ending: "chevron",
    },
    tetwist: {
      name: "T-E twist",
      kind: "stunt",
      group: "front",
      aim: (stance, field) => twistPoints(stance, field, "TE"),
      pair: true,
      line: "solid",
      ending: "chevron",
    },
    ettwist: {
      name: "E-T twist",
      kind: "stunt",
      group: "front",
      aim: (stance, field) => twistPoints(stance, field, "ET"),
      pair: true,
      line: "solid",
      ending: "chevron",
    },
    spill: {
      name: "Spill",
      kind: "stunt",
      group: "front",
      aim: spillPoints,
      line: "solid",
      ending: "arrow",
    },
    squeeze: {
      name: "Squeeze",
      kind: "stunt",
      group: "front",
      aim: squeezePoints,
      line: "solid",
      ending: "bar",
    },
    // The original's two rushes, which name no gap: a line drawn with one
    // before #165 still says what it is, but a Coach is now offered the gaps
    // and the front's own calls instead.
    blitz: {
      name: "Blitz",
      kind: "blitz",
      group: "pressure",
      points: [[0, 0, 44]],
      line: "solid",
      ending: "arrow",
      retired: true,
    },
    stunt: {
      name: "Stunt",
      kind: "stunt",
      group: "front",
      points: [
        [26, 0, 22],
        [44, 0, 52],
      ],
      line: "solid",
      ending: "chevron",
      retired: true,
    },
  };

export interface LinePreset {
  readonly key: string;
  readonly name: string;
  readonly kind: "block" | "zone" | "blitz" | "stunt";
  readonly style: {
    readonly line: "solid" | "dashed" | "dotted";
    readonly ending: "arrow" | "bar" | "dot" | "bubble" | "chevron";
  };
  /** He pulls, so the shape goes to the play side when there is one. */
  readonly pull: boolean;
  /** The ground it owns, where it owns any. */
  readonly area?: {
    readonly type: "deep" | "curl" | "hook" | "flat" | "spy";
    readonly radiusLateralYards: number;
    readonly radiusDepthYards: number;
  };
  /** Which of a defender's calls it is: the front's, pressure or coverage. */
  readonly group?: DefensivePresetGroup;
  /** A two-man game, given to the man's partner along with him. */
  readonly pair?: boolean;
  /** Named where a line was drawn with it, but no longer offered. */
  readonly retired?: boolean;
  /**
   * The line from his stance. A call aimed at the field reads it off the
   * field given — where the ball, the gaps and the quarterback are — and
   * without one is aimed at the original's line with the ball in the middle.
   * `toward` sends a pull to the play side; without it, and for every other
   * call, the shape is his own side's.
   */
  pointsFrom(
    stance: Coordinate,
    field?: DefensiveField,
    toward?: 1 | -1,
  ): readonly PathPoint[];
}

function buildLinePreset(
  key: string,
  preset: Omit<LegacyLinePreset, "points"> & {
    readonly points?: readonly LegacyOffset[];
  },
  kind: LinePreset["kind"],
  defensive?: LegacyDefensivePreset,
): LinePreset {
  const area = defensive?.area;
  const radiusLateralYards = area ? legacyLateralSpanToYards(area[0]) : 0;
  return {
    key,
    name: preset.name,
    kind,
    style: { line: preset.line, ending: preset.ending },
    pull: preset.pull === true,
    ...(area
      ? {
          area: {
            type: area[2] as NonNullable<LinePreset["area"]>["type"],
            radiusLateralYards,
            radiusDepthYards: legacyDepthSpanToYards(area[1]),
          },
        }
      : {}),
    ...(defensive ? { group: defensive.group } : {}),
    ...(defensive?.pair ? { pair: true } : {}),
    ...(defensive?.retired ? { retired: true } : {}),
    pointsFrom(
      stance: Coordinate,
      field = DEFAULT_DEFENSIVE_FIELD,
      toward?: 1 | -1,
    ) {
      if (defensive?.aim) {
        return [stance, ...defensive.aim(stance, field, radiusLateralYards)];
      }
      // A call that carries a real field direction is drawn as written, and a
      // pull runs to the play side; the rest mirror about the ball to the
      // side the man lines up on.
      const hand: Handedness = preset.absolute
        ? { outward: 1 }
        : preset.pull && toward !== undefined
          ? { outward: toward }
          : handednessOf(stance);
      return [
        stance,
        ...(preset.points ?? []).map((offset, index) => {
          const control = preset.controls?.[index];
          return {
            ...shifted(stance, offsetToYards(offset, hand)),
            ...(preset.ticks?.includes(index) ? { tick: true } : {}),
            ...(control
              ? { control: shifted(stance, offsetToYards(control, hand)) }
              : {}),
          };
        }),
      ];
    },
  };
}

export const blockPresets: readonly LinePreset[] = Object.freeze(
  Object.entries(legacyBlockPresets).map(([key, preset]) =>
    buildLinePreset(key, preset, "block"),
  ),
);

/** Every call a defender's line can be drawn as, retired ones included. */
export const defensivePresets: readonly LinePreset[] = Object.freeze(
  Object.entries(legacyDefensivePresets).map(([key, preset]) =>
    buildLinePreset(key, preset, preset.kind, preset),
  ),
);

const offeredIn = (group: DefensivePresetGroup) =>
  defensivePresets.filter(
    (preset) => preset.group === group && !preset.retired,
  );

/**
 * The calls a defender is offered, in the order he is offered them. A man on
 * the front gets the front's own calls first — rush, contain, the slants and
 * the games — then the gaps, then the drops a zone blitz can send him to.
 * Everyone else gets the gaps and the coverage.
 */
export function defensivePresetsFor(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
  player: Pick<Player, "position">,
): readonly LinePreset[] {
  const front = isOnDefensiveFront(player.position, defensiveFieldOf(play));
  return [
    ...(front ? offeredIn("front") : []),
    ...offeredIn("pressure"),
    ...offeredIn("coverage"),
  ];
}

export const linePresetByKey = (key: string): LinePreset | undefined =>
  blockPresets.find((preset) => preset.key === key) ??
  defensivePresets.find((preset) => preset.key === key);

/**
 * The six calls the original puts on the whole line at once, in its order.
 * Each one keeps every man his own alignment, because the shape is drawn from
 * where he stands.
 */
export const lineCallKeys: readonly string[] = Object.freeze([
  "passset",
  "setleft",
  "setright",
  "drive",
  "reach",
  "cut",
]);
