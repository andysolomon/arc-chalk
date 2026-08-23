import { stickThunderConcept, stickThunderFamily } from "@chalk/domain";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LibrarySnapshot } from "../app/editor-runtime";
import { LibraryPanel } from "./library-panel";

function stickSnapshot(): LibrarySnapshot {
  const family = stickThunderFamily();
  return {
    playbook: {
      schemaVersion: 1,
      id: family[0]!.playbookId,
      name: "Playbook",
      defaultFieldProfileId: family[0]!.fieldProfile.id,
      fieldProfiles: [family[0]!.fieldProfile],
      playTypes: [],
      createdAtMs: 0,
      updatedAtMs: 0,
    },
    concepts: [stickThunderConcept],
    members: family.map((play, index) => ({
      playId: play.id,
      playbookId: play.playbookId,
      name: play.name,
      unit: play.unit,
      conceptId: play.conceptSource?.conceptId,
      tags: [...play.tags],
      playerRoles: [],
      assignmentText: [],
      notes: play.notes,
      documentHash: `hash_${index}`,
      fieldProfileRevision: play.fieldProfile.revision,
      updatedAtMs: 1_000 - index,
    })),
  };
}

const unused = {
  onBrowse: () => undefined,
  onCancelVariation: () => undefined,
  onCommitVariation: () => undefined,
  onDelete: () => undefined,
  onDetach: () => undefined,
  onLoad: () => undefined,
  onNoteCommit: () => undefined,
  onPush: () => undefined,
  onSave: () => undefined,
  onScope: () => undefined,
  onStartVariation: () => undefined,
  onToggleOpen: () => undefined,
  onTogglePick: () => undefined,
  onVariationDraft: () => undefined,
};

describe("the inspector library panel", () => {
  it("nests variations under the concept and names them by what distinguishes them", () => {
    render(
      <LibraryPanel
        {...unused}
        currentPlayId={stickThunderFamily()[0]!.id}
        pickIds={[]}
        savedFlash={false}
        scope="play"
        snapshot={stickSnapshot()}
        storedOpen={{}}
        variationDraft=""
        variationOpen={false}
      />,
    );

    expect(screen.getByText("Library · 5")).toBeVisible();
    expect(screen.getByText("Stick — Thunder")).toBeVisible();
    expect(screen.getByText("Gun Doubles Left")).toBeVisible();
    expect(screen.getByText("Red zone")).toBeVisible();
  });

  it("toggles Pick… membership instead of only switching the scope", async () => {
    const onTogglePick = vi.fn();
    const family = stickThunderFamily();
    render(
      <LibraryPanel
        {...unused}
        currentPlayId={family[0]!.id}
        onTogglePick={onTogglePick}
        pickIds={[family[1]!.id]}
        savedFlash={false}
        scope="pick"
        snapshot={stickSnapshot()}
        storedOpen={{}}
        variationDraft=""
        variationOpen={false}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: /Stick — Thunder — Gun Doubles Right/,
      }),
    );
    expect(onTogglePick).toHaveBeenCalledWith(family[1]!.id);
  });

  it("asks before deleting a concept", async () => {
    const onDelete = vi.fn();
    const family = stickThunderFamily();
    render(
      <LibraryPanel
        {...unused}
        currentPlayId={family[0]!.id}
        onDelete={onDelete}
        pickIds={[]}
        savedFlash={false}
        scope="play"
        snapshot={stickSnapshot()}
        storedOpen={{}}
        variationDraft=""
        variationOpen={false}
      />,
    );

    const row = screen.getByText("Stick — Thunder").closest("[role='button']");
    expect(row).toBeTruthy();
    await userEvent.hover(row!);
    await userEvent.click(
      within(row as HTMLElement).getByTitle("Delete this concept"),
    );
    expect(onDelete).toHaveBeenCalledWith(family[0]!.id, false);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(family[0]!.id, true);
  });

  it("detaches a variation", async () => {
    const onDetach = vi.fn();
    const family = stickThunderFamily();
    render(
      <LibraryPanel
        {...unused}
        currentPlayId={family[2]!.id}
        onDetach={onDetach}
        pickIds={[]}
        savedFlash={false}
        scope="play"
        snapshot={stickSnapshot()}
        storedOpen={{}}
        variationDraft=""
        variationOpen={false}
      />,
    );

    const row = screen.getByText("Gun Doubles Left").closest("[role='button']");
    await userEvent.hover(row!);
    await userEvent.click(screen.getByRole("button", { name: "detach" }));
    expect(onDetach).toHaveBeenCalledWith(family[2]!.id);
  });
});

describe("concept notes", () => {
  it("saves a note and tags on the concept, not the Play", async () => {
    const onNoteCommit = vi.fn();
    const family = stickThunderFamily();
    render(
      <LibraryPanel
        {...unused}
        currentPlayId={family[0]!.id}
        onNoteCommit={onNoteCommit}
        pickIds={[]}
        savedFlash={false}
        scope="play"
        snapshot={stickSnapshot()}
        storedOpen={{}}
        variationDraft=""
        variationOpen={false}
      />,
    );

    const row = screen.getByText("Stick — Thunder").closest("[role='button']");
    await userEvent.hover(row!);
    await userEvent.click(screen.getByRole("button", { name: "note" }));
    const note = screen.getByRole("textbox", { name: "Concept note" });
    await userEvent.clear(note);
    await userEvent.type(note, "Take the flat");
    await userEvent.click(
      screen.getByRole("textbox", { name: "Concept tags" }),
    );
    expect(onNoteCommit).toHaveBeenCalledWith(
      stickThunderConcept.id,
      "Take the flat",
      expect.any(String),
    );
  });
});
