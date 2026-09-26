import {
  starterExamplePlays,
  stickThunderPlay,
  type PlayDocument,
} from "@chalk/domain";
import {
  createEditorStore,
  type EditorPersistence,
  type EditorStore,
} from "@chalk/editor";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  createMemoryLibrary,
  emptyLibrarySnapshot,
  type ChalkRuntime,
} from "../app/editor-runtime";
import { ChalkApp } from "./chalk-app";

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

/** The left sidebar (ADR 0058): formation, ball, shadow, layers, library, help. */
const sidebarOf = () => screen.getByRole("navigation", { name: "Sidebar" });

describe("Chalk application shell", () => {
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
});

describe("Play classification (issue #63)", () => {
  const coverThree = starterExamplePlays().find(
    ({ name }) => name === "Cover 3 — Fire Zone",
  )!;
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
    await unfold(user, sidebarOf(), "Library");
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

    // The sidebar is remembered the same way, and ⌥3 brings it back.
    await user.click(screen.getByRole("button", { name: "Hide the sidebar" }));
    expect(screen.queryByRole("navigation", { name: "Sidebar" })).toBeNull();
    await waitFor(async () => {
      expect((await library.loadChrome()).sidebarOpen).toBe(false);
    });
    await user.keyboard("{Alt>}3{/Alt}");
    expect(screen.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
    await waitFor(async () => {
      expect((await library.loadChrome()).sidebarOpen).toBe(true);
    });
  });
});

describe("Chalk device durability surfaces", () => {
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
  it("keeps a lineman to his block — no route by key, no blue dot, no other kind", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChalkApp runtime={createTestRuntime()} />);
    const outline = screen.getByRole("list", {
      name: "Everything on the field",
    });
    const drawing = () =>
      container.querySelector(".field-wrap")?.getAttribute("data-drawing");

    // The Quarterback runs routes, so he has the dot.
    await user.click(
      within(outline).getByRole("button", { name: "Q offense player" }),
    );
    expect(container.querySelector(".route-dot")).not.toBeNull();

    // The centre blocks and nothing else.
    await user.click(
      within(outline).getAllByRole("button", {
        name: "player offense player",
      })[2]!,
    );
    const draw = screen.getByRole("group", { name: "Draw by hand" });
    expect(
      within(draw)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["BlockB"]);
    expect(container.querySelector(".route-dot")).toBeNull();
    for (const key of ["r", "m", "z"]) {
      await user.keyboard(key);
      expect(drawing()).toBeNull();
    }

    // Given a block, the line can be nothing but a block.
    await user.click(screen.getByRole("button", { name: /^Drive/ }));
    await user.click(
      within(
        screen.getByRole("list", { name: "Everything on the field" }),
      ).getByRole("button", { name: /offense player block/ }),
    );
    expect(
      [
        ...container.querySelectorAll(".label-inspector .segments")[0]!
          .children,
      ].map((button) => button.textContent),
    ).toEqual(["Block"]);
  });

  it("keeps a defender off routes — no route by key, no blue dot, no route kind", async () => {
    const user = userEvent.setup();
    const coverThree = starterExamplePlays().find(
      ({ name }) => name === "Cover 3 — Fire Zone",
    )!;
    const { container } = render(
      <ChalkApp
        runtime={createTestRuntime({
          editorStore: createTestEditorStore(undefined, coverThree),
          library: createMemoryLibrary(
            emptyLibrarySnapshot(coverThree.playbookId),
          ),
        })}
      />,
    );
    const outline = screen.getByRole("list", {
      name: "Everything on the field",
    });
    await user.click(
      within(outline).getAllByRole("button", { name: /defense player$/ })[0]!,
    );
    expect(container.querySelector(".route-dot")).toBeNull();
    for (const key of ["r", "m"]) {
      await user.keyboard(key);
      expect(
        container.querySelector(".field-wrap")?.getAttribute("data-drawing"),
      ).toBeNull();
    }

    // A drop can become a blitz or a stunt, never a route or a ball flight.
    await user.click(
      within(outline).getAllByRole("button", { name: / zone$/ })[0]!,
    );
    expect(
      [
        ...container.querySelectorAll(".label-inspector .segments")[0]!
          .children,
      ].map((button) => button.textContent),
    ).toEqual(["Zone", "Blitz", "Stunt"]);
  });

  it("offers Done over the field while a line is in hand, and a Free draw switch that is remembered", async () => {
    const user = userEvent.setup();
    const library = createMemoryLibrary(
      emptyLibrarySnapshot(stickThunderPlay.playbookId),
    );
    const { container } = render(
      <ChalkApp runtime={createTestRuntime({ library })} />,
    );
    const outline = screen.getByRole("list", {
      name: "Everything on the field",
    });
    await user.click(
      within(outline).getByRole("button", { name: "Q offense player" }),
    );
    const draw = screen.getByRole("group", { name: "Draw by hand" });
    // The switch is not one of the lines he can be given.
    expect(
      within(draw)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["RouteR", "MotionM", "BlockB"]);
    const freeDraw = within(draw).getByRole("switch", { name: "Free draw" });
    expect(freeDraw).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("group", { name: "Route in hand" })).toBeNull();

    await user.click(within(draw).getByRole("button", { name: /^Route/ }));
    const bar = screen.getByRole("group", { name: "Route in hand" });
    expect(container.querySelector(".field-wrap")).toHaveAttribute(
      "data-drawing",
      "true",
    );
    expect(within(bar).getByRole("button", { name: "Breaks" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByText(/Done, enter or double-click: finish/),
    ).toBeVisible();

    // The way the line is drawn can change mid-line, and it is remembered.
    await user.click(within(bar).getByRole("button", { name: "Free draw" }));
    expect(
      within(bar).getByRole("button", { name: "Free draw" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/lifting finishes it/)).toBeVisible();
    expect((await library.loadChrome()).freeDraw).toBe(true);

    // Done ends the line where Enter or a double click would have.
    await user.click(
      within(bar).getByRole("button", { name: "Finish the route — ⏎" }),
    );
    expect(container.querySelector(".field-wrap")).not.toHaveAttribute(
      "data-drawing",
    );
    expect(screen.queryByRole("group", { name: "Route in hand" })).toBeNull();

    // The switch in the inspector shows the choice, and the next line
    // starts the way it says.
    await user.click(
      within(outline).getByRole("button", { name: "Q offense player" }),
    );
    expect(
      within(screen.getByRole("group", { name: "Draw by hand" })).getByRole(
        "switch",
        { name: "Free draw" },
      ),
    ).toHaveAttribute("aria-checked", "true");
    await user.keyboard("r");
    expect(
      within(screen.getByRole("group", { name: "Route in hand" })).getByRole(
        "button",
        { name: "Free draw" },
      ),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(
      screen.getByRole("button", { name: "Cancel the route — esc" }),
    );
    expect(container.querySelector(".field-wrap")).not.toHaveAttribute(
      "data-drawing",
    );
  });
});
