import {
  applyPlayCommand,
  ballPosition,
  coverableReceivers,
  coverageCallByKey,
  coverageJobsOf,
  deletePathsCommand,
  diffPlayDocuments,
  isLineman,
  type PlayCommand,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { applyCoverageCallCommand, buildMoveCommand } from "./commands";

/** A football action is offered only when every selected player can take it. */
export function selectionAssignmentOptions(
  document: PlayDocument,
  ids: readonly string[],
) {
  const men = document.players.filter(({ id }) => ids.includes(id));
  const receivers = new Set(
    coverableReceivers(document)
      .filter(
        ({ kind, player }) =>
          kind !== "back" || player.groupDesignation?.kind === "trips",
      )
      .map(({ player }) => player.id),
  );
  const coverageJobs = coverageJobsOf(document, "cover2man");
  return {
    trips: men.length === 3 && men.every(({ id }) => receivers.has(id)),
    doubleTeam:
      men.length === 2 &&
      men.every((man) => man.unit === "offense" && isLineman(man)),
    coverage: men.length >= 2 && men.every((man) => coverageJobs.has(man.id)),
  };
}

function designate(
  document: PlayDocument,
  ids: readonly string[],
  kind: NonNullable<Player["groupDesignation"]>["kind"],
  name: string,
  createId: (prefix: string) => string,
  order?: readonly string[],
): PlayDocument {
  const group = createId("group");
  // Reassigning part of an old group retires that designation for all its men.
  const oldGroups = new Set(
    document.players
      .filter((man) => ids.includes(man.id))
      .map((man) => man.group)
      .filter(Boolean),
  );
  return {
    ...document,
    players: document.players.map((man) => {
      const clean = { ...man };
      if (man.group && oldGroups.has(man.group)) {
        delete clean.group;
        delete clean.groupDesignation;
      }
      return ids.includes(man.id)
        ? {
            ...clean,
            group,
            groupDesignation: {
              kind,
              name,
              ...(order ? { order: order.indexOf(man.id) + 1 } : {}),
            },
          }
        : clean;
    }),
  };
}

/** Outside to inside is persisted by stance and by the number on each man. */
export function tripsSelectionCommand(
  document: PlayDocument,
  ids: readonly string[],
  side: "left" | "right",
  createId: (prefix: string) => string,
  orderedIds?: readonly string[],
): PlayCommand | undefined {
  if (!selectionAssignmentOptions(document, ids).trips) return undefined;
  const ball = ballPosition(document).lateralYards;
  const men = document.players.filter(({ id }) => ids.includes(id));
  const order =
    orderedIds ??
    [...men]
      .sort((a, b) => {
        const numbered =
          (a.groupDesignation?.order ?? 0) - (b.groupDesignation?.order ?? 0);
        return (
          numbered ||
          Math.abs(b.position.lateralYards - ball) -
            Math.abs(a.position.lateralYards - ball)
        );
      })
      .map(({ id }) => id);
  if (new Set(order).size !== 3 || order.some((id) => !ids.includes(id)))
    return undefined;
  const sign = side === "right" ? 1 : -1;
  // Keep all three inside the nearer sideline, including when the ball is on a hash.
  const width = Math.min(
    20,
    document.fieldProfile.widthYards / 2 - sign * ball - 2,
  );
  const spots = [width, width * 0.6, width * 0.3];
  let next = document;
  order.forEach((id, index) => {
    const man = next.players.find((man) => man.id === id)!;
    const move = buildMoveCommand(next, [{ kind: "player", id }], {
      lateralYards: ball + sign * spots[index]! - man.position.lateralYards,
      depthYards: (index === 0 ? -1 : -2) - man.position.depthYards,
    });
    if (move) next = applyPlayCommand(next, move);
  });
  next = designate(next, ids, "trips", `Trips ${side}`, createId, order);
  return diffPlayDocuments(document, next, `Trips ${side}`);
}

/** Both linemen block the same defender, or a shared point when no target is chosen. */
export function doubleTeamSelectionCommand(
  document: PlayDocument,
  ids: readonly string[],
  createId: (prefix: string) => string,
  targetId?: string,
): PlayCommand | undefined {
  if (!selectionAssignmentOptions(document, ids).doubleTeam) return undefined;
  const men = document.players.filter(({ id }) => ids.includes(id));
  const target = document.players.find(
    (man) => man.id === targetId && man.unit === "defense",
  );
  if (targetId && !target) return undefined;
  const end = target?.position ?? {
    lateralYards:
      men.reduce((sum, man) => sum + man.position.lateralYards, 0) / 2,
    depthYards: 2,
  };
  const removed = document.paths.filter(
    (path) => ids.includes(path.playerId) && path.kind === "block",
  );
  const replacedAssignments = new Set(
    document.assignments
      .filter(
        (assignment) =>
          assignment.text === "Double team" &&
          assignment.actions.some(
            (action) =>
              action.kind === "movement" &&
              removed.some((path) => path.id === action.pathId),
          ),
      )
      .map((assignment) => assignment.id),
  );
  const cleared = removed.length
    ? applyPlayCommand(
        document,
        deletePathsCommand(
          document,
          removed.map(({ id }) => id),
        ),
      )
    : document;
  const paths = men.map((man) => ({
    id: createId("path"),
    kind: "block" as const,
    playerId: man.id,
    points: [man.position, end],
    branches: [],
    style: {
      line: "solid" as const,
      ending: "bar" as const,
      color: "ink" as const,
    },
  }));
  const next = designate(
    {
      ...cleared,
      paths: [...cleared.paths, ...paths],
      assignments: [
        ...cleared.assignments.filter(
          (assignment) => !replacedAssignments.has(assignment.id),
        ),
        ...men.map((man, index) => ({
          id: createId("assignment"),
          playerId: man.id,
          text: "Double team",
          actions: [
            {
              id: createId("action"),
              kind: "movement" as const,
              pathId: paths[index]!.id,
            },
            {
              id: createId("action"),
              kind: "block" as const,
              ...(target
                ? { target: { kind: "player" as const, playerId: target.id } }
                : {}),
            },
          ],
        })),
      ],
    },
    ids,
    "double-team",
    "Double team",
    createId,
  );
  return diffPlayDocuments(document, next, "Double team");
}

/** Read the scheme against the whole field, then give jobs only to the selection. */
export function coverageSelectionCommand(
  document: PlayDocument,
  ids: readonly string[],
  key: string,
  createId: (prefix: string) => string,
): PlayCommand | undefined {
  const call = coverageCallByKey(key);
  if (!call || !selectionAssignmentOptions(document, ids).coverage)
    return undefined;
  const withoutCall = {
    ...document,
    unitCalls: { ...document.unitCalls, coverage: undefined },
  };
  const callCommand = applyCoverageCallCommand(withoutCall, key, createId);
  if (!callCommand) return undefined;
  const called = applyPlayCommand(withoutCall, callCommand);
  const replaced = document.paths.filter(
    (path) =>
      ids.includes(path.playerId) &&
      ["zone", "blitz", "stunt"].includes(path.kind) &&
      path.trigger !== "scramble",
  );
  const cleared = replaced.length
    ? applyPlayCommand(
        document,
        deletePathsCommand(
          document,
          replaced.map(({ id }) => id),
        ),
      )
    : document;
  const lines = called.paths
    .filter(
      (path) => ids.includes(path.playerId) && path.unitCall === "coverage",
    )
    .map((path) => {
      const own = { ...path };
      delete own.unitCall;
      return own;
    });
  const next = designate(
    { ...cleared, paths: [...cleared.paths, ...lines] },
    ids,
    "coverage",
    call.name,
    createId,
  );
  return diffPlayDocuments(document, next, `${call.name} — selected players`);
}
