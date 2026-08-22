import { DEMO_STATUS_HINT } from "@chalk/domain";
import { describe, expect, it } from "vitest";

import { editorStatusHint } from "./editor-status-hint";

describe("what the status bar says on the left", () => {
  it("keeps the original's at-fit Select copy, and changes it once the view moves", () => {
    const atFit = editorStatusHint({
      view: "editor",
      tool: "select",
      atFit: true,
      selectionCount: 0,
    });
    expect(atFit).toContain("drag the blue dot above a player");
    expect(atFit).not.toContain("drag the grass");

    const zoomed = editorStatusHint({
      view: "editor",
      tool: "select",
      atFit: false,
      selectionCount: 0,
    });
    expect(zoomed).toContain("drag the grass to move the view");
    expect(zoomed).not.toContain("blue dot");
  });

  it("speaks for a route in progress, and for a typed depth", () => {
    expect(
      editorStatusHint({
        view: "editor",
        tool: "route",
        atFit: true,
        selectionCount: 0,
        drawing: { depthBuffer: "" },
      }),
    ).toContain("click: add break");
    expect(
      editorStatusHint({
        view: "editor",
        tool: "route",
        atFit: true,
        selectionCount: 0,
        drawing: { depthBuffer: "12" },
      }),
    ).toBe(
      "depth 12 yds — click to place the point at that depth · ⌫ edits the number · esc cancels",
    );
  });

  it("does not keep the Select hint when another tool is in hand", () => {
    expect(
      editorStatusHint({
        view: "editor",
        tool: "text",
        atFit: true,
        selectionCount: 0,
      }),
    ).toBe("click the field to drop a text label");
  });

  it("says when the words have gone too small to read", () => {
    expect(
      editorStatusHint({
        view: "editor",
        tool: "select",
        atFit: true,
        selectionCount: 0,
        labelsTooSmall: true,
      }),
    ).toMatch(/^labels hidden — zoom in {3}· {3}/);
  });

  it("uses the original's Print and Demo copy", () => {
    expect(
      editorStatusHint({
        view: "print",
        tool: "select",
        atFit: true,
        selectionCount: 0,
      }),
    ).toContain("letter landscape");
    expect(
      editorStatusHint({
        view: "demo",
        tool: "select",
        atFit: true,
        selectionCount: 0,
      }),
    ).toBe(DEMO_STATUS_HINT);
  });
});
