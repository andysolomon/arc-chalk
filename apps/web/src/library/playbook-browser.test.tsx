import { blankPlaybook, stickThunderPlay } from "@chalk/domain";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createMemoryLibrary } from "../app/editor-runtime";
import { PlaybookBrowser } from "./playbook-browser";

function member(
  index: number,
  name = `Play ${index}`,
): {
  readonly playId: string;
  readonly playbookId: string;
  readonly name: string;
  readonly unit: "offense";
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
    unit: "offense",
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

describe("the Playbook browser on a tablet (issue #68)", () => {
  const observers: Array<(width: number) => void> = [];
  const installObserver = () => {
    globalThis.ResizeObserver = class {
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        // Only the scroller's own observer hears a resize; the virtualizer
        // measures its rows through another one.
        if (!target.classList.contains("playbook-scroll")) return;
        observers.push((width) =>
          this.callback(
            [{ contentRect: { width }, target } as ResizeObserverEntry],
            this,
          ),
        );
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    };
  };

  it("lays the cards out by the width it has and keeps the rows in step", async () => {
    installObserver();
    const members = Array.from({ length: 9 }, (_, index) => member(index));
    render(
      <PlaybookBrowser
        currentPlayId="play_0"
        focusSearch={false}
        initial={{ scrollTop: 0, query: "" }}
        library={createMemoryLibrary()}
        members={members}
        onClose={() => undefined}
        onOpen={() => undefined}
        onRemember={() => undefined}
        playTypes={blankPlaybook().playTypes}
      />,
    );
    const scroller = document.querySelector(".playbook-scroll")!;
    expect(scroller).toHaveAttribute("data-grid-columns", "4");
    // A finger did not ask for the keyboard.
    expect(screen.getByLabelText("Search plays")).not.toHaveFocus();

    act(() => {
      for (const resize of observers) resize(662);
    });
    expect(scroller).toHaveAttribute("data-grid-columns", "3");
    await waitFor(() => {
      const rows = [...document.querySelectorAll(".playbook-virtual-row")];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect((row as HTMLElement).style.gridTemplateColumns).toBe(
          "repeat(3, minmax(0, 1fr))",
        );
        expect(
          row.querySelectorAll("[data-play-id]").length,
        ).toBeLessThanOrEqual(3);
      }
    });
  });
});
