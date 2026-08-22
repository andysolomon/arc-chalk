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
});
