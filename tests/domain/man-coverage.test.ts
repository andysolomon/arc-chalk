import {
  highSchoolFieldProfile,
  playDocumentSchema,
  settleManCoverage,
  type MovementPath,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * Man coverage settled in isolation (ADR 0060). What a Coach sees — a man
 * call matched and lined up, a receiver picked on the field, the defense
 * following a new set, the defender shadowing his man in playback — is
 * `tests/e2e/man-coverage.spec.ts`. These are the ways settling could go
 * wrong where that journey would not notice:
 *
 * - a Play stored with man lines is rewritten by an edit that touches
 *   neither the offense nor a man call;
 * - with nobody on offense, a man call loses the line it was drawn with, or
 *   is left pointing at a receiver who is not there;
 * - a receiver the Coach picked leaves the field and the line still names
 *   him;
 * - the best match doubles one receiver while another goes uncovered, or
 *   hands the extra defender somebody to double;
 * - a small move of one receiver re-sorts everybody else's man.
 */

const man = (
  id: string,
  label: string,
  lateralYards: number,
  depthYards: number,
  unit: Player["unit"],
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

// Gun doubles, roughly: five linemen, the quarterback, two wide, a tight
// end and a back.
const offense: readonly Player[] = [
  man("lt", "", -3.9, -1.5, "offense"),
  man("lg", "", -2, -1.5, "offense"),
  man("c", "", 0, -1.5, "offense", "square"),
  man("rg", "", 2, -1.5, "offense"),
  man("rt", "", 3.9, -1.5, "offense"),
  man("q", "Q", 0, -6, "offense"),
  man("x", "X", -20, -1.8, "offense"),
  man("z", "Z", 20, -1.8, "offense"),
  man("y", "Y", 6.5, -1.7, "offense"),
  man("f", "F", 3, -6, "offense"),
];

const leftCorner = man("lc", "C", -19.7, 4.2, "defense");
const rightCorner = man("rc", "C", 19.7, 4.2, "defense");
const safety = man("ss", "$", 9, 9, "defense");
const will = man("w", "W", -2.6, 7.2, "defense");
const mike = man("m", "M", 3.3, 7.2, "defense");

/** A man call off a defender's stance, the way the catalogue draws one. */
const manLine = (
  owner: Player,
  covers?: MovementPath["covers"],
): MovementPath => ({
  id: `man_${owner.id}`,
  kind: "zone",
  playerId: owner.id,
  points: [
    owner.position,
    {
      lateralYards: owner.position.lateralYards,
      depthYards: owner.position.depthYards + 2.5,
    },
  ],
  branches: [],
  style: { line: "dotted", ending: "arrow", color: "blue" },
  ...(covers ? { covers } : {}),
});

const playOf = (
  players: readonly Player[],
  paths: readonly MovementPath[],
): PlayDocument =>
  playDocumentSchema.parse({
    schemaVersion: 3,
    id: "play_man_coverage",
    playbookId: "playbook_man_coverage",
    name: "Under test",
    unit: "defense",
    tags: [],
    notes: "",
    fieldProfile: highSchoolFieldProfile,
    players,
    assignments: [],
    paths,
    labels: [],
  });

const coveredBy = (play: PlayDocument, defenderId: string) =>
  play.paths.find(({ playerId }) => playerId === defenderId)?.covers?.playerId;

describe("settling man coverage", () => {
  it("leaves a stored Play's man lines as drawn when an edit touches neither the offense nor a man call", () => {
    const stored = playOf(
      [...offense, leftCorner, rightCorner],
      [manLine(leftCorner), manLine(rightCorner)],
    );
    const renamed = { ...stored, name: "Renamed" };
    expect(settleManCoverage(stored, renamed)).toBe(renamed);
  });

  it("keeps a man call's own line, following nobody, while there is no offense to cover", () => {
    const before = playOf([leftCorner], []);
    const after = playOf([leftCorner], [manLine(leftCorner)]);
    const settled = settleManCoverage(before, after);
    expect(settled.paths).toEqual(after.paths);
    expect(settled.players).toEqual(after.players);
  });

  it("hands a defender back to the best match when the receiver he was given leaves the field", () => {
    const before = playOf(
      [...offense, leftCorner],
      [manLine(leftCorner, { playerId: "z", chosen: true })],
    );
    const after = {
      ...before,
      players: before.players.filter(({ id }) => id !== "z"),
    };
    const settled = settleManCoverage(before, after);
    const covers = settled.paths[0]!.covers;
    expect(covers?.playerId).toBe("x");
    expect(covers?.chosen).toBeUndefined();
    // And the line goes to the man he covers now, not to where Z stood.
    const end = settled.paths[0]!.points.at(-1)!;
    expect(end.lateralYards).toBeLessThan(0);
  });

  it("covers every receiver it can before doubling one, and leaves the extra man free", () => {
    const twoWide = offense.filter(({ id }) => id !== "y" && id !== "f");
    const before = playOf([...twoWide, leftCorner, rightCorner, will], []);
    const after = playOf(
      [...twoWide, leftCorner, rightCorner, will],
      [manLine(leftCorner), manLine(rightCorner), manLine(will)],
    );
    const settled = settleManCoverage(before, after);
    expect(coveredBy(settled, "lc")).toBe("x");
    expect(coveredBy(settled, "rc")).toBe("z");
    expect(coveredBy(settled, "w")).toBeUndefined();
  });

  it("does not re-sort everybody else's man when one receiver takes a small step", () => {
    const defenders = [leftCorner, rightCorner, safety, will, mike];
    const before = playOf([...offense, ...defenders], []);
    const called = settleManCoverage(
      before,
      playOf(
        [...offense, ...defenders],
        defenders.map((defender) => manLine(defender)),
      ),
    );
    const matched = defenders.map(({ id }) => coveredBy(called, id));
    const stepped: PlayDocument = {
      ...called,
      players: called.players.map((player) =>
        player.id === "y"
          ? {
              ...player,
              position: {
                ...player.position,
                lateralYards: player.position.lateralYards + 0.5,
              },
            }
          : player,
      ),
    };
    const settled = settleManCoverage(called, stepped);
    expect(defenders.map(({ id }) => coveredBy(settled, id))).toEqual(matched);
    // Only the man on the tight end moved with him.
    const moved = settled.players.filter((player) => {
      const was = called.players.find(({ id }) => id === player.id)!;
      return (
        player.unit === "defense" &&
        (was.position.lateralYards !== player.position.lateralYards ||
          was.position.depthYards !== player.position.depthYards)
      );
    });
    expect(moved.map(({ id }) => coveredBy(settled, id))).toEqual(["y"]);
  });
});
