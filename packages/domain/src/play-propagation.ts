import { applyPlayCommand } from "./commands";
import { assignRoles, offensivePlayers } from "./formations";
import type {
  MovementPath,
  PlayCommand,
  PlayDocument,
  Player,
  PrimitivePlayCommand,
} from "./schema";

const ROLE_WORD: Readonly<Record<string, string>> = Object.freeze({
  QB: "Q",
  RB: "F",
  TE: "Y",
  H: "H",
  X: "X",
  Z: "Z",
});

export interface RouteMatch {
  readonly roleKey: string;
  readonly pathIndex: number;
}

export type PropagationResult =
  | { readonly ok: true; readonly play: PlayDocument }
  | { readonly ok: false; readonly reason: string };

export interface BroadcastReport {
  readonly applied: number;
  readonly total: number;
  readonly skipped: readonly string[];
}

export function roleWord(roleKey: string): string {
  const role = roleKey.replace(/^[od]:/, "").split(":")[0] ?? roleKey;
  return ROLE_WORD[role] ?? role;
}

/**
 * Propagation matches by role first — the thing that survives a realignment —
 * then by the route's index within that man.
 */
export function playRoleMap(
  play: PlayDocument,
): Readonly<Record<string, string>> {
  const map: Record<string, string> = {};
  const offense = offensivePlayers(play);
  const roles = assignRoles(offense);
  offense.forEach((player, index) => {
    map[player.id] = `o:${roles[index] ?? `x${index}`}`;
  });
  for (const player of play.players.filter(
    ({ unit }) => unit === "defense",
  )) {
    const side =
      player.position.lateralYards < -1
        ? "L"
        : player.position.lateralYards > 1
          ? "R"
          : "M";
    map[player.id] = `d:${(player.label || "?").toUpperCase()}:${side}`;
  }
  return map;
}

export function playerByRole(
  play: PlayDocument,
  roleKey: string,
): Player | undefined {
  const map = playRoleMap(play);
  const playerId = Object.keys(map).find((id) => map[id] === roleKey);
  return playerId
    ? play.players.find((player) => player.id === playerId)
    : undefined;
}

export function routeSignature(
  play: PlayDocument,
  path: MovementPath,
): RouteMatch | undefined {
  const roleKey = playRoleMap(play)[path.playerId];
  if (!roleKey) return undefined;
  const siblings = play.paths.filter(
    (candidate) => candidate.playerId === path.playerId,
  );
  return {
    roleKey,
    pathIndex: Math.max(0, siblings.findIndex(({ id }) => id === path.id)),
  };
}

export function matchRoute(
  play: PlayDocument,
  signature: RouteMatch,
):
  | { readonly path: MovementPath; readonly player: Player }
  | { readonly reason: string } {
  const player = playerByRole(play, signature.roleKey);
  const word = roleWord(signature.roleKey);
  if (!player) return { reason: `has no ${word} on the field` };
  const path = play.paths.filter(
    (candidate) => candidate.playerId === player.id,
  )[signature.pathIndex];
  if (!path) return { reason: `has no ${word} route` };
  return { path, player };
}

export function commandBroadcasts(command: PlayCommand): boolean {
  if (command.kind === "batch") {
    return command.commands.some((step) => commandBroadcasts(step));
  }
  return (
    command.kind === "update-path" ||
    command.kind === "insert-paths" ||
    command.kind === "update-assignment" ||
    command.kind === "insert-assignments" ||
    command.kind === "remove-assignments" ||
    command.kind === "set-play-name"
  );
}

export function propagateCommand(
  source: PlayDocument,
  target: PlayDocument,
  command: PlayCommand,
): PropagationResult {
  if (command.kind === "batch") {
    let play = target;
    for (const step of command.commands) {
      const result = propagateCommand(source, play, step);
      if (!result.ok) return result;
      play = result.play;
    }
    return { ok: true, play };
  }
  if (command.kind === "set-play-name") {
    return { ok: true, play: target };
  }
  if (command.kind === "update-path") {
    return propagatePath(source, target, command.path.id, command.path);
  }
  if (command.kind === "update-assignment") {
    return propagateAssignment(source, target, command);
  }
  if (command.kind === "insert-assignments") {
    let play = target;
    for (const { item } of command.assignments) {
      const path = source.paths.find((candidate) =>
        item.actions.some(
          (action) => action.kind === "movement" && action.pathId === candidate.id,
        ),
      );
      if (!path) continue;
      const signature = routeSignature(source, path);
      if (!signature) continue;
      const matched = matchRoute(play, signature);
      if ("reason" in matched) return { ok: false, reason: matched.reason };
      const existing = play.assignments.find(
        (assignment) =>
          assignment.playerId === matched.player.id &&
          assignment.actions.some(
            (action) =>
              action.kind === "movement" && action.pathId === matched.path.id,
          ),
      );
      play = applyPlayCommand(
        play,
        existing
          ? {
              kind: "update-assignment",
              assignment: {
                ...existing,
                text: item.text,
              },
            }
          : {
              kind: "insert-assignments",
              assignments: [
                {
                  index: play.assignments.length,
                  item: {
                    ...item,
                    id: `${item.id}_${play.id}`,
                    playerId: matched.player.id,
                    actions: item.actions.map((action) =>
                      action.kind === "movement"
                        ? { ...action, pathId: matched.path.id }
                        : action,
                    ),
                  },
                },
              ],
            },
      );
    }
    return { ok: true, play };
  }
  if (command.kind === "remove-assignments") {
    return { ok: true, play: target };
  }
  if (command.kind === "insert-paths") {
    return { ok: true, play: target };
  }
  return { ok: true, play: target };
}

function propagatePath(
  source: PlayDocument,
  target: PlayDocument,
  pathId: string,
  next: MovementPath,
): PropagationResult {
  const sourcePath = source.paths.find((path) => path.id === pathId) ?? next;
  const signature = routeSignature(source, sourcePath);
  if (!signature) return { ok: false, reason: "has no matching route" };
  const matched = matchRoute(target, signature);
  if ("reason" in matched) return { ok: false, reason: matched.reason };
  const reshape =
    next.preset !== matched.path.preset ||
    next.points.length !== matched.path.points.length;
  const play = applyPlayCommand(target, {
    kind: "update-path",
    path: {
      ...matched.path,
      kind: next.kind,
      style: next.style,
      ...(next.variant === undefined ? {} : { variant: next.variant }),
      ...(next.coverageArea === undefined
        ? {}
        : { coverageArea: next.coverageArea }),
      ...(next.readOrder === undefined ? {} : { readOrder: next.readOrder }),
      ...(next.conversion === undefined
        ? {}
        : { conversion: next.conversion }),
      ...(next.coachingNote === undefined
        ? {}
        : { coachingNote: next.coachingNote }),
      ...(next.preset === undefined ? {} : { preset: next.preset }),
      ...(next.concept === undefined ? {} : { concept: next.concept }),
      ...(reshape
        ? { points: next.points, branches: next.branches }
        : {}),
    },
  } satisfies PrimitivePlayCommand);
  return { ok: true, play };
}

function propagateAssignment(
  source: PlayDocument,
  target: PlayDocument,
  command: Extract<PlayCommand, { kind: "update-assignment" }>,
): PropagationResult {
  const pathId = command.assignment.actions.find(
    (action) => action.kind === "movement",
  )?.pathId;
  const path = pathId
    ? source.paths.find((candidate) => candidate.id === pathId)
    : undefined;
  if (!path) return { ok: true, play: target };
  const signature = routeSignature(source, path);
  if (!signature) return { ok: true, play: target };
  const matched = matchRoute(target, signature);
  if ("reason" in matched) return { ok: false, reason: matched.reason };
  const existing = target.assignments.find(
    (assignment) =>
      assignment.playerId === matched.player.id &&
      assignment.actions.some(
        (action) =>
          action.kind === "movement" && action.pathId === matched.path.id,
      ),
  );
  if (!existing) return { ok: true, play: target };
  return {
    ok: true,
    play: applyPlayCommand(target, {
      kind: "update-assignment",
      assignment: { ...existing, text: command.assignment.text },
    }),
  };
}

/**
 * Every variation takes the concept's spots for the men it shares, and keeps
 * its own routes attached.
 */
export function pushAlignmentToPlay(
  source: PlayDocument,
  target: PlayDocument,
): PropagationResult {
  const sourceMap = playRoleMap(source);
  let moved = 0;
  let play = target;
  for (const player of offensivePlayers(source)) {
    const roleKey = sourceMap[player.id];
    if (!roleKey) continue;
    const targetPlayer = playerByRole(play, roleKey);
    if (!targetPlayer) continue;
    const lateral =
      player.position.lateralYards - targetPlayer.position.lateralYards;
    const depth = player.position.depthYards - targetPlayer.position.depthYards;
    moved += 1;
    if (
      lateral === 0 &&
      depth === 0 &&
      targetPlayer.label === player.label &&
      targetPlayer.symbol === player.symbol
    ) {
      continue;
    }
    play = applyPlayCommand(play, {
      kind: "update-player",
      player: {
        ...targetPlayer,
        position: player.position,
        label: player.label,
        symbol: player.symbol,
        fill: player.fill,
      },
    });
    if (lateral === 0 && depth === 0) continue;
    for (const path of play.paths) {
      if (path.playerId !== targetPlayer.id) continue;
      const shift = (point: MovementPath["points"][number]) => ({
        ...point,
        lateralYards: point.lateralYards + lateral,
        depthYards: point.depthYards + depth,
        ...(point.control
          ? {
              control: {
                lateralYards: point.control.lateralYards + lateral,
                depthYards: point.control.depthYards + depth,
              },
            }
          : {}),
      });
      play = applyPlayCommand(play, {
        kind: "update-path",
        path: {
          ...path,
          points: path.points.map(shift),
          branches: path.branches.map((branch) => ({
            ...branch,
            points: branch.points.map(shift),
          })),
        },
      });
    }
  }
  if (!moved) {
    return { ok: false, reason: "shares no man with the concept" };
  }
  return { ok: true, play };
}

export function broadcastReport(
  applied: number,
  total: number,
  skipped: readonly string[],
): BroadcastReport {
  return { applied, total, skipped };
}

export function formatBroadcastReport(report: BroadcastReport): string {
  let message = `Applied to ${report.applied} of ${report.total}`;
  if (report.skipped[0]) {
    message += ` — ${report.skipped[0]}`;
    if (report.skipped.length > 1) {
      message += `, +${report.skipped.length - 1} more`;
    }
  }
  return message;
}
