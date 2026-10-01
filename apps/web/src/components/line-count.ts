import {
  scrimmageLine,
  type PlayDocument,
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
