import { canonicalStringify } from "./canonical";
import { defensiveFieldOf } from "./defensive-field";
import { holdInsideSidelines } from "./geometry";
import type {
  AssignmentAction,
  Coordinate,
  MovementPath,
  PlayDocument,
  Player,
} from "./schema";

export const defensiveReadKeys = [
  {
    key: "option",
    name: "Option Read",
    hint: "The give / keep decision at the mesh.",
  },
  {
    key: "pitch",
    name: "Pitch Key",
    hint: "The keep / pitch decision on the perimeter.",
  },
  {
    key: "rpo",
    name: "RPO Read",
    hint: "The run / pass decision against a conflict defender.",
  },
  {
    key: "pass",
    name: "Pass Key",
    hint: "The coverage reaction that guides a pass decision.",
  },
] as const;
export type DefensiveReadKey = (typeof defensiveReadKeys)[number]["key"];
export type ReadPerspective = "offense-key" | "defensive-read";
export const readKeyName = (key: DefensiveReadKey) =>
  defensiveReadKeys.find((choice) => choice.key === key)!.name;

export function defenderCoachingActions(
  play: PlayDocument,
  playerId: string,
): AssignmentAction[] {
  return play.assignments
    .filter((assignment) => assignment.playerId === playerId)
    .flatMap((assignment) => assignment.actions)
    .filter((action) => action.kind === "read" || action.kind === "plaster");
}

/** Concise marks shared by the field and exported diagrams. */
export function defenderCoachingMarks(
  play: PlayDocument,
  player: Player,
): string[] {
  if (player.unit !== "defense") return [];
  const technique = player.defensiveTechnique;
  return [
    ...(technique?.showBlitzFromDepth !== undefined ? ["SHOW BLITZ"] : []),
    ...(technique?.depthShade
      ? [technique.depthShade === "underneath" ? "UNDER" : "OVER"]
      : []),
    ...(technique?.leverage ? [technique.leverage.toUpperCase()] : []),
    ...(technique?.aggressive ? ["AGGRESSIVE"] : []),
    ...defenderCoachingActions(play, player.id).map((action) => {
      if (action.kind === "read") {
        const targetId =
          action.target?.kind === "player" ? action.target.playerId : undefined;
        const target = play.players.find((man) => man.id === targetId);
        return `${action.perspective === "offense-key" ? "O KEY" : "D READ"}: ${readKeyName(action.read).toUpperCase()}${target ? ` → ${target.label || target.role || "player"}` : ""}`;
      }
      return "PLASTER · SCRAMBLE";
    }),
  ];
}

const samePoint = (a: Coordinate, b: Coordinate) =>
  Math.abs(a.lateralYards - b.lateralYards) < 0.0001 &&
  Math.abs(a.depthYards - b.depthYards) < 0.0001;

/** Apply saved coverage techniques once, including to newly called zone drops. */
export function settleDefensiveCoaching(play: PlayDocument): PlayDocument {
  const ball = defensiveFieldOf(play).ballLateralYards;
  const men = new Map(play.players.map((player) => [player.id, player]));
  let changed = false;
  const paths = play.paths.map((path) => {
    const man = men.get(path.playerId);
    if (
      !man ||
      man.unit !== "defense" ||
      path.kind !== "zone" ||
      path.variant === "alternate"
    )
      return path;
    // A man arrow ends at a receiver. Its shade is taught by his technique mark;
    // zone drops can move the ground they defend.
    if (path.style.ending !== "bubble") return path;
    const old = path.coverageAdjustment ?? { lateralYards: 0, depthYards: 0 };
    const technique = man.defensiveTechnique;
    const side = man.position.lateralYards < ball ? -1 : 1;
    const depthYards =
      technique?.depthShade === "underneath"
        ? -3
        : technique?.depthShade === "overtop"
          ? 3
          : 0;
    const lateralYards =
      side *
      (technique?.leverage === "inside"
        ? -1.5
        : technique?.leverage === "outside"
          ? 1.5
          : 0);
    const last = path.points.at(-1)!;
    const base = {
      lateralYards: last.lateralYards - old.lateralYards,
      depthYards: last.depthYards - old.depthYards,
    };
    const wanted = holdInsideSidelines(play.fieldProfile, {
      lateralYards: base.lateralYards + lateralYards,
      depthYards: Math.max(
        1,
        Math.min(
          play.fieldProfile.lengthYards,
          base.depthYards +
            depthYards -
            (technique?.aggressive && path.coverageArea?.type !== "deep"
              ? 1
              : 0),
        ),
      ),
    });
    const offset = {
      lateralYards: wanted.lateralYards - base.lateralYards,
      depthYards: wanted.depthYards - base.depthYards,
    };
    if (samePoint(last, wanted) && samePoint(old, offset)) return path;
    changed = true;
    const next: MovementPath = {
      ...path,
      points: path.points.map((point, i) =>
        i === path.points.length - 1 ? { ...point, ...wanted } : point,
      ),
      coverageAdjustment: offset,
    };
    if (samePoint(offset, { lateralYards: 0, depthYards: 0 }))
      delete next.coverageAdjustment;
    return next;
  });
  let next = changed ? { ...play, paths } : play;
  // A plaster line is a conditional alternative. Its chosen receiver and his
  // route stay connected when either side is moved or redrawn.
  const plasterPaths = new Map<string, MovementPath>();
  for (const assignment of next.assignments) {
    const plaster = assignment.actions.find(
      (action) => action.kind === "plaster",
    );
    const movement = assignment.actions.find(
      (action) => action.kind === "movement",
    );
    if (
      !plaster ||
      plaster.target?.kind !== "player" ||
      movement?.kind !== "movement"
    )
      continue;
    const defender = men.get(assignment.playerId);
    const receiver = men.get(plaster.target.playerId);
    const line = next.paths.find((path) => path.id === movement.pathId);
    if (!defender || !receiver || !line) continue;
    const base = next.paths.find(
      (path) =>
        path.playerId === defender.id &&
        path.id !== line.id &&
        path.variant !== "alternate",
    );
    const route = next.paths.find(
      (path) =>
        path.playerId === receiver.id &&
        path.kind === "route" &&
        path.variant !== "alternate",
    );
    const target = route?.points.at(-1) ?? receiver.position;
    const points = [
      defender.position,
      ...(base ? [base.points.at(-1)!] : []),
      { lateralYards: target.lateralYards, depthYards: target.depthYards },
    ];
    if (canonicalStringify(points) !== canonicalStringify(line.points))
      plasterPaths.set(line.id, { ...line, points });
  }
  if (plasterPaths.size)
    next = {
      ...next,
      paths: next.paths.map((path) => plasterPaths.get(path.id) ?? path),
    };
  return next;
}
