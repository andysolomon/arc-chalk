import {
  footballPathPrimitivePlay,
  playerLabelPrimitivePlay,
} from "@chalk/test-fixtures";
import {
  formationFromOffense,
  hashPlayDocument,
  stickThunderPlay,
  stockFormations,
  type PlayDocument,
} from "@chalk/domain";
import {
  applyFormationCommand,
  createEditorStore,
  type EditorPersistence,
  type EditorStore,
} from "@chalk/editor";
import { buildRenderScene, buildSvgRenderScene } from "@chalk/render";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ChalkRuntime } from "../app/editor-runtime";
import { ChalkApp, FieldDiagram } from "./chalk-app";

function createTestRuntime(
  overrides: Partial<ChalkRuntime> = {},
): ChalkRuntime {
  return {
    editorStore: createTestEditorStore(),
    recovery: { interrupted: false },
    storage: { persisted: true, pressure: "healthy" },
    coachSets: {
      formations: [],
      favoriteFormationIds: [],
      favoriteCallIds: [],
    },
    saveCoachFormation: () => Promise.resolve(),
    removeCoachFormation: () => Promise.resolve(),
    setFavoriteFormations: () => Promise.resolve(),
    setFavoriteCalls: () => Promise.resolve(),
    releaseDerivedStorage: () =>
      Promise.resolve({ persisted: true, pressure: "healthy" as const }),
    exportEncryptedBackup: () => Promise.resolve("{}"),
    importEncryptedBackup: () =>
      Promise.resolve({
        playbooks: 0,
        concepts: 0,
        formations: 0,
        plays: 0,
        revisions: 0,
        preferences: 0,
        skippedPlays: [],
        skippedRevisions: [],
      }),
    ...overrides,
  };
}

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
  initialDocument = stickThunderPlay,
): EditorStore {
  return createEditorStore({
    initialDocument,
    initialDocumentHash: "initial_hash",
    persistence,
    createMutationId: () => "mutation_test",
    monotonicNow: () => 0,
  });
}

describe("Chalk application shell", () => {
  it("preserves the original editor entry points", () => {
    const { container } = render(<ChalkApp runtime={createTestRuntime()} />);

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

  it("uses the prototype rail glyphs and makes angle snapping a real toggle", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChalkApp runtime={createTestRuntime()} />);
    const rail = screen.getByRole("navigation", { name: "Drawing tools" });
    const glyph = (name: string) =>
      within(rail).getByRole("button", { name }).querySelector("svg");

    expect(glyph("Select — V")).toHaveAttribute("viewBox", "0 0 18 18");
    expect(glyph("Select — V")?.querySelector("path")).toHaveAttribute(
      "d",
      "M4.5 2.5 L4.5 14.5 L8 11.6 L10 16 L12 15.1 L10 10.8 L14.5 10.5 Z",
    );
    expect(
      [...(glyph("Route — R")?.querySelectorAll("path") ?? [])].map((path) =>
        path.getAttribute("d"),
      ),
    ).toEqual(["M3.5 15 L9.5 15 L9.5 5", "M6.5 7.5 L9.5 4 L12.5 7.5"]);
    expect(
      [...(glyph("Zone drop — Z")?.querySelectorAll("path") ?? [])].map(
        (path) => path.getAttribute("d"),
      ),
    ).toEqual(["M3 15.5 L7.5 10"]);
    const playerGlyph = glyph("Player — P")?.querySelector("circle");
    expect(playerGlyph).toHaveAttribute("cx", "9");
    expect(playerGlyph).toHaveAttribute("cy", "9");
    expect(playerGlyph).toHaveAttribute("r", "5.5");
    expect(
      [...(glyph("Motion — M")?.querySelectorAll("path") ?? [])].map((path) =>
        path.getAttribute("d"),
      ),
    ).toEqual(["M2.5 12.5 L10.5 12.5", "M9.5 9 L13 12.5 L9.5 16"]);
    expect(
      [...(glyph("Block — B")?.querySelectorAll("path") ?? [])].map((path) =>
        path.getAttribute("d"),
      ),
    ).toEqual(["M9 15.5 L9 6.5", "M4.5 6.5 L13.5 6.5"]);
    expect(glyph("Text — T")?.querySelector("text")).toHaveTextContent("T");
    expect(glyph("Text — T")?.querySelector("g")).toBeNull();
    expect(glyph("Text — T")).toHaveAttribute("width", "18");
    expect(glyph("Text — T")).toHaveAttribute("height", "18");

    expect(
      [...(glyph("Clear a layer")?.querySelectorAll("path") ?? [])].map(
        (path) => path.getAttribute("d"),
      ),
    ).toEqual([
      "M3 15.2 L15 15.2",
      "M6.4 15.2 L3.6 12.1 L10.2 3.6 L14 6.4 Z",
      "M7.2 9.1 L11.4 12.2",
    ]);
    expect(glyph("Clear a layer")?.querySelector("g")).toBeNull();

    const collapse = within(rail).getByRole("button", {
      name: "Hide the tools",
    });
    expect(collapse).toHaveTextContent("‹");
    expect(collapse).toHaveClass("rail-collapse");

    const snap = within(rail).getByRole("button", {
      name: "Angle snap 45 degrees — S",
    });
    expect(snap).toHaveAttribute("aria-pressed", "true");
    expect(snap.querySelectorAll("path")).toHaveLength(2);
    expect(snap.querySelector("path")).toHaveAttribute(
      "d",
      "M4 3.5 L4 14.5 L15 14.5",
    );
    expect(snap.querySelector("g")).toBeNull();
    expect(snap.querySelector("svg")).toHaveAttribute("width", "18");

    await user.click(snap);
    expect(snap).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector(".status-controls")).toHaveTextContent(
      "SNAP OFF",
    );

    snap.focus();
    await user.keyboard("{Enter}");
    expect(snap).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("s");
    expect(snap).toHaveAttribute("aria-pressed", "false");
  });

  it("drives the live camera controls and tells the truth about the idle formation", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChalkApp runtime={createTestRuntime()} />);
    const field = container.querySelector("svg.field-diagram");

    expect(screen.getByText("CUSTOM ALIGNMENT")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Fit the field — 100% zoom" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(Number(field?.getAttribute("viewBox")?.split(" ")[2])).toBeCloseTo(
      800,
    );
    expect(
      screen.getByRole("button", { name: "Fit the field — 125% zoom" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Fit the field — 125% zoom" }),
    );
    expect(field).toHaveAttribute("viewBox", "0 0 1000 620");

    const outline = screen.getByRole("list", {
      name: "Everything on the field",
    });
    await user.click(
      within(outline).getByRole("button", { name: "Q offense player" }),
    );
    await user.click(screen.getByRole("button", { name: "Fit to selection" }));
    const selectionCamera = field?.getAttribute("viewBox");
    expect(selectionCamera).not.toBe("0 0 1000 620");
    expect(
      container.querySelector("[data-formation-status]"),
    ).toBeEmptyDOMElement();

    await user.click(
      screen.getByRole("button", { name: "Center on the ball" }),
    );
    expect(field?.getAttribute("viewBox")).not.toBe(selectionCamera);
  });

  it("names a stock formation in the status bar only when it is really active", () => {
    const emptyRight = stockFormations.find(
      ({ id }) => id === "formation_empty_right",
    )!;
    const formed = applyFormationCommand(
      stickThunderPlay,
      emptyRight,
      (prefix) => `${prefix}_formed`,
    ).result.play;

    render(
      <ChalkApp
        runtime={createTestRuntime({
          editorStore: createTestEditorStore(undefined, formed),
        })}
      />,
    );

    expect(screen.getByText("EMPTY RIGHT · 11")).toBeVisible();
    expect(screen.queryByText("CUSTOM ALIGNMENT")).toBeNull();
  });

  it("stars a set, keeps it under Favorites, and tells the device", async () => {
    const user = userEvent.setup();
    const setFavoriteFormations = vi.fn<ChalkRuntime["setFavoriteFormations"]>(
      () => Promise.resolve(),
    );
    render(<ChalkApp runtime={createTestRuntime({ setFavoriteFormations })} />);

    await user.click(screen.getByTitle("Browse formations — ⇧⌘F"));
    const book = screen.getByRole("dialog", { name: "Formations" });

    // Favorites is empty until the Coach stars something, and says so in the
    // original's own words rather than the search's.
    await user.click(within(book).getByRole("tab", { name: "Favorites" }));
    expect(
      within(book).getByText(
        "No favorites yet — star a formation to keep it here.",
      ),
    ).toBeVisible();

    await user.click(within(book).getByRole("tab", { name: "All" }));
    const stars = within(book).getAllByRole("button", {
      name: "Add to favorites",
    });
    await user.click(stars[0]!);
    expect(setFavoriteFormations).toHaveBeenCalledTimes(1);
    expect(setFavoriteFormations.mock.calls[0]![0]).toHaveLength(1);

    await user.click(within(book).getByRole("tab", { name: "Favorites" }));
    const kept = within(book).getAllByRole("button", {
      name: "Remove from favorites",
    });
    expect(kept).toHaveLength(1);

    // Starring is not picking — the set does not land on the field.
    expect(book).toBeVisible();

    await user.click(kept[0]!);
    expect(
      within(book).getByText(
        "No favorites yet — star a formation to keep it here.",
      ),
    ).toBeVisible();
    expect(setFavoriteFormations).toHaveBeenLastCalledWith([]);
  });

  it("stars a call, and keeps the two books' favorites apart", async () => {
    const user = userEvent.setup();
    const setFavoriteCalls = vi.fn<ChalkRuntime["setFavoriteCalls"]>(() =>
      Promise.resolve(),
    );
    const setFavoriteFormations = vi.fn<ChalkRuntime["setFavoriteFormations"]>(
      () => Promise.resolve(),
    );
    render(
      <ChalkApp
        runtime={createTestRuntime({ setFavoriteCalls, setFavoriteFormations })}
      />,
    );

    await user.click(screen.getByTitle("Browse defenses — ⇧⌘D"));
    const book = screen.getByRole("dialog", { name: "Defenses" });
    await user.click(within(book).getByRole("tab", { name: "Favorites" }));
    expect(
      within(book).getByText("No favorites yet — star a call to keep it here."),
    ).toBeVisible();

    await user.click(within(book).getByRole("tab", { name: "All" }));
    await user.click(
      within(book).getAllByRole("button", { name: "Add to favorites" })[0]!,
    );
    expect(setFavoriteCalls).toHaveBeenCalledTimes(1);
    // A starred call is not a starred set.
    expect(setFavoriteFormations).not.toHaveBeenCalled();

    await user.click(within(book).getByRole("tab", { name: "Favorites" }));
    expect(
      within(book).getAllByRole("button", { name: "Remove from favorites" }),
    ).toHaveLength(1);
  });

  it("keeps the offense on the field as a set of the Coach's own", async () => {
    const user = userEvent.setup();
    const saveCoachFormation = vi.fn<ChalkRuntime["saveCoachFormation"]>(() =>
      Promise.resolve(),
    );
    const setFavoriteFormations = vi.fn<ChalkRuntime["setFavoriteFormations"]>(
      () => Promise.resolve(),
    );
    render(
      <ChalkApp
        runtime={createTestRuntime({
          saveCoachFormation,
          setFavoriteFormations,
        })}
      />,
    );

    await user.click(screen.getByTitle("Browse formations — ⇧⌘F"));
    const book = screen.getByRole("dialog", { name: "Formations" });

    await user.click(within(book).getByRole("tab", { name: "Mine" }));
    expect(
      within(book).getByText(
        "Nothing saved yet. Set an offense on the field and save it below.",
      ),
    ).toBeVisible();

    // The Save button will not act on an unnamed set.
    const save = within(book).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute(
      "title",
      "Save the offense on the field as a formation",
    );

    const name = within(book).getByRole("textbox", {
      name: "Save the offense on the field as",
    });
    await user.type(name, "Andy's Empty");
    expect(save).toBeEnabled();
    await user.click(save);

    expect(saveCoachFormation).toHaveBeenCalledTimes(1);
    const saved = saveCoachFormation.mock.calls[0]![0];
    expect(saved.name).toBe("Andy's Empty");
    expect(saved.family).toBe("custom");

    // The Coach named it to reach for it, so it is starred at once — and it
    // is his set, so it can be let go again.
    expect(setFavoriteFormations).toHaveBeenLastCalledWith([saved.id]);
    expect(within(book).getByText("Andy's Empty")).toBeVisible();
    expect(name).toHaveValue("");
    expect(
      within(book).getByRole("button", { name: "Remove Andy's Empty" }),
    ).toBeVisible();
  });

  it("opens the Coach's saved sets beside the ones Chalk ships", async () => {
    const user = userEvent.setup();
    const mine = formationFromOffense(stickThunderPlay, {
      id: "formation_mine",
      playbookId: stickThunderPlay.playbookId,
      name: "Andy's Empty",
      slotId: (index) => `slot_mine_${index}`,
    })!;
    const removeCoachFormation = vi.fn<ChalkRuntime["removeCoachFormation"]>(
      () => Promise.resolve(),
    );
    render(
      <ChalkApp
        runtime={createTestRuntime({
          coachSets: {
            formations: [mine],
            favoriteFormationIds: [mine.id],
            favoriteCallIds: [],
          },
          removeCoachFormation,
        })}
      />,
    );

    await user.click(screen.getByTitle("Browse formations — ⇧⌘F"));
    const book = screen.getByRole("dialog", { name: "Formations" });

    // It is in all three books: the whole one, the starred, and his own.
    for (const tab of ["All", "Favorites", "Mine"]) {
      await user.click(within(book).getByRole("tab", { name: tab }));
      expect(within(book).getByText("Andy's Empty")).toBeVisible();
    }
    expect(
      within(book).getByRole("button", { name: "Remove from favorites" }),
    ).toBeVisible();

    await user.click(
      within(book).getByRole("button", { name: "Remove Andy's Empty" }),
    );
    expect(removeCoachFormation).toHaveBeenCalledWith(mine.id);
    expect(
      within(book).getByText(
        "Nothing saved yet. Set an offense on the field and save it below.",
      ),
    ).toBeVisible();
  });

  it("keeps the play name editable and exposes the original modes", async () => {
    const user = userEvent.setup();
    const editorStore = createTestEditorStore();
    render(<ChalkApp runtime={createTestRuntime({ editorStore })} />);

    const name = screen.getByRole("textbox", { name: "Play name" });
    await user.clear(name);
    await user.type(name, "Mesh — Alert");
    await user.click(screen.getByRole("button", { name: "Present" }));

    expect(screen.getByRole("region", { name: "Present" })).toBeVisible();
    expect(screen.getByText("Mesh — Alert")).toBeVisible();
    expect(screen.getByText("← → variations")).toBeVisible();
    expect(screen.getByRole("button", { name: "esc" })).toBeVisible();
    await waitFor(() => {
      expect(editorStore.getSnapshot().document.name).toBe("Mesh — Alert");
    });
    // Present mode hides authoring chrome, so the acknowledgement lives with
    // the Editor's status bar rather than following the Coach into Present.
    expect(
      screen.queryByRole("button", { name: "Saved on this device" }),
    ).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Play name" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "esc" }));
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
    render(<ChalkApp runtime={createTestRuntime({ editorStore })} />);

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

  it("scales Present type 1.25× and returns to the editor on esc", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChalkApp runtime={createTestRuntime()} />);

    const editorLabel = container.querySelector("[data-scene-label] text");
    const editorSize = editorLabel?.getAttribute("font-size");
    expect(editorSize).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Present" }));
    const present = screen.getByRole("region", { name: "Present" });
    const presentLabel = present.querySelector("[data-scene-label] text");
    expect(Number(presentLabel?.getAttribute("font-size"))).toBeGreaterThan(
      Number(editorSize),
    );
    expect(present.querySelector("svg.field-diagram")).toHaveAttribute(
      "data-type-preset",
      "coach",
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Present" })).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Drawing tools" }),
    ).toBeVisible();
  });

  it("runs the original Tool tour and opens a demo as a new Play", async () => {
    const user = userEvent.setup();
    const records = new Map<string, PlayDocument>([
      [stickThunderPlay.id, stickThunderPlay],
    ]);
    const editorStore = createTestEditorStore({
      commitPlay: async (input) => {
        records.set(input.play.id, input.play);
        return {
          playId: input.play.id,
          documentHash: await hashPlayDocument(input.play),
          committedAtMs: 100,
          mutationId: input.mutation.id,
        };
      },
    });
    render(<ChalkApp runtime={createTestRuntime({ editorStore })} />);

    await user.click(
      within(
        screen.getByRole("navigation", { name: "Workspace views" }),
      ).getByRole("button", { name: "Demo" }),
    );
    const demo = screen.getByRole("region", { name: "Demo" });
    expect(within(demo).getByText("Player tool")).toBeVisible();
    expect(screen.getByText("Drawing tools — guided tour")).toBeVisible();
    expect(screen.getByText("Stick — Thunder")).toBeVisible();

    await user.click(within(demo).getByRole("button", { name: "Pause" }));
    await user.click(within(demo).getByRole("button", { name: "Defense" }));
    expect(screen.getByText("Cover 3 — Fire Zone")).toBeVisible();
    expect(within(demo).getByText("Offense in gray")).toBeVisible();

    await user.click(
      within(demo).getByRole("button", {
        name: "Open this play in the editor",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Demo" })).toBeNull();
    });
    expect(screen.getByRole("textbox", { name: "Play name" })).toHaveValue(
      "Cover 3 — Fire Zone",
    );
    expect(records.get(stickThunderPlay.id)).toEqual(stickThunderPlay);
    expect(
      [...records.values()].some(
        (play) =>
          play.id !== stickThunderPlay.id &&
          play.name === "Cover 3 — Fire Zone",
      ),
    ).toBe(true);
  });

  it("shows the letter-landscape Print sheet and prints it", async () => {
    const user = userEvent.setup();
    const popup = {
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    };
    const open = vi
      .spyOn(window, "open")
      .mockReturnValue(popup as unknown as Window);

    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.click(
      within(
        screen.getByRole("navigation", { name: "Workspace views" }),
      ).getByRole("button", { name: "Print" }),
    );
    const sheet = screen.getByRole("region", { name: "Print preview" });
    expect(within(sheet).getByText("Stick — Thunder")).toBeVisible();
    expect(within(sheet).getByText("Pass")).toBeVisible();
    expect(
      within(sheet).getByText(
        "letter landscape · half-inch margins · coach type",
      ),
    ).toBeVisible();
    expect(sheet.querySelector("svg.field-diagram")).toHaveAttribute(
      "data-type-preset",
      "coach",
    );

    await user.click(screen.getByRole("button", { name: "Print this" }));
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(popup.document.write).toHaveBeenCalledWith(
      expect.stringContaining("<h1>Stick — Thunder</h1>"),
    );
    expect(popup.document.write).toHaveBeenCalledWith(
      expect.stringContaining("<span>Pass</span>"),
    );
    expect(popup.document.write).toHaveBeenCalledWith(
      expect.stringContaining("@page{size:letter landscape;margin:0.5in}"),
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Print preview" })).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Drawing tools" }),
    ).toBeVisible();
    open.mockRestore();
  });

  it("prints the same letter-landscape sheet from Export → Print the field", async () => {
    const user = userEvent.setup();
    const popup = {
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    };
    const open = vi
      .spyOn(window, "open")
      .mockReturnValue(popup as unknown as Window);

    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("button", { name: "Print the field" }));

    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(popup.document.write).toHaveBeenCalledWith(
      expect.stringContaining("<h1>Stick — Thunder</h1>"),
    );
    expect(popup.document.write).toHaveBeenCalledWith(
      expect.stringContaining("@page{size:letter landscape;margin:0.5in}"),
    );
    expect(popup.document.write).toHaveBeenCalledWith(
      expect.stringContaining(".field-paper{fill:#fff;stroke:#e5e5e5}"),
    );
    expect(
      screen.getByRole("navigation", { name: "Drawing tools" }),
    ).toBeVisible();
    open.mockRestore();
  });

  it("prints in the Print type when that preset is selected", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);
    const inspector = screen.getByRole("complementary", {
      name: "Play inspector",
    });

    await user.click(
      within(inspector).getByRole("button", { name: /^Print$/ }),
    );
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Workspace views" }),
      ).getByRole("button", { name: "Print" }),
    );

    const sheet = screen.getByRole("region", { name: "Print preview" });
    expect(
      within(sheet).getByText(
        "letter landscape · half-inch margins · print type",
      ),
    ).toBeVisible();
    expect(sheet.querySelector("svg.field-diagram")).toHaveAttribute(
      "data-type-preset",
      "print",
    );
  });
});

describe("Chalk device durability surfaces", () => {
  it("lets the Coach name a version and restore it later", async () => {
    const user = userEvent.setup();
    const store = createTestEditorStore();
    const created: string[] = [];
    const restored: string[] = [];
    const snapshot = {
      ...store.getSnapshot(),
      versions: [
        {
          id: "revision_1",
          label: "Install week",
          createdAtMs: Date.now(),
          documentHash: "h",
        },
      ],
    };
    const versionStore: EditorStore = {
      ...store,
      createVersion: (label) => {
        created.push(label);
        return Promise.resolve({
          status: "created",
          version: {
            id: "revision_1",
            label,
            createdAtMs: 1,
            documentHash: "hash_version",
          },
        });
      },
      restoreVersion: (revisionId) => {
        restored.push(revisionId);
        return Promise.resolve({ status: "unchanged" });
      },
      // useSyncExternalStore needs one stable snapshot reference.
      getSnapshot: () => snapshot,
    };
    render(
      <ChalkApp runtime={createTestRuntime({ editorStore: versionStore })} />,
    );

    // The original has a Save control in the header and another in the Library
    // panel, so this one is scoped to the header.
    const header = screen.getByRole("banner");
    await user.click(within(header).getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Snapshot" }));
    const name = screen.getByRole("textbox", { name: "Snapshot name" });
    // Naming replaces the menu with the original's snapshot form, so the only
    // Snapshot control left is the one that commits it.
    const create = screen.getByRole("button", { name: "Snapshot" });

    // A version the Coach has not named cannot be created.
    expect(create).toBeDisabled();
    await user.type(name, "Game Plan Final");
    expect(create).toBeEnabled();
    await user.click(create);
    expect(created).toEqual(["Game Plan Final"]);

    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(restored).toEqual(["revision_1"]);

    const inspector = screen.getByRole("complementary", {
      name: "Play inspector",
    });
    expect(within(inspector).getByText("History 1")).toBeVisible();
    await user.click(within(inspector).getByRole("button", { name: "Show" }));
    expect(within(inspector).getByText("just now")).toBeVisible();
    expect(within(inspector).getByText("Install week")).toBeVisible();
    expect(
      within(inspector).getByText(
        "Named snapshots of this play, kept across a closed tab. Restoring is itself undoable.",
      ),
    ).toBeVisible();
    await user.click(
      within(inspector).getByRole("button", { name: "Restore" }),
    );
    expect(restored).toEqual(["revision_1", "revision_1"]);
  });

  it("points History at named snapshots instead of a 90-second autosave", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);
    const inspector = screen.getByRole("complementary", {
      name: "Play inspector",
    });

    expect(
      within(inspector).getByText("History", { exact: true }),
    ).toBeVisible();
    await user.click(within(inspector).getByRole("button", { name: "Show" }));
    expect(
      within(inspector).getByText(
        "Nothing saved back yet. Name a Snapshot from Save when you want a state you can come back to.",
      ),
    ).toBeVisible();
    expect(within(inspector).queryByText(/90 seconds/)).toBeNull();
  });

  it("tells the Coach the app closed unexpectedly without claiming lost work", async () => {
    const user = userEvent.setup();
    render(
      <ChalkApp
        runtime={createTestRuntime({
          recovery: {
            interrupted: true,
            previousSessionId: "session_1",
            previousStartedAtMs: Date.UTC(2026, 7, 5),
          },
        })}
      />,
    );

    const notice = screen.getByText(/Chalk closed unexpectedly/);
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent("Every edit saved on this device is here");

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Chalk closed unexpectedly/)).toBeNull();
  });

  it("offers to free space only when the device is under storage pressure", async () => {
    const user = userEvent.setup();
    let released = 0;
    const { rerender } = render(<ChalkApp runtime={createTestRuntime()} />);
    expect(screen.queryByRole("button", { name: "Free space" })).toBeNull();

    rerender(
      <ChalkApp
        runtime={createTestRuntime({
          storage: {
            persisted: true,
            pressure: "critical",
            usageBytes: 96,
            quotaBytes: 100,
            usedFraction: 0.96,
          },
          releaseDerivedStorage: () => {
            released += 1;
            return Promise.resolve({ persisted: true, pressure: "healthy" });
          },
        })}
      />,
    );

    expect(
      screen.getByText("This device is nearly out of space for Chalk."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Free space" }));
    await waitFor(() => expect(released).toBe(1));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Free space" })).toBeNull(),
    );
  });

  it("keeps the save acknowledgement a status until a save actually fails", async () => {
    const user = userEvent.setup();
    let shouldFail = false;
    const store = createTestEditorStore({
      commitPlay: (input) =>
        shouldFail
          ? Promise.reject(new Error("IndexedDB unavailable"))
          : Promise.resolve({
              playId: input.play.id,
              documentHash: `hash_${input.play.name}`,
              committedAtMs: 100,
              mutationId: input.mutation.id,
            }),
    });
    render(<ChalkApp runtime={createTestRuntime({ editorStore: store })} />);

    expect(
      screen.getByRole("button", { name: "Saved on this device" }),
    ).toBeDisabled();

    shouldFail = true;
    const playName = screen.getByRole("textbox", { name: "Play name" });
    await user.clear(playName);
    await user.type(playName, "Mesh — Alert");
    await user.tab();

    const retry = await screen.findByRole("button", {
      name: "Local save failed — retry",
    });
    expect(retry).toBeEnabled();
  });
});

describe("Chalk encrypted backups", () => {
  it("encrypts with the Coach's passphrase and warns it cannot be recovered", async () => {
    const user = userEvent.setup();
    const passphrases: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    globalThis.URL.createObjectURL = () => "blob:chalk";
    globalThis.URL.revokeObjectURL = () => undefined;

    render(
      <ChalkApp
        runtime={createTestRuntime({
          exportEncryptedBackup: (passphrase) => {
            passphrases.push(passphrase);
            return Promise.resolve('{"kind":"chalk-encrypted-backup"}');
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Backup" }));
    expect(
      screen.getByText(/A passphrase you lose cannot be recovered/),
    ).toBeVisible();

    const backUp = screen.getByRole("button", {
      name: "Back up my Playbooks",
    });
    // Nothing leaves the device without a passphrase.
    expect(backUp).toBeDisabled();

    await user.type(
      screen.getByLabelText("Backup passphrase"),
      "third and long",
    );
    expect(backUp).toBeEnabled();
    await user.click(backUp);

    await waitFor(() => expect(passphrases).toEqual(["third and long"]));
    expect(click).toHaveBeenCalled();
    await screen.findByText("Backup saved to this device.");
    // The passphrase does not linger in the field afterwards.
    expect(screen.getByLabelText("Backup passphrase")).toHaveValue("");
    click.mockRestore();
  });

  it("says plainly when a backup will not open", async () => {
    const user = userEvent.setup();
    render(
      <ChalkApp
        runtime={createTestRuntime({
          importEncryptedBackup: () =>
            Promise.reject(new Error("BackupPassphraseError")),
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Backup" }));
    await user.type(screen.getByLabelText("Backup passphrase"), "wrong");
    await user.upload(
      screen.getByLabelText("Backup file"),
      new File(['{"kind":"chalk-encrypted-backup"}'], "chalk-backup.json", {
        type: "application/json",
      }),
    );

    expect(await screen.findByText(/does not open this backup/)).toBeVisible();
  });

  it("reports what a restore brought back and that newer work was kept", async () => {
    const user = userEvent.setup();
    render(
      <ChalkApp
        runtime={createTestRuntime({
          importEncryptedBackup: () =>
            Promise.resolve({
              playbooks: 1,
              concepts: 0,
              formations: 0,
              plays: 3,
              revisions: 2,
              preferences: 0,
              skippedPlays: ["play_newer_here"],
              skippedRevisions: [],
            }),
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Backup" }));
    await user.type(screen.getByLabelText("Backup passphrase"), "right");
    await user.upload(
      screen.getByLabelText("Backup file"),
      new File(['{"kind":"chalk-encrypted-backup"}'], "chalk-backup.json", {
        type: "application/json",
      }),
    );

    expect(
      await screen.findByText(
        "Restored 3 Plays. Newer work on this device was kept.",
      ),
    ).toBeVisible();
  });
});

describe("Chalk editor overlays", () => {
  it("runs a command the Coach finds by typing and closes the palette", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.keyboard("{Control>}k{/Control}");
    const search = screen.getByRole("textbox", { name: "Command palette" });
    // The palette opens on the original's ten most common commands.
    const palette = screen.getByRole("dialog", { name: "Command palette" });
    expect(within(palette).getAllByRole("button")).toHaveLength(10);

    await user.type(search, "route tool");
    await user.click(screen.getByRole("button", { name: "Route tool R" }));

    expect(
      screen.queryByRole("dialog", { name: "Command palette" }),
    ).toBeNull();
    // The command actually took: the Route tool is the active one.
    const rail = screen.getByRole("navigation", { name: "Drawing tools" });
    expect(within(rail).getByRole("button", { name: "Route — R" })).toHaveClass(
      "active",
    );
  });

  it("shows a command the editor cannot run yet as unavailable", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.keyboard("{Control>}k{/Control}");
    await user.type(
      screen.getByRole("textbox", { name: "Command palette" }),
      "call sheet",
    );

    // Listed, because the palette is the product's catalogue of commands — but
    // it cannot be run, so a click never silently does nothing.
    expect(
      screen.getByRole("button", { name: "Export: Call sheet" }),
    ).toBeDisabled();
  });

  it("gives the field the whole window and offers the panels back", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Focus mode F" }));

    expect(
      screen.queryByRole("navigation", { name: "Drawing tools" }),
    ).toBeNull();
    expect(
      screen.queryByRole("complementary", { name: "Play inspector" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(
      screen.getByRole("button", { name: "Show both panels F" }),
    );

    expect(
      screen.getByRole("navigation", { name: "Drawing tools" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Play inspector" }),
    ).toBeVisible();
  });

  it("changes what prints under the play without moving the players", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChalkApp runtime={createTestRuntime()} />);
    const inspector = screen.getByRole("complementary", {
      name: "Play inspector",
    });

    expect(within(inspector).getByText("Page")).toBeVisible();
    expect(
      within(inspector).getByText(
        "Changes what prints under the play — the players and lines never move.",
      ),
    ).toBeVisible();
    expect(container.querySelectorAll("[data-field-yard-line]")).toHaveLength(
      9,
    );
    expect(container.querySelectorAll("[data-scene-player]")).toHaveLength(11);

    await user.click(
      within(inspector).getByRole("button", { name: "Half field" }),
    );
    expect(container.querySelectorAll("[data-field-yard-line]")).toHaveLength(
      7,
    );
    expect(container.querySelectorAll("[data-scene-player]")).toHaveLength(11);

    await user.click(
      within(inspector).getByRole("button", { name: "Scout card" }),
    );
    expect(container.querySelectorAll("[data-field-yard-line]")).toHaveLength(
      1,
    );
    expect(container.querySelector("[data-field-sideline]")).toBeNull();

    await user.click(
      within(inspector).getByRole("button", { name: "Playbook page" }),
    );
    expect(container.querySelector("svg.field-diagram")).toHaveAttribute(
      "data-field-style",
      "light",
    );
    expect(container.querySelectorAll("[data-field-yard-line]")).toHaveLength(
      9,
    );
    expect(container.querySelector("[data-field-sideline]")).toBeNull();

    await user.click(within(inspector).getByRole("button", { name: "Blank" }));
    expect(container.querySelector("[data-field-yard-line]")).toBeNull();
    expect(container.querySelectorAll("[data-scene-player]")).toHaveLength(11);
  });

  it("scales the words and hides a family of marks from the type and layer controls", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChalkApp runtime={createTestRuntime()} />);
    const inspector = screen.getByRole("complementary", {
      name: "Play inspector",
    });

    expect(
      within(inspector).getByText(
        "Dense — reads, assignments, conversions and notes all on the field.",
      ),
    ).toBeVisible();
    expect(container.querySelectorAll("[data-scene-label]")).toHaveLength(12);

    await user.click(within(inspector).getByRole("button", { name: "Player" }));
    expect(
      within(inspector).getByText(
        "Bigger type, assignments only — what a player reads across a room.",
      ),
    ).toBeVisible();
    expect(container.querySelector("svg.field-diagram")).toHaveAttribute(
      "data-type-preset",
      "player",
    );

    await user.click(
      within(inspector).getByRole("button", { name: /^Print$/ }),
    );
    expect(
      within(inspector).getByText(
        "Pure black, no color fills — survives a copier.",
      ),
    ).toBeVisible();

    await user.click(within(inspector).getByRole("button", { name: "Text" }));
    expect(container.querySelector("[data-scene-label]")).toBeNull();
    expect(
      within(inspector).getByRole("button", { name: "Text" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("opens the shortcut reference from the inspector and closes it on Escape", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.click(screen.getByRole("button", { name: "Shortcuts ?" }));
    const panel = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(panel).getByText("Marquee select")).toBeVisible();
    expect(within(panel).getByText("drag empty field")).toBeVisible();

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeNull();
  });

  it("walks into an Export submenu and back out to the exports", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("button", { name: "Position view" }));

    expect(screen.getByText("POSITION VIEW")).toBeVisible();
    expect(screen.queryByText("DIAGRAM")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back to exports" }));
    expect(screen.getByText("DIAGRAM")).toBeVisible();

    // Reopening returns to the top level rather than the submenu.
    await user.click(screen.getByRole("button", { name: "Position view" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByText("DIAGRAM")).toBeVisible();
  });

  it("opens only one header menu at a time", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("button", { name: "Mirror" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByText("DIAGRAM")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mirror" })).toBeNull();
  });
});
