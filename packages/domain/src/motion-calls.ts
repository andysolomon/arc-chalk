import { ballPosition } from "./ball-spot";
import { canRunLine } from "./classifications";
import { isQuarterback } from "./quarterback";
import type {
  Coordinate,
  MovementPath,
  PathPoint,
  PlayDocument,
} from "./schema";

/**
 * Pre-snap motion, by type (ADR 0080). A Coach does not think of a motion as
 * a line with a style: he says jet, orbit, across, return or shift, and
 * whether the man is still moving when the ball is snapped. A type is a
 * shape measured from the man's own stance and from where the ball and the
 * quarterback are, the way a route off the tree is, so the same call lands
 * correctly on any set; the Coach drags its breaks from there.
 */

/** What a man in motion is doing when the ball is snapped. */
export type MotionAtSnap = "moving" | "set";

export type MotionCallKey = "jet" | "orbit" | "across" | "return" | "shift";

export interface MotionCall {
  readonly key: MotionCallKey;
  /** What the Coach picks: Jet. */
  readonly name: string;
  /** How a roster or a row says it, where "Jet" alone could be a route. */
  readonly said: string;
  /** What the type means at the snap until the Coach says otherwise. */
  readonly atSnap: MotionAtSnap;
  /** One line on what it draws, for the button's title. */
  readonly about: string;
}

export const motionCalls: readonly MotionCall[] = Object.freeze([
  {
    key: "jet",
    name: "Jet",
    said: "Jet motion",
    atSnap: "moving",
    about:
      "Flat and fast toward the ball, reaching the quarterback as it is snapped",
  },
  {
    key: "orbit",
    name: "Orbit",
    said: "Orbit motion",
    atSnap: "moving",
    about: "In toward the ball, then round behind the quarterback",
  },
  {
    key: "across",
    name: "Across",
    said: "Motion across",
    atSnap: "set",
    about: "All the way across the formation to the far slot",
  },
  {
    key: "return",
    name: "Return",
    said: "Return motion",
    atSnap: "set",
    about: "In toward the ball and back out to where he started",
  },
  {
    key: "shift",
    name: "Shift",
    said: "Shift",
    atSnap: "set",
    about: "A few yards to a new spot, set before the snap",
  },
] satisfies MotionCall[]);

export const motionCallByKey = (
  key: string | undefined,
): MotionCall | undefined =>
  key === undefined ? undefined : motionCalls.find((call) => call.key === key);

/** The type a motion was drawn as, while it is a motion. */
export function motionCallOf(
  path: Pick<MovementPath, "kind" | "preset">,
): MotionCall | undefined {
  return path.kind === "motion" ? motionCallByKey(path.preset) : undefined;
}

/**
 * What he is doing at the snap. A motion nobody has chosen for is set: it
 * finishes a breath before the ball is snapped, which is how every motion
 * drawn before the choice existed has always played.
 */
export function motionAtSnap(path: Pick<MovementPath, "atSnap">): MotionAtSnap {
  return path.atSnap ?? "set";
}

/** The offensive line's depth where a Play has no center to read it off. */
const LINE_DEPTH_YARDS = -1.5;

/**
 * How far behind or in front of a man a line has to pass to clear his
 * symbol, on the depth axis the field is drawn on.
 */
const CLEAR_DEPTH_YARDS = 2.3;

/** How far apart across the field two men have to stand not to overlap. */
const CLEAR_LATERAL_YARDS = 1.6;

/** How far apart a return's two legs are drawn, so its teeth do not mesh. */
const RETURN_LEGS_YARDS = 1.9;

/** The lane a motion runs in has to be at least this deep to fit a man. */
const LANE_ROOM_YARDS = CLEAR_DEPTH_YARDS * 2 - 0.4;

const tidy = (value: number): number => {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const at = (lateralYards: number, depthYards: number): Coordinate => ({
  lateralYards: tidy(lateralYards),
  depthYards: tidy(depthYards),
});

interface MotionField {
  /** Where the man stands. */
  readonly stance: Coordinate;
  /** The ball, across the field. */
  readonly ball: number;
  /** Which way is in for him: toward the ball. */
  readonly toward: 1 | -1;
  /** How far across the field he is from the ball. */
  readonly split: number;
  /** The depth a man runs flat across the formation at. */
  readonly lane: number;
  /** The depth that takes him round behind the quarterback. */
  readonly deep: number;
  /** Everyone else on his side of the ball, to stay clear of. */
  readonly others: readonly Coordinate[];
}

function readField(
  play: PlayDocument,
  playerId: string,
): MotionField | undefined {
  const player = play.players.find(({ id }) => id === playerId);
  if (!player || !canRunLine(player, "motion")) return undefined;
  const stance = player.position;
  const spot = ballPosition(play);
  const ball = spot.lateralYards;
  const line = spot.depthYards < 0 ? spot.depthYards : LINE_DEPTH_YARDS;
  const offense = play.players.filter(
    ({ id, unit }) => id !== playerId && unit !== "defense",
  );
  const quarterback = offense.find((other) => isQuarterback(play, other));
  const behindLine = line - CLEAR_DEPTH_YARDS;
  // In the gun there is room between the line and the quarterback, and a
  // man runs through it in front of him. Under center there is not, so he
  // goes behind.
  const lane =
    quarterback === undefined
      ? behindLine
      : line - quarterback.position.depthYards >= LANE_ROOM_YARDS
        ? (line + quarterback.position.depthYards) / 2
        : quarterback.position.depthYards - CLEAR_DEPTH_YARDS;
  const deep =
    (quarterback?.position.depthYards ?? behindLine - 2) - CLEAR_DEPTH_YARDS;
  const toward = stance.lateralYards > ball ? -1 : 1;
  return {
    stance,
    ball,
    toward,
    split: Math.abs(stance.lateralYards - ball),
    lane,
    deep: Math.min(deep, lane - 2),
    others: offense.map(({ position }) => position),
  };
}

/** Whether a spot is clear of every other man. */
const isClear = (spot: Coordinate, others: readonly Coordinate[]): boolean =>
  others.every(
    (other) =>
      Math.abs(other.lateralYards - spot.lateralYards) >= CLEAR_LATERAL_YARDS ||
      Math.abs(other.depthYards - spot.depthYards) >= CLEAR_DEPTH_YARDS - 0.3,
  );

/** The first of the spots offered that nobody is standing on, else the first. */
const clearSpot = (
  spots: readonly Coordinate[],
  others: readonly Coordinate[],
): Coordinate => spots.find((spot) => isClear(spot, others)) ?? spots[0]!;

/** Off his stance and down to the lane, a couple of yards in. */
const intoLane = (field: MotionField, travel: number): Coordinate =>
  at(
    field.stance.lateralYards + field.toward * Math.min(2.5, travel / 2),
    field.lane,
  );

const shapes: Readonly<
  Record<MotionCallKey, (field: MotionField) => readonly PathPoint[]>
> = {
  /**
   * Flat down the lane to the near guard, where the quarterback meets him.
   * A man lined up inside that runs on across the ball instead.
   */
  jet(field) {
    const { stance, ball, toward, lane } = field;
    const mesh = ball - toward * 2;
    const end =
      Math.abs(mesh - stance.lateralYards) >= 3
        ? mesh
        : stance.lateralYards + toward * 6;
    return [
      intoLane(field, Math.abs(end - stance.lateralYards)),
      at(end, lane),
    ];
  },
  /**
   * One sweep off his stance, bowed back behind the quarterback — deep
   * enough to clear a back beside him — and on past him.
   */
  orbit(field) {
    const { ball, toward, deep } = field;
    return [
      {
        ...at(ball + toward * 2.5, deep),
        control: at(ball - toward * 4, deep - 3),
      },
    ];
  },
  /** Down the lane and all the way over, up into the far slot. */
  across(field) {
    const { stance, ball, toward, lane, others } = field;
    const depth = Math.min(stance.depthYards, LINE_DEPTH_YARDS - 0.3);
    const far = (yards: number) => at(ball + toward * yards, depth);
    const end = clearSpot([9, 7, 11, 13, 5.5].map(far), others);
    const travel = Math.abs(end.lateralYards - stance.lateralYards);
    return [
      intoLane(field, travel),
      at(end.lateralYards - toward * 2.5, lane),
      end,
    ];
  },
  /**
   * In toward the ball, round, and back out underneath to where he started
   * — two legs far enough apart to read as two. He goes in level, as far as
   * the room before the next man inside him allows; with no room at all he
   * goes in behind that man instead.
   */
  return(field) {
    const { stance, toward, others } = field;
    const inside = others
      .filter(
        (other) =>
          Math.abs(other.depthYards - stance.depthYards) < CLEAR_DEPTH_YARDS &&
          (other.lateralYards - stance.lateralYards) * toward > 0,
      )
      .map((other) => Math.abs(other.lateralYards - stance.lateralYards));
    const room = Math.min(6, ...inside.map((gap) => gap - 2.2));
    const level = room >= 3;
    const reach = level ? room : Math.min(6, Math.max(4, field.split * 0.4));
    const out = stance.depthYards - (level ? 0 : CLEAR_DEPTH_YARDS);
    const back = out - RETURN_LEGS_YARDS;
    const turn = stance.lateralYards + toward * (reach - 1);
    return [
      at(turn, out),
      {
        ...at(turn, back),
        control: at(turn + toward * 2, (out + back) / 2),
      },
      at(stance.lateralYards + toward * 0.8, back),
    ];
  },
  /**
   * A few yards at his own depth: in for a man split wide, out for one who
   * is already in close, where in would put him on the quarterback.
   */
  shift(field) {
    const { stance, toward, others } = field;
    const way = field.split >= 6 ? toward : -toward;
    const over = (yards: number) =>
      at(stance.lateralYards + way * yards, stance.depthYards);
    return [clearSpot([4, 3, 5, 6, 2.5].map(over), others)];
  },
};

/**
 * A motion type drawn for a man: his stance, exactly as it is, and then the
 * type's breaks. Nothing for a man who does not go in motion — a lineman, a
 * defender — or a type the catalogue does not have.
 */
export function motionCallPoints(
  play: PlayDocument,
  playerId: string,
  key: string,
): PathPoint[] | undefined {
  const call = motionCallByKey(key);
  const field = readField(play, playerId);
  if (!call || !field) return undefined;
  const shape = shapes[call.key];
  return [
    {
      lateralYards: field.stance.lateralYards,
      depthYards: field.stance.depthYards,
    },
    ...shape(field),
  ];
}
