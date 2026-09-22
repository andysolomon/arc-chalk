import {
  starterExamplePlays,
  starterPlaybookEnvelope,
  type PlayDocument,
} from "@chalk/domain";
import type { PlaySearchProjection } from "@chalk/local-db";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  createMemoryLibrary,
  type ChalkLibrary,
  type LibrarySnapshot,
} from "../app/editor-runtime";
import { GamePlansWorkspace } from "./game-plans-workspace";

const plays = starterExamplePlays();
const envelope = starterPlaybookEnvelope();

const projectionOf = (
  play: PlayDocument,
  hash = `hash_${play.id}`,
): PlaySearchProjection => ({
  playId: play.id,
  playbookId: play.playbookId,
  name: play.name,
  unit: play.unit,
  ...(play.playType === undefined
    ? {}
    : { playTypeId: play.playType.id, playTypeName: play.playType.name }),
  ...(play.conceptSource === undefined
    ? {}
    : { conceptId: play.conceptSource.conceptId }),
  tags: play.tags,
  playerRoles: [],
  assignmentText: [],
  notes: play.notes,
  documentHash: hash,
  updatedAtMs: 1,
});

function snapshotOf(hashes: Record<string, string> = {}): LibrarySnapshot {
  return {
    playbook: envelope.playbook,
    concepts: envelope.concepts,
    members: plays.map((play) => projectionOf(play, hashes[play.id])),
  };
}

function libraryOf(snapshot: LibrarySnapshot): ChalkLibrary {
  return createMemoryLibrary(
    snapshot,
    plays.map((play) => ({
      id: play.id,
      playbookId: play.playbookId,
      document: play,
      documentHash: `hash_${play.id}`,
      updatedAtMs: 1,
    })),
  );
}

let clock = 1_700_000_000_000;
const now = () => (clock += 1_000);

function renderWorkspace(
  library: ChalkLibrary,
  snapshot: LibrarySnapshot,
  overrides: Partial<Parameters<typeof GamePlansWorkspace>[0]> = {},
) {
  const onOpenPlay = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <GamePlansWorkspace
      formations={[]}
      library={library}
      now={now}
      onClose={onClose}
      onOpenPlay={onOpenPlay}
      render={() => "<svg></svg>"}
      snapshot={snapshot}
      {...overrides}
    />,
  );
  return { ...view, onOpenPlay, onClose };
}

const dialog = () => screen.getByRole("dialog", { name: "Game plans" });

async function createPlan(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  unit: "Offense" | "Defense",
) {
  await user.click(within(dialog()).getByRole("button", { name: "New plan" }));
  await user.type(screen.getByLabelText("Plan name"), name);
  await user.click(
    within(screen.getByRole("group", { name: "Coordinator" })).getByRole(
      "button",
      { name: unit },
    ),
  );
  await user.type(screen.getByLabelText("Opponent"), "Central");
  await user.click(screen.getByRole("button", { name: "Create plan" }));
  await screen.findByLabelText("Add plays");
}

async function addSelected(
  user: ReturnType<typeof userEvent.setup>,
  names: readonly string[],
) {
  const list = screen.getByRole("group", { name: "Matching plays" });
  for (const name of names) {
    await user.click(within(list).getByLabelText(name));
  }
}

describe("the Game plans workspace", () => {
  it("creates separate offensive and defensive plans from a mixed library, and reopens them", async () => {
    const user = userEvent.setup();
    const snapshot = snapshotOf();
    const library = libraryOf(snapshot);
    renderWorkspace(library, snapshot);
    expect(screen.getByText(/No game plans yet/)).toBeVisible();

    await createPlan(user, "Week 3", "Offense");
    // The coordinator's sections, and the library scoped to his unit.
    expect(screen.getByRole("region", { name: "Openers" })).toBeVisible();
    const list = screen.getByRole("group", { name: "Matching plays" });
    expect(within(list).getByText("Stick — Thunder")).toBeVisible();
    expect(within(list).queryByText("Cover 3 — Fire Zone")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Back to game plans" }),
    );
    await createPlan(user, "Week 3 D", "Defense");
    expect(screen.getByRole("region", { name: "Pressure" })).toBeVisible();
    expect(
      within(screen.getByRole("group", { name: "Matching plays" })).getByText(
        "Cover 3 — Fire Zone",
      ),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Back to game plans" }),
    );
    const rows = dialog().querySelectorAll("[data-plan-id]");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Week 3")).toBeVisible();
    // The unit is a labeled badge on the row, ahead of the same words.
    const defensive = [...rows].find((row) =>
      row.querySelector('.unit-badge[data-unit="defense"]'),
    );
    expect(defensive).toHaveTextContent(/Defense · vs Central · 0 calls/);
    expect(await library.listGamePlans()).toHaveLength(2);

    // Rename in place, duplicate as last week's plan, reopen the copy.
    await user.click(screen.getAllByRole("button", { name: "Rename" })[1]!);
    const rename = screen.getByLabelText("Rename plan");
    await user.clear(rename);
    await user.type(rename, "Week 3 offense{Enter}");
    await waitFor(() => {
      expect(screen.getByText("Week 3 offense")).toBeVisible();
    });
    const row = screen
      .getByText("Week 3 offense")
      .closest("[data-plan-id]") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Duplicate" }));
    expect(screen.getByLabelText("Copy name")).toHaveValue(
      "Week 3 offense copy",
    );
    await user.click(within(row).getByRole("button", { name: "Duplicate" }));
    expect(await screen.findByLabelText("Plan name")).toHaveValue(
      "Week 3 offense copy",
    );
    expect(await library.listGamePlans()).toHaveLength(3);
  });

  it("previews a bulk addition before adding, keeps codes unique, and moves calls", async () => {
    const user = userEvent.setup();
    const snapshot = snapshotOf();
    const library = libraryOf(snapshot);
    renderWorkspace(library, snapshot);
    await createPlan(user, "Week 3", "Offense");

    await addSelected(user, ["Stick — Thunder", "Four Verticals"]);
    expect(dialog().querySelector("[data-preview]")).toHaveTextContent(
      "2 new calls",
    );
    await user.click(screen.getByRole("button", { name: "Add 2 to plan" }));
    const openers = screen.getByRole("region", { name: "Openers" });
    await waitFor(() => {
      expect(openers.querySelectorAll("[data-call-id]")).toHaveLength(2);
    });
    expect(screen.getByText("Added 2 new calls")).toBeVisible();

    // Re-adding one to another section says so before it happens, and keeps
    // one call for the play.
    await user.selectOptions(
      screen.getByLabelText("Target section"),
      "3rd down",
    );
    await addSelected(user, ["Stick — Thunder"]);
    expect(dialog().querySelector("[data-preview]")).toHaveTextContent(
      "1 already in the plan, placed in 3rd down",
    );
    await user.click(screen.getByRole("button", { name: "Add 1 to plan" }));
    const third = screen.getByRole("region", { name: "3rd down" });
    await waitFor(() => {
      expect(third.querySelectorAll("[data-call-id]")).toHaveLength(1);
    });
    const [plan] = await library.listGamePlans();
    expect(plan!.calls).toHaveLength(2);

    // Codes: assign, collide, keep the old one, name the holder.
    const stickCode = within(openers).getByLabelText(
      "Call number for Stick — Thunder",
    );
    await user.type(stickCode, "12{Enter}");
    await waitFor(() => {
      expect(
        within(third).getByLabelText("Call number for Stick — Thunder"),
      ).toHaveValue("12");
    });
    const vertsCode = within(openers).getByLabelText(
      "Call number for Four Verticals",
    );
    await user.type(vertsCode, "12{Enter}");
    expect(await within(openers).findByRole("status")).toHaveTextContent(
      "12 is already a call in this plan. It belongs to Stick — Thunder.",
    );
    expect(
      (await library.listGamePlans())[0]!.calls.map(({ code }) => code),
    ).toEqual(["12", ""]);
    await user.click(
      within(openers).getByRole("button", {
        name: "Next free number for Four Verticals",
      }),
    );
    await waitFor(() => {
      expect(
        within(openers).getByLabelText("Call number for Four Verticals"),
      ).toHaveValue("13");
    });

    // Move down, then move to another section — accessible controls.
    await user.click(
      within(openers).getByRole("button", {
        name: "Move Stick — Thunder down",
      }),
    );
    await waitFor(() => {
      const names = [...openers.querySelectorAll(".game-plan-call-name")].map(
        (node) => node.textContent,
      );
      expect(names).toEqual(["Four Verticals", "Stick — Thunder"]);
    });
    await user.selectOptions(
      within(openers).getByLabelText("Move Four Verticals to section"),
      "Red zone",
    );
    await waitFor(() => {
      expect(
        within(screen.getByRole("region", { name: "Red zone" })).getByText(
          "Four Verticals",
        ),
      ).toBeVisible();
    });
    expect(openers.querySelectorAll("[data-call-id]")).toHaveLength(1);
  });

  it("prepares a revision, then flags the plan when a source play moves on", async () => {
    const user = userEvent.setup();
    const snapshot = snapshotOf();
    const library = libraryOf(snapshot);
    const view = renderWorkspace(library, snapshot);
    await createPlan(user, "Week 3", "Offense");
    await addSelected(user, ["Stick — Thunder"]);
    await user.click(screen.getByRole("button", { name: "Add 1 to plan" }));
    await screen.findByText("Added 1 new call");

    expect(screen.getByRole("button", { name: "Call sheet" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Prepare for game" }));
    await waitFor(() => {
      expect(screen.getByText("Prepared 1 call")).toBeVisible();
    });
    const [plan] = await library.listGamePlans();
    expect(plan!.preparedRevisionId).toBeDefined();
    const revision = await library.getGamePlanRevision(
      plan!.preparedRevisionId!,
    );
    expect(revision?.plays.map(({ playId }) => playId)).toEqual([plays[0]!.id]);
    expect(screen.getByRole("button", { name: "Call sheet" })).toBeEnabled();

    // The Coach edits Stick in the library: the packet is behind, and says so
    // without changing what was prepared.
    view.rerender(
      <GamePlansWorkspace
        formations={[]}
        library={library}
        now={now}
        onClose={view.onClose}
        onOpenPlay={view.onOpenPlay}
        render={() => "<svg></svg>"}
        snapshot={snapshotOf({ [plays[0]!.id]: "hash_edited" })}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Back to game plans" }),
    );
    await user.click(screen.getByRole("button", { name: /^Week 3/ }));
    const status = await screen.findByText(/library has moved on since/);
    expect(status).toHaveTextContent("changed: Stick — Thunder");
    expect(status.getAttribute("data-stale")).toBe("true");
    expect(
      (await library.getGamePlanRevision(plan!.preparedRevisionId!))?.plays[0]
        ?.documentHash,
    ).toBe(`hash_${plays[0]!.id}`);

    // A call's name opens the play in the editor.
    await user.click(screen.getByRole("button", { name: "Stick — Thunder" }));
    expect(view.onClose).toHaveBeenCalled();
    expect(view.onOpenPlay).toHaveBeenCalledWith(plays[0]!.id);
  });

  it("prepares a call number typed a moment before Prepare, even while its save is in flight", async () => {
    const user = userEvent.setup();
    const snapshot = snapshotOf();
    const inner = libraryOf(snapshot);
    // Plan saves wait at a gate until the test opens it — the write that has
    // not landed yet when the Coach clicks Prepare.
    const waiting: (() => void)[] = [];
    let gated = false;
    const library: ChalkLibrary = {
      ...inner,
      saveGamePlan: (plan) =>
        gated
          ? new Promise<void>((resolve) => {
              waiting.push(resolve);
            }).then(() => inner.saveGamePlan(plan))
          : inner.saveGamePlan(plan),
    };
    renderWorkspace(library, snapshot);
    await createPlan(user, "Week 3", "Offense");
    await addSelected(user, ["Stick — Thunder"]);
    await user.click(screen.getByRole("button", { name: "Add 1 to plan" }));
    await screen.findByText("Added 1 new call");

    gated = true;
    const field = screen.getByLabelText("Call number for Stick — Thunder");
    await user.type(field, "99");
    // The click leaves the field, which commits 99, then asks to prepare.
    await user.click(screen.getByRole("button", { name: "Prepare for game" }));
    expect(field).toHaveValue("99");
    await waitFor(() => expect(waiting).toHaveLength(1));
    expect((await inner.listGamePlans())[0]?.calls[0]?.code).toBe("");

    // The edit lands; Prepare was queued behind it and writes the plan next.
    waiting.shift()!();
    await waitFor(() => expect(waiting).toHaveLength(1));
    waiting.shift()!();
    await waitFor(() => {
      expect(screen.getByText("Prepared 1 call")).toBeVisible();
    });
    const [plan] = await inner.listGamePlans();
    const revision = await inner.getGamePlanRevision(plan!.preparedRevisionId!);
    expect(revision?.plan.calls[0]?.code).toBe("99");
    expect(plan!.calls[0]?.code).toBe("99");
  });

  it("prints the same packet after the editor's page, type and layers change", async () => {
    const user = userEvent.setup();
    const snapshot = snapshotOf();
    const library = libraryOf(snapshot);
    // The shell's renderer draws options over the editor's live presentation.
    const rendererOver =
      (base: {
        pageKind: string;
        typePreset: string;
        layers: Record<string, boolean>;
      }): Parameters<typeof GamePlansWorkspace>[0]["render"] =>
      (play, options = {}) =>
        `<svg data-play="${play.id}" data-effective='${JSON.stringify({
          pageKind: options.pageKind ?? base.pageKind,
          typePreset: options.typePreset ?? base.typePreset,
          layers: { ...base.layers, ...options.layers },
        })}'></svg>`;
    const coach = rendererOver({
      pageKind: "full",
      typePreset: "coach",
      layers: { reads: true, assigns: true, notes: true, text: true },
    });
    const stripped = rendererOver({
      pageKind: "card",
      typePreset: "player",
      layers: { reads: false, assigns: false, notes: false, text: false },
    });
    const printed: string[] = [];
    const open = vi.spyOn(window, "open").mockImplementation(
      () =>
        ({
          document: {
            write: (html: string) => {
              printed.push(html);
            },
            close: () => undefined,
          },
          focus: () => undefined,
          print: () => undefined,
        }) as unknown as Window,
    );
    try {
      const view = renderWorkspace(library, snapshot, { render: coach });
      await createPlan(user, "Week 3", "Offense");
      await addSelected(user, ["Stick — Thunder"]);
      await user.click(screen.getByRole("button", { name: "Add 1 to plan" }));
      await screen.findByText("Added 1 new call");
      await user.click(
        screen.getByRole("button", { name: "Prepare for game" }),
      );
      await waitFor(() => {
        expect(screen.getByText("Prepared 1 call")).toBeVisible();
      });
      await user.click(screen.getByRole("button", { name: "Handout" }));
      await user.click(screen.getByRole("button", { name: "Wristband" }));
      expect(printed).toHaveLength(2);

      // The Coach hides every layer and switches to the card page in the
      // inspector, then prints again without preparing.
      view.rerender(
        <GamePlansWorkspace
          formations={[]}
          library={library}
          now={now}
          onClose={view.onClose}
          onOpenPlay={view.onOpenPlay}
          render={stripped}
          snapshot={snapshot}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Handout" }));
      await user.click(screen.getByRole("button", { name: "Wristband" }));
      expect(printed).toHaveLength(4);
      expect(printed[2]).toBe(printed[0]);
      expect(printed[3]).toBe(printed[1]);
      expect(printed[0]).toContain(
        `"pageKind":"full","typePreset":"print","layers":{"reads":true,"assigns":true,"notes":true,"text":true}`,
      );
      expect(printed[1]).toContain(
        `"pageKind":"full","typePreset":"print","layers":{"reads":false,"assigns":false,"notes":false,"text":false}`,
      );
    } finally {
      open.mockRestore();
    }
  });
});
