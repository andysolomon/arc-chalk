import type { Player } from "@chalk/domain";

/** The seven drawing tools on the rail, in the original's order. */
export type ToolId =
  "select" | "player" | "route" | "motion" | "block" | "zone" | "text";

export const tools: ReadonlyArray<{
  readonly id: ToolId;
  readonly label: string;
  readonly shortcut: string;
}> = [
  { id: "select", label: "Select", shortcut: "V" },
  { id: "player", label: "Player", shortcut: "P" },
  { id: "route", label: "Route", shortcut: "R" },
  { id: "motion", label: "Motion", shortcut: "M" },
  { id: "block", label: "Block", shortcut: "B" },
  { id: "zone", label: "Zone drop", shortcut: "Z" },
  { id: "text", label: "Text", shortcut: "T" },
];

/**
 * What a tool is called for the man it would start from. Block on a defender
 * draws his blitz path, so the rail says Blitz while a defender is selected
 * (issue #65); every other name is the tool's own.
 */
export function toolLabelFor(
  tool: ToolId,
  selected: { readonly unit: Player["unit"] } | undefined,
): string {
  const base = tools.find(({ id }) => id === tool)?.label ?? tool;
  if (tool === "block" && selected?.unit === "defense") return "Blitz";
  return base;
}
