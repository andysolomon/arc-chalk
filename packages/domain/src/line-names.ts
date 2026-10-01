import { stockDefensiveCalls, type DefensiveCall } from "./defense-catalogue";
import { currentDefensiveCall } from "./defenses";
import {
  defensiveFieldOf,
  gapLateralYards,
  gapLetters,
  sideOfBall,
} from "./defensive-field";
import { classifyZoneCoverage } from "./geometry";
import { isManLine } from "./man-coverage";
import { routeCallName } from "./quarterback";
import { linePresetByKey } from "./route-catalogue";
import type { MovementPath, PlayDocument, Player } from "./schema";

/**
 * What a line is called when the Coach has not written anything for it — the
 * words an install sheet prints beside a man, and the name a quick route
 * carries on the field. A line drawn as a call is named for that call; a
 * defender's line is read the way a staff says it: the zone he owns, the man
 * he has, the gap he rushes.
 */

/** The quick call a line was drawn as, while it is still that call. */
export function quickCallName(path: MovementPath): string | undefined {
  if (path.preset === undefined) return undefined;
  if (path.kind === "route") return routeCallName(path.preset);
  return linePresetByKey(path.preset)?.name;
}

/** The original's rush, which names no gap: the line itself has to say which. */
const UNAIMED_RUSH = "blitz";

/** The call the defense was put in, if the catalogue still has it. */
function sourceCall(
  play: PlayDocument,
  calls: readonly DefensiveCall[],
): DefensiveCall | undefined {
  const callId = play.defensiveCallSource?.callId;
  return callId === undefined
    ? undefined
    : calls.find(({ formation }) => formation.id === callId);
}

/**
 * The gap a rush goes through, read where it crosses the line of scrimmage
 * against the field's own gaps (ADR 0064): the nearest one on that side.
 */
function rushGap(play: PlayDocument, path: MovementPath): string {
  const points = path.points;
  let cross = points.at(-1)!.lateralYards;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    if (from.depthYards > 0 && to.depthYards <= 0) {
      const t = from.depthYards / (from.depthYards - to.depthYards);
      cross = from.lateralYards + (to.lateralYards - from.lateralYards) * t;
      break;
    }
  }
  const field = defensiveFieldOf(play);
  const side = sideOfBall(field, cross);
  let nearest = 0;
  gapLetters.forEach((_, index) => {
    const off = (at: number) =>
      Math.abs(gapLateralYards(field, side, at) - cross);
    if (off(index) < off(nearest)) nearest = index;
  });
  return `${gapLetters[nearest]} gap`;
}

/** A drop: a zone line that ends in the ground it owns. */
function isDrop(path: MovementPath): boolean {
  return (
    path.kind === "zone" &&
    path.style.ending === "bubble" &&
    path.variant !== "alternate" &&
    path.points.length > 1
  );
}

function dropType(path: MovementPath) {
  return path.coverageArea?.type ?? classifyZoneCoverage(path.points.at(-1)!);
}

/** The deep field is shared out: one man owns the middle, two halves, … */
const DEEP_SHARES: Readonly<Record<number, string>> = {
  1: "Deep middle",
  2: "Deep 1/2",
  3: "Deep 1/3",
  4: "Deep 1/4",
};

const ZONE_WORDS = {
  curl: "Curl",
  hook: "Hook",
  flat: "Flat",
  spy: "QB spy",
} as const;

/**
 * A drop that is not a quick assignment. A Play saved before the catalogue
 * named its lines (ADR 0064) still remembers the call that drew them, and
 * that call now says what each of its drops is; one it did not draw is named
 * for the ground it owns, and a deep one for its share of the deep shell.
 */
function dropName(
  play: PlayDocument,
  path: MovementPath,
  calls: readonly DefensiveCall[],
): string {
  const slotId = play.defensiveCallSource?.slotBindings.find(
    ({ playerId }) => playerId === path.playerId,
  )?.slotId;
  const called = sourceCall(play, calls)?.assignments.find(
    (assignment) => assignment.slotId === slotId && assignment.kind === "drop",
  )?.preset;
  const name = called === undefined ? undefined : linePresetByKey(called);
  if (name) return name.name;
  const type = dropType(path);
  if (type !== "deep") return ZONE_WORDS[type];
  const deep = play.paths.filter(
    (line) => isDrop(line) && dropType(line) === "deep",
  ).length;
  return DEEP_SHARES[deep] ?? "Deep";
}

/** How far a quarterback has to travel across to be moving the pocket. */
const BOOT_YARDS = 4;

/** The quarterback's own line: straight back, or away across the field. */
function quarterbackName(
  player: Player,
  path: MovementPath,
): string | undefined {
  const end = path.points.at(-1)!;
  const across = end.lateralYards - player.position.lateralYards;
  const back = player.position.depthYards - end.depthYards;
  if (Math.abs(across) >= BOOT_YARDS && back > -1) {
    return `Boot ${across < 0 ? "left" : "right"}`;
  }
  return back > 0.5 ? "Drop" : undefined;
}

/**
 * What to call one of a man's lines when nothing is written for it, or
 * undefined when it is only a shape. `role` is the offensive position he was
 * read as, which is what tells a quarterback's drop from a route.
 */
export function lineCallName(
  play: PlayDocument,
  path: MovementPath,
  options: {
    readonly role?: string;
    readonly calls?: readonly DefensiveCall[];
  } = {},
): string | undefined {
  const calls = options.calls ?? stockDefensiveCalls;
  if (isManLine(path)) {
    const man = play.players.find(({ id }) => id === path.covers?.playerId);
    return man?.label.trim() ? `Man on ${man.label.trim()}` : "Man";
  }
  if (
    path.kind === "blitz" &&
    (path.preset === undefined || path.preset === UNAIMED_RUSH)
  ) {
    return `${rushGap(play, path)} blitz`;
  }
  const called = quickCallName(path);
  if (called) return called;
  if (isDrop(path)) return dropName(play, path, calls);
  if (path.kind === "stunt") return "Stunt";
  if (path.kind === "block") return "Block";
  if (path.kind === "zone") return "Zone drop";
  const player = play.players.find(({ id }) => id === path.playerId);
  if (path.kind === "route" && options.role === "QB" && player) {
    return quarterbackName(player, path);
  }
  return undefined;
}

/**
 * The call the defense is in, by the catalogue: the one it was put in while
 * any man it placed is still there — a defender moved a yard is still
 * playing that call, and two calls can stand their men alike — else the one
 * standing on the field.
 */
export function defensiveCallOf(
  play: PlayDocument,
  calls: readonly DefensiveCall[] = stockDefensiveCalls,
): DefensiveCall | undefined {
  const call = sourceCall(play, calls);
  const placed = new Set(
    (play.defensiveCallSource?.slotBindings ?? []).map(
      ({ playerId }) => playerId,
    ),
  );
  if (call && play.players.some(({ id }) => placed.has(id))) return call;
  return currentDefensiveCall(play, calls);
}

/**
 * What the defense is called, for a picker or a printed footer: the call it
 * is standing in, on whichever hash — or, once a man has been moved by hand,
 * a custom front that still says which call it came from, so the Coach knows
 * which front and coverage his variant is a variant of.
 */
export function defensiveCallName(
  play: PlayDocument,
  calls: readonly DefensiveCall[] = stockDefensiveCalls,
): string {
  const standing = currentDefensiveCall(play, calls);
  if (standing) return standing.formation.name;
  const source = defensiveCallOf(play, calls);
  return source ? `Custom · from ${source.formation.name}` : "Custom front";
}

/** A defense's personnel is its front's: base, or extra backs for nickel and dime. */
export function defensivePersonnel(call: DefensiveCall): string {
  if (call.front === "Nickel" || call.front === "Dime") return call.front;
  return "Base";
}
