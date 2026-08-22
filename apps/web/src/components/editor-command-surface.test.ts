import { formationFromOffense, stickThunderPlay } from "@chalk/domain";
import { describe, expect, it } from "vitest";

import { paletteCommands } from "./editor-command-surface";

describe("the command palette catalogue", () => {
  it("lists a set the Coach saved, and a Play he named", () => {
    const mine = formationFromOffense(stickThunderPlay, {
      id: "formation_mine",
      playbookId: stickThunderPlay.playbookId,
      name: "Andy's Empty",
      slotId: (index) => `slot_mine_${index}`,
    })!;
    const commands = paletteCommands({
      formations: [mine],
      savedPlays: [{ id: stickThunderPlay.id, name: stickThunderPlay.name }],
    });
    expect(commands.map(({ label }) => label)).toContain(
      "Formation: Andy's Empty",
    );
    expect(commands.map(({ label }) => label)).toContain(
      "Open: Stick — Thunder",
    );
  });

  it("names the zone command for the state it will produce", () => {
    expect(
      paletteCommands().find(({ id }) => id === "toggleZones")?.label,
    ).toBe("Hide zone areas");
    expect(
      paletteCommands({ zonesHidden: true }).find(
        ({ id }) => id === "toggleZones",
      )?.label,
    ).toBe("Show zone areas");
  });

  it("concatenates the catalogue the original's own way", () => {
    const labels = paletteCommands({
      formations: [{ id: "formation_mine", name: "Andy's Empty" }],
      defenses: [{ id: "defense_mine", name: "Cover 3 — Fire Zone" }],
      savedPlays: [{ id: "play_mine", name: "Stick — Thunder" }],
    }).map(({ label }) => label);
    const after = (label: string) => labels.indexOf(label);
    const first = (prefix: string) =>
      labels.findIndex((label) => label.startsWith(prefix));

    // The original ends the static list at Keyboard shortcuts, then appends
    // exports, then every Formation, then every Defense, then Open: plays.
    // A browser opener named Formations is not in that list — ⇧⌘F is.
    expect(labels).not.toContain("Formations");
    expect(labels).not.toContain("Defenses");
    expect(after("New play")).toBeLessThan(after("Keyboard shortcuts"));
    expect(after("Keyboard shortcuts")).toBeLessThan(first("Export:"));
    expect(first("Export:")).toBeLessThan(first("Formation:"));
    expect(first("Formation:")).toBeLessThan(first("Defense:"));
    expect(first("Defense:")).toBeLessThan(first("Open:"));
  });
});
