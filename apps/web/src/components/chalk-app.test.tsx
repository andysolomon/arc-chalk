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

  it("keeps the play name editable and exposes the original modes", async () => {
    const user = userEvent.setup();
    const editorStore = createTestEditorStore();
    render(<ChalkApp runtime={createTestRuntime({ editorStore })} />);

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
    // Present mode hides authoring chrome, so the acknowledgement lives with
    // the Editor's status bar rather than following the Coach into Present.
    expect(
      screen.queryByRole("button", { name: "Saved on this device" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Editor" }));
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
          createdAtMs: 1,
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
