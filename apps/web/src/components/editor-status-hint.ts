import { DEMO_STATUS_HINT } from "@chalk/domain";

export type StatusHintTool =
  "select" | "player" | "route" | "motion" | "block" | "zone" | "text";

export interface EditorStatusHintInput {
  readonly view: "editor" | "demo" | "print";
  readonly tool: StatusHintTool;
  readonly atFit: boolean;
  readonly selectionCount: number;
  readonly drawing?: { readonly depthBuffer: string };
  readonly labelsTooSmall?: boolean;
}

const toolHint: Record<StatusHintTool, (atFit: boolean) => string> = {
  select: (atFit) =>
    atFit
      ? "drag the blue dot above a player to draw his route — double-click a line to add a node · ⌫ delete"
      : "drag the grass to move the view · shift-drag: marquee select · double-click a line to add a node · ⌫ delete",
  zone: () =>
    "click a defender to drop him into a zone — dashed line, open bubble ending",
  player: () =>
    "click the field to place a player — pick a symbol on the right",
  route: () =>
    "click a player (or the field) to start a route — click an existing route to edit it",
  motion: () => "click to start a motion path — dashed by default",
  block: () => "click to start a blocking assignment — T ending",
  text: () => "click the field to drop a text label",
};

/**
 * The line the original puts on the left of the status bar. Print and Demo
 * are fixed copy; the editor speaks for the tool, the drawing, and whether
 * the Coach is looking at the whole field.
 */
export function editorStatusHint(input: EditorStatusHintInput): string {
  if (input.view === "print") {
    return "letter landscape, half-inch margins — this is what export → print produces · esc returns to the editor";
  }
  if (input.view === "demo") return DEMO_STATUS_HINT;
  if (input.drawing) {
    const depth = input.drawing.depthBuffer;
    return depth !== ""
      ? `depth ${depth} yds — click to place the point at that depth · ⌫ edits the number · esc cancels`
      : "click: add break · type a number: exact depth · enter / double-click: finish · ⌫: remove last point · shift: toggle snap";
  }
  if (input.selectionCount > 1) {
    return "drag any selected item to move the group · shift-click: add/remove · ⌫ delete · ⌘D duplicate";
  }
  const hint = toolHint[input.tool](input.atFit);
  return input.labelsTooSmall ? `labels hidden — zoom in   ·   ${hint}` : hint;
}
