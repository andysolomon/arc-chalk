import { defensiveFieldOf } from "./defensive-field";
import {
  classifyZoneCoverage,
  DEEP_ZONE_DEPTH_YARDS,
  DEFAULT_ZONE_COVERAGE_RADII,
  ZONE_COVERAGE_RADIUS_BOUNDS,
} from "./geometry";
import type {
  Coordinate,
  CoverageArea,
  MovementPath,
  PlayDocument,
} from "./schema";

/**
 * A defense's zones are one shell rather than a drop per man. A deep call is
 * the ground its name says (ADR 0075): Middle 1/3 the middle third of the
 * field, Deep 1/3 the outside third on the man's side, Deep 1/2 his half and
 * Deep 1/4 the quarter nearest him, all at one depth. Men called to the same
 * ground share it. Underneath, each bubble stays where it was called to unless
 * it would sit on a neighbour's, and then the two are slid apart until they
 * meet at a seam; two men called to the same landmark share its bubble.
 *
 * The shell is laid out when the Coach changes who is in it — a zone called on
 * a defender, or taken off — so the defenders already dropping make room for
 * a new one or close over the one that left. What it lays out is stored on the
 * drops like any other edit, and one undo takes it back.
 *
 * A spy watches the quarterback rather than a piece of the field, so a spy
 * is nobody's neighbour and keeps the drop it was given.
 */
export type ZoneShellLevel = "deep" | "underneath";

/**
 * What the shell reads of a Play: the men, their lines and the field, whose
 * width it shares out and whose hashes say where a defense drawn alone has
 * its ball. A call in the catalogue is laid out on the same rule before it is
 * ever put on a Play, so it asks for no more than that.
 */
export type ZoneShellPlay = Pick<
  PlayDocument,
  "players" | "paths" | "fieldProfile"
>;

export const zoneShellLevels: readonly ZoneShellLevel[] = Object.freeze([
  "deep",
  "underneath",
]);

/** Neighbouring bubbles meet at a seam this wide rather than stacking. */
export const ZONE_SEAM_YARDS = 1;

/**
 * The deep shell settles this far behind the deepest defender in it, and
 * never shallower than a drop that reads as deep.
 */
const DEEP_CUSHION_YARDS = 4;

/** Closer than this, a bubble is where it was and is not moved. */
const SAME_SPOT_YARDS = 1e-9;

/**
 * Closer to the ball than this, a man is straight over it — the tolerance a
 * man head up on a lineman is given (ADR 0064).
 */
const OVER_THE_BALL_YARDS = 0.25;

/** The deep calls, and how many equal shares of the field each one's ground is. */
const deepShares: Readonly<Record<string, 2 | 3 | 4>> = Object.freeze({
  mid3: 3,
  deep3: 3,
  deep2: 2,
  quarter: 4,
});

/**
 * Which side of the ball a man plays: the one he stands on. A man straight
 * over the ball takes the field side, where there is more of it to cover,
 * and over the ball in the middle of the field the left as the diagram is
 * drawn.
 */
function sideOf(stance: Coordinate, ballLateralYards: number): -1 | 1 {
  const off = stance.lateralYards - ballLateralYards;
  if (Math.abs(off) > OVER_THE_BALL_YARDS) return off < 0 ? -1 : 1;
  if (Math.abs(ballLateralYards) > OVER_THE_BALL_YARDS) {
    return ballLateralYards < 0 ? 1 : -1;
  }
  return -1;
}

/**
 * The ground a deep call names, as the centre of its share of the field and
 * the share's width; nothing for a call that is not a deep one.
 */
export function deepGroundOf(
  preset: string | undefined,
  stance: Coordinate,
  ballLateralYards: number,
  widthYards: number,
): { readonly lateralYards: number; readonly shareYards: number } | undefined {
  const count = preset === undefined ? undefined : deepShares[preset];
  if (count === undefined) return undefined;
  const shareYards = widthYards / count;
  const centre = (index: number) =>
    -widthYards / 2 + (index + 0.5) * shareYards;
  const side = sideOf(stance, ballLateralYards);
  let index: number;
  if (preset === "mid3") {
    index = 1;
  } else if (preset === "deep3") {
    index = side < 0 ? 0 : 2;
  } else if (preset === "deep2") {
    index = side < 0 ? 0 : 1;
  } else {
    // The quarter he stands in is the nearest; on the line between two, the
    // one on his side.
    const at = (stance.lateralYards + widthYards / 2) / shareYards;
    const boundary = Math.round(at);
    index =
      Math.abs(at - boundary) <= SAME_SPOT_YARDS / shareYards
        ? side < 0
          ? boundary - 1
          : boundary
        : Math.floor(at);
    index = Math.max(0, Math.min(count - 1, index));
  }
  return { lateralYards: centre(index), shareYards };
}

/**
 * Where a deep call sends a man on his own: the middle of the ground it
 * names, four yards behind him and never shallower than a drop that reads as
 * deep. The shell then settles every deep man at one depth.
 */
export function deepCallLandmark(
  preset: string,
  stance: Coordinate,
  ballLateralYards: number,
  widthYards: number,
): Coordinate | undefined {
  const ground = deepGroundOf(preset, stance, ballLateralYards, widthYards);
  if (!ground) return undefined;
  return {
    lateralYards: ground.lateralYards,
    depthYards: Math.max(
      DEEP_ZONE_DEPTH_YARDS,
      stance.depthYards + DEEP_CUSHION_YARDS,
    ),
  };
}

interface Drop {
  readonly path: MovementPath;
  readonly level: ZoneShellLevel;
  readonly stance: Coordinate;
  /**
   * Whose ground the call names: his own, or — for a man who took over
   * another's zone (ADR 0075) — the stance of the man whose zone it was.
   */
  readonly ground: Coordinate;
  readonly end: Coordinate;
  readonly area: CoverageArea;
}

function levelOf(type: CoverageArea["type"]): ZoneShellLevel | undefined {
  if (type === "spy") return undefined;
  return type === "deep" ? "deep" : "underneath";
}

/**
 * The drops the shell is made of: a defender's zone line that ends in a
 * bubble. A man assignment is a zone line too, but it follows a receiver
 * instead of owning ground, so it ends in an arrow and has no place here; nor
 * has an alternate, which is a choice between lines rather than one more man.
 */
function dropsOf(play: ZoneShellPlay): readonly Drop[] {
  const stances = new Map(
    play.players
      .filter(({ unit }) => unit === "defense")
      .map(({ id, position }) => [id, position]),
  );
  return play.paths.flatMap((path) => {
    const stance = stances.get(path.playerId);
    const end = path.points.at(-1);
    if (
      !stance ||
      !end ||
      path.points.length < 2 ||
      path.kind !== "zone" ||
      path.style.ending !== "bubble" ||
      path.variant === "alternate"
    ) {
      return [];
    }
    // Read the way the field draws it: a drop never sized owns the default
    // bubble, at the level where it ends.
    const area = path.coverageArea ?? {
      type: classifyZoneCoverage(end),
      ...DEFAULT_ZONE_COVERAGE_RADII,
    };
    const level = levelOf(area.type);
    const ground =
      (path.fills === undefined ? undefined : stances.get(path.fills)) ??
      stance;
    return level ? [{ path, level, stance, ground, end, area }] : [];
  });
}

const byId = (left: Drop, right: Drop): number =>
  left.path.id < right.path.id ? -1 : left.path.id > right.path.id ? 1 : 0;

/**
 * The drop with its bubble centred on `center`. A bend in the last leg
 * travels with the break it ends at, as it does when the Coach drags one.
 */
function landed(
  drop: Drop,
  center: Coordinate,
  area?: CoverageArea,
): MovementPath {
  const { path } = drop;
  const last = path.points.at(-1)!;
  const points = [...path.points];
  points[points.length - 1] = {
    ...last,
    lateralYards: center.lateralYards,
    depthYards: center.depthYards,
    ...(last.control === undefined
      ? {}
      : {
          control: {
            lateralYards:
              last.control.lateralYards +
              center.lateralYards -
              last.lateralYards,
            depthYards:
              last.control.depthYards + center.depthYards - last.depthYards,
          },
        }),
  };
  return { ...path, points, ...(area ? { coverageArea: area } : {}) };
}

/**
 * The deep shell. Each deep call is laid on the ground it names, its bubble as
 * wide as its share of the field less the seam — though never wider than a
 * zone can be sized — so men called to the same ground share one bubble.
 * They settle at one depth, behind the deepest of them, so the shell reads as
 * one line of coverage. A deep drop that is no call stays where it was drawn.
 */
function layDeep(
  play: ZoneShellPlay,
  drops: readonly Drop[],
  ballLateralYards: number,
): Map<string, MovementPath> {
  const moved = new Map<string, MovementPath>();
  const width = play.fieldProfile.widthYards;
  const called = drops.flatMap((drop) => {
    const ground = deepGroundOf(
      drop.path.preset,
      drop.ground,
      ballLateralYards,
      width,
    );
    return ground ? [{ drop, ground }] : [];
  });
  if (called.length === 0) return moved;
  const bounds = ZONE_COVERAGE_RADIUS_BOUNDS.lateralYards;
  const deepest = Math.max(...called.map(({ drop }) => drop.stance.depthYards));
  const depthYards = Math.max(
    DEEP_ZONE_DEPTH_YARDS,
    deepest + DEEP_CUSHION_YARDS,
  );
  for (const { drop, ground } of called) {
    const radiusLateralYards = Math.max(
      bounds.min,
      Math.min(bounds.max, ground.shareYards / 2 - ZONE_SEAM_YARDS / 2),
    );
    const center = { lateralYards: ground.lateralYards, depthYards };
    const unchanged =
      drop.path.coverageArea !== undefined &&
      Math.abs(drop.end.lateralYards - center.lateralYards) <=
        SAME_SPOT_YARDS &&
      Math.abs(drop.end.depthYards - center.depthYards) <= SAME_SPOT_YARDS &&
      Math.abs(drop.area.radiusLateralYards - radiusLateralYards) <=
        SAME_SPOT_YARDS;
    if (unchanged) continue;
    moved.set(
      drop.path.id,
      landed(drop, center, { ...drop.area, radiusLateralYards }),
    );
  }
  return moved;
}

/**
 * Underneath drops whose bubbles share any depth are on one row, where they
 * can only sit side by side; two whose depths never meet can sit one above
 * the other and are left to.
 */
function rowsOf(drops: readonly Drop[]): Drop[][] {
  const near = ({ end, area }: Drop) => end.depthYards - area.radiusDepthYards;
  const rows: Drop[][] = [];
  let reach = -Infinity;
  for (const drop of [...drops].sort(
    (left, right) => near(left) - near(right) || byId(left, right),
  )) {
    const far = drop.end.depthYards + drop.area.radiusDepthYards;
    const row = rows.at(-1);
    if (row && near(drop) < reach) {
      row.push(drop);
      reach = Math.max(reach, far);
    } else {
      rows.push([drop]);
      reach = far;
    }
  }
  return rows;
}

/** Where each bubble's centre falls when a run of them sits seam to seam. */
function offsetsOf(drops: readonly Drop[]): number[] {
  let at = 0;
  return drops.map(({ area }) => {
    const offset = at + area.radiusLateralYards;
    at += 2 * area.radiusLateralYards + ZONE_SEAM_YARDS;
    return offset;
  });
}

interface Run {
  readonly drops: readonly Drop[];
  readonly start: number;
  readonly span: number;
}

/**
 * Where each bubble on a row goes across the field. A bubble clear of its
 * neighbours stays where it was called to. Bubbles that would stack are laid
 * side by side, seam to seam and in the order they were called across the
 * field, as a group as near as it can be to where each of them was called;
 * and every group is held between the sidelines.
 */
function spreadAcross(
  row: readonly Drop[],
  halfWidth: number,
): (readonly [Drop, number])[] {
  const place = (drops: readonly Drop[]): Run => {
    const offsets = offsetsOf(drops);
    const span = offsets.at(-1)! + drops.at(-1)!.area.radiusLateralYards;
    const wanted =
      drops.reduce(
        (sum, { end }, index) => sum + end.lateralYards - offsets[index]!,
        0,
      ) / drops.length;
    return {
      drops,
      span,
      start: Math.max(-halfWidth, Math.min(halfWidth - span, wanted)),
    };
  };
  const runs: Run[] = [];
  for (const drop of [...row].sort(
    (left, right) =>
      left.end.lateralYards - right.end.lateralYards ||
      left.stance.lateralYards - right.stance.lateralYards ||
      byId(left, right),
  )) {
    let run = place([drop]);
    for (
      let previous = runs.at(-1);
      previous &&
      previous.start + previous.span + ZONE_SEAM_YARDS >
        run.start + SAME_SPOT_YARDS;
      previous = runs.at(-1)
    ) {
      runs.pop();
      run = place([...previous.drops, ...run.drops]);
    }
    runs.push(run);
  }
  return runs.flatMap(({ drops, start }) => {
    const offsets = offsetsOf(drops);
    return drops.map((drop, index) => [drop, start + offsets[index]!] as const);
  });
}

/**
 * Drops that share a bubble: men called to the same landmark with the same
 * call. Each group is laid out as the one bubble its first drop draws, and
 * every man in it goes where that bubble goes. A drop that is no call is a
 * group of its own.
 */
function sharedGroupsOf(drops: readonly Drop[]): Map<Drop, readonly Drop[]> {
  const groups = new Map<Drop, Drop[]>();
  const sorted = [...drops].sort(byId);
  for (const drop of sorted) {
    const lead =
      drop.path.preset === undefined
        ? undefined
        : [...groups.keys()].find(
            (other) =>
              other.path.preset === drop.path.preset &&
              Math.abs(other.end.lateralYards - drop.end.lateralYards) <=
                SAME_SPOT_YARDS &&
              Math.abs(other.end.depthYards - drop.end.depthYards) <=
                SAME_SPOT_YARDS,
          );
    if (lead) groups.get(lead)!.push(drop);
    else groups.set(drop, [drop]);
  }
  return groups;
}

function layUnderneath(
  play: ZoneShellPlay,
  drops: readonly Drop[],
): Map<string, MovementPath> {
  const moved = new Map<string, MovementPath>();
  const halfWidth = play.fieldProfile.widthYards / 2;
  const groups = sharedGroupsOf(drops);
  for (const row of rowsOf([...groups.keys()])) {
    for (const [lead, lateralYards] of spreadAcross(row, halfWidth)) {
      for (const drop of groups.get(lead)!) {
        if (Math.abs(lateralYards - drop.end.lateralYards) <= SAME_SPOT_YARDS) {
          continue;
        }
        moved.set(
          drop.path.id,
          landed(drop, { lateralYards, depthYards: drop.end.depthYards }),
        );
      }
    }
  }
  return moved;
}

/**
 * The defense's zones laid out as a shell, at the levels asked for. Lines
 * that are not part of the shell, and drops already where the shell puts
 * them, come back exactly as they were.
 */
export function layoutZoneShell<Play extends ZoneShellPlay>(
  play: Play,
  levels: readonly ZoneShellLevel[] = zoneShellLevels,
): Play {
  // Layout reads the unshaded shell; the editor reapplies each man's saved
  // technique afterwards. Otherwise repeated calls accumulate the same shade.
  const relaid = new Set(
    dropsOf(play)
      .filter((drop) => levels.includes(drop.level))
      .map((drop) => drop.path.id),
  );
  const paths = play.paths.map((path) => {
    if (!relaid.has(path.id) || !path.coverageAdjustment) return path;
    const offset = path.coverageAdjustment;
    const next = {
      ...path,
      points: path.points.map((point, index) =>
        index === path.points.length - 1
          ? {
              ...point,
              lateralYards: point.lateralYards - offset.lateralYards,
              depthYards: point.depthYards - offset.depthYards,
            }
          : point,
      ),
    };
    delete next.coverageAdjustment;
    return next;
  });
  if (paths.some((path, index) => path !== play.paths[index])) {
    play = { ...play, paths };
  }
  const drops = dropsOf(play);
  const at = (level: ZoneShellLevel) =>
    drops.filter((drop) => drop.level === level);
  const moved = new Map([
    ...(levels.includes("deep")
      ? layDeep(play, at("deep"), defensiveFieldOf(play).ballLateralYards)
      : []),
    ...(levels.includes("underneath")
      ? layUnderneath(play, at("underneath"))
      : []),
  ]);
  if (moved.size === 0) return play;
  return {
    ...play,
    paths: play.paths.map((path) => moved.get(path.id) ?? path),
  };
}

/**
 * The shell once a change has been made to it. Only a level whose drops are
 * not the ones it had before is laid out again: calling a hook re-lays the
 * underneath and leaves the deep shell exactly as the Coach left it, and an
 * edit that calls or clears no drop at all changes nothing.
 */
export function settleZoneShell(
  before: PlayDocument,
  after: PlayDocument,
): PlayDocument {
  const membersOf = (play: PlayDocument) => {
    const drops = dropsOf(play);
    return (level: ZoneShellLevel) =>
      drops
        .filter((drop) => drop.level === level)
        .map(({ path }) => path.id)
        .sort()
        .join("\n");
  };
  const was = membersOf(before);
  const is = membersOf(after);
  const changed = zoneShellLevels.filter((level) => was(level) !== is(level));
  return changed.length === 0 ? after : layoutZoneShell(after, changed);
}
