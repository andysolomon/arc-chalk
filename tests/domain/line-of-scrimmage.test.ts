import { scrimmageLine, type Player } from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * Who is on the line of scrimmage, in isolation (ADR 0073). What a Coach
 * sees — the count while he drags a receiver off the line, the warning when
 * a fifth man is in the backfield — is `tests/e2e/line-alignment.spec.ts`.
 * These are the ways the reading could go wrong where that journey would
 * not notice:
 *
 * - a defender down on the ball is counted into the offense's line;
 * - a receiver drawn a hair under the linemen, as every shipped set draws
 *   him, is counted as a back;
 * - a slot a full step off the line is counted on it;
 * - the quarterback under center is counted on the line;
 * - with the ball on a hash, the line is measured off the lineman nearest
 *   the middle of the field rather than off the snapper;
 * - the line is read off where the shipped sets stand it rather than off
 *   the snapper, so a set drawn deeper has nobody on the line;
 * - eight on the line is refused, as if the line had a maximum;
 * - an off-by-one lets five backs through, or refuses four;
 * - an offense still being drawn is refused for having fewer than seven on
 *   the line, which high school allows with no more than four backs;
 * - a play with no offensive line — seven-on-seven, a defense with no
 *   shadow — is given a verdict at all.
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

describe("who is on the line of scrimmage", () => {
  it("does not count a defender down on the ball into the offense's line", () => {
    const front = [-3, -1, 1, 3].map((lateral, index) =>
      man(`dl${index}`, "", lateral, 1, "defense"),
    );
    const read = scrimmageLine([...doubles, ...front]);
    expect(read?.onTheLine).toHaveLength(7);
    expect(read?.offenseCount).toBe(11);
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
    expect(read?.legal).toBe(true);
  });

  it("lets more than seven stand on the line", () => {
    const read = scrimmageLine(moved(moved(doubles, "h", -1.8), "z", -1.8));
    expect(read?.onTheLine).toHaveLength(9);
    expect(read?.legal).toBe(true);
  });

  it("allows four backs and refuses a fifth", () => {
    expect(scrimmageLine(doubles)?.legal).toBe(true);
    const fifth = scrimmageLine(moved(doubles, "x", -2.8));
    expect(fifth?.backs).toHaveLength(5);
    expect(fifth?.legal).toBe(false);
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
