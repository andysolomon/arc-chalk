import {
  demoTours,
  scrimmageLine,
  stickThunderPlay,
  stockFormations,
  type Player,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * Who is on the line of scrimmage, who can catch a pass, and what is wrong
 * with a set, in isolation (ADR 0073, ADR 0081). What a Coach sees — the
 * count while he drags a receiver off the line, the warning when a fifth
 * man is in the backfield or a receiver is covered — is
 * `tests/e2e/line-alignment.spec.ts`. These are the ways the reading could
 * go wrong where that journey would not notice:
 *
 * - a defender down on the ball is counted into the offense's line;
 * - a receiver drawn a hair under the linemen, as every shipped set draws
 *   him, is counted as a back;
 * - a slot a full step off the line is counted on it;
 * - the quarterback under center is counted on the line;
 * - with the ball on a hash, the line is measured off the lineman nearest
 *   the middle of the field rather than off the snapper;
 * - the line is read off where the shipped sets stand it rather than off
 *   the snapper, so a set drawn deeper has nobody on the line — or has its
 *   unlettered linemen, no longer at the shipped depth, called covered;
 * - eight on the line is refused, as if the line had a maximum;
 * - an off-by-one lets five backs through, or refuses four;
 * - an offense still being drawn is refused for having fewer than seven on
 *   the line, which high school allows with no more than four backs;
 * - a play with no offensive line — seven-on-seven, a defense with no
 *   shadow — is given a verdict at all;
 * - a tight end on the line inside a receiver on it is not called covered,
 *   or is said to be covered by the wrong man;
 * - the receiver at the end of the line is called covered by the lineman
 *   inside him, or a sixth lineman at the end of the line is called covered;
 * - the man on the line between the tackles, with a tackle's letter or none,
 *   is called covered;
 * - a man on the left of the ball is said to be covered by the right end;
 * - the snapper is counted eligible, or a back is not;
 * - a twelfth man goes uncalled while the count on the line is fine;
 * - a man standing on the ball is called over the line, or one past it is
 *   not;
 * - a shipped set, the starter, or a demo Play reads as illegal — the sets
 *   the app hands a Coach have to pass its own rule.
 */

const man = (
  id: string,
  label: string,
  lateralYards: number,
  depthYards: number,
  unit: Player["unit"] = "offense",
  symbol: Player["symbol"] = unit === "defense" ? "triangle" : "circle",
): Player => ({
  id,
  unit,
  position: { lateralYards, depthYards },
  symbol,
  label,
  sublabel: "",
  fill: "none",
  color: "ink",
});

const line: readonly Player[] = [
  man("lt", "", -3.9, -1.5),
  man("lg", "", -2, -1.5),
  man("c", "", 0, -1.5, "offense", "square"),
  man("rg", "", 2, -1.5),
  man("rt", "", 3.9, -1.5),
];

/** Gun doubles with the slots off the ball: seven on the line, four backs. */
const doubles: readonly Player[] = [
  ...line,
  man("x", "X", -20, -1.8),
  man("y", "Y", 6, -1.7),
  man("h", "H", -12, -2.8),
  man("z", "Z", 20, -2.8),
  man("q", "Q", 0, -6),
  man("f", "F", 2, -6),
];

const moved = (
  players: readonly Player[],
  id: string,
  depthYards: number,
): Player[] =>
  players.map((player) =>
    player.id === id
      ? { ...player, position: { ...player.position, depthYards } }
      : player,
  );

const kinds = (players: readonly Player[]) =>
  scrimmageLine(players)?.faults.map(({ kind }) => kind);

describe("who is on the line of scrimmage", () => {
  it("does not count a defender down on the ball into the offense's line", () => {
    const front = [-3, -1, 1, 3].map((lateral, index) =>
      man(`dl${index}`, "", lateral, 1, "defense"),
    );
    const read = scrimmageLine([...doubles, ...front]);
    expect(read?.onTheLine).toHaveLength(7);
    expect(read?.offenseCount).toBe(11);
    expect(read?.legal).toBe(true);
  });

  it("counts a receiver drawn a third of a yard under the linemen on the line", () => {
    const read = scrimmageLine(moved(doubles, "x", -1.5 - 1 / 3));
    expect(read?.onTheLine).toContain("x");
  });

  it("counts a slot a full step off the line as a back", () => {
    const read = scrimmageLine(moved(doubles, "h", -2.5));
    expect(read?.backs).toContain("h");
  });

  it("counts the quarterback under center as a back", () => {
    const read = scrimmageLine(moved(doubles, "q", -4));
    expect(read?.backs).toContain("q");
  });

  it("measures the line off the snapper when the ball is on a hash", () => {
    // On the right hash the left tackle is the lineman nearest the middle of
    // the field, and he has stepped back in a two-point stance. Measured off
    // him, a slot half a yard deeper than the center would be on the line.
    const onHash = doubles.map((player) => ({
      ...player,
      position: {
        ...player.position,
        lateralYards: player.position.lateralYards + 9.5,
      },
    }));
    const read = scrimmageLine(moved(moved(onHash, "lt", -1.9), "h", -2.3));
    expect(read?.snapperId).toBe("c");
    expect(read?.backs).toContain("h");
  });

  it("reads the line off the snapper in a set drawn deeper than the shipped ones", () => {
    const deeper = doubles.map((player) => ({
      ...player,
      position: {
        ...player.position,
        depthYards: player.position.depthYards - 2,
      },
    }));
    const read = scrimmageLine(deeper);
    expect(read?.snapperId).toBe("c");
    expect(read?.onTheLine).toHaveLength(7);
    // The unlettered linemen are the line wherever it is drawn, not covered men.
    expect(read?.covered).toEqual([]);
    expect(read?.legal).toBe(true);
  });

  it("lets more than seven stand on the line", () => {
    // Two more unlettered men on the end of the line: a jumbo set.
    const jumbo = [
      ...doubles,
      man("ol5", "", 5.9, -1.5),
      man("ol6", "", -5.9, -1.5),
    ].filter(({ id }) => id !== "q" && id !== "f");
    const read = scrimmageLine(jumbo);
    expect(read?.onTheLine).toHaveLength(9);
    expect(read?.legal).toBe(true);
  });

  it("allows four backs and refuses a fifth", () => {
    expect(scrimmageLine(doubles)?.legal).toBe(true);
    const fifth = scrimmageLine(moved(doubles, "x", -2.8));
    expect(fifth?.backs).toHaveLength(5);
    expect(fifth?.legal).toBe(false);
    expect(fifth?.faults).toEqual([{ kind: "too-many-backs", backs: 5 }]);
  });

  it("does not refuse an offense still being drawn for a short line", () => {
    // Nine men: the line and four backs. Seven on the line is what eleven men
    // and four backs come to; high school asks only for five.
    const unfinished = doubles.filter(({ id }) => id !== "x" && id !== "y");
    const read = scrimmageLine(unfinished);
    expect(read?.onTheLine).toHaveLength(5);
    expect(read?.legal).toBe(true);
  });

  it("gives no verdict to a play with no offensive line", () => {
    const sevenOnSeven = [
      man("q", "Q", 0, -5),
      man("x", "X", -20, -1.8),
      man("z", "Z", 20, -1.8),
      man("h", "H", -10, -2.8),
      man("y", "Y", 10, -2.8),
      man("f", "F", 2, -5),
    ];
    expect(scrimmageLine(sevenOnSeven)).toBeUndefined();
    const defenseOnly = [-3, -1, 1, 3].map((lateral, index) =>
      man(`dl${index}`, "", lateral, 1, "defense"),
    );
    expect(scrimmageLine(defenseOnly)).toBeUndefined();
  });
});

describe("who can catch a pass", () => {
  it("names the end man of each side and the backs eligible, and not the snapper", () => {
    const read = scrimmageLine(doubles);
    expect([...(read?.eligible ?? [])].sort()).toEqual(
      ["f", "h", "q", "x", "y", "z"].sort(),
    );
    expect(read?.eligible).not.toContain("c");
    expect(read?.covered).toEqual([]);
  });

  it("calls a tight end on the line inside a receiver on it covered, by that receiver", () => {
    // Z steps up level with the line outside Y: nine on the line is no count
    // fault, but Y can no longer catch a pass.
    const read = scrimmageLine(moved(doubles, "z", -1.8));
    expect(read?.onTheLine).toHaveLength(8);
    expect(read?.backs).toHaveLength(3);
    expect(read?.covered).toEqual([{ id: "y", byId: "z" }]);
    expect(read?.eligible).not.toContain("y");
    expect(read?.faults).toEqual([
      { kind: "covered", men: [{ id: "y", byId: "z" }] },
    ]);
    expect(read?.legal).toBe(false);
  });

  it("covers a man on the left by the left end, whatever the right end does", () => {
    // Both slots up on the line, the ball on the left hash.
    const onHash = doubles.map((player) => ({
      ...player,
      position: {
        ...player.position,
        lateralYards: player.position.lateralYards - 9.5,
      },
    }));
    const read = scrimmageLine(moved(moved(onHash, "h", -1.8), "z", -1.8));
    expect(read?.covered).toEqual([
      { id: "h", byId: "x" },
      { id: "y", byId: "z" },
    ]);
  });

  it("never calls the linemen covered, lettered for their spot or not", () => {
    const lettered = doubles.map((player) =>
      player.id === "lt" ? { ...player, label: "LT" } : player,
    );
    expect(scrimmageLine(lettered)?.covered).toEqual([]);
    // A sixth unlettered man outside the tackle is a lineman, and the X
    // outside him is still the end.
    const sixth = [...doubles, man("ol5", "", 5.9, -1.5)].filter(
      ({ id }) => id !== "f",
    );
    expect(scrimmageLine(sixth)?.covered).toEqual([]);
    expect(scrimmageLine(sixth)?.eligible).toContain("x");
  });

  it("calls a back brought up on the line between the tackles covered", () => {
    const wing = scrimmageLine(moved(doubles, "h", -1.6));
    expect(wing?.covered).toEqual([{ id: "h", byId: "x" }]);
  });
});

describe("what is wrong with a set", () => {
  it("calls a twelfth man while the count on the line is fine", () => {
    const twelve = [...doubles, man("a", "A", -14, -2.8)];
    const read = scrimmageLine(twelve);
    expect(read?.offenseCount).toBe(12);
    expect(read?.backs).toHaveLength(5);
    expect(kinds(twelve)).toEqual(["too-many-men", "too-many-backs"]);
  });

  it("calls a man past the ball over the line, and not one standing on it", () => {
    expect(scrimmageLine(moved(doubles, "x", 0))?.acrossTheLine).toEqual([]);
    const over = scrimmageLine(moved(doubles, "x", 0.5));
    expect(over?.acrossTheLine).toEqual(["x"]);
    expect(over?.faults[0]).toEqual({
      kind: "across-the-line",
      playerIds: ["x"],
    });
    expect(over?.legal).toBe(false);
  });

  it("orders the faults the way a Coach fixes them", () => {
    // X over the ball, Z up on the line covering Y, and two more backs.
    const everything = [
      ...moved(moved(doubles, "x", 0.5), "z", -1.8),
      man("a", "A", -14, -5),
      man("b", "B", -4, -6),
    ];
    expect(kinds(everything)).toEqual([
      "across-the-line",
      "too-many-men",
      "too-many-backs",
      "covered",
    ]);
  });
});

describe("the sets the app hands a Coach", () => {
  it.each(stockFormations.map((formation) => [formation.name, formation]))(
    "%s is seven on the line and four backs with its receivers eligible",
    (_name, formation) => {
      const men = formation.slots.map((slot, index) =>
        man(
          `man_${index}`,
          slot.label,
          slot.position.lateralYards,
          slot.position.depthYards,
          slot.unit,
          slot.symbol,
        ),
      );
      const read = scrimmageLine(men);
      expect(read?.onTheLine).toHaveLength(7);
      expect(read?.backs).toHaveLength(4);
      expect(read?.faults).toEqual([]);
      expect(read?.legal).toBe(true);
    },
  );

  it("ships a legal starter and legal demo Plays", () => {
    const starter = scrimmageLine(stickThunderPlay.players);
    expect(starter?.onTheLine).toHaveLength(7);
    expect(starter?.faults).toEqual([]);
    for (const tour of demoTours) {
      const read = scrimmageLine(tour.play.players);
      // Seven-on-seven has no line, and so no verdict.
      if (!read) continue;
      expect(read.faults, tour.playName).toEqual([]);
    }
  });
});
