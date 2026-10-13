import {
  ballLateralYards,
  highSchoolFieldProfile,
  playDocumentSchema,
  settleManCoverage,
  stickThunderPlay,
  stockDefensiveCalls,
  stockFormations,
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
 * - a small move of one receiver re-sorts everybody else's man;
 * - a defender is sent across the ball to a receiver while a man in man
 *   stands free on that receiver's side (#196), over any stock man call and
 *   any stock set, either way round;
 * - who takes whom depends on which way the field faces, so a set and its
 *   mirror image are not met by mirror-image matches.
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

/** A stock set's men, or a stock call's, as players on the field. */
const fromSlots = (
  slots: readonly {
    readonly id: string;
    readonly position: Player["position"];
    readonly label: string;
    readonly symbol: Player["symbol"];
  }[],
  unit: Player["unit"],
): Player[] =>
  slots.map(({ id, position, label, symbol }) =>
    man(id, label, position.lateralYards, position.depthYards, unit, symbol),
  );

/**
 * The stock man calls, and the men each puts in man: Nickel Cover 1 and
 * Bear Front Cover 0 as the catalogue draws them, and 4-3 Cover 3's men in
 * Cover 1 — everyone who drops but the free safety, who stays deep.
 */
const manCalls = [
  ...["Nickel Cover 1", "Bear Front Cover 0"].map((name) => {
    const call = stockDefensiveCalls.find((c) => c.formation.name === name)!;
    const inMan = new Set(
      call.assignments
        .filter(({ kind }) => kind === "man")
        .map(({ slotId }) => slotId),
    );
    return { name, call, inMan };
  }),
  (() => {
    const name = "4-3 Cover 3";
    const call = stockDefensiveCalls.find((c) => c.formation.name === name)!;
    const inMan = new Set(
      call.formation.slots
        .filter(({ label }) => ["C", "$", "W", "M", "S"].includes(label))
        .map(({ id }) => id),
    );
    return { name: "4-3 Cover 3's men in Cover 1", call, inMan };
  })(),
];

const offenses: readonly { name: string; players: readonly Player[] }[] = [
  ...stockFormations.map((set) => ({
    name: set.name,
    players: fromSlots(set.slots, "offense"),
  })),
  {
    name: stickThunderPlay.name,
    players: stickThunderPlay.players.filter(({ unit }) => unit !== "defense"),
  },
];

const mirrored = (player: Player): Player => ({
  ...player,
  position: {
    ...player.position,
    lateralYards: -player.position.lateralYards,
  },
});

/** A man call over a set, settled, either way round. */
function settledOver(
  { call, inMan }: (typeof manCalls)[number],
  offense: readonly Player[],
  reflect: boolean,
) {
  const flip = reflect ? mirrored : (player: Player) => player;
  const defense = fromSlots(call.formation.slots, "defense").map(flip);
  const men = defense.filter(({ id }) => inMan.has(id));
  const play = playOf(
    [...offense.map(flip), ...defense],
    men.map((defender) => manLine(defender)),
  );
  return { play, men, settled: settleManCoverage(undefined, play) };
}

/** Which side of the ball a man stands on, or neither when he is over it. */
const sideOf = (lateralYards: number, ball: number) =>
  Math.abs(lateralYards - ball) < 1e-9 ? 0 : Math.sign(lateralYards - ball);

/**
 * Every defender sent across the ball to a receiver while a man in man
 * stands free on that receiver's side, as the defender's letter, his man's
 * and the free man's: "$ on H past W". A man over the ball is on neither
 * side to be sent across from, and free on both.
 */
function crossedPastAFreeMan(
  play: PlayDocument,
  men: readonly Player[],
  settled: PlayDocument,
): string[] {
  const offense = play.players.filter(({ unit }) => unit !== "defense");
  const ball = ballLateralYards(offense);
  const free = men.filter((defender) => !coveredBy(settled, defender.id));
  return men.flatMap((defender) => {
    const receiver = offense.find(
      ({ id }) => id === coveredBy(settled, defender.id),
    );
    if (!receiver) return [];
    const his = sideOf(receiver.position.lateralYards, ball);
    const mine = sideOf(defender.position.lateralYards, ball);
    if (his === 0 || mine === 0 || mine === his) return [];
    const helper = free.find(({ position }) =>
      [0, his].includes(sideOf(position.lateralYards, ball)),
    );
    return helper
      ? [`${defender.label} on ${receiver.label} past ${helper.label}`]
      : [];
  });
}

describe("matching each man in man on his own side of the ball", () => {
  describe.each(manCalls)("$name", (scheme) => {
    it.each(offenses)(
      "sends nobody across the ball past a free man over $name, either way round",
      ({ players }) => {
        for (const reflect of [false, true]) {
          const { play, men, settled } = settledOver(scheme, players, reflect);
          expect(crossedPastAFreeMan(play, men, settled)).toEqual([]);
        }
      },
    );

    it.each(offenses)(
      "meets $name and its mirror image with mirror-image matches",
      ({ players }) => {
        const asDrawn = settledOver(scheme, players, false);
        const reflected = settledOver(scheme, players, true);
        // Ids are the same either way round, so the same pairs mean the
        // mirror-image match.
        expect(
          reflected.men.map(({ id }) => coveredBy(reflected.settled, id)),
        ).toEqual(asDrawn.men.map(({ id }) => coveredBy(asDrawn.settled, id)));
      },
    );
  });
});
