import { starterPlaybookEnvelope, type GamePlan } from "@chalk/domain";
import { render, screen } from "@testing-library/react";
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

describe("the Game Day reader (issue #67)", () => {
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
      expect(
        screen.getByText("Week 5", { selector: ".game-day-title" }),
      ).toBeVisible();
      await user.click(
        screen.getByRole("button", { name: "Switch to the newest" }),
      );
      expect(
        await screen.findByText("Week 5 — final", {
          selector: ".game-day-title",
        }),
      ).toBeVisible();
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
