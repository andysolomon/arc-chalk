import {
  createGamePlan,
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

  it("drops one plan's packet the moment another plan is chosen, and prints nothing while the next one reads", async () => {
    const user = userEvent.setup();
    const packet = hundredCallPlan();
    const other = hundredCallPlan({
      planId: "plan_b",
      idPrefix: "b",
      nowMs: 5,
    });
    const library = libraryOf(packet.plays);
    await library.saveGamePlan(packet.plan);
    await library.saveGamePlanRevision(packet.revision);
    await library.saveGamePlan({ ...other.plan, name: "Week 6" });
    await library.saveGamePlanRevision(other.revision);
    const draft = createGamePlan({
      playbookId: packet.plan.playbookId,
      name: "Draft B",
      unit: "offense",
      nowMs: 9,
      id: "plan_draft",
    });
    await library.saveGamePlan(draft);
    // The other plan's packet is held back until the test lets it through.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: ChalkLibrary = {
      ...library,
      getGamePlanRevision: (id) =>
        id === other.revision.id
          ? gate.then(() => library.getGamePlanRevision(id))
          : library.getGamePlanRevision(id),
    };
    renderWorkspace(
      defaultOutputSpec(defaultPresentation, "callSheet", {
        kind: "plan",
        planId: packet.plan.id,
        copy: "revision",
      }),
      { library: slow, libraryPlays: [...plays, ...packet.plays] },
    );
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        "Game plan: Week 5 · Offense · 100 plays",
      ),
    );
    const planSelect = screen.getByRole("combobox", { name: "Plan" });
    const printButton = () => screen.getByRole("button", { name: "Print…" });

    // Prepared → unprepared: no packet is carried over.
    await user.selectOptions(planSelect, draft.id);
    await waitFor(() => expect(status()).toHaveTextContent("Draft B"));
    expect(status()).not.toHaveTextContent("100 plays");
    expect(status()).not.toHaveTextContent("prepared");
    expect(screen.getByText(/has not been prepared/)).toBeInTheDocument();
    expect(printButton()).toBeDisabled();

    // Prepared → prepared while the packet is still reading: nothing prints
    // and the first plan's hundred calls never appear under the second's name.
    await user.selectOptions(planSelect, other.plan.id);
    await waitFor(() => expect(status()).toHaveTextContent("reading the plan"));
    expect(status()).not.toHaveTextContent("100 plays");
    expect(screen.getByRole("alert")).toHaveTextContent("Reading the plan");
    expect(printButton()).toBeDisabled();
    release();
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        "Game plan: Week 6 · Offense · 100 plays",
      ),
    );
    expect(status()).toHaveTextContent("prepared 1 Jan 1970");
    expect(printButton()).toBeEnabled();

    // Leaving the plan source and coming back reads the plan chosen, not
    // the one before it.
    await user.click(screen.getByRole("radio", { name: /^Current play/ }));
    await waitFor(() => expect(status()).not.toHaveTextContent("Game plan"));
    await user.click(screen.getByRole("radio", { name: /^Game plan/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Plan" }),
      packet.plan.id,
    );
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        "Game plan: Week 5 · Offense · 100 plays",
      ),
    );
  }, 20_000);

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

  it("prints the packet's sections as prepared when the live plan has since lost or renamed one", async () => {
    const user = userEvent.setup();
    const packet = hundredCallPlan();
    const library = libraryOf(packet.plays);
    const [openers, thirdDown, redZone] = packet.plan.sections;
    // After preparing: Openers deleted, 3rd down renamed, the packet kept.
    const live = {
      ...packet.plan,
      sections: [{ ...thirdDown!, name: "Money down" }, redZone!],
      calls: packet.plan.calls.filter(
        (call) => !openers!.callIds.includes(call.id),
      ),
    };
    await library.saveGamePlan(live);
    await library.saveGamePlanRevision(packet.revision);
    const { print } = renderWorkspace(
      defaultOutputSpec(defaultPresentation, "callSheet", {
        kind: "plan",
        planId: packet.plan.id,
        copy: "revision",
      }),
      { library, libraryPlays: [...plays, ...packet.plays] },
    );
    const layout = await screen.findByRole("group", {
      name: "Call sheet layout",
    });
    // The layout offers the packet's sections under their prepared names.
    expect(within(layout).getByLabelText("Title for Openers")).toBeVisible();
    expect(within(layout).getByLabelText("Title for 3rd down")).toBeVisible();
    expect(within(layout).queryByLabelText("Title for Money down")).toBeNull();
    await waitFor(() =>
      expect(status()).toHaveTextContent("Week 5 · Offense · 100 plays"),
    );
    await user.click(screen.getByRole("button", { name: "Print…" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const html = print.mock.calls[0]![0];
    expect(html).toContain("Openers");
    expect(html).toContain("3rd down");
    expect(html).not.toContain("Money down");
    expect(html).toContain("100 calls ·");
    expect(html.match(/<td class="cc">/g)).toHaveLength(100);

    // A section the Coach leaves off is said so, not counted as printed.
    await user.click(
      within(layout).getByRole("button", {
        name: "Leave Openers off the sheet",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Print…" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(2));
    expect(print.mock.calls[1]![0]).toContain(
      "66 of 100 calls — 34 left off this sheet",
    );
  }, 20_000);
});

describe("configurable coordinator call sheets (issue #70)", () => {
  it("lays a plan's sheet out from its template, keeps the layout on the device, and says what will not fit", async () => {
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
    const layout = await screen.findByRole("group", {
      name: "Call sheet layout",
    });
    expect(within(layout).getByRole("button", { name: "OC" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(layout).getByLabelText("Personnel")).toBeChecked();
    // Thirty-four calls in a section will not sit in one column of eighteen.
    const warnings = within(layout).getByRole("list", {
      name: "Before printing",
    });
    expect(warnings).toHaveTextContent("Openers lists 34 calls");
    await user.click(within(layout).getByRole("button", { name: "Compact" }));
    expect(
      within(layout).getByRole("list", { name: "Before printing" }),
    ).toHaveTextContent("a column holds 26");

    await user.click(within(layout).getByRole("button", { name: "Two sides" }));
    await user.type(
      within(layout).getByLabelText("Title for Openers"),
      "Script",
    );
    await user.selectOptions(
      within(layout).getByLabelText("Accent for Openers"),
      "a",
    );
    await user.click(within(layout).getByLabelText(/^Check/));
    await user.click(screen.getByRole("button", { name: "Print…" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const html = print.mock.calls[0]![0];
    expect(html).toContain("Week 5 — Offensive coordinator");
    expect(html).toContain("Side 1 of 2");
    expect(html).toContain(">Script<");
    expect(html).toContain('<span class="tag">A</span>');
    expect(html).toContain("<th>Check</th>");
    expect(html).toContain('<td class="cc">12</td>');

    const stored = await library.loadCallSheetConfigs();
    expect(stored[packet.plan.id]).toMatchObject({
      template: "oc",
      density: "compact",
      sides: 2,
    });
    expect(stored[packet.plan.id]!.sections[0]).toMatchObject({
      title: "Script",
      accent: "a",
    });
  });
});

describe("configurable wristband inserts (issue #71)", () => {
  it(
    "confirms the plan's calls, reorders them, takes one off, names one short, and keeps it all on the device",
    { timeout: 20_000 },
    async () => {
      const user = userEvent.setup();
      const packet = hundredCallPlan();
      const library = libraryOf(packet.plays);
      await library.saveGamePlan(packet.plan);
      await library.saveGamePlanRevision(packet.revision);
      const { print } = renderWorkspace(
        defaultOutputSpec(defaultPresentation, "wristband", {
          kind: "plan",
          planId: packet.plan.id,
          copy: "revision",
        }),
        { library, libraryPlays: [...plays, ...packet.plays] },
      );
      const band = await screen.findByRole("group", {
        name: "Wristband inserts",
      });
      // A hundred calls paginate into thirteen inserts of eight; nothing is cut.
      expect(band).toHaveTextContent(
        "8 cells an insert · 100 calls → 13 inserts",
      );
      const list = within(band).getByRole("list", {
        name: "Calls on the band",
      });
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(100);
      expect(items[0]).toHaveTextContent("1");
      expect(items[1]).toHaveTextContent("4");

      await user.click(
        within(items[1]!).getByRole("button", { name: /^Move .* up$/ }),
      );
      expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("4");
      await user.click(
        within(within(list).getAllByRole("listitem")[2]!).getByRole("button", {
          name: /^Take .* off the band$/,
        }),
      );
      expect(within(list).getAllByRole("listitem")).toHaveLength(99);
      expect(
        screen.getByRole("group", { name: "Calls not on the band" }),
      ).toHaveTextContent("+ 7");
      await user.type(
        within(within(list).getAllByRole("listitem")[0]!).getByRole("textbox"),
        "Thunder",
      );
      await user.selectOptions(
        within(band).getByLabelText("Size preset"),
        "3x1.5-1x3",
      );
      expect(band).toHaveTextContent(
        "3 cells an insert · 99 calls → 33 inserts",
      );

      await user.click(screen.getByRole("button", { name: "Print…" }));
      await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
      const html = print.mock.calls[0]![0];
      expect(html).toContain("Insert 1 of 33");
      expect(html).toContain("grid-template-columns:repeat(1,3in)");
      expect(html.indexOf('<b class="cc">4</b>')).toBeLessThan(
        html.indexOf('<b class="cc">1</b>'),
      );
      expect(html).toContain("Thunder");
      expect(html).not.toContain('<b class="cc">7</b>');

      const stored = await library.loadWristbandConfigs();
      expect(stored[packet.plan.id]).toMatchObject({
        cellWidthIn: 3,
        columns: 1,
        rows: 3,
        presetId: "3x1.5-1x3",
      });
      expect(stored[packet.plan.id]!.calls[0]).toMatchObject({
        shortName: "Thunder",
      });
      expect(stored[packet.plan.id]!.calls).toHaveLength(99);
    },
  );
});
