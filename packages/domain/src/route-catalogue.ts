import { legacyDepthSpanToYards, legacyLateralSpanToYards } from "./geometry";
import type { Coordinate, PathPoint } from "./schema";

/**
 * The route tree, and the concepts drawn out of it.
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
 * A concept is a distribution, not a route: each man gets his job by the
 * position he plays, mirrored to the side he lines up on, so one entry covers
 * both sides of the ball. Some jobs are a preset off the tree; the rest are
 * drawn out here because they belong to the concept rather than to the tree.
 */
interface LegacyJob {
  /** What the man is told, in the words the original prints on the card. */
  readonly assignment: string;
  readonly preset?: string;
  readonly points?: readonly LegacyOffset[];
  readonly ending?: "arrow" | "hook";
}

interface LegacyConcept {
  readonly key: string;
  readonly name: string;
  readonly hint: string;
  readonly jobs: Readonly<Record<string, LegacyJob>>;
}

const legacyConcepts: readonly LegacyConcept[] = [
  {
    key: "mesh",
    name: "Mesh",
    hint: "shallow crossers underneath, dig behind, back to the flat",
    jobs: {
      X: {
        assignment: "SHALLOW",
        points: [
          [0, 0, -24],
          [0, 320, -66],
        ],
      },
      H: {
        assignment: "SHALLOW",
        points: [
          [0, 0, -30],
          [0, 300, -80],
        ],
      },
      TE: { assignment: "DIG", preset: "dig" },
      Z: { assignment: "CORNER", preset: "corner" },
      RB: { assignment: "FLAT", preset: "flat" },
    },
  },
  {
    key: "stick",
    name: "Stick",
    hint: "stick to the flat with a fade over the top",
    jobs: {
      TE: {
        assignment: "STICK",
        points: [
          [0, 0, -66],
          [34, 0, -74],
        ],
        ending: "hook",
      },
      H: { assignment: "FLAT", preset: "flat" },
      X: { assignment: "FADE", preset: "go" },
      Z: { assignment: "HITCH", preset: "hitch" },
      RB: { assignment: "CHECK", preset: "flat" },
    },
  },
  {
    key: "smash",
    name: "Smash",
    hint: "hitch under, corner over the top — high / low on the corner",
    jobs: {
      X: { assignment: "HITCH", preset: "hitch" },
      Z: { assignment: "HITCH", preset: "hitch" },
      H: { assignment: "CORNER", preset: "corner" },
      TE: { assignment: "CORNER", preset: "corner" },
      RB: { assignment: "CHECK", preset: "flat" },
    },
  },
  {
    key: "flood",
    name: "Flood",
    hint: "three levels to one side — deep, intermediate, flat",
    jobs: {
      Z: { assignment: "CORNER", preset: "corner" },
      TE: { assignment: "OUT", preset: "out" },
      H: { assignment: "FLAT", preset: "flat" },
      X: { assignment: "GO", preset: "go" },
      RB: { assignment: "CHECK", preset: "flat" },
    },
  },
  {
    key: "dagger",
    name: "Dagger",
    hint: "seam clears the middle, dig comes in behind it",
    jobs: {
      H: { assignment: "SEAM", preset: "go" },
      X: { assignment: "DIG", preset: "dig" },
      Z: { assignment: "GO", preset: "go" },
      TE: { assignment: "FLAT", preset: "flat" },
      RB: { assignment: "CHECK", preset: "flat" },
    },
  },
  {
    key: "drive",
    name: "Drive",
    hint: "shallow drive with the dig right behind it",
    jobs: {
      X: {
        assignment: "DRIVE",
        points: [
          [0, 0, -20],
          [0, 300, -52],
        ],
      },
      TE: { assignment: "DIG", preset: "dig" },
      H: { assignment: "CURL", preset: "curl" },
      Z: { assignment: "GO", preset: "go" },
      RB: { assignment: "CHECK", preset: "flat" },
    },
  },
  {
    key: "ycross",
    name: "Y-Cross",
    hint: "Y crosses deep, post on top, back checks",
    jobs: {
      TE: {
        assignment: "CROSS",
        points: [
          [0, 0, -44],
          [0, 300, -158],
        ],
      },
      X: { assignment: "POST", preset: "post" },
      Z: { assignment: "CURL", preset: "curl" },
      H: { assignment: "FLAT", preset: "flat" },
      RB: { assignment: "CHECK", preset: "flat" },
    },
  },
  {
    key: "levels",
    name: "Levels",
    hint: "two ins at different depths on the same side",
    jobs: {
      X: { assignment: "SLANT", preset: "slant" },
      H: { assignment: "DIG", preset: "dig" },
      Z: { assignment: "SLANT", preset: "slant" },
      TE: { assignment: "DIG", preset: "dig" },
      RB: { assignment: "CHECK", preset: "flat" },
    },
  },
  {
    key: "spacing",
    name: "Spacing",
    hint: "everybody sits in a window — beats zone, moves the ball",
    jobs: {
      X: { assignment: "HITCH", preset: "hitch" },
      Z: { assignment: "HITCH", preset: "hitch" },
      H: { assignment: "FLAT", preset: "flat" },
      TE: {
        assignment: "STICK",
        points: [
          [0, 0, -62],
          [30, 0, -70],
        ],
        ending: "hook",
      },
      RB: { assignment: "CHECK", preset: "flat" },
    },
  },
  {
    key: "verts",
    name: "4 Verts",
    hint: "four straight up, back checks underneath",
    jobs: {
      X: { assignment: "GO", preset: "go" },
      Z: { assignment: "GO", preset: "go" },
      H: { assignment: "SEAM", preset: "go" },
      TE: { assignment: "SEAM", preset: "go" },
      RB: { assignment: "CHECK", preset: "flat" },
    },
  },
];

export interface ConceptJob {
  readonly role: string;
  readonly assignment: string;
  readonly preset?: string;
  readonly ending: "arrow" | "hook";
}

export interface ConceptDefinition {
  readonly key: string;
  readonly name: string;
  readonly hint: string;
  readonly roles: readonly string[];
  /** What the man playing this position is asked to run, drawn from his spot. */
  jobFor(
    role: string,
    stance: Coordinate,
  ):
    | (ConceptJob & {
        readonly points: readonly PathPoint[];
      })
    | undefined;
}

export const stockConcepts: readonly ConceptDefinition[] = Object.freeze(
  legacyConcepts.map((concept) => ({
    key: concept.key,
    name: concept.name,
    hint: concept.hint,
    roles: Object.keys(concept.jobs),
    jobFor(role: string, stance: Coordinate) {
      const job = concept.jobs[role];
      if (!job) return undefined;
      const ending = job.ending ?? "arrow";
      const points = job.preset
        ? routePresetPoints(job.preset, stance)
        : [
            stance,
            ...job.points!.map((offset) =>
              shifted(stance, offsetToYards(offset, handednessOf(stance))),
            ),
          ];
      if (!points) return undefined;
      return {
        role,
        assignment: job.assignment,
        ...(job.preset === undefined ? {} : { preset: job.preset }),
        ending,
        points,
      };
    },
  })),
);

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
 */
const legacyDefensivePresets: Readonly<
  Record<
    string,
    LegacyLinePreset & {
      readonly kind: "zone" | "blitz" | "stunt";
      readonly area?: readonly [number, number, string];
    }
  >
> = {
  hook: {
    name: "Hook",
    kind: "zone",
    points: [[0, 0, -56]],
    line: "dashed",
    ending: "bubble",
    area: [52, 27, "hook"],
  },
  curlflat: {
    name: "Curl / flat",
    kind: "zone",
    points: [
      [0, 0, -40],
      [62, 0, -24],
    ],
    line: "dashed",
    ending: "bubble",
    area: [64, 30, "curl"],
  },
  deep3: {
    name: "Deep 1/3",
    kind: "zone",
    points: [[0, 0, -124]],
    line: "dashed",
    ending: "bubble",
    area: [104, 44, "deep"],
  },
  deep2: {
    name: "Deep 1/2",
    kind: "zone",
    points: [[-30, 0, -118]],
    line: "dashed",
    ending: "bubble",
    area: [132, 48, "deep"],
  },
  mid3: {
    name: "Middle 1/3",
    kind: "zone",
    points: [[0, 0, -136]],
    line: "dashed",
    ending: "bubble",
    area: [96, 42, "deep"],
  },
  robber: {
    name: "Robber",
    kind: "zone",
    points: [[-48, 0, -42]],
    line: "dashed",
    ending: "bubble",
    area: [70, 32, "curl"],
  },
  man: {
    name: "Man",
    kind: "zone",
    points: [[0, 0, -30]],
    line: "dotted",
    ending: "arrow",
  },
  quarter: {
    name: "Deep 1/4",
    kind: "zone",
    points: [[-14, 0, -120]],
    line: "dashed",
    ending: "bubble",
    area: [78, 44, "deep"],
  },
  blitz: {
    name: "Blitz",
    kind: "blitz",
    points: [[0, 0, 44]],
    line: "solid",
    ending: "arrow",
  },
  stunt: {
    name: "Stunt",
    kind: "stunt",
    points: [
      [26, 0, 22],
      [44, 0, 52],
    ],
    line: "solid",
    ending: "chevron",
  },
  spy: {
    name: "QB spy",
    kind: "zone",
    points: [[0, 0, -16]],
    line: "dotted",
    ending: "bubble",
    area: [44, 24, "spy"],
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
  /** The ground it owns, where it owns any. */
  readonly area?: {
    readonly type: "deep" | "curl" | "hook" | "flat" | "spy";
    readonly radiusLateralYards: number;
    readonly radiusDepthYards: number;
  };
  pointsFrom(stance: Coordinate): readonly PathPoint[];
}

function buildLinePreset(
  key: string,
  preset: LegacyLinePreset,
  kind: LinePreset["kind"],
  area?: readonly [number, number, string],
): LinePreset {
  return {
    key,
    name: preset.name,
    kind,
    style: { line: preset.line, ending: preset.ending },
    ...(area
      ? {
          area: {
            type: area[2] as NonNullable<LinePreset["area"]>["type"],
            radiusLateralYards: legacyLateralSpanToYards(area[0]),
            radiusDepthYards: legacyDepthSpanToYards(area[1]),
          },
        }
      : {}),
    pointsFrom(stance: Coordinate) {
      // A call that carries a real field direction is drawn as written; the
      // rest mirror about the ball to the side the man lines up on.
      const hand: Handedness = preset.absolute
        ? { outward: 1 }
        : handednessOf(stance);
      return [
        stance,
        ...preset.points.map((offset, index) => {
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

export const defensivePresets: readonly LinePreset[] = Object.freeze(
  Object.entries(legacyDefensivePresets).map(([key, preset]) =>
    buildLinePreset(key, preset, preset.kind, preset.area),
  ),
);

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
