import { stickThunderPlay } from "@chalk/domain";
import { combinePlayDocuments } from "@chalk/sync";
import { describe, expect, it } from "vitest";

describe("manual combine", () => {
  it("copies chosen notes from the donor onto the base without dropping the base", () => {
    const extra = {
      ...stickThunderPlay.labels[0]!,
      id: "label_donor_note",
      text: "Donor note",
    };
    const donor = {
      ...stickThunderPlay,
      labels: [...stickThunderPlay.labels, extra],
    };
    const combined = combinePlayDocuments(stickThunderPlay, donor, {
      playerIds: [],
      pathIds: [],
      labelIds: [extra.id],
      assignmentIds: [],
    });
    expect(combined.labels).toHaveLength(stickThunderPlay.labels.length + 1);
    expect(combined.labels.some((label) => label.text === "Donor note")).toBe(
      true,
    );
    expect(combined.players).toEqual(stickThunderPlay.players);
  });

  it("assigns a new id when a copied route would collide", () => {
    const path = stickThunderPlay.paths[0]!;
    const combined = combinePlayDocuments(stickThunderPlay, stickThunderPlay, {
      playerIds: [],
      pathIds: [path.id],
      labelIds: [],
      assignmentIds: [],
    });
    expect(combined.paths.length).toBe(stickThunderPlay.paths.length + 1);
    expect(combined.paths.filter((item) => item.id === path.id)).toHaveLength(
      1,
    );
  });
});
