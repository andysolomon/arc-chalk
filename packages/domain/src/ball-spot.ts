import { ballLateralYards } from "./formations";
import { legacyLateralSpanToYards } from "./geometry";
import type { Coordinate, PathPoint, PlayDocument } from "./schema";

/**
 * Where the official spots the ball, and what moving it does to a Play.
 *
 * The whole thing travels with the ball, defense included, and splits stay
 * exactly as drawn — until a hash leaves no room for them, at which point the
 * boundary side is squeezed rather than allowed to stand out of bounds.
 */

export type BallSpot = "left" | "middle" | "right";

/** How far from the middle of the field each spot is, for this field. */
export function hashSpots(
  play: Pick<PlayDocument, "fieldProfile">,
): Readonly<Record<BallSpot, number>> {
  const fromMiddle =
    play.fieldProfile.widthYards / 2 - play.fieldProfile.hashInsetYards;
  return { left: -fromMiddle, middle: 0, right: fromMiddle };
}

/** Close enough to a spot to be called spotted there. */
const SPOT_TOLERANCE_YARDS = legacyLateralSpanToYards(6);

/** Which spot the ball is on now, if it is on one. */
export function currentBallSpot(play: PlayDocument): BallSpot | undefined {
  const ball = ballLateralYards(
    play.players.filter(({ unit }) => unit !== "defense"),
  );
  const spots = hashSpots(play);
  let best: { spot: BallSpot; gap: number } | undefined;
  for (const spot of ["left", "middle", "right"] as const) {
    const gap = Math.abs(spots[spot] - ball);
    if (!best || gap < best.gap) best = { spot, gap };
  }
  return best && best.gap <= SPOT_TOLERANCE_YARDS ? best.spot : undefined;
}

/**
 * The room a set is left when the ball moves to a hash. The original keeps a
 * margin off the paint so the widest man has grass under him rather than
 * standing on the minimum, and gives the field side back what the boundary
 * side loses — capped, so nothing ends up looking stretched.
 */
const MARGIN_YARDS = legacyLateralSpanToYards(54);
/** Below this there is no split to squeeze, only rounding. */
const MIN_SPLIT_YARDS = legacyLateralSpanToYards(4);
const MIN_SQUEEZE = 0.45;
const MAX_GIVE = 1.15;

export interface BallSpotMapping {
  readonly ballLateralYards: number;
  readonly leftScale: number;
  readonly rightScale: number;
  /** Where a man standing at this lateral ends up once the ball is spotted. */
  at(lateralYards: number): number;
}

export function ballSpotMapping(
  play: PlayDocument,
  spotLateralYards: number,
): BallSpotMapping {
  const ball = ballLateralYards(
    play.players.filter(({ unit }) => unit !== "defense"),
  );
  const offsets = play.players.map(
    ({ position }) => position.lateralYards - ball,
  );
  const half = play.fieldProfile.widthYards / 2;
  const needLeft = Math.max(0, -Math.min(0, ...offsets));
  const needRight = Math.max(0, Math.max(0, ...offsets));
  const roomLeft = spotLateralYards - (-half + MARGIN_YARDS);
  const roomRight = half - MARGIN_YARDS - spotLateralYards;

  const squeeze = (need: number, room: number) =>
    need > MIN_SPLIT_YARDS && room < need
      ? Math.max(MIN_SQUEEZE, room / need)
      : 1;
  let leftScale = squeeze(needLeft, roomLeft);
  let rightScale = squeeze(needRight, roomRight);

  const give = (lost: number, need: number, room: number) =>
    lost <= 0 || need <= MIN_SPLIT_YARDS
      ? 1
      : Math.max(1, Math.min(MAX_GIVE, Math.min(room / need, 1 + lost / need)));
  if (leftScale < 1) {
    rightScale = give(needLeft * (1 - leftScale), needRight, roomRight);
  } else if (rightScale < 1) {
    leftScale = give(needRight * (1 - rightScale), needLeft, roomLeft);
  }

  return {
    ballLateralYards: ball,
    leftScale,
    rightScale,
    at(lateralYards: number) {
      const offset = lateralYards - ball;
      return spotLateralYards + offset * (offset < 0 ? leftScale : rightScale);
    },
  };
}

export interface BallSpotResult {
  readonly play: PlayDocument;
  readonly mapping: BallSpotMapping;
  /** Whether a boundary split had to be tightened to stay in bounds. */
  readonly tightened: boolean;
}

/**
 * Spots the ball, and takes the Play with it. Every man is placed against the
 * new spot; every line travels with the man running it exactly as drawn,
 * because a route is a shape rather than a proportion.
 *
 * One divergence from the original is recorded here. It clamps a break that
 * would land out of bounds, and then has to remember the line's true shape so
 * that moving the ball back gives it its length again. Production does not
 * clamp: nothing is lost, so there is nothing to remember, and the same
 * information is expressed by not destroying it. A break drawn past the paint
 * is a drawing the Coach can see, and it comes back exactly when he moves the
 * ball back.
 */
export function spotBall(play: PlayDocument, spot: BallSpot): BallSpotResult {
  const mapping = ballSpotMapping(play, hashSpots(play)[spot]);
  const moved = new Map<string, number>();
  const players = play.players.map((player) => {
    const lateralYards = mapping.at(player.position.lateralYards);
    moved.set(player.id, lateralYards - player.position.lateralYards);
    return { ...player, position: { ...player.position, lateralYards } };
  });

  const across = (point: PathPoint, by: number): PathPoint => ({
    ...point,
    lateralYards: point.lateralYards + by,
    ...(point.control
      ? {
          control: {
            ...point.control,
            lateralYards: point.control.lateralYards + by,
          },
        }
      : {}),
  });

  const paths = play.paths.map((path) => {
    // A line travels with the man running it. One drawn on nobody — which the
    // schema does not allow, but a future one might — would be placed by
    // where it starts instead.
    const by =
      moved.get(path.playerId) ??
      mapping.at(path.points[0]!.lateralYards) - path.points[0]!.lateralYards;
    return {
      ...path,
      points: path.points.map((point) => across(point, by)),
      branches: path.branches.map((branch) => ({
        ...branch,
        points: branch.points.map((point) => across(point, by)),
      })),
    };
  });

  const labels = play.labels.map((label) => {
    // A note pinned to a line rides that line; only its leader is placed,
    // since the leader points at somewhere on the field rather than at a
    // distance from the note.
    const placed = (point: Coordinate): Coordinate => ({
      ...point,
      lateralYards: mapping.at(point.lateralYards),
    });
    if (label.binding) {
      return label.leader
        ? {
            ...label,
            leader: {
              ...label.leader,
              endpoint: placed(label.leader.endpoint),
            },
          }
        : label;
    }
    const by =
      mapping.at(label.position.lateralYards) - label.position.lateralYards;
    return {
      ...label,
      position: placed(label.position),
      ...(label.leader
        ? {
            leader: {
              ...label.leader,
              endpoint: {
                ...label.leader.endpoint,
                lateralYards: label.leader.endpoint.lateralYards + by,
              },
            },
          }
        : {}),
    };
  });

  return {
    mapping,
    tightened: mapping.leftScale < 1 || mapping.rightScale < 1,
    play: { ...play, players, paths, labels },
  };
}

/** How the toast names each spot. */
export const ballSpotNames: Readonly<Record<BallSpot, string>> = Object.freeze({
  left: "Ball on the left hash",
  middle: "Ball in the middle of the field",
  right: "Ball on the right hash",
});

/**
 * Where the ball is, for a camera asked to look at it: under the centre if
 * one is drawn, and otherwise the middle of the line of scrimmage, which is
 * where it would be spotted on an empty field.
 */
export function ballPosition(play: PlayDocument): Coordinate {
  const centre = play.players.find(
    ({ symbol, unit }) => symbol === "square" && unit !== "defense",
  );
  return centre?.position ?? { lateralYards: 0, depthYards: 0 };
}
