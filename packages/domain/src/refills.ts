import { defensiveLineKinds, routeKindStyle } from "./classifications";
import {
  coverageCallOf,
  coverageGroundsOf,
  coverageJobsOf,
  coverageMenOf,
  groundOfLine,
} from "./coverage-calls";
import {
  defensiveFieldOf,
  sideOfBall,
  type DefensiveField,
} from "./defensive-field";
import { defensivePositions } from "./positions";
import { linePresetByKey } from "./route-catalogue";
import type { Coordinate, MovementPath, PlayDocument, Player } from "./schema";
import { frontJobOf, frontMenOf } from "./unit-calls";
import { deepCallLandmark } from "./zone-shell";

/**
 * A zone left open is refilled in the same step (ADR 0075, issue #190). The
 * coverage gives its jobs as if every man it is put on drops; a man who is
 * sent, or given his own call out of his zone, leaves that zone open, and
 * the nearest man who can take it does:
 *
 * - an open deep zone goes to the nearest defensive back playing a zone the
 *   coverage gave him underneath — he rotates up, and the zone he left is
 *   open in turn; a man in man stays on his man;
 * - an open underneath zone goes to the nearest man on the front on its side
 *   (either side, for one over the ball), who stops rushing: the zone blitz;
 * - a man with his own call is never moved, each man fills one zone at most,
 *   and a zone nobody can take stays open, for the roster to name.
 *
 * "Nearest" is measured from where he stands to where the zone is. When there
 * are fewer men than zones, as many as can be are filled; among the ways of
 * doing that, the one with the least ground to cover; and between two that
 * cover the same ground, the one that reaches first for the man on the left,
 * so the same man drops whatever order the men are stored in.
 *
 * A man who fills a zone carries the coverage's line to it, marked with the
 * man whose zone it was (`fills`), so the shell lays it on that man's ground.
 * When the zone is his no longer, a man off the front goes back to what the
 * front gives him, and a defensive back to the coverage's job for him.
 */

const DEEP_JOBS: ReadonlySet<string> = new Set([
  "deep3",
  "mid3",
  "deep2",
  "quarter",
]);

/** A landmark this close to the ball is over it, and on neither side. */
const OVER_THE_BALL_YARDS = 0.5;

/** Two costs this close are the same. */
const SAME_COST = 1e-9;

type Standing = "coverage" | "own" | "sent" | "none";

/**
 * Where a defender stands with the unit calls: playing what a unit call gave
 * him, his own call, sent by the linebackers' call, or with nothing at all.
 */
function standingOf(
  play: Pick<PlayDocument, "paths">,
  playerId: string,
): { readonly standing: Standing; readonly ownPreset?: string } {
  const lines = play.paths.filter(
    (path) => path.playerId === playerId && defensiveLineKinds.has(path.kind),
  );
  const own = lines.find(({ unitCall }) => unitCall === undefined);
  if (own) {
    return {
      standing: "own",
      ...(own.preset === undefined ? {} : { ownPreset: own.preset }),
    };
  }
  if (lines.some(({ unitCall }) => unitCall === "linebackers")) {
    return { standing: "sent" };
  }
  return { standing: lines.length > 0 ? "coverage" : "none" };
}

/** What the plan reads of a Play. */
type RefillPlay = Pick<
  PlayDocument,
  "players" | "paths" | "fieldProfile" | "unitCalls"
>;

/** A zone the coverage gave a man, where it is, and which side it is on. */
interface Zone {
  readonly man: Player;
  readonly job: string;
  readonly landmark: Coordinate;
  /** Undefined for a zone over the ball, which either side can take. */
  readonly side?: -1 | 1;
}

function zoneOf(
  man: Player,
  job: string,
  field: DefensiveField,
  widthYards: number,
): Zone | undefined {
  if (DEEP_JOBS.has(job)) {
    const landmark = deepCallLandmark(
      job,
      man.position,
      field.ballLateralYards,
      widthYards,
    );
    return landmark ? { man, job, landmark } : undefined;
  }
  const preset = linePresetByKey(job);
  if (!preset?.area || preset.style.ending !== "bubble") return undefined;
  const landmark = preset.pointsFrom(man.position, field).at(-1)!;
  const off = landmark.lateralYards - field.ballLateralYards;
  return {
    man,
    job,
    landmark,
    ...(Math.abs(off) <= OVER_THE_BALL_YARDS ? {} : { side: off < 0 ? -1 : 1 }),
  };
}

/** The ground a job covers from this stance, when it is one a coverage counts. */
function groundIdOf(
  job: string,
  stance: Coordinate,
  field: DefensiveField,
): string | undefined {
  return groundOfLine(
    {
      id: "",
      kind: "zone",
      playerId: "",
      points: [stance],
      branches: [],
      style: { line: "dashed", ending: "bubble", color: "blue" },
      preset: job,
    },
    stance,
    field,
  );
}

const distance = (from: Coordinate, to: Coordinate) =>
  Math.hypot(
    from.lateralYards - to.lateralYards,
    from.depthYards - to.depthYards,
  );

const leftToRight = (left: Player, right: Player) =>
  left.position.lateralYards - right.position.lateralYards ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

/**
 * Who takes which zone: as many filled as can be, then the least ground
 * covered, then the first way found with the zones and the men each taken
 * left to right — so a tie always goes the same way.
 */
function matched(
  zones: readonly Zone[],
  men: readonly Player[],
  can: (zone: Zone, man: Player) => boolean,
): Map<Zone, Player> {
  const ordered = [...zones].sort((left, right) =>
    leftToRight(left.man, right.man),
  );
  const candidates = [...men].sort(leftToRight);
  let best: { unfilled: number; cost: number; pairs: [Zone, Player][] } = {
    unfilled: Infinity,
    cost: Infinity,
    pairs: [],
  };
  const taken = new Set<string>();
  const pairs: [Zone, Player][] = [];
  const visit = (index: number, unfilled: number, cost: number) => {
    if (index === ordered.length) {
      const better =
        unfilled < best.unfilled ||
        (unfilled === best.unfilled && cost < best.cost - SAME_COST);
      if (better) best = { unfilled, cost, pairs: [...pairs] };
      return;
    }
    const zone = ordered[index]!;
    for (const man of candidates) {
      if (taken.has(man.id) || !can(zone, man)) continue;
      taken.add(man.id);
      pairs.push([zone, man]);
      visit(index + 1, unfilled, cost + distance(man.position, zone.landmark));
      pairs.pop();
      taken.delete(man.id);
    }
    visit(index + 1, unfilled + 1, cost);
  };
  visit(0, 0, 0);
  return new Map(best.pairs);
}

/** Which man takes which open zone, and the open zones nobody can take. */
export interface RefillPlan {
  /** The man whose zone was left, by id, and the man who took it over. */
  readonly fills: ReadonlyMap<string, string>;
  /** The zones nobody could take: whose they were, and the job they were. */
  readonly unfilled: readonly { readonly man: Player; readonly job: string }[];
}

const NO_PLAN: RefillPlan = Object.freeze({ fills: new Map(), unfilled: [] });

/** The refills the Play's coverage asks for, as it stands now. */
export function refillPlanOf(play: RefillPlay): RefillPlan {
  const coverage = coverageCallOf(play);
  if (!coverage) return NO_PLAN;
  const field = defensiveFieldOf(play);
  const width = play.fieldProfile.widthYards;
  const jobs = coverageJobsOf(play, coverage.key);
  const men = coverageMenOf(play);
  const defense = play.players.filter(({ unit }) => unit === "defense");
  const positions = defensivePositions(play);
  const secondary = new Set(
    defense
      .filter((_, index) => positions[index]?.group === "secondary")
      .map(({ id }) => id),
  );

  // The ground other men already stand in, whoever called them there; a
  // refill is worked out afresh, so a filler's own line does not count.
  const stances = new Map(defense.map(({ id, position }) => [id, position]));
  const heldBy = new Map<string, string>();
  for (const path of play.paths) {
    const stance = stances.get(path.playerId);
    if (!stance || path.fills !== undefined) continue;
    const ground = groundOfLine(path, stance, field);
    if (ground && !heldBy.has(ground)) heldBy.set(ground, path.playerId);
  }

  // The zones the coverage gave men who are no longer in them.
  const open: Zone[] = [];
  const free: Player[] = [];
  for (const man of men) {
    const job = jobs.get(man.id);
    const { standing, ownPreset } = standingOf(play, man.id);
    if (standing === "coverage") {
      free.push(man);
      continue;
    }
    // A man whose lines were cleared has gone nowhere: what was cleared stays
    // cleared, and the roster names his ground open instead.
    if (standing === "none") continue;
    if (!job || (standing === "own" && ownPreset === job)) continue;
    const ground = groundIdOf(job, man.position, field);
    const holder = ground === undefined ? undefined : heldBy.get(ground);
    if (holder !== undefined && holder !== man.id) continue;
    const zone = zoneOf(man, job, field, width);
    if (zone) open.push(zone);
  }

  // Deep first: a defensive back who rotates up leaves a zone of his own. A
  // man in man stays on his man, so only a back playing a zone underneath
  // rotates.
  const backs = free.filter(({ id }) => {
    const job = jobs.get(id);
    return (
      secondary.has(id) &&
      job !== undefined &&
      job !== "man" &&
      !DEEP_JOBS.has(job)
    );
  });
  const deep = matched(
    open.filter(({ job }) => DEEP_JOBS.has(job)),
    backs,
    () => true,
  );
  const underneath = open.filter(({ job }) => !DEEP_JOBS.has(job));
  for (const back of deep.values()) {
    const zone = zoneOf(back, jobs.get(back.id) ?? "", field, width);
    if (zone) underneath.push(zone);
  }
  const front = frontMenOf(play).filter(
    ({ id }) => standingOf(play, id).standing !== "own",
  );
  const under = matched(
    underneath,
    front,
    (zone, man) =>
      zone.side === undefined ||
      sideOfBall(field, man.position.lateralYards) === zone.side,
  );

  const fills = new Map<string, string>();
  for (const [zone, man] of [...deep, ...under]) fills.set(zone.man.id, man.id);
  const unfilled = [
    ...open.filter(({ job }) => DEEP_JOBS.has(job)),
    ...underneath,
  ]
    .filter(({ man }) => !fills.has(man.id))
    .map(({ man, job }) => ({ man, job }));
  return { fills, unfilled };
}

/** A line drawn as a quick assignment, from the man's stance. */
function presetLine(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
  id: string,
  owner: Player,
  job: string,
  unitCall: NonNullable<MovementPath["unitCall"]>,
  from: Player = owner,
  fills?: string,
): MovementPath | undefined {
  const preset = linePresetByKey(job);
  if (!preset || preset.kind === "block") return undefined;
  const field = defensiveFieldOf(play);
  const aimed = DEEP_JOBS.has(job)
    ? [
        deepCallLandmark(
          job,
          from.position,
          field.ballLateralYards,
          play.fieldProfile.widthYards,
        )!,
      ]
    : preset.pointsFrom(from.position, field).slice(1);
  return {
    id,
    kind: preset.kind,
    playerId: owner.id,
    points: [owner.position, ...aimed],
    branches: [],
    style: {
      ...routeKindStyle(preset.kind, {
        line: preset.style.line,
        ending: preset.style.ending,
        color: "blue",
      }),
      line: preset.style.line,
      ending: preset.style.ending,
    },
    ...(preset.area
      ? {
          coverageArea: {
            type: preset.area.type,
            radiusLateralYards: preset.area.radiusLateralYards,
            radiusDepthYards: preset.area.radiusDepthYards,
          },
        }
      : {}),
    preset: job,
    unitCall,
    ...(fills === undefined ? {} : { fills }),
  };
}

/**
 * What decides the refills, but for where the men stand: the coverage, each
 * defender's letter and whether he plays a unit call's job, his own call (and
 * which), is sent, or has nothing. When none of that is different between
 * two versions of a Play, nobody is refilled again — so dragging a man, or
 * anything else that changes nobody's call, never swaps who drops.
 */
function refillSignature(play: PlayDocument): string {
  return [
    play.unitCalls?.coverage ?? "",
    ...play.players
      .filter(({ unit }) => unit === "defense")
      .map((player) => {
        const { standing, ownPreset } = standingOf(play, player.id);
        return `${player.id}:${player.label}:${standing}:${ownPreset ?? ""}`;
      })
      .sort(),
  ].join("\n");
}

/**
 * The Play with its refills settled: every open zone that can be taken,
 * taken by the man the plan names, and every man who filled a zone that is
 * not open any more given back what his unit asks of him. Nothing happens
 * unless the edit from `before` changed the coverage, a defender's letter,
 * or whether one plays a unit call's job, his own call, is sent or has
 * nothing; with no `before`, the Play is settled as it stands.
 */
export function settleRefills(
  before: PlayDocument | undefined,
  after: PlayDocument,
): PlayDocument {
  if (before && refillSignature(before) === refillSignature(after)) {
    return after;
  }
  const players = new Map(after.players.map((player) => [player.id, player]));
  const coverage = coverageCallOf(after);
  const plan = refillPlanOf(after);
  const fillerOf = new Map([...plan.fills].map(([man, by]) => [by, man]));
  const jobs = coverage ? coverageJobsOf(after, coverage.key) : undefined;
  const front = new Set(frontMenOf(after).map(({ id }) => id));
  const hadFills = new Set(
    (before?.paths ?? [])
      .filter(({ fills }) => fills !== undefined)
      .map(({ playerId }) => playerId),
  );

  const replacing = new Map<string, MovementPath | null>();
  for (const player of after.players) {
    if (player.unit !== "defense") continue;
    const lines = after.paths.filter(
      (path) =>
        path.playerId === player.id && defensiveLineKinds.has(path.kind),
    );
    const filling = fillerOf.get(player.id);
    if (filling !== undefined) {
      const man = players.get(filling)!;
      const job = jobs!.get(filling)!;
      const already =
        lines.length === 1 &&
        lines[0]!.fills === filling &&
        lines[0]!.preset === job;
      if (!already) {
        replacing.set(
          player.id,
          presetLine(
            after,
            `${player.id}-fills-${filling}`,
            player,
            job,
            "coverage",
            man,
            filling,
          ) ?? null,
        );
      }
      continue;
    }
    const wasFilling = lines.some(({ fills }) => fills !== undefined);
    // A man off the front whose filler's line went with the coverage it
    // came from has nothing left; he is given back to the front as well.
    const lostFill =
      lines.length === 0 && hadFills.has(player.id) && front.has(player.id);
    if (!wasFilling && !lostFill) continue;
    const unitCall = front.has(player.id) ? "front" : "coverage";
    const job = front.has(player.id)
      ? frontJobOf(after, player.id)
      : jobs?.get(player.id);
    replacing.set(
      player.id,
      job === undefined
        ? null
        : (presetLine(
            after,
            `${player.id}-${unitCall}-${job}`,
            player,
            job,
            unitCall,
          ) ?? null),
    );
  }
  if (replacing.size === 0) return after;

  const paths = after.paths.filter(
    (path) =>
      !(replacing.has(path.playerId) && defensiveLineKinds.has(path.kind)),
  );
  for (const line of replacing.values()) if (line) paths.push(line);
  return { ...after, paths };
}

/** What the roster calls a hook nobody is left to take. */
function hookName(zone: Zone | undefined, field: DefensiveField): string {
  if (!zone) return "Hook";
  const off = zone.landmark.lateralYards - field.ballLateralYards;
  return Math.abs(off) <= OVER_THE_BALL_YARDS
    ? "Hook middle"
    : off < 0
      ? "Hook left"
      : "Hook right";
}

/**
 * The zones the Play's coverage plays that nobody is in (ADR 0075): the deep
 * zones and curl/flats the defense has nobody to give, and every zone a man
 * left that nobody can take — a hook among them, though a hook the coverage
 * gave nobody is never open. Empty when the Play has no coverage this version
 * knows.
 */
export function openZonesOf(play: RefillPlay): readonly string[] {
  const coverage = coverageCallOf(play);
  if (!coverage) return [];
  const field = defensiveFieldOf(play);
  const width = play.fieldProfile.widthYards;
  const grounds = coverageGroundsOf(coverage.key, play);
  const defenders = new Map(
    play.players
      .filter(({ unit }) => unit === "defense")
      .map((player) => [player.id, player]),
  );
  const held = new Set(
    play.paths.flatMap((path) => {
      const owner = defenders.get(path.playerId);
      const ground =
        (path.fills === undefined ? undefined : defenders.get(path.fills)) ??
        owner;
      const id = ground && groundOfLine(path, ground.position, field);
      return id ? [id] : [];
    }),
  );
  const names = grounds
    .filter(({ id }) => !held.has(id))
    .map(({ name }) => name);
  for (const { man, job } of refillPlanOf(play).unfilled) {
    const ground = groundIdOf(job, man.position, field);
    const name =
      job === "hook"
        ? hookName(zoneOf(man, job, field, width), field)
        : grounds.find(({ id }) => id === ground)?.name;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}
