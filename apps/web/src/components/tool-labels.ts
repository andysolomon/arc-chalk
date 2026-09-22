import type { FieldDrawingKind } from "@chalk/editor";
import type { Player } from "@chalk/domain";

import { isLineman } from "@chalk/domain";

/**
 * The field's two modes. Select is the standing one; Text is the one tool
 * left on the rail (ADR 0052). Everything a man is given starts from the man.
 */
export type ToolId = "select" | "text";

export const tools: ReadonlyArray<{
  readonly id: ToolId;
  readonly label: string;
  readonly shortcut: string;
}> = [{ id: "text", label: "Text", shortcut: "T" }];

/** What the Coach may draw from a selected man, in the inspector's order. */
export interface DrawChoice {
  readonly kind: FieldDrawingKind;
  readonly label: string;
  readonly shortcut: string;
}

const ROUTE: DrawChoice = { kind: "route", label: "Route", shortcut: "R" };
const MOTION: DrawChoice = { kind: "motion", label: "Motion", shortcut: "M" };
const BLOCK: DrawChoice = { kind: "block", label: "Block", shortcut: "B" };
/** Block on a defender draws his blitz path, so the button says so (issue #65). */
const BLITZ: DrawChoice = { kind: "block", label: "Blitz", shortcut: "B" };
const ZONE: DrawChoice = { kind: "zone", label: "Zone drop", shortcut: "Z" };

/**
 * The lines this man can be given by hand: a receiver or back runs, moves
 * and blocks; a lineman blocks; a defender drops or comes.
 */
export function drawChoicesFor(
  player: Pick<Player, "unit" | "symbol" | "label" | "position">,
): readonly DrawChoice[] {
  if (player.unit === "defense") return [ZONE, BLITZ];
  if (isLineman(player)) return [BLOCK];
  return [ROUTE, MOTION, BLOCK];
}

/** The draw key pressed with a man selected: R, M, B or Z, or nothing. */
export function drawKindForKey(key: string): FieldDrawingKind | undefined {
  return (
    {
      r: "route",
      m: "motion",
      b: "block",
      z: "zone",
    } as const satisfies Record<string, FieldDrawingKind>
  )[key];
}
