import { starterPlaybookEnvelope, type GamePlan } from "@chalk/domain";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  createMemoryLibrary,
  type ChalkLibrary,
  type LibrarySnapshot,
} from "../app/editor-runtime";
import { hundredCallPlan } from "./game-day-fixture";
import { GameDayView } from "./game-day-view";

const envelope = starterPlaybookEnvelope();

async function libraryWith(
  packet: ReturnType<typeof hundredCallPlan>,
  hashes: (playId: string) => string = (id) => `h_${id}`,
): Promise<{ library: ChalkLibrary; snapshot: LibrarySnapshot }> {
  const snapshot: LibrarySnapshot = {
    playbook: envelope.playbook,
    concepts: envelope.concepts,
    members: packet.plays.map((play) => ({
      playId: play.id,
      playbookId: play.playbookId,
      name: play.name,
      unit: play.unit,
      tags: play.tags,
      playerRoles: [],
      assignmentText: [],
      notes: play.notes,
      documentHash: hashes(play.id),
      updatedAtMs: 1,
    })),
  };
  const library = createMemoryLibrary(
    snapshot,
    packet.plays.map((play) => ({
      id: play.id,
      playbookId: play.playbookId,
      document: play,
      documentHash: hashes(play.id),
      updatedAtMs: 1,
    })),
  );
  await library.saveGamePlan(packet.plan);
  await library.saveGamePlanRevision(packet.revision);
  return { library, snapshot };
}

function renderReader(
  library: ChalkLibrary,
  snapshot: LibrarySnapshot,
  hasImage: (hash: string) => Promise<boolean> = () => Promise.resolve(true),
) {
  return render(
    <GameDayView
      hasImage={hasImage}
      library={library}
      onOpenPlaybooks={() => undefined}
      snapshot={snapshot}
    />,
  );
}

const reader = () => screen.getByRole("main", { name: "Game Day" });
const stage = () => screen.getByRole("region", { name: "Selected call" });

describe("the Game Day reader (issue #67)", () => {
  it(
    "opens a prepared plan, finds a call by number, steps Next, and comes back to its section",
    { timeout: 20_000 },
    async () => {
      const user = userEvent.setup();
      const packet = hundredCallPlan();
      const { library, snapshot } = await libraryWith(packet);
      renderReader(library, snapshot);

      await user.click(await screen.findByRole("button", { name: /Week 5/ }));
      expect(within(reader()).getByText("Offense · Week 5")).toBeVisible();
      expect(
        await screen.findByText(/Ready offline · 100 calls/),
      ).toBeVisible();
      // Situations, favorites, and every section by name.
      const tabs = screen.getByRole("navigation", { name: "Situations" });
      expect(
        within(tabs)
          .getAllByRole("button")
          .map((tab) => tab.textContent),
      ).toEqual(["All", "★ Favorites", "Openers", "3rd down", "Red zone"]);

      await user.type(
        screen.getByRole("searchbox", {
          name: "Find a call by number or name",
        }),
        "12",
      );
      const calls = screen.getByRole("navigation", { name: "Calls" });
      const rows = within(calls).getAllByRole("button", { name: /^12 / });
      expect(rows).toHaveLength(1);
      await user.click(rows[0]!);
      expect(within(stage()).getByText("12")).toBeVisible();
      expect(within(stage()).getByText(/ 12$/)).toBeVisible();

      // Next inside a one-call search stays put; clearing the search frees it.
      expect(screen.getByRole("button", { name: "Next call" })).toBeDisabled();
      await user.click(
        screen.getByRole("button", { name: "Back to Red zone" }),
      );
      expect(
        screen.getByRole("searchbox", {
          name: "Find a call by number or name",
        }),
      ).toHaveValue("");
      // Call 12 is in the third section (12 % 3 === 0 → "Red zone").
      expect(
        within(tabs).getByRole("button", { name: "Red zone" }),
      ).toHaveClass("active");
      await user.click(screen.getByRole("button", { name: "Next call" }));
      expect(within(stage()).getByText("15")).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Previous call" }));
      expect(within(stage()).getByText("12")).toBeVisible();
      // The diagram is drawn and takes no pointer.
      const svg = stage().querySelector("svg.field-diagram")!;
      expect(svg).toBeTruthy();
      expect(svg.getAttribute("tabindex")).toBeNull();
    },
  );

  it(
    "keeps stars, notes and marks on the device beside the revision, and lands back where it was",
    { timeout: 20_000 },
    async () => {
      const user = userEvent.setup();
      const packet = hundredCallPlan();
      const { library, snapshot } = await libraryWith(packet);
      const { unmount } = renderReader(library, snapshot);
      await user.click(await screen.findByRole("button", { name: /Week 5/ }));
      await screen.findByText(/Ready offline/);
      const calls = screen.getByRole("navigation", { name: "Calls" });
      await user.click(within(calls).getByRole("button", { name: /^7 / }));
      await user.click(
        screen.getByRole("button", { name: "Add to favorites" }),
      );
      await user.click(screen.getByRole("button", { name: /^Called/ }));
      await user.click(screen.getByRole("button", { name: /^Called/ }));
      await user.click(screen.getByRole("button", { name: "Score" }));
      await user.type(
        screen.getByRole("textbox", { name: "Game note" }),
        "Alert to the boundary",
      );
      await user.tab();
      expect(screen.getByRole("button", { name: /^Called ×2/ })).toBeVisible();

      const stored = await library.loadGameDay();
      const notes = stored.revisions[packet.revision.id]!;
      const seven = packet.plan.calls.find((call) => call.code === "7")!;
      expect(notes.favorites).toEqual([seven.id]);
      expect(notes.marks[seven.id]).toEqual({ called: 2, result: "score" });
      expect(notes.notes[seven.id]).toBe("Alert to the boundary");
      expect(stored.place?.callId).toBe(seven.id);
      // Nothing reached the play itself.
      const play = await library.getPlay(seven.playId);
      expect(play?.document.notes).toBe(packet.plays[6]!.notes);

      unmount();
      renderReader(library, snapshot);
      const again = await screen.findByRole("region", {
        name: "Selected call",
      });
      expect(within(again).getByText(/ 7$/)).toBeVisible();
      expect(screen.getByRole("textbox", { name: "Game note" })).toHaveValue(
        "Alert to the boundary",
      );
      await user.click(
        within(
          screen.getByRole("navigation", { name: "Situations" }),
        ).getByRole("button", { name: "★ Favorites" }),
      );
      expect(
        within(screen.getByRole("navigation", { name: "Calls" })).getAllByRole(
          "button",
          { name: /^\d+ / },
        ),
      ).toHaveLength(1);
    },
  );

  it(
    "says when the plan has moved on, and switches revisions only when asked",
    { timeout: 20_000 },
    async () => {
      const user = userEvent.setup();
      const packet = hundredCallPlan();
      const { library, snapshot } = await libraryWith(packet, (id) =>
        id === "play_call_1" ? "h_changed" : `h_${id}`,
      );
      const first = renderReader(library, snapshot);
      await user.click(await screen.findByRole("button", { name: /Week 5/ }));
      expect(
        await screen.findByText(/have changed since this packet was prepared/),
      ).toBeVisible();
      first.unmount();

      // A newer packet is prepared behind the reader's back.
      const newer = hundredCallPlan({
        planId: packet.plan.id,
        nowMs: 5000,
        idPrefix: "b",
      });
      const renamed: GamePlan = { ...newer.plan, name: "Week 5 — final" };
      await library.saveGamePlanRevision({ ...newer.revision, plan: renamed });
      await library.saveGamePlan({
        ...renamed,
        preparedRevisionId: newer.revision.id,
      });
      renderReader(library, snapshot);
      expect(
        await screen.findByText(/A newer packet has been prepared/),
      ).toBeVisible();
      // Still the packet that was opened.
      expect(screen.getByText("Offense · Week 5")).toBeVisible();
      await user.click(
        screen.getByRole("button", { name: "Switch to the newest" }),
      );
      expect(await screen.findByText("Offense · Week 5 — final")).toBeVisible();
    },
  );

  it("does not claim readiness it cannot show", async () => {
    const user = userEvent.setup();
    const packet = hundredCallPlan();
    const withImage = {
      ...packet,
      revision: {
        ...packet.revision,
        plays: packet.revision.plays.map((play, index) =>
          index === 0
            ? {
                ...play,
                document: {
                  ...play.document,
                  attachments: [
                    {
                      id: "att_1",
                      hash: "a".repeat(64),
                      mimeType: "image/png" as const,
                      width: 4,
                      height: 4,
                      byteLength: 8,
                    },
                  ],
                },
              }
            : play,
        ),
      },
    };
    const { library, snapshot } = await libraryWith(withImage);
    renderReader(library, snapshot, () => Promise.resolve(false));
    await user.click(await screen.findByRole("button", { name: /Week 5/ }));
    expect(
      await screen.findByText(/Not ready offline — missing 1: image aaaaaaaa/),
    ).toBeVisible();
    expect(screen.queryByText(/Ready offline ·/)).toBeNull();
  });
});
