import type { FieldDrawingKind } from "@chalk/editor";
import type { Player } from "@chalk/domain";

import { isLineman } from "@chalk/domain";

/**
 * The field's modes. Select is the standing one; Hand moves the field from
 * anywhere and edits nothing (ADR 0079); Text puts a note down (ADR 0052).
 * Everything a man is given starts from the man.
 */
export type ToolId = "select" | "pan" | "text";

/**
 * How the pointer meets the field, at the head of the rail (ADR 0079): pick
 * and move what is on it, or take hold of the field itself. Holding space is
 * a moment's Hand, so the Hand has no key of its own — H is the shadow's.
 */
export const pointerTools: ReadonlyArray<{
  readonly id: "select" | "pan";
  readonly label: string;
  readonly name: string;
  readonly title: string;
  readonly glyph: "pointer" | "hand";
}> = [
  {
    id: "select",
    label: "Select",
    name: "Select — V",
    title: "Select — V · drag the grass to box in a group",
    glyph: "pointer",
  },
  {
    id: "pan",
    label: "Hand",
    name: "Hand",
    title: "Hand — drag anywhere to move the field · hold space for a moment",
    glyph: "hand",
  },
];

/** The rail's drawing tools, after the pointer pair: Text alone (ADR 0052). */
export const tools: ReadonlyArray<{
  readonly id: Exclude<ToolId, "select" | "pan">;
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
