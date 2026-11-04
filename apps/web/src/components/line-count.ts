import {
  assignRoles,
  MAX_BACKS,
  MIN_ON_THE_LINE,
  PLAYERS_PER_SIDE,
  scrimmageLine,
  type LineFault,
  type PlayDocument,
  type Player,
  type ScrimmageLine,
} from "@chalk/domain";
import type { FieldGesture } from "@chalk/editor";

/**
 * The offense's line as the field shows it (ADR 0073): with a drag's men
 * where the drag has them, so the count changes as a receiver comes off the
 * line rather than once he is put down.
 */
export function liveScrimmageLine(
  document: PlayDocument,
  gesture: FieldGesture,
): ScrimmageLine | undefined {
  if (gesture.kind !== "moving") return scrimmageLine(document.players);
  const moving = new Set(
    gesture.items.flatMap((item) => (item.kind === "player" ? [item.id] : [])),
  );
  const { lateralYards, depthYards } = gesture.translation;
  return scrimmageLine(
    document.players.map((player) =>
      moving.has(player.id)
        ? {
            ...player,
            position: {
              lateralYards: player.position.lateralYards + lateralYards,
              depthYards: player.position.depthYards + depthYards,
            },
          }
        : player,
    ),
  );
}

/** The status bar's word for the line, for a Coach who wants the count at rest. */
export function lineStatusWords(
  line: ScrimmageLine | undefined,
): string | undefined {
  if (!line) return undefined;
  return `LINE ${line.onTheLine.length} · BACKS ${line.backs.length}`;
}

/**
 * Each man as the call names him: his letter, the spot an unlettered lineman
 * stands in (LT, C, RG), or "a man".
 */
function namesOf(players: readonly Player[]): Map<string, string> {
  const offense = players.filter(({ unit }) => unit !== "defense");
  const roles = assignRoles(offense);
  return new Map(
    offense.map((player, index) => [
      player.id,
      player.label.trim() || roles[index] || "a man",
    ]),
  );
}

/** "X", "X and Y", "X, Y and Z". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * What is wrong with the formation, one line each, said the way the rule
 * is coached (ADR 0081): a man over the ball, too many men, a fifth back,
 * and a receiver another man on the line covers.
 */
export function lineFaultWords(
  line: ScrimmageLine,
  players: readonly Player[],
): string[] {
  const name = namesOf(players);
  const called = (id: string) => name.get(id) ?? "a man";
  return line.faults.map((fault: LineFault): string => {
    switch (fault.kind) {
      case "across-the-line": {
        const men = fault.playerIds.map(called);
        return `${listed(men)} ${men.length === 1 ? "is" : "are"} over the line of scrimmage`;
      }
      case "too-many-men":
        return `Too many men — ${fault.count} on offense, ${PLAYERS_PER_SIDE} at most`;
      case "too-many-backs":
        return line.offenseCount === PLAYERS_PER_SIDE
          ? `Illegal formation — needs ${MIN_ON_THE_LINE} on the line`
          : `Illegal formation — no more than ${MAX_BACKS} backs`;
      case "covered": {
        const bySide = new Map<string, string[]>();
        for (const { id, byId } of fault.men) {
          bySide.set(byId, [...(bySide.get(byId) ?? []), called(id)]);
        }
        return [...bySide.entries()]
          .map(
            ([byId, men]) =>
              `${listed(men)} ${men.length === 1 ? "is" : "are"} covered by ${called(byId)} — only the end man on the line can catch a pass`,
          )
          .join(" · ");
      }
    }
  });
}
