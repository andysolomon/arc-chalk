import { stickThunderPlay } from "@chalk/domain";
import { render, screen } from "@testing-library/react";
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
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Playbook" });
    expect(dialog.className).toContain("browser");
    await userEvent.type(screen.getByLabelText("Search plays"), "stick");
    expect(await screen.findByText("Stick — Thunder")).toBeVisible();
    expect(dialog.querySelectorAll("[data-play-id]").length).toBeLessThan(80);
  });
});
