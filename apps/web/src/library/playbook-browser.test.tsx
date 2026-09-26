import { blankPlaybook, stickThunderPlay } from "@chalk/domain";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createMemoryLibrary } from "../app/editor-runtime";
import { sortPlays } from "./play-order";
import { PlaybookBrowser } from "./playbook-browser";

function member(
  index: number,
  name = `Play ${index}`,
  unit: "offense" | "defense" = "offense",
): {
  readonly playId: string;
  readonly playbookId: string;
  readonly name: string;
  readonly unit: "offense" | "defense";
  readonly tags: readonly string[];
  readonly playerRoles: readonly string[];
  readonly assignmentText: readonly string[];
  readonly notes: string;
  readonly documentHash: string;
  readonly updatedAtMs: number;
} {
  return {
    playId: `play_${index}`,
    playbookId: stickThunderPlay.playbookId,
    name,
    unit,
    tags: [],
    playerRoles: [],
    assignmentText: [],
    notes: "",
    documentHash: `hash_${index}`,
    updatedAtMs: index,
  };
}

describe("the Playbook browser", () => {
  it("virtualizes a 2,000-Play list instead of mounting every card", async () => {
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

    const members = Array.from({ length: 2_000 }, (_, index) =>
      member(index, index === 12 ? "Stick — Thunder" : `Play ${index}`),
    );
    render(
      <PlaybookBrowser
        currentPlayId="play_0"
        initial={{ scrollTop: 0, query: "" }}
        library={createMemoryLibrary()}
        members={members}
        onClose={() => undefined}
        onOpen={() => undefined}
        onRemember={() => undefined}
        playTypes={blankPlaybook().playTypes}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Playbook" });
    expect(dialog.className).toContain("browser");
    await userEvent.type(screen.getByLabelText("Search plays"), "stick");
    expect(await screen.findByText("Stick — Thunder")).toBeVisible();
    expect(dialog.querySelectorAll("[data-play-id]").length).toBeLessThan(80);
  });
});

describe("the Playbooks page", () => {
  const book = [
    member(1, "Stick — Thunder"),
    member(2, "Cover 3 — Fire Zone", "defense"),
    member(3, "Four Verticals"),
  ];

  it("narrows with a chip, opens back up with a second press, and clears", async () => {
    const closed: string[] = [];
    render(
      <PlaybookBrowser
        currentPlayId="play_1"
        embedded
        focusSearch={false}
        initial={{ scrollTop: 0, query: "" }}
        library={createMemoryLibrary()}
        members={book}
        onClose={() => closed.push("page")}
        onOpen={() => undefined}
        onRemember={() => undefined}
        playTypes={blankPlaybook().playTypes}
      />,
    );
    const filters = screen.getByRole("group", { name: "Filter plays" });
    const defense = within(filters).getByRole("button", { name: "Defense" });
    expect(screen.getByText("3 plays")).toBeVisible();

    await userEvent.click(defense);
    expect(defense).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 of 3 plays")).toBeVisible();
    await waitFor(() =>
      expect(document.querySelectorAll("[data-play-id]")).toHaveLength(1),
    );

    await userEvent.click(defense);
    expect(defense).toHaveAttribute("aria-pressed", "false");
    await waitFor(() =>
      expect(document.querySelectorAll("[data-play-id]")).toHaveLength(3),
    );

    const search = screen.getByLabelText("Search plays");
    await userEvent.type(search, "zzz");
    expect(await screen.findByText("No plays match")).toBeVisible();
    // Escape empties the search before it would leave the page.
    await userEvent.keyboard("{Escape}");
    expect(search).toHaveValue("");
    expect(closed).toEqual([]);
    await userEvent.keyboard("{Escape}");
    expect(closed).toEqual(["page"]);

    await userEvent.type(search, "zzz");
    expect(await screen.findByText("No plays match")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear search and filters" }),
    );
    expect(screen.getByLabelText("Search plays")).toHaveValue("");
    await waitFor(() =>
      expect(document.querySelectorAll("[data-play-id]")).toHaveLength(3),
    );
  });

  it("remembers the order it was asked for", async () => {
    const remembered: unknown[] = [];
    render(
      <PlaybookBrowser
        currentPlayId="play_1"
        embedded
        focusSearch={false}
        initial={{ scrollTop: 0, query: "" }}
        library={createMemoryLibrary()}
        members={book}
        onClose={() => undefined}
        onOpen={() => undefined}
        onRemember={(state) => remembered.push(state)}
        playTypes={blankPlaybook().playTypes}
      />,
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Sort plays" }),
      "recent",
    );
    expect(remembered.at(-1)).toMatchObject({ sort: "recent" });
    await waitFor(() =>
      expect(
        [...document.querySelectorAll("[data-play-id]")].map((node) =>
          node.getAttribute("data-play-id"),
        ),
      ).toEqual(["play_3", "play_2", "play_1"]),
    );
  });

  it("deletes a Play only after it is asked twice", async () => {
    const deleted: string[] = [];
    const opened: string[] = [];
    const closed: string[] = [];
    render(
      <PlaybookBrowser
        currentPlayId="play_1"
        deletePrompt={() => "It goes for good."}
        embedded
        focusSearch={false}
        initial={{ scrollTop: 0, query: "" }}
        library={createMemoryLibrary()}
        members={book}
        onClose={() => closed.push("page")}
        onDelete={(playId) => deleted.push(playId)}
        onOpen={(playId) => opened.push(playId)}
        onRemember={() => undefined}
        playTypes={blankPlaybook().playTypes}
      />,
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Actions for Four Verticals",
      }),
    );
    const sheet = screen.getByRole("dialog", { name: "Four Verticals" });
    await userEvent.keyboard("{Escape}");
    expect(sheet).not.toBeInTheDocument();
    expect(closed).toEqual([]);

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Four Verticals" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete…" }));
    expect(screen.getByText("It goes for good.")).toBeVisible();
    expect(deleted).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Delete play" }));
    expect(deleted).toEqual(["play_3"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Stick — Thunder" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Back to the editor" }),
    );
    expect(opened).toEqual(["play_1"]);
  });
});

describe("the Playbook's order", () => {
  it("reads by name with numbers in order, or by the last edit", () => {
    const plays = [
      { ...member(1, "Trips 10"), updatedAtMs: 5 },
      { ...member(2, "trips 9"), updatedAtMs: 1 },
      { ...member(3, "Bunch"), updatedAtMs: 9 },
    ];
    expect(sortPlays(plays, "name").map(({ name }) => name)).toEqual([
      "Bunch",
      "trips 9",
      "Trips 10",
    ]);
    expect(sortPlays(plays, "recent").map(({ name }) => name)).toEqual([
      "Bunch",
      "Trips 10",
      "trips 9",
    ]);
  });
});
