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
 * A defense's zones are one shell rather than a drop per man: where a bubble
 * sits depends on who else is dropping at its level. The deep defenders share
 * the width of the field, so one deep man owns the middle of it, two split it
 * in halves, three in thirds and four in quarters, all at one depth.
 * Underneath, each bubble stays where it was called to unless it would sit on
 * a neighbour's, and then the two are slid apart until they meet at a seam.
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

interface Drop {
  readonly path: MovementPath;
  readonly level: ZoneShellLevel;
  readonly stance: Coordinate;
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
function dropsOf(play: PlayDocument): readonly Drop[] {
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
    return level ? [{ path, level, stance, end, area }] : [];
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
 * The deep shell. The deep defenders take the field's width in equal shares,
 * left to right in the order they line up, each bubble as wide as its share
 * less the seam — though never wider than a zone can be sized, so a lone deep
 * man owns the middle of the field rather than all of it. They settle at one
 * depth, so the shell reads as one line of coverage.
 */
function layDeep(
  play: PlayDocument,
  drops: readonly Drop[],
): Map<string, MovementPath> {
  const moved = new Map<string, MovementPath>();
  if (drops.length === 0) return moved;
  const width = play.fieldProfile.widthYards;
  const ordered = [...drops].sort(
    (left, right) =>
      left.stance.lateralYards - right.stance.lateralYards ||
      left.end.lateralYards - right.end.lateralYards ||
      byId(left, right),
  );
  const share = width / ordered.length;
  const bounds = ZONE_COVERAGE_RADIUS_BOUNDS.lateralYards;
  const radiusLateralYards = Math.max(
    bounds.min,
    Math.min(bounds.max, share / 2 - ZONE_SEAM_YARDS / 2),
  );
  const deepest = Math.max(...ordered.map(({ stance }) => stance.depthYards));
  const depthYards = Math.max(
    DEEP_ZONE_DEPTH_YARDS,
    deepest + DEEP_CUSHION_YARDS,
  );
  ordered.forEach((drop, index) => {
    const center = {
      lateralYards: -width / 2 + (index + 0.5) * share,
      depthYards,
    };
    const unchanged =
      drop.path.coverageArea !== undefined &&
      Math.abs(drop.end.lateralYards - center.lateralYards) <=
        SAME_SPOT_YARDS &&
      Math.abs(drop.end.depthYards - center.depthYards) <= SAME_SPOT_YARDS &&
      Math.abs(drop.area.radiusLateralYards - radiusLateralYards) <=
        SAME_SPOT_YARDS;
    if (unchanged) return;
    moved.set(
      drop.path.id,
      landed(drop, center, { ...drop.area, radiusLateralYards }),
    );
  });
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

function layUnderneath(
  play: PlayDocument,
  drops: readonly Drop[],
): Map<string, MovementPath> {
  const moved = new Map<string, MovementPath>();
  const halfWidth = play.fieldProfile.widthYards / 2;
  for (const row of rowsOf(drops)) {
    for (const [drop, lateralYards] of spreadAcross(row, halfWidth)) {
      if (Math.abs(lateralYards - drop.end.lateralYards) <= SAME_SPOT_YARDS) {
        continue;
      }
      moved.set(
        drop.path.id,
        landed(drop, { lateralYards, depthYards: drop.end.depthYards }),
      );
    }
  }
  return moved;
}

/**
 * The defense's zones laid out as a shell, at the levels asked for. Lines
 * that are not part of the shell, and drops already where the shell puts
 * them, come back exactly as they were.
 */
export function layoutZoneShell(
  play: PlayDocument,
  levels: readonly ZoneShellLevel[] = zoneShellLevels,
): PlayDocument {
  const drops = dropsOf(play);
  const at = (level: ZoneShellLevel) =>
    drops.filter((drop) => drop.level === level);
  const moved = new Map([
    ...(levels.includes("deep") ? layDeep(play, at("deep")) : []),
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
