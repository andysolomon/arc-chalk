import {
  footballPathPrimitivePlay,
  playerLabelPrimitivePlay,
} from "@chalk/test-fixtures";
import { stickThunderPlay } from "@chalk/domain";
import {
  createEditorStore,
  type EditorPersistence,
  type EditorStore,
} from "@chalk/editor";
import { buildRenderScene, buildSvgRenderScene } from "@chalk/render";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ChalkApp, FieldDiagram } from "./chalk-app";

function createTestEditorStore(
  persistence: EditorPersistence = {
    commitPlay: (input) =>
      Promise.resolve({
        playId: input.play.id,
        documentHash: `hash_${input.play.name}`,
        committedAtMs: 100,
        mutationId: input.mutation.id,
      }),
  },
): EditorStore {
  return createEditorStore({
    initialDocument: stickThunderPlay,
    initialDocumentHash: "initial_hash",
    persistence,
    createMutationId: () => "mutation_test",
    monotonicNow: () => 0,
  });
}

describe("Chalk application shell", () => {
  it("preserves the original editor entry points", () => {
    const { container } = render(
      <ChalkApp editorStore={createTestEditorStore()} />,
    );

    expect(
      screen.getByRole("navigation", { name: "Workspace views" }),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Drawing tools" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Play inspector" }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Stick — Thunder football play" }),
    ).toBeVisible();
    expect(container.querySelectorAll("[data-scene-player]")).toHaveLength(11);
    expect(container.querySelectorAll("[data-scene-path]")).toHaveLength(6);
    expect(container.querySelectorAll("[data-scene-label]")).toHaveLength(12);
    expect(container.querySelectorAll("[data-field-yard-line]")).toHaveLength(
      9,
    );
    expect(container.querySelectorAll("[data-field-sideline]")).toHaveLength(2);
    expect(container.querySelectorAll("[data-field-minor-mark]")).toHaveLength(
      128,
    );
    expect(container.querySelectorAll("[data-field-number]")).toHaveLength(8);
  });

  it("keeps the play name editable and exposes the original modes", async () => {
    const user = userEvent.setup();
    const editorStore = createTestEditorStore();
    render(<ChalkApp editorStore={editorStore} />);

    const name = screen.getByRole("textbox", { name: "Play name" });
    await user.clear(name);
    await user.type(name, "Mesh — Alert");
    await user.click(screen.getByRole("button", { name: "Present" }));

    expect(screen.getByText("Present mode")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Play name" })).toHaveValue(
      "Mesh — Alert",
    );
    await waitFor(() => {
      expect(editorStore.getSnapshot().document.name).toBe("Mesh — Alert");
    });
    expect(
      screen.getByRole("button", { name: "Saved on this device" }),
    ).toBeVisible();
  });

  it("renders the complete original path vocabulary from the shared scene", () => {
    const scene = buildSvgRenderScene(
      buildRenderScene(footballPathPrimitivePlay),
    );
    const { container } = render(<FieldDiagram scene={scene} />);

    expect(container.querySelectorAll("[data-scene-path]")).toHaveLength(9);
    expect(container.querySelectorAll("[data-scene-coverage]")).toHaveLength(1);
    expect(
      container.querySelector('[data-scene-path="path-route-segment-1"]'),
    ).toHaveAttribute("marker-end", "url(#chalk-diamond-ink)");
    expect(
      container.querySelector('[data-scene-path="path-route-segment-2"]'),
    ).toHaveAttribute("marker-end", "url(#chalk-hook-ink)");
    expect(
      container.querySelector('[data-scene-path="path-route-branch-0"]'),
    ).toHaveAttribute("marker-end", "url(#chalk-square-ink)");
    expect(
      container.querySelector('[data-scene-path="path-block"]'),
    ).toHaveAttribute("marker-end", "url(#chalk-bar-green)");
    expect(
      container.querySelector('[data-scene-path="path-stunt"]'),
    ).toHaveAttribute("marker-end", "url(#chalk-chevron-orange)");
    expect(
      container.querySelector('[data-scene-path="path-zone"]'),
    ).not.toHaveAttribute("marker-end");
  });

  it("exposes a failed local save and lets the Coach retry it", async () => {
    const user = userEvent.setup();
    let shouldFail = true;
    const editorStore = createTestEditorStore({
      commitPlay(input) {
        if (shouldFail) return Promise.reject(new Error("storage unavailable"));
        return Promise.resolve({
          playId: input.play.id,
          documentHash: "hash_retry",
          committedAtMs: 200,
          mutationId: input.mutation.id,
        });
      },
    });
    render(<ChalkApp editorStore={editorStore} />);

    const name = screen.getByRole("textbox", { name: "Play name" });
    await user.clear(name);
    await user.type(name, "Retry this Play");
    await user.tab();
    const retry = await screen.findByRole("button", {
      name: "Local save failed — retry",
    });
    expect(editorStore.getSnapshot().document.name).toBe("Retry this Play");

    shouldFail = false;
    await user.click(retry);

    expect(
      await screen.findByRole("button", { name: "Saved on this device" }),
    ).toBeVisible();
  });

  it("renders accessible player and label primitives from prepared SVG data", () => {
    const scene = buildSvgRenderScene(
      buildRenderScene(playerLabelPrimitivePlay),
    );
    const { container } = render(<FieldDiagram scene={scene} />);

    expect(
      screen.getByRole("img", {
        name: "Player and label primitive coverage football play",
      }),
    ).toBeVisible();
    expect(screen.getByRole("img", { name: "M defense player" })).toBeVisible();
    expect(screen.getByRole("img", { name: "progression: 1" })).toBeVisible();
    expect(container.querySelectorAll("[data-scene-player]")).toHaveLength(6);
    expect(container.querySelectorAll("[data-scene-label]")).toHaveLength(6);
    expect(
      container.querySelector("[data-scene-player='player-oval'] ellipse"),
    ).toBeTruthy();
    expect(
      container.querySelector("[data-scene-player='player-triangle'] path"),
    ).toBeTruthy();
    expect(
      container.querySelector("[data-scene-player='player-x'] path"),
    ).toBeTruthy();
    expect(
      container.querySelector("[data-scene-player='player-letter'] > circle"),
    ).toBeNull();
    expect(
      container.querySelector("[data-label-role='progression'] > circle"),
    ).toBeTruthy();
    expect(
      container.querySelector("[data-label-leader='label-alert']"),
    ).toHaveAttribute("stroke-dasharray", "4 3");
  });
});
