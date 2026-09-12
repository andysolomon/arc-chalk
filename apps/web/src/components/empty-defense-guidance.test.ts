import { describe, expect, it } from "vitest";

import { emptyDefenseGuidance } from "./empty-defense-guidance";

const offense = { unit: "offense" as const };
const defense = { unit: "defense" as const };
const special = { unit: "special-teams" as const };

describe("emptyDefenseGuidance", () => {
  it("shows for an Editor Play with offense and no defenders", () => {
    expect(
      emptyDefenseGuidance({
        view: "Editor",
        overlayOpen: false,
        animating: false,
        players: [offense, offense, offense],
      }),
    ).toEqual({ show: true, defenderCount: 0, nonDefenseCount: 3 });
  });

  it("shows when special teams are the only non-defense players", () => {
    expect(
      emptyDefenseGuidance({
        view: "Editor",
        overlayOpen: false,
        animating: false,
        players: [special],
      }).show,
    ).toBe(true);
  });

  it("hides when any defender is on the field", () => {
    expect(
      emptyDefenseGuidance({
        view: "Editor",
        overlayOpen: false,
        animating: false,
        players: [offense, defense],
      }).show,
    ).toBe(false);
  });

  it("hides on an empty field", () => {
    expect(
      emptyDefenseGuidance({
        view: "Editor",
        overlayOpen: false,
        animating: false,
        players: [],
      }).show,
    ).toBe(false);
  });

  it("hides for defense-only Plays", () => {
    expect(
      emptyDefenseGuidance({
        view: "Editor",
        overlayOpen: false,
        animating: false,
        players: [defense, defense],
      }).show,
    ).toBe(false);
  });

  it.each(["Demo", "Present", "Print"] as const)("hides in %s view", (view) => {
    expect(
      emptyDefenseGuidance({
        view,
        overlayOpen: false,
        animating: false,
        players: [offense],
      }).show,
    ).toBe(false);
  });

  it("hides while an overlay is open", () => {
    expect(
      emptyDefenseGuidance({
        view: "Editor",
        overlayOpen: true,
        animating: false,
        players: [offense],
      }).show,
    ).toBe(false);
  });

  it("hides while playback is animating", () => {
    expect(
      emptyDefenseGuidance({
        view: "Editor",
        overlayOpen: false,
        animating: true,
        players: [offense],
      }).show,
    ).toBe(false);
  });
});
