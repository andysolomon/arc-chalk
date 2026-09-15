import {
  footballPathPrimitivePlay,
  playerLabelPrimitivePlay,
} from "@chalk/test-fixtures";
import {
  formationFromOffense,
  hashPlayDocument,
  starterExamplePlays,
  starterPlaybookEnvelope,
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
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  createMemoryLibrary,
  emptyLibrarySnapshot,
  type ChalkRuntime,
} from "../app/editor-runtime";
import { ChalkApp, FieldDiagram } from "./chalk-app";
import { CommandPalette } from "./editor-overlays";

function createTestRuntime(
  overrides: Partial<ChalkRuntime> = {},
): ChalkRuntime {
  return {
    editorStore: createTestEditorStore(),
    recovery: { interrupted: false },
    storage: { persisted: true, pressure: "healthy" },
    library: createMemoryLibrary(
      emptyLibrarySnapshot(stickThunderPlay.playbookId),
    ),
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
        gamePlans: 0,
        gamePlanRevisions: 0,
        skippedPlays: [],
        skippedRevisions: [],
      }),
    putImage: () => Promise.resolve(),
    getImage: () => Promise.resolve(undefined),
    listImages: () => Promise.resolve([]),
    markImageUploaded: () => Promise.resolve(),
    subscribeLocalEdit: () => () => undefined,
    destroyLocalData: () => Promise.resolve(),
    repository: {
      counts: () =>
        Promise.resolve({
          playbooks: 0,
          concepts: 0,
          formations: 0,
          plays: 0,
          revisions: 0,
          syncMutations: 0,
          conflicts: 0,
          preferences: 0,
          imageBlobs: 0,
          undoHistories: 0,
          searchProjections: 0,
          thumbnails: 0,
          gamePlans: 0,
          gamePlanRevisions: 0,
        }),
      listUnresolvedConflicts: () => Promise.resolve([]),
    } as unknown as ChalkRuntime["repository"],
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

/**
 * Unfolds one of the inspector's folded sections (issue #64): the heading and
 * a one-line summary stay in view; the controls come out on request.
 */
async function unfold(
  user: ReturnType<typeof userEvent.setup>,
  scope: HTMLElement,
  title: string,
): Promise<void> {
  await user.click(
    within(scope).getByRole("button", {
      name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      expanded: false,
    }),
  );
}

/**
 * Opens the Settings overlay — Field, Playbook settings, History and Print &
 * export moved off the inspector into a single dialog the Coach opens from
 * the More menu. Returns the panel so subsequent queries stay scoped to it.
 */
async function openSettings(
  user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> {
  await user.click(
    within(screen.getByRole("banner")).getByRole("button", {
      name: "More actions",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Settings…" }));
  return screen.getByRole("dialog", { name: "Settings" });
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
    expect(screen.getByRole("button", { name: "local" })).toHaveAttribute(
      "data-sync-status",
      "local",
    );
  });

  it("keeps the original library panel and opens an additive Playbook browser", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    const inspector = screen.getByRole("complementary", {
      name: "Play inspector",
    });
    expect(within(inspector).getByText("Library")).toBeVisible();
    await unfold(user, inspector, "Library");
    expect(within(inspector).getByText("This play")).toBeVisible();
    expect(
      within(inspector).getByRole("button", { name: "Browse Playbook" }),
    ).toBeVisible();

    await user.click(
      within(inspector).getByRole("button", { name: "Browse Playbook" }),
    );
    expect(screen.getByRole("dialog", { name: "Playbook" })).toBeVisible();
    expect(screen.getByLabelText("Search plays")).toBeVisible();
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

    // Clear left the rail for the More menu's Clear… page (issue #65).
    expect(
      within(rail).queryByRole("button", { name: "Clear a layer" }),
    ).toBeNull();

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

    const trash = within(rail).getByRole("button", {
      name: "Delete selection — ⌫",
    });
    expect(trash).toBeDisabled();
    expect(trash.querySelectorAll("path")).toHaveLength(5);
    expect(trash.querySelector("path")).toHaveAttribute("d", "M4 5.5 L14 5.5");
    expect(trash.querySelector("g")).toBeNull();
  });

  it("trashes the selected object from the tool rail", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);
    const rail = screen.getByRole("navigation", { name: "Drawing tools" });
    const trash = within(rail).getByRole("button", {
      name: "Delete selection — ⌫",
    });
    const fieldList = screen.getByRole("list", {
      name: "Everything on the field",
    });

    expect(trash).toBeDisabled();
    expect(
      within(fieldList).getByRole("button", { name: "X route" }),
    ).toBeVisible();

    await user.click(
      within(fieldList).getByRole("button", { name: "X route" }),
    );
    expect(trash).toBeEnabled();

    await user.click(trash);
    expect(
      within(fieldList).queryByRole("button", { name: "X route" }),
    ).toBeNull();
    expect(trash).toBeDisabled();
  });

  it("drives the live camera controls and tells the truth about the idle formation", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <StrictMode>
        <ChalkApp runtime={createTestRuntime()} />
      </StrictMode>,
    );
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
    expect(screen.getByText(/drag the grass to move the view/)).toBeVisible();
    expect(container.querySelector(".minimap")).toHaveAttribute(
      "data-shown",
      "true",
    );

    await user.click(
      screen.getByRole("button", { name: "Fit the field — 125% zoom" }),
    );
    expect(field).toHaveAttribute("viewBox", "0 0 1000 620");
    expect(screen.getByText(/drag the blue dot above a player/)).toBeVisible();
    expect(container.querySelector(".minimap")).toHaveAttribute(
      "data-shown",
      "false",
    );

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

  it("lets the Coach stand back off the field, and steps him back onto it", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChalkApp runtime={createTestRuntime()} />);
    const field = container.querySelector("svg.field-diagram");

    // Fit is no longer as far back as he can go: one step out leaves the
    // whole field on screen with room around it.
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(field).toHaveAttribute("viewBox", "-125 -77.5 1250 775");
    expect(
      screen.getByRole("button", { name: "Fit the field — 80% zoom" }),
    ).toBeVisible();
    // Nothing is off screen out there, so the navigator stays away.
    expect(container.querySelector(".minimap")).toHaveAttribute(
      "data-shown",
      "false",
    );

    // And he stops at 40%, however many times he asks for more room.
    for (let step = 0; step < 6; step += 1)
      await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(Number(field?.getAttribute("viewBox")?.split(" ")[2])).toBeCloseTo(
      2500,
    );
    expect(
      screen.getByRole("button", { name: "Fit the field — 40% zoom" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Fit the field — 40% zoom" }),
    );
    expect(field).toHaveAttribute("viewBox", "0 0 1000 620");
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

  it("opens Formations without focusing search, so tablets keep the keyboard down", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.click(screen.getByTitle("Browse formations — ⇧⌘F"));
    const book = screen.getByRole("dialog", { name: "Formations" });
    expect(book).toBeVisible();
    expect(
      within(book).getByRole("textbox", { name: "Search formations" }),
    ).not.toHaveFocus();
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

    await unfold(
      user,
      screen.getByRole("complementary", { name: "Play inspector" }),
      "Opponent look",
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
    const star = within(book).getByRole("button", {
      name: "Remove from favorites",
    });
    expect(star.parentElement).toHaveClass("browser-name-row");

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
    expect(
      screen.getByRole("button", { name: "Back to the editor" }),
    ).toBeVisible();
    await waitFor(() => {
      expect(editorStore.getSnapshot().document.name).toBe("Mesh — Alert");
    });
    // Present mode hides authoring chrome, so the acknowledgement lives with
    // the Editor's status bar rather than following the Coach into Present.
    expect(
      screen.queryByRole("button", { name: "Saved on this device" }),
    ).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Play name" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Back to the editor" }),
    );
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

    await user.click(screen.getByRole("button", { name: "Help" }));
    await user.click(
      screen.getByRole("button", { name: "Demo — guided tour" }),
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

  it("shows the letter-landscape Print sheet in Print & export and opens it to print", async () => {
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
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Print & export",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Print preview" }));
    const workspace = screen.getByRole("region", { name: "Print & export" });
    const sheet = within(workspace).getByRole("region", {
      name: "Print preview",
    });
    expect(within(sheet).getByText("Stick — Thunder")).toBeVisible();
    expect(within(sheet).getByText("Offense · Pass")).toBeVisible();
    expect(
      within(sheet).getByText(
        "letter landscape · half-inch margins · coach type",
      ),
    ).toBeVisible();
    expect(sheet.querySelector("svg.field-diagram")).toHaveAttribute(
      "data-type-preset",
      "coach",
    );
    // The source, the count and the paper are stated before anything prints.
    expect(
      within(workspace).getByRole("status", { name: "What prints" }),
    ).toHaveTextContent("Current play: Stick — Thunder · Offense · 1 play");
    expect(
      within(workspace).getByRole("status", { name: "What prints" }),
    ).toHaveTextContent("Letter landscape · half-inch margins");

    await user.click(
      within(workspace).getByRole("button", { name: "Open in a new tab" }),
    );
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(popup.document.write).toHaveBeenCalledWith(
      expect.stringContaining("<h1>Stick — Thunder</h1>"),
    );
    expect(popup.document.write).toHaveBeenCalledWith(
      expect.stringContaining("@page{size:letter landscape;margin:0.5in}"),
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Print & export" })).toBeNull();
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

    await user.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Print & export",
      }),
    );
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
    const settings = await openSettings(user);

    await user.click(within(settings).getByRole("button", { name: /^Print$/ }));
    await user.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Print & export",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Print preview" }));

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

describe("Play classification (issue #63)", () => {
  const coverThree = starterExamplePlays().find(
    ({ name }) => name === "Cover 3 — Fire Zone",
  )!;
  /**
   * Undo is hash-guarded (ADR 0038), so a store that is asked to undo needs
   * the real hash of the Play it opened with, and a save that reports one.
   */
  const createHashedEditorStore = async () =>
    createEditorStore({
      initialDocument: stickThunderPlay,
      initialDocumentHash: await hashPlayDocument(stickThunderPlay),
      persistence: {
        commitPlay: async (input) => ({
          playId: input.play.id,
          documentHash: await hashPlayDocument(input.play),
          committedAtMs: 100,
          mutationId: input.mutation.id,
        }),
      },
      createMutationId: () => "mutation_test",
      monotonicNow: () => 0,
    });
  /** The virtualized browser measures rows; jsdom has no layout to offer. */
  const giveBrowserALayout = () => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return 480;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 480,
          right: 800,
          width: 800,
          height: 480,
          toJSON() {
            return undefined;
          },
        };
      },
    });
    if (typeof globalThis.ResizeObserver !== "function") {
      globalThis.ResizeObserver = class {
        observe() {
          return undefined;
        }
        unobserve() {
          return undefined;
        }
        disconnect() {
          return undefined;
        }
      };
    }
  };
  const projectionOf = (play: PlayDocument) => ({
    playId: play.id,
    playbookId: play.playbookId,
    name: play.name,
    unit: play.unit,
    ...(play.playType === undefined
      ? {}
      : { playTypeId: play.playType.id, playTypeName: play.playType.name }),
    tags: play.tags,
    playerRoles: [],
    assignmentText: [],
    notes: play.notes,
    documentHash: `hash_${play.id}`,
    updatedAtMs: 1,
  });
  const pill = () => screen.getByRole("button", { name: "Play type" });

  it("shows a defensive play's stored classification, not a Pass default", async () => {
    giveBrowserALayout();
    const user = userEvent.setup();
    const envelope = starterPlaybookEnvelope();
    const library = createMemoryLibrary(
      {
        playbook: envelope.playbook,
        concepts: envelope.concepts,
        members: [stickThunderPlay, coverThree].map(projectionOf),
      },
      [stickThunderPlay, coverThree].map((play) => ({
        id: play.id,
        playbookId: play.playbookId,
        document: play,
        documentHash: `hash_${play.id}`,
        updatedAtMs: 1,
      })),
    );
    const editorStore = createTestEditorStore();
    render(<ChalkApp runtime={createTestRuntime({ editorStore, library })} />);

    expect(pill()).toHaveTextContent("Offense · Pass");

    const inspector = screen.getByRole("complementary", {
      name: "Play inspector",
    });
    await unfold(user, inspector, "Library");
    await user.click(
      within(inspector).getByRole("button", { name: "Browse Playbook" }),
    );
    const book = screen.getByRole("dialog", { name: "Playbook" });
    const card = await within(book).findByRole("button", {
      name: /Cover 3 — Fire Zone/,
    });
    // The card says the same words the header will.
    expect(card).toHaveTextContent("Defense");
    expect(card).not.toHaveTextContent("Pass");
    await user.click(card);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Play name" })).toHaveValue(
        "Cover 3 — Fire Zone",
      );
    });
    expect(pill()).toHaveTextContent("Defense");
    expect(pill()).not.toHaveTextContent("Pass");
    expect(editorStore.getSnapshot().document.unit).toBe("defense");
    expect(editorStore.getSnapshot().document.playType).toBeUndefined();
  });

  it("filters Defense apart from Coverage in the browser", async () => {
    giveBrowserALayout();
    const user = userEvent.setup();
    const coverage = {
      ...coverThree,
      id: "play_cover_two",
      name: "Cover 2 — Trap",
      playType: { id: "play_type_coverage", name: "Coverage" },
    };
    const library = createMemoryLibrary({
      ...emptyLibrarySnapshot(stickThunderPlay.playbookId),
      members: [stickThunderPlay, coverThree, coverage].map(projectionOf),
    });
    render(<ChalkApp runtime={createTestRuntime({ library })} />);
    await unfold(
      user,
      screen.getByRole("complementary", { name: "Play inspector" }),
      "Library",
    );
    await user.click(screen.getByRole("button", { name: "Browse Playbook" }));
    const book = screen.getByRole("dialog", { name: "Playbook" });

    await user.click(within(book).getByRole("button", { name: "Defense" }));
    await waitFor(() => {
      expect(book.querySelectorAll("[data-play-id]")).toHaveLength(2);
    });
    // Defense offers only its own Types — no Pass, no Run — plus the plays
    // the Coach left unclassified.
    expect(within(book).queryByRole("button", { name: "Pass" })).toBeNull();
    await user.click(within(book).getByRole("button", { name: "Coverage" }));
    await waitFor(() => {
      expect(book.querySelectorAll("[data-play-id]")).toHaveLength(1);
    });
    expect(within(book).getByText("Cover 2 — Trap")).toBeVisible();
    await user.click(
      within(book).getByRole("button", { name: "Unclassified" }),
    );
    await waitFor(() => {
      expect(within(book).getByText("Cover 3 — Fire Zone")).toBeVisible();
    });
    expect(within(book).queryByText("Cover 2 — Trap")).toBeNull();
  });

  it("changes the Type through a command the Coach can undo", async () => {
    const user = userEvent.setup();
    const editorStore = await createHashedEditorStore();
    render(<ChalkApp runtime={createTestRuntime({ editorStore })} />);

    await user.click(pill());
    const panel = screen.getByRole("group", { name: "Play classification" });
    expect(within(panel).getByRole("button", { name: "Pass" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Offense offers offensive Types only.
    expect(
      within(panel).queryByRole("button", { name: "Coverage" }),
    ).toBeNull();
    await user.click(within(panel).getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(editorStore.getSnapshot().document.playType).toEqual({
        id: "play_type_run",
        name: "Run",
      });
    });
    expect(pill()).toHaveTextContent("Offense · Run");
    expect(
      screen.queryByRole("group", { name: "Play classification" }),
    ).toBeNull();
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toHaveAttribute("title", "Undo Change Play Type");
    await user.click(undo);
    await waitFor(() => {
      expect(pill()).toHaveTextContent("Offense · Pass");
    });
    expect(editorStore.getSnapshot().document.playType?.name).toBe("Pass");
  });

  it("lets a play go unclassified rather than claiming a type it has not", async () => {
    const user = userEvent.setup();
    const editorStore = createTestEditorStore();
    render(<ChalkApp runtime={createTestRuntime({ editorStore })} />);
    await user.click(pill());
    await user.click(screen.getByRole("button", { name: "Unclassified" }));
    await waitFor(() => {
      expect(editorStore.getSnapshot().document.playType).toBeUndefined();
    });
    expect(pill()).toHaveTextContent("Offense");
    expect(pill()).not.toHaveTextContent("Pass");
  });

  it("names what a unit change drops, waits for the Coach, and keeps the diagram", async () => {
    const user = userEvent.setup();
    const editorStore = await createHashedEditorStore();
    const { container } = render(
      <ChalkApp runtime={createTestRuntime({ editorStore })} />,
    );
    const before = editorStore.getSnapshot().document;

    await user.click(pill());
    await user.click(screen.getByRole("button", { name: "Defense" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Moving to Defense drops the Pass type. The diagram stays.",
    );
    // Nothing has moved yet.
    expect(editorStore.getSnapshot().document.unit).toBe("offense");
    await user.click(screen.getByRole("button", { name: "Keep Offense" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(editorStore.getSnapshot().document.unit).toBe("offense");

    await user.click(screen.getByRole("button", { name: "Defense" }));
    await user.click(screen.getByRole("button", { name: "Move to Defense" }));
    await waitFor(() => {
      expect(editorStore.getSnapshot().document.unit).toBe("defense");
    });
    const after = editorStore.getSnapshot().document;
    expect(after.playType).toBeUndefined();
    expect(after.players).toEqual(before.players);
    expect(after.paths).toEqual(before.paths);
    expect(after.labels).toEqual(before.labels);
    expect(container.querySelectorAll("[data-scene-player]")).toHaveLength(11);
    expect(pill()).toHaveTextContent("Defense");

    // One undo puts the unit and the type back together.
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => {
      expect(editorStore.getSnapshot().document.unit).toBe("offense");
    });
    expect(editorStore.getSnapshot().document.playType?.name).toBe("Pass");
    expect(pill()).toHaveTextContent("Offense · Pass");
  });

  it("adds a Coach-defined type to the Playbook and files the play under it", async () => {
    const user = userEvent.setup();
    const editorStore = createTestEditorStore();
    const library = createMemoryLibrary(
      emptyLibrarySnapshot(stickThunderPlay.playbookId),
    );
    render(<ChalkApp runtime={createTestRuntime({ editorStore, library })} />);

    await user.click(pill());
    await user.type(screen.getByLabelText("New offense type"), "Trick");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(editorStore.getSnapshot().document.playType?.name).toBe("Trick");
    });
    expect(pill()).toHaveTextContent("Offense · Trick");
    const playbook = await library.getPlaybook();
    expect(
      playbook?.playTypes.find(({ name }) => name === "Trick"),
    ).toMatchObject({ unit: "offense", archived: false });

    // The new Type is offered next time, and a duplicate is refused.
    await user.click(pill());
    expect(screen.getByRole("button", { name: "Trick" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.type(screen.getByLabelText("New offense type"), "trick");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Offense already has a Trick type.",
    );
  });
});

describe("Inspector progressive disclosure (issue #64)", () => {
  const inspectorOf = () =>
    screen.getByRole("complementary", { name: "Play inspector" });
  const before = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("leads the idle panel with play setup and folds library and print away", () => {
    render(<ChalkApp runtime={createTestRuntime()} />);
    const inspector = inspectorOf();
    const formation = within(inspector).getByTitle("Browse formations — ⇧⌘F");
    const concept = within(inspector).getByRole("button", {
      name: /^No concept yet/,
    });
    const lineCall = within(inspector).getByRole("button", {
      name: /^No line call yet/,
    });
    const library = within(inspector).getByRole("button", {
      name: /^Library/,
      expanded: false,
    });
    expect(before(formation, concept)).toBe(true);
    expect(before(concept, lineCall)).toBe(true);
    expect(before(lineCall, library)).toBe(true);
    // The grids and the library tree are not on the idle panel any more.
    expect(
      within(inspector).queryByRole("button", { name: "Reach" }),
    ).toBeNull();
    expect(within(inspector).queryByText("This play")).toBeNull();
    expect(within(inspector).queryByText(/Applies to all/)).toBeNull();
    expect(
      within(inspector).queryByRole("button", { name: "Half field" }),
    ).toBeNull();
    // Print & export, Field profile, Playbook settings and History moved
    // into the Settings overlay — they should not be on the inspector.
    expect(
      within(inspector).queryByRole("button", { name: /^Print & export/ }),
    ).toBeNull();
    expect(
      within(inspector).queryByRole("button", { name: /^Field$/ }),
    ).toBeNull();
    expect(
      within(inspector).queryByRole("button", { name: /^Playbook settings/ }),
    ).toBeNull();
    expect(
      within(inspector).queryByRole("button", { name: /^History/ }),
    ).toBeNull();
    // What the folded sections currently say stays in view.
    expect(
      inspector.querySelector(
        '[data-disclosure="library"] .disclosure-summary',
      ),
    ).toHaveTextContent(/^0 plays$/);
  });

  it("opens the searchable catalogue, draws a concept in two actions, and stars it", async () => {
    const user = userEvent.setup();
    const library = createMemoryLibrary(
      emptyLibrarySnapshot(stickThunderPlay.playbookId),
    );
    const editorStore = createTestEditorStore();
    render(<ChalkApp runtime={createTestRuntime({ editorStore, library })} />);
    const inspector = inspectorOf();

    await user.click(
      within(inspector).getByRole("button", { name: /^No concept yet/ }),
    );
    const picker = screen.getByRole("dialog", {
      name: "Concepts and line calls",
    });
    // Opened from the concept row it shows concepts; All brings both back.
    // Search stays unfocused so a click on Concept/Line does not steal typing.
    const search = within(picker).getByLabelText(
      "Search concepts and line calls",
    );
    expect(search).not.toHaveFocus();
    expect(within(picker).getByText("CONCEPTS")).toBeVisible();
    expect(within(picker).queryByText("LINE CALLS")).toBeNull();
    await user.click(within(picker).getByRole("button", { name: "All" }));
    expect(within(picker).getByText("LINE CALLS")).toBeVisible();
    await user.type(search, "smash");
    expect(within(picker).queryByText("LINE CALLS")).toBeNull();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(
        within(inspector).getByRole("button", { name: /^Smash/ }),
      ).toBeVisible();
    });
    expect(
      screen.queryByRole("dialog", { name: "Concepts and line calls" }),
    ).toBeNull();
    expect(
      editorStore
        .getSnapshot()
        .document.paths.some((path) => path.concept === "smash"),
    ).toBe(true);

    // Second visit: Recent leads, and a star keeps it under Favorites.
    await user.click(within(inspector).getByRole("button", { name: /^Smash/ }));
    const again = screen.getByRole("dialog", {
      name: "Concepts and line calls",
    });
    expect(within(again).getByText("RECENT")).toBeVisible();
    // Smash is listed under Recent and under Concepts; either star will do.
    await user.click(
      within(again).getAllByRole("button", { name: "Star Smash" })[0]!,
    );
    expect(within(again).getByText("FAVORITES")).toBeVisible();
    const chrome = await library.loadChrome();
    expect(chrome.favoritePresets).toEqual(["concept:smash"]);
    expect(chrome.recentPresets).toEqual(["concept:smash"]);
  });

  it("gives a line call through the same catalogue and says so on the summary", async () => {
    const user = userEvent.setup();
    const editorStore = createTestEditorStore();
    render(<ChalkApp runtime={createTestRuntime({ editorStore })} />);
    const inspector = inspectorOf();
    await user.click(
      within(inspector).getByRole("button", { name: /^No line call yet/ }),
    );
    const picker = screen.getByRole("dialog", {
      name: "Concepts and line calls",
    });
    // Opened from the line-call row, it shows line calls only.
    expect(within(picker).queryByText("CONCEPTS")).toBeNull();
    await user.click(within(picker).getByRole("button", { name: /^Reach/ }));
    await waitFor(() => {
      expect(
        within(inspector).getByRole("button", { name: /^Reach/ }),
      ).toBeVisible();
    });
  });

  it("leads a defensive play with the call and keeps the offense's tools out of the way", () => {
    const coverThree = starterExamplePlays().find(
      ({ name }) => name === "Cover 3 — Fire Zone",
    )!;
    render(
      <ChalkApp
        runtime={createTestRuntime({
          editorStore: createTestEditorStore(undefined, coverThree),
        })}
      />,
    );
    const inspector = inspectorOf();
    expect(within(inspector).getByText("Defensive call")).toBeVisible();
    expect(within(inspector).getByTitle("Browse defenses — ⇧⌘D")).toBeVisible();
    expect(
      within(inspector).queryByRole("button", { name: /^No concept yet/ }),
    ).toBeNull();
    expect(within(inspector).queryByText(/linemen/)).toBeNull();
    expect(
      within(inspector).getByRole("button", {
        name: /^Opponent look/,
        expanded: false,
      }),
    ).toBeVisible();
  });

  it("folds the inspector away, remembers it on the device, and brings it back with ⌥1", async () => {
    const user = userEvent.setup();
    const library = createMemoryLibrary(
      emptyLibrarySnapshot(stickThunderPlay.playbookId),
    );
    render(<ChalkApp runtime={createTestRuntime({ library })} />);
    await user.click(
      screen.getByRole("button", { name: "Hide the inspector" }),
    );
    expect(
      screen.queryByRole("complementary", { name: "Play inspector" }),
    ).toBeNull();
    await waitFor(async () => {
      expect((await library.loadChrome()).inspectorOpen).toBe(false);
    });

    await user.keyboard("{Alt>}1{/Alt}");
    expect(
      screen.getByRole("complementary", { name: "Play inspector" }),
    ).toBeVisible();
    await waitFor(async () => {
      expect((await library.loadChrome()).inspectorOpen).toBe(true);
    });

    // Unfolded sections are remembered the same way.
    await unfold(user, inspectorOf(), "Library");
    await waitFor(async () => {
      expect((await library.loadChrome()).open.library).toBe(true);
    });
  });

  it("puts the coaching first on a selected route and keeps timing under Advanced", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);
    await user.click(
      within(
        screen.getByRole("list", { name: "Everything on the field" }),
      ).getByRole("button", { name: "X route" }),
    );
    const inspector = inspectorOf();
    const read = within(inspector).getByRole("textbox", { name: "Assignment" });
    const appearance = within(inspector).getByRole("button", {
      name: /^Appearance/,
      expanded: false,
    });
    expect(before(read, appearance)).toBe(true);
    expect(within(inspector).queryByLabelText("Delay")).toBeNull();
    expect(within(inspector).queryByLabelText("Dashed")).toBeNull();

    await unfold(user, inspector, "Advanced");
    expect(within(inspector).getByLabelText("Delay")).toBeVisible();
    expect(
      within(inspector).getByRole("button", { name: "Delete this route" }),
    ).toBeVisible();
    await unfold(user, inspector, "Appearance");
    expect(within(inspector).getByLabelText("Dashed")).toBeVisible();
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

    const settings = await openSettings(user);
    expect(within(settings).getByText("History 1")).toBeVisible();
    expect(within(settings).getByText("just now")).toBeVisible();
    expect(within(settings).getByText("Install week")).toBeVisible();
    expect(
      within(settings).getByText(
        "Named snapshots of this play, kept across a closed tab. Restoring is itself undoable.",
      ),
    ).toBeVisible();
    await user.click(
      within(settings).getByRole("button", { name: "Restore" }),
    );
    expect(restored).toEqual(["revision_1", "revision_1"]);
  });

  it("points History at named snapshots instead of a 90-second autosave", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);
    const settings = await openSettings(user);

    expect(
      within(settings).getByRole("heading", { name: /^History/ }),
    ).toBeVisible();
    expect(
      within(settings).getByText(
        "Nothing saved back yet. Name a Snapshot from Save when you want a state you can come back to.",
      ),
    ).toBeVisible();
    expect(within(settings).queryByText(/90 seconds/)).toBeNull();
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
              gamePlans: 0,
              gamePlanRevisions: 0,
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

  it("reaches a set the Coach saved from the palette", async () => {
    const user = userEvent.setup();
    const mine = formationFromOffense(stickThunderPlay, {
      id: "formation_mine",
      playbookId: stickThunderPlay.playbookId,
      name: "Andy's Empty",
      slotId: (index) => `slot_palette_${index}`,
    })!;
    render(
      <ChalkApp
        runtime={createTestRuntime({
          coachSets: {
            formations: [mine],
            favoriteFormationIds: [mine.id],
            favoriteCallIds: [],
          },
        })}
      />,
    );

    await user.keyboard("{Control>}k{/Control}");
    await user.type(
      screen.getByRole("textbox", { name: "Command palette" }),
      "andy",
    );
    expect(
      screen.getByRole("button", { name: "Formation: Andy's Empty" }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: "Formation: Andy's Empty" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Command palette" }),
    ).toBeNull();
    expect(screen.getByText("ANDY'S EMPTY · 11")).toBeVisible();
  });

  it("shows a command the shell has no action for as unavailable", () => {
    // Every catalogued command is wired today (New variation arrived with the
    // library, the call sheet with the coaching outputs), so the mechanism is
    // proven on the palette itself: an entry without an action is listed — the
    // palette is the product's catalogue — but cannot be run, so a click never
    // silently does nothing.
    const onClose = vi.fn();
    const { rerender } = render(
      <CommandPalette
        actions={{}}
        commands={[{ id: "newPlay", label: "New play" }]}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole("button", { name: "New play" })).toBeDisabled();

    const newPlay = vi.fn();
    rerender(
      <CommandPalette
        actions={{ newPlay }}
        commands={[{ id: "newPlay", label: "New play" }]}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole("button", { name: "New play" })).toBeEnabled();
  });

  it("prints an install page from Export with the assignment table", async () => {
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
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Print & export",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Install page" }));

    expect(open).toHaveBeenCalledWith("", "_blank");
    const html = popup.document.write.mock.calls[0]?.[0] as string;
    expect(html).toContain("<title>Stick — Thunder — install — Chalk</title>");
    expect(html).toContain("@page{size:letter portrait;margin:0.5in}");
    expect(html).toContain("<th>Assignment</th>");
    expect(html).toContain('data-type-preset="print"');
    expect(html).toContain(
      '<div class="__pn">Stick — Thunder · Offense · Pass</div>',
    );
    expect(screen.queryByText("DIAGRAM")).toBeNull();
    open.mockRestore();
  });

  it("runs the library outputs from the palette and the menu", async () => {
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

    await user.keyboard("{Control>}k{/Control}");
    await user.type(
      screen.getByRole("textbox", { name: "Command palette" }),
      "call sheet",
    );
    await user.click(
      screen.getByRole("button", { name: "Export: Call sheet" }),
    );

    const html = popup.document.write.mock.calls[0]?.[0] as string;
    expect(html).toContain("<h1>Call sheet</h1>");
    // The seed Play carries its own situation tags, so it is grouped by them.
    expect(html).toContain("<h2>3rd down</h2>");
    expect(html).toContain("<h2>red zone</h2>");
    expect(html.match(/class="wl"/g)?.length).toBe(12);
    open.mockRestore();
  });

  it("picks wristband cells from the library and prints them", async () => {
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
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Print & export",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Wristband — 8 cells" }),
    );

    // The only Play on this device fills the first cell by default.
    expect(screen.getByText("1 of 8 cells filled")).toBeVisible();
    const row = screen.getByRole("button", { name: "Stick — Thunder" });
    expect(row).toHaveAttribute("aria-pressed", "true");

    await user.click(row);
    expect(screen.getByText("0 of 8 cells filled")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Print the wristband" }),
    ).toBeDisabled();

    await user.click(row);
    await user.click(
      screen.getByRole("button", { name: "Print the wristband" }),
    );
    const html = popup.document.write.mock.calls[0]?.[0] as string;
    expect(html).toContain("grid-template-columns:2.1in 2.1in");
    expect(html.match(/class="wc"/g)?.length).toBe(1);
    open.mockRestore();
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
    const settings = await openSettings(user);

    expect(within(settings).getByText("Page")).toBeVisible();
    expect(
      within(settings).getByText(
        "Changes what prints under the play — the players and lines never move.",
      ),
    ).toBeVisible();
    expect(container.querySelectorAll("[data-field-yard-line]")).toHaveLength(
      9,
    );
    expect(container.querySelectorAll("[data-scene-player]")).toHaveLength(11);

    await user.click(
      within(settings).getByRole("button", { name: "Half field" }),
    );
    expect(container.querySelectorAll("[data-field-yard-line]")).toHaveLength(
      7,
    );
    expect(container.querySelectorAll("[data-scene-player]")).toHaveLength(11);

    await user.click(
      within(settings).getByRole("button", { name: "Scout card" }),
    );
    expect(container.querySelectorAll("[data-field-yard-line]")).toHaveLength(
      1,
    );
    expect(container.querySelector("[data-field-sideline]")).toBeNull();

    await user.click(
      within(settings).getByRole("button", { name: "Playbook page" }),
    );
    expect(container.querySelector("svg.field-diagram")).toHaveAttribute(
      "data-field-style",
      "light",
    );
    expect(container.querySelectorAll("[data-field-yard-line]")).toHaveLength(
      9,
    );
    expect(container.querySelector("[data-field-sideline]")).toBeNull();

    await user.click(within(settings).getByRole("button", { name: "Blank" }));
    expect(container.querySelector("[data-field-yard-line]")).toBeNull();
    expect(container.querySelectorAll("[data-scene-player]")).toHaveLength(11);
  });

  it("scales the words and hides a family of marks from the type and layer controls", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChalkApp runtime={createTestRuntime()} />);
    const inspector = screen.getByRole("complementary", {
      name: "Play inspector",
    });
    const settings = await openSettings(user);

    expect(
      within(settings).getByText(
        "Dense — reads, assignments, conversions and notes all on the field.",
      ),
    ).toBeVisible();
    expect(container.querySelectorAll("[data-scene-label]")).toHaveLength(12);

    await user.click(within(settings).getByRole("button", { name: "Player" }));
    expect(
      within(settings).getByText(
        "Bigger type, assignments only — what a player reads across a room.",
      ),
    ).toBeVisible();
    expect(container.querySelector("svg.field-diagram")).toHaveAttribute(
      "data-type-preset",
      "player",
    );

    await user.click(
      within(settings).getByRole("button", { name: /^Print$/ }),
    );
    expect(
      within(settings).getByText(
        "Pure black, no color fills — survives a copier.",
      ),
    ).toBeVisible();

    // The layer toggles live in the inspector bar's Layers popover now.
    await user.click(
      within(inspector).getByRole("button", { name: /^Layers/ }),
    );
    await user.click(within(inspector).getByRole("button", { name: "Text" }));
    expect(container.querySelector("[data-scene-label]")).toBeNull();
    expect(
      within(inspector).getByRole("button", { name: "Text" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      within(inspector).getByRole("button", { name: /^Layers 3\/4/ }),
    ).toBeVisible();
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

    await user.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Print & export",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Position view" }));

    expect(screen.getByText("POSITION VIEW")).toBeVisible();
    expect(screen.queryByText("DIAGRAM")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back to exports" }));
    expect(screen.getByText("DIAGRAM")).toBeVisible();

    // Reopening returns to the top level rather than the submenu.
    await user.click(screen.getByRole("button", { name: "Position view" }));
    await user.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Print & export",
      }),
    );
    await user.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Print & export",
      }),
    );
    expect(screen.getByText("DIAGRAM")).toBeVisible();
  });

  it("opens only one header menu at a time", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("button", { name: "Mirror" })).toBeVisible();

    await user.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Print & export",
      }),
    );
    expect(screen.getByText("DIAGRAM")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mirror" })).toBeNull();
  });

  it("offers playback on a play with routes", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    const bar = screen.getByLabelText("Playback controls");
    expect(bar).toBeVisible();
    expect(within(bar).getByRole("button", { name: "Play" })).toBeVisible();
    expect(
      within(bar).getByRole("button", { name: "Reset positions" }),
    ).toBeVisible();
    expect(
      within(bar).getByRole("slider", { name: "Scrub the play" }),
    ).toBeVisible();
    expect(bar).toHaveAttribute("data-playback-playing", "false");

    await user.click(within(bar).getByRole("button", { name: "Play" }));
    expect(within(bar).getByRole("button", { name: "Pause" })).toBeVisible();
    await user.click(within(bar).getByRole("button", { name: "Pause" }));
    expect(within(bar).getByRole("button", { name: "Play" })).toBeVisible();
  });

  it("focuses and scrubs playback with the keyboard without invoking field shortcuts", async () => {
    const user = userEvent.setup();
    const runtime = createTestRuntime();
    render(<ChalkApp runtime={runtime} />);
    const slider = screen.getByRole("slider", { name: "Scrub the play" });
    const before = runtime.editorStore.getSnapshot().document;
    expect(slider).toHaveAttribute("tabindex", "0");
    slider.focus();
    expect(slider).toHaveFocus();
    await user.keyboard("{Home}{ArrowRight}");
    const start = Number(slider.getAttribute("aria-valuemin"));
    const end = Number(slider.getAttribute("aria-valuemax"));
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(start + 100);
    expect(slider.getAttribute("aria-valuetext")).toContain("seconds");
    await user.keyboard("{ArrowUp}{ArrowLeft}{ArrowDown}");
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(start);
    await user.keyboard("{ArrowLeft}{PageUp}");
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(
      Math.min(start + 1000, end),
    );
    await user.keyboard("{PageDown}{End}{ArrowRight}");
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(end);
    await user.keyboard("{Home}{PageDown}");
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(start);
    expect(runtime.editorStore.getSnapshot().document).toEqual(before);
  });

  it("keeps Share, Attach image, and Film Reference in the More menu", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Share & assets" }));

    expect(screen.getByRole("heading", { name: "Attach image" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Film Reference" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Share Link" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Create Share Link" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Play inspector" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Create Share Link" }));
    expect(screen.getByText(/Sharing needs an account/i)).toBeVisible();

    await user.type(
      screen.getByRole("textbox", { name: "Film Reference address" }),
      "https://www.hudl.com/video/3/clip",
    );
    await user.click(
      screen.getByRole("button", { name: "Add Film Reference" }),
    );
    expect(
      await screen.findByRole("link", {
        name: "https://www.hudl.com/video/3/clip",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /hudl.com/ })).toHaveAttribute(
      "rel",
      "noopener noreferrer nofollow",
    );
  });
});

describe("Navigation (issue #65)", () => {
  const banner = () => screen.getByRole("banner");
  const nav = () => screen.getByRole("navigation", { name: "Workspace views" });

  it("puts Editor, Playbooks and Game Day in the header and the rest behind actions", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    expect(
      within(nav())
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Editor", "Playbooks", "Game Day"]);
    expect(within(nav()).queryByRole("button", { name: "Demo" })).toBeNull();
    expect(within(nav()).queryByRole("button", { name: "Print" })).toBeNull();
    expect(
      within(banner()).getByRole("button", { name: "New play" }),
    ).toBeVisible();
    const resetPositions = within(banner()).getByRole("button", {
      name: "Reset positions",
    });
    expect(resetPositions).toBeVisible();
    expect(resetPositions).toBeDisabled();
    expect(
      within(banner()).getByRole("button", { name: "Present" }),
    ).toBeVisible();
    expect(
      within(banner()).getByRole("button", { name: "Print & export" }),
    ).toBeVisible();

    await user.click(within(banner()).getByRole("button", { name: "Help" }));
    const help = within(banner());
    expect(
      help.getByRole("button", { name: "Demo — guided tour" }),
    ).toBeVisible();
    expect(help.getByText("TUTORIALS")).toBeVisible();
    expect(help.getByRole("button", { name: "Defense" })).toBeVisible();
    expect(
      help.getByRole("button", { name: "Keyboard shortcuts ?" }),
    ).toBeVisible();
    expect(
      help.getByRole("button", { name: "Command palette ⌘K" }),
    ).toBeVisible();

    // Present is still one action away, and esc still comes back.
    await user.click(within(banner()).getByRole("button", { name: "Present" }));
    expect(screen.getByRole("region", { name: "Present" })).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Back to the editor" }),
    );
    expect(nav()).toBeVisible();
  });

  it("resets animated positions from the header after playback moves off the snap", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    const bar = screen.getByLabelText("Playback controls");
    const resetPositions = within(banner()).getByRole("button", {
      name: "Reset positions",
    });
    expect(resetPositions).toBeDisabled();

    const slider = within(bar).getByRole("slider", { name: "Scrub the play" });
    const start = Number(slider.getAttribute("aria-valuemin"));
    const end = Number(slider.getAttribute("aria-valuemax"));
    slider.focus();
    await user.keyboard("{End}");
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(end);
    expect(resetPositions).toBeEnabled();

    await user.click(resetPositions);
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(start);
    expect(resetPositions).toBeDisabled();
  });

  it("opens a tutorial from Help on its own tour", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.click(within(banner()).getByRole("button", { name: "Help" }));
    await user.click(within(banner()).getByRole("button", { name: "Defense" }));
    const demo = screen.getByRole("region", { name: "Demo" });
    expect(within(demo).getByRole("button", { name: "Defense" })).toHaveClass(
      "active",
    );
    expect(screen.getByText("Cover 3 — Fire Zone")).toBeVisible();
  });

  it("makes Playbooks a destination with its two pages and a labeled New play", async () => {
    const user = userEvent.setup();
    const editorStore = createTestEditorStore();
    render(<ChalkApp runtime={createTestRuntime({ editorStore })} />);

    await user.click(within(nav()).getByRole("button", { name: "Playbooks" }));
    const page = screen.getByRole("main", { name: "Playbooks" });
    expect(
      within(page).getByRole("region", { name: "Playbook" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "Drawing tools" }),
    ).toBeNull();
    expect(
      within(nav()).getByRole("button", { name: "Playbooks" }),
    ).toHaveClass("active");
    // A page, not a dialog: nothing to click outside of.
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(
      within(
        screen.getByRole("navigation", { name: "Playbooks pages" }),
      ).getByRole("button", { name: "Game plans" }),
    );
    expect(
      within(page).getByRole("region", { name: "Game plans" }),
    ).toBeVisible();

    await user.click(within(page).getByRole("button", { name: "New play" }));
    expect(
      screen.getByRole("navigation", { name: "Drawing tools" }),
    ).toBeVisible();
    await waitFor(() => {
      expect(editorStore.getSnapshot().document.players).toHaveLength(0);
    });

    await user.click(within(nav()).getByRole("button", { name: "Playbooks" }));
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("navigation", { name: "Drawing tools" }),
    ).toBeVisible();
  });

  it("shows Game Day with the way to a prepared plan when nothing is prepared", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.click(within(nav()).getByRole("button", { name: "Game Day" }));
    const page = screen.getByRole("main", { name: "Game Day" });
    expect(within(page).getByText(/Nothing is prepared/)).toBeVisible();
    await user.click(
      within(page).getByRole("button", { name: "Open Game plans" }),
    );
    expect(screen.getByRole("region", { name: "Game plans" })).toBeVisible();
  });

  it("moves Clear into the More menu as Clear… with its scopes and undo in view", async () => {
    const user = userEvent.setup();
    const editorStore = createTestEditorStore();
    render(<ChalkApp runtime={createTestRuntime({ editorStore })} />);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Clear a layer" }));
    const clear = screen.getByRole("group", { name: "Clear a layer" });
    expect(
      within(clear)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["‹", "Coverage", "Routes", "Offense", "Defense", "Text", "All"]);
    expect(within(clear).getByText(/Undo brings any of it back/)).toBeVisible();
    // An offensive play has no coverage to take off.
    expect(
      within(clear).getByRole("button", { name: "Coverage" }),
    ).toBeDisabled();

    await user.click(within(clear).getByRole("button", { name: "Routes" }));
    await waitFor(() => {
      expect(editorStore.getSnapshot().document.paths).toHaveLength(0);
    });
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute(
      "title",
      "Undo Clear offensive routes",
    );
    expect(screen.queryByRole("group", { name: "Clear a layer" })).toBeNull();

    // Reopening the menu starts on the actions, with Back a page away.
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("button", { name: "Mirror" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear a layer" }));
    await user.click(screen.getByRole("button", { name: "Back to actions" }));
    expect(screen.getByRole("button", { name: "Mirror" })).toBeVisible();
  });

  it("names the tools on request, remembers it, and calls Block a Blitz on a defender", async () => {
    const user = userEvent.setup();
    const coverThree = starterExamplePlays().find(
      ({ name }) => name === "Cover 3 — Fire Zone",
    )!;
    const library = createMemoryLibrary(
      emptyLibrarySnapshot(coverThree.playbookId),
    );
    render(
      <ChalkApp
        runtime={createTestRuntime({
          editorStore: createTestEditorStore(undefined, coverThree),
          library,
        })}
      />,
    );
    const rail = screen.getByRole("navigation", { name: "Drawing tools" });
    expect(rail).not.toHaveClass("labeled");
    expect(
      within(rail).getByRole("button", { name: "Block — B" }),
    ).toBeVisible();

    await user.click(within(rail).getByRole("button", { name: "Tool names" }));
    expect(rail).toHaveClass("labeled");
    expect(within(rail).getByText("Zone drop")).toBeVisible();
    await waitFor(async () => {
      expect((await library.loadChrome()).railLabels).toBe(true);
    });

    await user.click(
      within(
        screen.getByRole("list", { name: "Everything on the field" }),
      ).getAllByRole("button", { name: /defense player$/ })[0]!,
    );
    expect(
      within(rail).getByRole("button", { name: "Blitz — B" }),
    ).toBeVisible();
    expect(within(rail).getByText("Blitz")).toBeVisible();
    expect(
      within(rail).queryByRole("button", { name: "Block — B" }),
    ).toBeNull();
  });

  it("points a Coach on his first blank field at Help → Demo", () => {
    render(
      <ChalkApp
        runtime={createTestRuntime({
          editorStore: createTestEditorStore(undefined, {
            ...stickThunderPlay,
            players: [],
            paths: [],
            labels: [],
          }),
        })}
      />,
    );
    expect(
      screen.getByText(
        "new here? Help → Demo walks the drawing tools on a real play",
      ),
    ).toBeVisible();
  });

  it("reaches the destinations and the tour from the palette", async () => {
    const user = userEvent.setup();
    render(<ChalkApp runtime={createTestRuntime()} />);

    await user.keyboard("{Control>}k{/Control}");
    const search = screen.getByRole("textbox", { name: "Command palette" });
    await user.type(search, "Game Day");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("main", { name: "Game Day" })).toBeVisible();
  });
});

describe("Tablet and narrow screens (issue #68)", () => {
  /** A screen the browser reports as the given queries matching. */
  const screenWhere = (matching: (query: string) => boolean) => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) =>
      ({
        matches: matching(query),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;
    return () => {
      globalThis.matchMedia = original;
    };
  };

  it("keeps the destinations on a screen below the floor and lets the Coach edit there anyway", async () => {
    const restore = screenWhere((query) => !query.includes("min-width"));
    try {
      const user = userEvent.setup();
      render(<ChalkApp runtime={createTestRuntime()} />);
      const nav = screen.getByRole("navigation", { name: "Workspace views" });
      expect(
        within(nav).getByRole("button", { name: "Game Day" }),
      ).toBeVisible();
      expect(screen.getByText("Read only")).toBeVisible();
      expect(
        screen.queryByRole("navigation", { name: "Drawing tools" }),
      ).toBeNull();

      await user.click(within(nav).getByRole("button", { name: "Playbooks" }));
      expect(screen.getByRole("main", { name: "Playbooks" })).toBeVisible();
      await user.click(within(nav).getByRole("button", { name: "Editor" }));

      await user.click(
        screen.getByRole("button", { name: "Edit on this screen" }),
      );
      expect(
        screen.getByRole("navigation", { name: "Drawing tools" }),
      ).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Read only" }));
      expect(
        screen.queryByRole("navigation", { name: "Drawing tools" }),
      ).toBeNull();
    } finally {
      restore();
    }
  });

  it("starts the inspector as a closed drawer below 1024 px and keeps the keyboard down on a finger", async () => {
    const restore = screenWhere(
      (query) =>
        query.includes("max-width: 1023px") ||
        query.includes("pointer: coarse") ||
        query.includes("min-width"),
    );
    try {
      const user = userEvent.setup();
      render(<ChalkApp runtime={createTestRuntime()} />);
      expect(
        screen.queryByRole("complementary", { name: "Play inspector" }),
      ).toBeNull();
      await user.click(screen.getByRole("button", { name: "Inspector" }));
      expect(
        screen.getByRole("complementary", { name: "Play inspector" }),
      ).toBeVisible();

      const nav = screen.getByRole("navigation", { name: "Workspace views" });
      await user.click(within(nav).getByRole("button", { name: "Playbooks" }));
      expect(screen.getByLabelText("Search plays")).not.toHaveFocus();
      // The rail keeps its footprint; the names are a tap away on Aa.
      await user.click(within(nav).getByRole("button", { name: "Editor" }));
      const rail = screen.getByRole("navigation", { name: "Drawing tools" });
      expect(rail).not.toHaveClass("labeled");
      expect(
        within(rail).getByRole("button", { name: "Tool names" }),
      ).toBeVisible();
    } finally {
      restore();
    }
  });
});

describe("Present for a thumb (issue #67)", () => {
  it("steps variations with visible Previous and Next and comes back with a labeled Back", async () => {
    const user = userEvent.setup();
    const envelope = starterPlaybookEnvelope();
    const library = createMemoryLibrary(
      {
        playbook: envelope.playbook,
        concepts: envelope.concepts,
        members: starterExamplePlays().map((play) => ({
          playId: play.id,
          playbookId: play.playbookId,
          name: play.name,
          unit: play.unit,
          ...(play.conceptSource
            ? { conceptId: play.conceptSource.conceptId }
            : {}),
          tags: play.tags,
          playerRoles: [],
          assignmentText: [],
          notes: play.notes,
          documentHash: `hash_${play.id}`,
          updatedAtMs: 1,
        })),
      },
      starterExamplePlays().map((play) => ({
        id: play.id,
        playbookId: play.playbookId,
        document: play,
        documentHash: `hash_${play.id}`,
        updatedAtMs: 1,
      })),
    );
    render(<ChalkApp runtime={createTestRuntime({ library })} />);
    await user.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Present",
      }),
    );
    const present = screen.getByRole("region", { name: "Present" });
    await waitFor(() => {
      expect(present.querySelector(".present-pos")?.textContent).toMatch(
        /^1 \/ /,
      );
    });
    await user.click(
      within(present).getByRole("button", { name: "Next variation" }),
    );
    await waitFor(() => {
      expect(present.querySelector(".present-pos")?.textContent).toMatch(
        /^2 \/ /,
      );
    });
    await user.click(
      within(present).getByRole("button", { name: "Previous variation" }),
    );
    await waitFor(() => {
      expect(present.querySelector(".present-pos")?.textContent).toMatch(
        /^1 \/ /,
      );
    });
    await user.click(
      within(present).getByRole("button", { name: "Back to the editor" }),
    );
    expect(
      screen.getByRole("navigation", { name: "Drawing tools" }),
    ).toBeVisible();
  });
});
