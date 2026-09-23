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
    expect(atFit).toContain("select a player to give him his assignment");
    expect(atFit).toContain(
      "drag the blue dot above a player in any direction",
    );
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
        tool: "select",
        atFit: true,
        selectionCount: 0,
        drawing: { depthBuffer: "" },
      }),
    ).toContain("click: add break");
    expect(
      editorStatusHint({
        view: "editor",
        tool: "select",
        atFit: true,
        selectionCount: 0,
        drawing: { depthBuffer: "12" },
      }),
    ).toBe(
      "depth 12 yds — click to place the point at that depth · ⌫ edits the number · esc cancels",
    );
    // Done over the field is the way to end a line without the keyboard.
    expect(
      editorStatusHint({
        view: "editor",
        tool: "select",
        atFit: true,
        selectionCount: 0,
        drawing: { depthBuffer: "", mode: "breaks" },
      }),
    ).toContain("Done, enter or double-click: finish");
  });

  it("says how a free-drawn line ends: when the pointer lifts", () => {
    const hint = editorStatusHint({
      view: "editor",
      tool: "select",
      atFit: true,
      selectionCount: 0,
      drawing: { depthBuffer: "", mode: "free" },
    });
    expect(hint).toContain("pointer held down");
    expect(hint).toContain("lifting finishes");
    expect(hint).not.toContain("add break");
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

describe("the first blank field (issue #65)", () => {
  it("points at Help → Demo with the Select tool, and steps aside for a tool", () => {
    expect(
      editorStatusHint({
        view: "editor",
        tool: "select",
        atFit: true,
        selectionCount: 0,
        firstUse: true,
      }),
    ).toBe("new here? Help → Demo walks the drawing tools on a real play");
    expect(
      editorStatusHint({
        view: "editor",
        tool: "text",
        atFit: true,
        selectionCount: 0,
        firstUse: true,
      }),
    ).toBe("click the field to drop a text label");
  });
});
