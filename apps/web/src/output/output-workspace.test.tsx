import {
  starterExamplePlays,
  starterPlaybookEnvelope,
  type PlayDocument,
} from "@chalk/domain";
import { defaultPresentation } from "@chalk/render";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  createMemoryLibrary,
  type ChalkLibrary,
  type LibrarySnapshot,
} from "../app/editor-runtime";
import { hundredCallPlan } from "../library/game-day-fixture";
import { defaultOutputSpec, type OutputSpec } from "./output-spec";
import { OutputWorkspace } from "./output-workspace";
import type { PrintOutcome } from "./print-frame";

const plays = starterExamplePlays();
const envelope = starterPlaybookEnvelope();
const snapshot: LibrarySnapshot = {
  playbook: envelope.playbook,
  concepts: envelope.concepts,
  members: plays.map((play) => ({
    playId: play.id,
    playbookId: play.playbookId,
    name: play.name,
    unit: play.unit,
    tags: play.tags,
    playerRoles: [],
    assignmentText: [],
    notes: play.notes,
    documentHash: `h_${play.id}`,
    updatedAtMs: 1,
  })),
};

function libraryOf(extra: readonly PlayDocument[] = []): ChalkLibrary {
  return createMemoryLibrary(
    snapshot,
    [...plays, ...extra].map((play) => ({
      id: play.id,
      playbookId: play.playbookId,
      document: play,
      documentHash: `h_${play.id}`,
      updatedAtMs: 1,
    })),
  );
}

function renderWorkspace(
  spec: OutputSpec = defaultOutputSpec(defaultPresentation),
  overrides: {
    library?: ChalkLibrary;
    print?: (html: string) => Promise<PrintOutcome>;
    openWindow?: (html: string) => PrintOutcome;
    libraryPlays?: readonly PlayDocument[];
  } = {},
) {
  const library = overrides.library ?? libraryOf();
  const onRan = vi.fn();
  const print = vi.fn<(html: string) => Promise<PrintOutcome>>(
    overrides.print ?? (() => Promise.resolve({ ok: true, via: "frame" })),
  );
  const openWindow = vi.fn<(html: string) => PrintOutcome>(
    overrides.openWindow ?? (() => ({ ok: true, via: "window" })),
  );
  render(
    <OutputWorkspace
      currentPlay={plays[0]!}
      formations={[]}
      initial={spec}
      onClose={() => undefined}
      onRan={onRan}
      ports={{
        library,
        loadLibrary: () =>
          Promise.resolve({
            plays: overrides.libraryPlays ?? plays,
            concepts: envelope.concepts,
          }),
        print,
        openWindow,
      }}
      presentation={defaultPresentation}
      snapshot={snapshot}
    />,
  );
  return { onRan, print, openWindow };
}

const status = () =>
  within(screen.getByRole("region", { name: "Print & export" })).getByRole(
    "status",
    { name: "What prints" },
  );

describe("Print & export (issue #69)", () => {
  it("states the source, count, order and paper, and keeps the selection when a format cannot take it", async () => {
    const user = userEvent.setup();
    const { print, onRan } = renderWorkspace();
    expect(status()).toHaveTextContent("Current play: Stick — Thunder");
    expect(status()).toHaveTextContent("1 play");
    expect(status()).toHaveTextContent("Letter landscape · half-inch margins");

    await user.click(screen.getByRole("radio", { name: "Selected plays" }));
    const list = screen.getByRole("list", { name: "Plays to pick" });
    await user.click(within(list).getByLabelText("Four Verticals"));
    await user.click(within(list).getByLabelText("Cover 3 — Fire Zone"));
    expect(status()).toHaveTextContent(
      "3 selected plays · 3 plays · in the order picked",
    );
    // The order is the Coach's, and he can move a play.
    const order = screen.getByRole("list", { name: "Print order" });
    expect(
      within(order)
        .getAllByRole("listitem")
        .map((item) => item.textContent?.replace(/[↑↓]/g, "")),
    ).toEqual(["Stick — Thunder", "Four Verticals", "Cover 3 — Fire Zone"]);
    await user.click(
      within(order).getByRole("button", {
        name: "Move Cover 3 — Fire Zone up",
      }),
    );
    expect(within(order).getAllByRole("listitem")[1]?.textContent).toContain(
      "Cover 3 — Fire Zone",
    );

    // Field sheet prints one play: the three stay selected and the reason is said.
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Field sheet prints one play",
    );
    expect(screen.getByRole("button", { name: "Print…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^Practice cards/ }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(status()).toHaveTextContent("Practice cards");
    expect(status()).toHaveTextContent("3 plays");
    expect(screen.getByTitle("Preview")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("@media screen"),
    );

    await user.click(screen.getByRole("button", { name: "Print…" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(print.mock.calls[0]?.[0]).toContain("Cover 3 — Fire Zone");
    expect(screen.getByText("Sent to print.")).toBeVisible();
    expect(onRan).toHaveBeenCalledWith(
      expect.objectContaining({ format: "practice", sourceKind: "selection" }),
    );
  });

  it("explains an empty selection instead of printing the whole library", async () => {
    const user = userEvent.setup();
    const { print } = renderWorkspace();
    await user.click(screen.getByRole("radio", { name: "Selected plays" }));
    await user.click(
      within(
        screen.getByRole("list", { name: "Plays to pick" }),
      ).getByLabelText("Stick — Thunder"),
    );
    await user.click(
      screen.getByRole("button", { name: /^Coordinator call sheet/ }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Pick at least one play.",
    );
    expect(screen.getByRole("button", { name: "Print…" })).toBeDisabled();
    expect(print).not.toHaveBeenCalled();
  });

  it("prints a game plan's prepared packet and names the revision, or its current plays on request", async () => {
    const user = userEvent.setup();
    const packet = hundredCallPlan();
    const library = libraryOf(packet.plays);
    await library.saveGamePlan(packet.plan);
    await library.saveGamePlanRevision(packet.revision);
    const { print } = renderWorkspace(
      defaultOutputSpec(defaultPresentation, "callSheet", {
        kind: "plan",
        planId: packet.plan.id,
        copy: "revision",
      }),
      { library, libraryPlays: [...plays, ...packet.plays] },
    );
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        "Game plan: Week 5 · Offense · 100 plays",
      ),
    );
    expect(status()).toHaveTextContent("prepared");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Section" }),
      packet.plan.sections[0]!.id,
    );
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        "Week 5 — Openers · Offense · 34 plays",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Print…" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(print.mock.calls[0]?.[0]).toContain("Openers");
    expect(print.mock.calls[0]?.[0]).not.toContain("3rd down");

    await user.click(screen.getByRole("button", { name: "Current plays" }));
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        "current plays, not the prepared packet",
      ),
    );
  });

  it("reports a blocked pop-up with the way round it", async () => {
    const user = userEvent.setup();
    const { print } = renderWorkspace(
      defaultOutputSpec(defaultPresentation, "install"),
      {
        openWindow: () => ({ ok: false, reason: "blocked" }),
      },
    );
    await user.click(screen.getByRole("button", { name: "Open in a new tab" }));
    expect(
      await screen.findByText(/The browser blocked the new tab/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Print from here" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it("does not inherit hidden editor layers: the detail preset is explicit", async () => {
    const user = userEvent.setup();
    const { print } = renderWorkspace(
      defaultOutputSpec({
        ...defaultPresentation,
        layers: { reads: false, assigns: false, notes: false, text: false },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Print…" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    // Full detail is the default whatever the inspector had hidden…
    expect(print.mock.calls[0]?.[0]).toContain("MAX SPLIT");
    // …and Diagram only is an explicit choice, not a leftover.
    await user.click(screen.getByRole("button", { name: "Diagram only" }));
    await user.click(screen.getByRole("button", { name: "Print…" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(2));
    expect(print.mock.calls[1]?.[0]).not.toContain("MAX SPLIT");
  });
});
