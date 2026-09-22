import { DEMO_STATUS_HINT } from "@chalk/domain";

/** Select and Text are the field's two modes (ADR 0052). */
export type StatusHintTool = "select" | "text";

export interface EditorStatusHintInput {
  readonly view: "editor" | "demo" | "print";
  readonly tool: StatusHintTool;
  readonly atFit: boolean;
  readonly selectionCount: number;
  readonly drawing?: { readonly depthBuffer: string };
  readonly labelsTooSmall?: boolean;
  readonly animating?: boolean;
  /**
   * Nothing saved and nothing drawn: the Coach's first minute. The bar
   * points him at Help → Demo before the tool hints (issue #65).
   */
  readonly firstUse?: boolean;
}

export const FIRST_USE_HINT =
  "new here? Help → Demo walks the drawing tools on a real play";

const toolHint: Record<StatusHintTool, (atFit: boolean) => string> = {
  select: (atFit) =>
    atFit
      ? "select a player to give him his assignment on the right, or drag the blue dot above a player to draw his route — double-click a line to add a node · ⌫ delete"
      : "drag the grass to move the view · shift-drag: marquee select · double-click a line to add a node · ⌫ delete",
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
  if (input.animating) {
    return "space: play / pause · drag the scrubber to any frame — the play stays selectable and editable · ⟲ back to the snap";
  }
  if (input.drawing) {
    const depth = input.drawing.depthBuffer;
    return depth !== ""
      ? `depth ${depth} yds — click to place the point at that depth · ⌫ edits the number · esc cancels`
      : "click: add break · type a number: exact depth · enter / double-click: finish · ⌫: remove last point · shift: toggle snap";
  }
  if (input.selectionCount > 1) {
    return "drag any selected item to move the group · shift-click: add/remove · ⌫ delete · ⌘D duplicate";
  }
  if (input.firstUse && input.tool === "select") return FIRST_USE_HINT;
  const hint = toolHint[input.tool](input.atFit);
  return input.labelsTooSmall ? `labels hidden — zoom in   ·   ${hint}` : hint;
}
