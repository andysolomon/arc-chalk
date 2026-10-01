import {
  applyDefensiveCall,
  defensivePositions,
  formationMeta,
  highSchoolFieldProfile,
  lineKindWord,
  offensivePlayers,
  offensivePositions,
  playDocumentSchema,
  stockDefensiveCalls,
  stockFormations,
  stickThunderPlay,
  type DefensiveCall,
  type Formation,
  type MovementPath,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * What a man plays, read off where he stands (issue #154, ADR 0066), in
 * isolation. The Coach's journey — the I-Form's tailback and fullback in the
 * roster and 21 personnel on the print, the nickel and the deep safety in
 * the secondary, a man line that says Man — is
 * `tests/e2e/football-metadata.spec.ts`. These are the ways the reading
 * could be wrong on a set or a call the journey does not open:
 *
 * - an H standing in the backfield read as a slot (the I-Form tailback),
 *   or two backs both called Back, or the deeper one the fullback;
 * - the Strong set read by its letters, so the offset man is the tailback;
 * - a lone back called Tailback or Fullback, or split backs level with each
 *   other given the words that need a deeper man;
 * - a back split out wide still filed among the backs;
 * - a letter that names a position read off the stance anyway — an X inside
 *   another man called a slot, a Y in the backfield a back;
 * - an unlettered man split out read as a back, or one in the backfield as
 *   a receiver;
 * - personnel counted off the stance rather than the men on the field, so
 *   the I-Form reads 11 and Empty reads 01;
 * - a back split wide counted beside the man standing at back, so a
 *   one-back gun set whose F is out wide and whose H is behind the
 *   quarterback (the seeded Stick — Thunder) reads 21;
 * - a nickel standing off the ball filed on the front as the nose, or a
 *   safety lettered S eighteen yards deep listed among the linebackers as
 *   the Sam;
 * - the $ of a base front called the nickel, or the $ beside a strong
 *   safety called a second strong safety;
 * - a front read off its letters alone, so an unlettered front has no ends
 *   and no nose, or read against midfield when the ball is on the hash;
 * - an unlettered man three yards off the ball counted as a linebacker, or
 *   a corner pressed at the line counted into the front;
 * - a call lettering two men alike on the same side of the ball, as the
 *   Bear's nose and fourth defensive back were;
 * - a man line named for its kind — Zone — rather than for what it is.
 */

const setNamed = (name: string): Formation => {
  const formation = stockFormations.find((value) => value.name === name);
  if (!formation) throw new Error(`No such set: ${name}`);
  return formation;
};

const callNamed = (name: string): DefensiveCall => {
  const call = stockDefensiveCalls.find(
    (value) => value.formation.name === name,
  );
  if (!call) throw new Error(`No such call: ${name}`);
  return call;
};

const man = (
  id: string,
  unit: Player["unit"],
  label: string,
  lateralYards: number,
  depthYards: number,
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

/** The men of a set, standing on a Play as players. */
const menOf = (formation: Formation): Player[] =>
  formation.slots.map((slot, index) =>
    man(
      `man_${index}`,
      slot.unit,
      slot.label,
      slot.position.lateralYards,
      slot.position.depthYards,
      slot.symbol,
    ),
  );

/** The original's line: five men two yards apart, the centre in the middle. */
const line = (ball = 0, depth = -1.5): Player[] =>
  [-3.9, -2, 0, 2, 3.9].map((off, index) =>
    man(
      `ol${index}`,
      "offense",
      "",
      ball + off,
      depth,
      off === 0 ? "square" : "circle",
    ),
  );

function playWith(players: readonly Player[]): PlayDocument {
  return playDocumentSchema.parse({
    schemaVersion: 3,
    id: "play_positions",
    playbookId: "playbook_positions",
    name: "Positions",
    unit: "defense",
    tags: [],
    notes: "",
    fieldProfile: highSchoolFieldProfile,
    players,
    assignments: [],
    paths: [],
    labels: [],
  });
}

/** `letter: group · name` for every man, in the order given. */
const offenseWords = (players: readonly Player[]) =>
  offensivePositions(players).map(
    ({ group, name }, index) =>
      `${players[index]!.label || "-"}: ${group} · ${name}`,
  );

const defenseWords = (play: PlayDocument) => {
  const defense = play.players.filter(({ unit }) => unit === "defense");
  return defensivePositions(play).map(
    ({ group, name }, index) =>
      `${defense[index]!.label || "-"}: ${group} · ${name}`,
  );
};

/** A call's men on a Play of their own, with the call's lines. */
const onField = (call: DefensiveCall): PlayDocument => {
  let next = 0;
  return applyDefensiveCall(
    playWith([]),
    call,
    (prefix) => `${prefix}_${(next += 1)}`,
  ).play;
};

describe("what an offensive man plays, read off where he stands", () => {
  it("makes the I-Form's H the tailback and its F the fullback, among the backs", () => {
    const words = offenseWords(menOf(setNamed("I-Form Right")));
    expect(words).toContain("H: backs · Tailback");
    expect(words).toContain("F: backs · Fullback");
    expect(words).toContain("Q: backs · Quarterback");
    expect(words).toContain("Y: skill · Tight end");
    expect(words).toContain("X: skill · Receiver");
    expect(words).toContain("Z: skill · Receiver");
  });

  it("reads the Strong set off the stance too: the deep F is the tailback and the offset H the fullback", () => {
    const words = offenseWords(menOf(setNamed("Strong Right")));
    expect(words).toContain("F: backs · Tailback");
    expect(words).toContain("H: backs · Fullback");
  });

  it("calls a lone back Back, and backs level with each other Back", () => {
    expect(offenseWords(menOf(setNamed("Gun Doubles Right")))).toContain(
      "F: backs · Back",
    );
    // Split backs, side by side at one depth: neither is deeper.
    const split = [
      ...line(),
      man("q", "offense", "Q", 0, -4),
      man("f", "offense", "F", -3, -6.5),
      man("h", "offense", "H", 3, -6.5),
    ];
    expect(offenseWords(split)).toEqual(
      expect.arrayContaining(["F: backs · Back", "H: backs · Back"]),
    );
    // A wishbone: the fullback short, two halfbacks level behind him.
    const bone = [
      ...line(),
      man("q", "offense", "Q", 0, -2.5),
      man("f", "offense", "F", 0, -5),
      man("h", "offense", "H", -3, -7.5),
      man("t", "offense", "T", 3, -7.5),
    ];
    expect(offenseWords(bone)).toEqual(
      expect.arrayContaining([
        "F: backs · Fullback",
        "H: backs · Back",
        "T: backs · Back",
      ]),
    );
  });

  it("files a back split out among the skill men, as the slot or receiver he is standing as", () => {
    // Empty: the F is inside the X.
    expect(offenseWords(menOf(setNamed("Empty Right")))).toContain(
      "F: skill · Slot",
    );
    // Split out past everyone, he is the wide receiver on his side.
    const outside = [
      ...line(),
      man("q", "offense", "Q", 0, -6),
      man("x", "offense", "X", -14, -1.8),
      man("f", "offense", "F", -18, -3),
      man("z", "offense", "Z", 20, -1.8),
    ];
    expect(offenseWords(outside)).toContain("F: skill · Receiver");
  });

  it("keeps the word a letter gives: an X inside another man is still a receiver, a Y in the backfield a tight end", () => {
    const stacked = [
      ...line(),
      man("q", "offense", "Q", 0, -6),
      man("x", "offense", "X", -14, -1.8),
      man("f", "offense", "F", -18, -3),
      man("y", "offense", "Y", 3, -4),
    ];
    const words = offenseWords(stacked);
    expect(words).toContain("X: skill · Receiver");
    // He stands as a back this snap, so he is filed with them, but he is a
    // tight end by his letter.
    expect(words).toContain("Y: backs · Tight end");
  });

  it("reads an unlettered man off the field: split out a slot, in the backfield a back", () => {
    // Level with the ball he would be a sixth lineman (ADR 0056); off it,
    // where he stands says what he is.
    const players = [
      ...line(),
      man("q", "offense", "Q", 0, -6),
      man("slot", "offense", "", 12, -3),
      man("rb", "offense", "", 2, -7),
      man("x", "offense", "X", -20, -1.8),
      man("z", "offense", "Z", 20, -1.8),
    ];
    const words = offenseWords(players);
    expect(words).toContain("-: skill · Slot");
    expect(words).toContain("-: backs · Back");
  });

  it("counts personnel off the men on the field, not off where they stand", () => {
    const read = (name: string) =>
      formationMeta(
        setNamed(name).slots.map(({ label, position, symbol }) => ({
          label,
          position,
          symbol,
        })),
      ).personnelLabel;
    // The H is a back by his letter only when he stands in the backfield.
    expect(read("I-Form Right")).toBe("21");
    expect(read("Strong Right")).toBe("21");
    expect(read("Gun Doubles Right")).toBe("11");
    expect(read("Gun Spread Right")).toBe("10");
    // The F is a back wherever he lines up: Empty is still 11 personnel.
    expect(read("Empty Right")).toBe("11");
    expect(read("Gun Ace Right")).toBe("12");
  });

  it("counts one back when a lettered back is split wide and another man stands at back (Stick — Thunder)", () => {
    // The F is out past the X and the H is behind the quarterback: one back
    // on the field, not two. A back's letter and a back's stance are two
    // ways of seeing the same man, never two men.
    const offense = offensivePlayers(stickThunderPlay);
    expect(offense.find(({ label }) => label === "F")).toBeDefined();
    expect(formationMeta(offense).personnelLabel).toBe("11");
  });
});

describe("what a defender plays, read off his stance and the front", () => {
  it("puts the nickel in the secondary and the deep S among the safeties (Nickel Cover 2)", () => {
    const words = defenseWords(onField(callNamed("Nickel Cover 2")));
    expect(words).toContain("N: secondary · Nickel");
    expect(words).toContain("S: secondary · Strong safety");
    expect(words).toContain("F: secondary · Free safety");
    expect(words).toContain("W: linebackers · Will");
    expect(words).toContain("M: linebackers · Mike");
    expect(words.filter((word) => word.startsWith("E:"))).toEqual([
      "E: front · End",
      "E: front · End",
    ]);
    expect(words.filter((word) => word.startsWith("T:"))).toEqual([
      "T: front · Tackle",
      "T: front · Tackle",
    ]);
  });

  it("tells the two S of 4-3 Cover 2 apart: the Sam in the box, the strong safety deep", () => {
    const words = defenseWords(onField(callNamed("4-3 Cover 2"))).filter(
      (word) => word.startsWith("S:"),
    );
    expect(words.sort()).toEqual([
      "S: linebackers · Sam",
      "S: secondary · Strong safety",
    ]);
  });

  it("calls the $ of a base front the strong safety, and a $ beside a strong safety the nickel", () => {
    expect(defenseWords(onField(callNamed("4-3 Cover 3")))).toContain(
      "$: secondary · Strong safety",
    );
    expect(defenseWords(onField(callNamed("3-4 Cover 3")))).toContain(
      "$: secondary · Strong safety",
    );
    // Two-high with a money backer over the slot: the strong safety is
    // already deep, so the $ is the fifth defensive back.
    const money = playWith([
      man("e1", "defense", "E", -6, 2),
      man("t1", "defense", "T", -2.7, 2),
      man("t2", "defense", "T", 2.7, 2),
      man("e2", "defense", "E", 6, 2),
      man("w", "defense", "W", -4, 6),
      man("m", "defense", "M", 3, 6),
      man("c1", "defense", "C", -20, 5),
      man("c2", "defense", "C", 20, 5),
      man("f", "defense", "F", -8, 15),
      man("s", "defense", "S", 8, 15),
      man("$", "defense", "$", 12, 6),
    ]);
    expect(defenseWords(money)).toContain("$: secondary · Nickel");
  });

  it("reads the front off the stance: the nose over the ball, the ends outside, tackles between", () => {
    expect(defenseWords(onField(callNamed("Bear Front Cover 0")))).toEqual(
      expect.arrayContaining([
        "E: front · End",
        "T: front · Tackle",
        "N: front · Nose",
      ]),
    );
    const unlettered = (offsets: readonly number[]) =>
      defenseWords(
        playWith(
          offsets.map((lateral, index) =>
            man(`d${index}`, "defense", "", lateral, 2),
          ),
        ),
      );
    expect(unlettered([-6, -2.7, 0, 2.7, 6])).toEqual([
      "-: front · End",
      "-: front · Tackle",
      "-: front · Nose",
      "-: front · Tackle",
      "-: front · End",
    ]);
    expect(unlettered([-6, -2.7, 2.7, 6])).toEqual([
      "-: front · End",
      "-: front · Tackle",
      "-: front · Tackle",
      "-: front · End",
    ]);
  });

  it("reads the front against the offense's ball, not midfield", () => {
    const onHash = playWith([
      ...line(-8),
      man("q", "offense", "Q", -8, -6),
      man("nose", "defense", "", -8, 2),
      man("end", "defense", "", -2, 2),
    ]);
    expect(defenseWords(onHash)).toEqual(["-: front · Nose", "-: front · End"]);
  });

  it("keeps an unlettered man three yards off the ball on the front, and a corner pressed at the line out of it", () => {
    const play = playWith([
      man("dl", "defense", "", 2, 3.5),
      man("lb", "defense", "", -2, 6),
      man("c", "defense", "C", -18, 1),
      man("fs", "defense", "", 0, 14),
      man("nb", "defense", "", 10, 6),
    ]);
    expect(defenseWords(play)).toEqual([
      "-: front · Nose",
      "-: linebackers · Linebacker",
      "C: secondary · Corner",
      "-: secondary · Safety",
      "-: secondary · Nickel",
    ]);
  });

  it("fields the Bear's four defensive backs as two corners and two safeties, each with his own letter", () => {
    const bear = callNamed("Bear Front Cover 0");
    const letters = bear.formation.slots.map(({ label }) => label).sort();
    expect(letters).toEqual([
      "$",
      "C",
      "C",
      "E",
      "E",
      "F",
      "M",
      "N",
      "T",
      "T",
      "W",
    ]);
    const secondary = defenseWords(onField(bear)).filter((word) =>
      word.includes("secondary"),
    );
    expect(secondary.sort()).toEqual([
      "$: secondary · Strong safety",
      "C: secondary · Corner",
      "C: secondary · Corner",
      "F: secondary · Free safety",
    ]);
  });

  it("letters no two men of a call alike on one side of the ball unless the reading tells them apart", () => {
    for (const call of stockDefensiveCalls) {
      const words = defensivePositions(onField(call));
      const defense = onField(call).players.filter(
        ({ unit }) => unit === "defense",
      );
      const seen = new Map<string, number>();
      defense.forEach((player, index) => {
        const side = player.position.lateralYards < 0 ? "L" : "R";
        const key = `${player.label}@${side}·${words[index]!.name}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      });
      for (const [key, count] of seen) {
        expect(count, `${call.formation.name}: ${key}`).toBe(1);
      }
    }
  });
});

describe("what a line is called", () => {
  const dotted: MovementPath = {
    id: "man",
    kind: "zone",
    playerId: "c",
    points: [
      { lateralYards: -20, depthYards: 5 },
      { lateralYards: -19, depthYards: -1 },
    ],
    branches: [],
    style: { line: "dotted", ending: "arrow", color: "blue" },
  };

  it("calls a man line Man, and a drop Zone", () => {
    expect(lineKindWord(dotted)).toBe("Man");
    expect(
      lineKindWord({
        ...dotted,
        style: { line: "dashed", ending: "bubble", color: "blue" },
      }),
    ).toBe("Zone");
    expect(lineKindWord({ ...dotted, kind: "blitz" })).toBe("Blitz");
  });
});
