import { createStableId, type PlayDocument } from "@chalk/domain";

export interface CombinePicks {
  readonly playerIds: readonly string[];
  readonly pathIds: readonly string[];
  readonly labelIds: readonly string[];
  readonly assignmentIds: readonly string[];
}

/**
 * Starts from one branch and copies chosen entities from the other. Copied
 * Players keep their ids when the base does not already have them; routes,
 * notes, and Assignments that would collide get new ids so both sides survive.
 */
export function combinePlayDocuments(
  base: PlayDocument,
  donor: PlayDocument,
  picks: CombinePicks,
): PlayDocument {
  const playerIds = new Set(base.players.map((player) => player.id));
  const players = [...base.players];
  for (const player of donor.players) {
    if (!picks.playerIds.includes(player.id) || playerIds.has(player.id)) {
      continue;
    }
    players.push(structuredClone(player));
    playerIds.add(player.id);
  }

  const pathIds = new Set(base.paths.map((path) => path.id));
  const paths = [...base.paths];
  for (const path of donor.paths) {
    if (!picks.pathIds.includes(path.id)) continue;
    const copy = structuredClone(path);
    const next = pathIds.has(copy.id)
      ? { ...copy, id: createStableId("path") }
      : copy;
    if (!playerIds.has(next.playerId)) continue;
    paths.push(next);
    pathIds.add(next.id);
  }

  const labelIds = new Set(base.labels.map((label) => label.id));
  const labels = [...base.labels];
  for (const label of donor.labels) {
    if (!picks.labelIds.includes(label.id)) continue;
    const copy = structuredClone(label);
    const next = labelIds.has(copy.id)
      ? { ...copy, id: createStableId("label") }
      : copy;
    labels.push(next);
    labelIds.add(next.id);
  }

  const assignmentIds = new Set(
    base.assignments.map((assignment) => assignment.id),
  );
  const assignments = [...base.assignments];
  for (const assignment of donor.assignments) {
    if (!picks.assignmentIds.includes(assignment.id)) continue;
    if (!playerIds.has(assignment.playerId)) continue;
    const copy = structuredClone(assignment);
    const next = assignmentIds.has(copy.id)
      ? { ...copy, id: createStableId("assignment") }
      : copy;
    assignments.push(next);
    assignmentIds.add(next.id);
  }

  return {
    ...base,
    players,
    paths,
    labels,
    assignments,
  };
}
