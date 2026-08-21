import {
  applyFormation,
  assignRoles,
  ballLateralYards,
  currentFormation,
  formationFromOffense,
  formationMeta,
  formationSchema,
  formationStillApplied,
  highSchoolFieldProfile,
  planRealignment,
  playDocumentSchema,
  recognizeFormation,
  roleFromLabel,
  stockFormations,
  type Formation,
  type PlayDocument,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

const setNamed = (name: string): Formation => {
  const formation = stockFormations.find((value) => value.name === name);
  if (!formation) throw new Error(`No such set: ${name}`);
  return formation;
};

/** A Play with the men of a set standing on it, and nothing else. */
function playOn(formation: Formation): PlayDocument {
  return playDocumentSchema.parse({
    schemaVersion: 3,
    id: "play_under_test",
    playbookId: "playbook_formations",
    name: "Under test",
    unit: "offense",
    tags: [],
    notes: "",
    fieldProfile: highSchoolFieldProfile,
    players: formation.slots.map((slot, index) => ({
      id: `man_${index}`,
      unit: slot.unit,
      position: slot.position,
      symbol: slot.symbol,
      label: slot.label,
      sublabel: "",
      fill: "none",
      color: "ink",
    })),
    assignments: [],
    paths: [],
    labels: [],
  });
}

const idOfRole = (play: PlayDocument, role: string): string => {
  const roles = assignRoles(play.players);
  const index = roles.indexOf(role);
  if (index < 0) throw new Error(`Nobody is playing ${role}`);
  return play.players[index]!.id;
};

const positionOf = (play: PlayDocument, id: string) =>
  play.players.find((player) => player.id === id)!.position;

let nextId = 0;
const makeId = (prefix: string) => `${prefix}_new_${(nextId += 1)}`;

describe("the sets the original ships with", () => {
  it("carries every one of them, and each is a Formation the schema accepts", () => {
    expect(stockFormations).toHaveLength(18);
    for (const formation of stockFormations) {
      expect(() => formationSchema.parse(formation)).not.toThrow();
      expect(formation.slots).toHaveLength(11);
    }
  });

  it("derives the left-handed twin by reflection, trading the names that say which side a man plays", () => {
    const right = setNamed("Gun Trips Right");
    const left = setNamed("Gun Trips Left");
    expect(left.mirrorFormationId).toBe(right.id);
    expect(right.mirrorFormationId).toBe(left.id);

    const acrossFrom = (formation: Formation, role: string) =>
      formation.slots.find((slot) => slot.role === role)!.position;
    expect(acrossFrom(left, "Z").lateralYards).toBeCloseTo(
      -acrossFrom(right, "X").lateralYards,
      9,
    );
    // The letter travels with the side, not with the man: the Z of the left
    // set stands where the X of the right one did, and is lettered Z.
    expect(left.slots.find((slot) => slot.role === "Z")!.label).toBe("Z");
    expect(acrossFrom(left, "LT").lateralYards).toBeCloseTo(
      -acrossFrom(right, "RT").lateralYards,
      9,
    );
  });

  it("reads personnel and strength back off the men, for a set that never declared them", () => {
    const read = (name: string) =>
      formationMeta(
        setNamed(name).slots.map(({ label, position }) => ({
          label,
          position,
        })),
      );
    expect(read("Gun Trips Right").personnelLabel).toBe("11");
    expect(read("Gun Ace Right").personnelLabel).toBe("12");
    // The I-Form's second back is lettered H, which reads as a slot rather
    // than a back, so the count comes out 11 where the set is named 21. This
    // is why every shipped set declares its own personnel: the reading is a
    // fallback for a set the Coach saved without naming, not an authority.
    expect(read("I-Form Right").personnelLabel).toBe("11");
    expect(setNamed("I-Form Right").personnelLabel).toBe("21");

    expect(read("Gun Trips Right").strength).toBe("right");
    expect(read("Gun Trips Left").strength).toBe("left");
    // Two tight ends split either side is nobody's strong side. The shipped
    // set still calls itself Right, because what it declares is what a Coach
    // named it — the reading is only for a set that named nothing.
    expect(read("Gun Ace Right").strength).toBe("balanced");

    // What a set declares wins over what the men in it read as, which is how
    // the I-Form keeps being 21 personnel and Gun Ace keeps being Right.
    const iForm = setNamed("I-Form Right");
    const ace = setNamed("Gun Ace Right");
    expect(
      formationMeta(iForm.slots, { personnelLabel: iForm.personnelLabel }),
    ).toMatchObject({ personnelLabel: "21" });
    expect(formationMeta(ace.slots, { strength: ace.strength })).toMatchObject({
      strength: "right",
    });
  });
});

describe("what position a man is playing", () => {
  it("takes the letter he is drawn with when he has one", () => {
    expect(roleFromLabel("q")).toBe("QB");
    expect(roleFromLabel(" A ")).toBe("H");
    expect(roleFromLabel("W")).toBeUndefined();
  });

  it("makes the five unlettered men nearest the ball the line, and names them left to right", () => {
    const at = (lateralYards: number, depthYards = -1.5) => ({
      label: "",
      position: { lateralYards, depthYards },
    });
    expect(assignRoles([at(2), at(-2), at(0), at(4), at(-4)])).toEqual([
      "RG",
      "LG",
      "C",
      "RT",
      "LT",
    ]);
    // Seven men standing on the line is still a five-man line: the two
    // furthest out are wings. Which two is decided by how far from the ball
    // each man is, not by which side of it he stands on.
    expect(
      assignRoles([at(-7), at(2), at(-2), at(0), at(4), at(-4), at(7)]),
    ).toEqual(["H", "RG", "LG", "C", "RT", "LT", "H"]);
  });

  it("centres a short line on the names, so three men read as the guards and the centre", () => {
    const at = (lateralYards: number) => ({
      label: "",
      position: { lateralYards, depthYards: -1.5 },
    });
    expect(assignRoles([at(-2), at(0), at(2)])).toEqual(["LG", "C", "RG"]);
    // An even count cannot be centred, and the original settles it to the
    // left rather than leaving a name unused in the middle.
    expect(assignRoles([at(-3), at(-1), at(1), at(3)])).toEqual([
      "LT",
      "LG",
      "C",
      "RG",
    ]);
  });

  it("calls a deep man in the middle a back and a wide one a slot", () => {
    const deep = (lateralYards: number) => ({
      label: "",
      role: undefined,
      position: { lateralYards, depthYards: -7 },
    });
    expect(assignRoles([deep(1), deep(20)])).toEqual(["RB", "H"]);
  });

  it("lets the man himself say, over anything read off where he stands", () => {
    expect(
      assignRoles([
        {
          label: "X",
          role: "TE",
          position: { lateralYards: -20, depthYards: 0 },
        },
      ]),
    ).toEqual(["TE"]);
  });
});

describe("where the ball is spotted", () => {
  it("takes the centre when one is drawn, wherever the rest of the line stands", () => {
    const play = playOn(setNamed("Gun Trips Right"));
    expect(ballLateralYards(play.players)).toBeCloseTo(0, 9);
    // The ball is under the centre, not at the average of the men around
    // him: a line that has shifted off the ball has not moved the ball.
    const shifted = play.players.map((player) =>
      player.symbol === "square"
        ? {
            ...player,
            position: { ...player.position, lateralYards: 4 },
          }
        : player,
    );
    expect(ballLateralYards(shifted)).toBeCloseTo(4, 9);
  });

  it("falls back to the middle of the line when nobody is drawn as the centre", () => {
    const play = playOn(setNamed("Gun Trips Right"));
    const rounded = play.players.map((player) => ({
      ...player,
      symbol: "circle" as const,
      position: {
        ...player.position,
        lateralYards: player.position.lateralYards + 6,
      },
    }));
    expect(ballLateralYards(rounded)).toBeCloseTo(6, 9);
  });
});

describe("moving the men onto another set", () => {
  it("pairs every man with the slot of the position he was playing", () => {
    const play = playOn(setNamed("Gun Doubles Right"));
    const plan = planRealignment(play, setNamed("Gun Trips Right"));
    expect(plan.vacancies).toHaveLength(0);
    expect(plan.orphans).toHaveLength(0);
    expect(plan.pairs).toHaveLength(11);
    const moved = plan.pairs.find(({ slot }) => slot.role === "H")!;
    expect(moved.slot.position.lateralYards).toBeGreaterThan(0);
    expect(moved.from.lateralYards).toBeLessThan(0);
    expect(plan.movedCount).toBeGreaterThan(0);
  });

  it("counts a slot nobody plays as a vacancy and a man the set has no place for as an orphan", () => {
    const play = playOn(setNamed("Gun Ace Right"));
    // Gun Ace has two tight ends; Gun Doubles has one, so a Y is left over.
    const plan = planRealignment(play, setNamed("Gun Doubles Right"));
    expect(plan.vacancies.map(({ role }) => role)).toEqual(["H"]);
    expect(plan.orphans).toHaveLength(1);
    expect(assignRoles(plan.orphans)).toEqual(["TE"]);
  });

  it("carries every route with the man running it, control points and forks included", () => {
    const start = playOn(setNamed("Gun Doubles Right"));
    const receiver = idOfRole(start, "X");
    const withRoute: PlayDocument = {
      ...start,
      paths: [
        {
          id: "route_x",
          kind: "route",
          playerId: receiver,
          points: [
            positionOf(start, receiver),
            {
              lateralYards: -18,
              depthYards: 12,
              control: { lateralYards: -19, depthYards: 6 },
            },
          ],
          branches: [
            {
              fromIndex: 1,
              points: [{ lateralYards: -10, depthYards: 16 }],
              style: { line: "dashed", ending: "arrow", color: "ink" },
            },
          ],
          style: { line: "solid", ending: "arrow", color: "ink" },
        },
      ],
    };

    const { play } = applyFormation(withRoute, setNamed("Empty Right"), makeId);
    const before = positionOf(withRoute, receiver);
    const after = positionOf(play, receiver);
    const lateral = after.lateralYards - before.lateralYards;
    expect(lateral).not.toBe(0);

    const path = play.paths[0]!;
    expect(path.points[0]!.lateralYards).toBeCloseTo(after.lateralYards, 9);
    expect(path.points[1]!.lateralYards).toBeCloseTo(-18 + lateral, 9);
    expect(path.points[1]!.control!.lateralYards).toBeCloseTo(-19 + lateral, 9);
    expect(path.branches[0]!.points[0]!.lateralYards).toBeCloseTo(
      -10 + lateral,
      9,
    );
  });

  it("takes an unbound note beside a man with him, and leaves one pinned to a route alone", () => {
    const start = playOn(setNamed("Gun Doubles Right"));
    const receiver = idOfRole(start, "X");
    const stance = positionOf(start, receiver);
    const withNotes: PlayDocument = {
      ...start,
      paths: [
        {
          id: "route_x",
          kind: "route",
          playerId: receiver,
          points: [stance, { lateralYards: -20, depthYards: 12 }],
          branches: [],
          style: { line: "solid", ending: "arrow", color: "ink" },
        },
      ],
      labels: [
        {
          id: "beside_him",
          position: { ...stance, depthYards: stance.depthYards + 1 },
          text: "Outside release",
          color: "ink",
          size: 11,
          box: "none",
          boxColor: "yellow",
        },
        {
          // Placed right beside the man, so the only thing keeping it still
          // is that it is pinned to a route which travels on its own.
          id: "on_the_route",
          position: { ...stance, depthYards: stance.depthYards + 0.5 },
          text: "12",
          color: "ink",
          size: 11,
          box: "none",
          boxColor: "yellow",
          binding: {
            pathId: "route_x",
            segmentIndex: 0,
            progress: 0.5,
            offset: { lateralYards: 1, depthYards: 0 },
          },
        },
        {
          id: "far_away",
          position: { lateralYards: 24, depthYards: 20 },
          text: "Ball at the 40",
          color: "ink",
          size: 11,
          box: "none",
          boxColor: "yellow",
        },
      ],
    };

    const { play } = applyFormation(withNotes, setNamed("Empty Right"), makeId);
    const lateral =
      positionOf(play, receiver).lateralYards - stance.lateralYards;
    const noteAt = (id: string) =>
      play.labels.find((label) => label.id === id)!.position;
    expect(noteAt("beside_him").lateralYards).toBeCloseTo(
      stance.lateralYards + lateral,
      9,
    );
    expect(noteAt("on_the_route")).toEqual({
      ...stance,
      depthYards: stance.depthYards + 0.5,
    });
    expect(noteAt("far_away")).toEqual({ lateralYards: 24, depthYards: 20 });
  });

  it("adds the men the set has nobody for, and says which ones it added", () => {
    const start = playOn(setNamed("Gun Doubles Right"));
    const withoutTheTightEnd: PlayDocument = {
      ...start,
      players: start.players.filter(
        (player) => player.id !== idOfRole(start, "TE"),
      ),
    };
    const { play, addedPlayerIds } = applyFormation(
      withoutTheTightEnd,
      setNamed("Gun Doubles Right"),
      makeId,
    );
    expect(addedPlayerIds).toHaveLength(1);
    expect(play.players).toHaveLength(11);
    const added = play.players.find(({ id }) => id === addedPlayerIds[0])!;
    expect(added.label).toBe("Y");
  });

  it("leaves the men alone when the Coach asked for the set without its missing pieces", () => {
    const start = playOn(setNamed("Gun Doubles Right"));
    const short: PlayDocument = {
      ...start,
      players: start.players.filter(
        (player) => player.id !== idOfRole(start, "TE"),
      ),
    };
    const { play, addedPlayerIds } = applyFormation(
      short,
      setNamed("Gun Doubles Right"),
      makeId,
      { addMissingPlayers: false },
    );
    expect(addedPlayerIds).toEqual([]);
    expect(play.players).toHaveLength(10);
  });

  it("records which set is on the field, and which man is standing in which slot", () => {
    const play = playOn(setNamed("Gun Doubles Right"));
    const trips = setNamed("Gun Trips Right");
    const { play: after } = applyFormation(play, trips, makeId);
    expect(after.formationSource?.formationId).toBe(trips.id);
    expect(after.formationSource?.slotBindings).toHaveLength(11);
    expect(() => playDocumentSchema.parse(after)).not.toThrow();
  });

  it("gives an unlettered man the shape his slot is drawn with, and leaves a lettered one his own", () => {
    const start = playOn(setNamed("Gun Doubles Right"));
    const disguised: PlayDocument = {
      ...start,
      players: start.players.map((player) => ({
        ...player,
        symbol: "triangle" as const,
      })),
    };
    const { play } = applyFormation(
      disguised,
      setNamed("Gun Doubles Right"),
      makeId,
    );
    const roles = assignRoles(play.players);
    const symbolOf = (role: string) =>
      play.players[roles.indexOf(role)]!.symbol;
    expect(symbolOf("C")).toBe("square");
    expect(symbolOf("LT")).toBe("circle");
    expect(symbolOf("X")).toBe("triangle");
  });
});

describe("reading which set is on the field", () => {
  it("names the set the men are standing in", () => {
    const bunch = setNamed("Gun Bunch Right");
    const read = recognizeFormation(playOn(bunch), stockFormations);
    expect(read.formation?.id).toBe(bunch.id);
    expect(read.confidence).toBe(1);
  });

  it("names nothing at all when the count is wrong, however well the rest of them line up", () => {
    const trips = setNamed("Gun Trips Right");
    const start = playOn(trips);
    const short: PlayDocument = {
      ...start,
      players: start.players.filter(
        (player) => player.id !== idOfRole(start, "Z"),
      ),
    };
    const read = recognizeFormation(short, stockFormations);
    expect(read.formation).toBeUndefined();
    expect(read.confidence).toBe(0);
  });

  it("still names it when the whole set has moved to a hash, because it measures from the ball", () => {
    const trips = setNamed("Gun Trips Right");
    const start = playOn(trips);
    const onTheHash: PlayDocument = {
      ...start,
      players: start.players.map((player) => ({
        ...player,
        position: {
          ...player.position,
          lateralYards: player.position.lateralYards - 6,
        },
      })),
    };
    expect(recognizeFormation(onTheHash, stockFormations).formation?.id).toBe(
      trips.id,
    );
  });

  it("keeps the name when the Coach tightens the splits, and loses it when a man leaves the set", () => {
    const trips = setNamed("Gun Trips Right");
    const start = playOn(trips);
    const tightened: PlayDocument = {
      ...start,
      players: start.players.map((player) => ({
        ...player,
        position: {
          ...player.position,
          lateralYards: player.position.lateralYards * 0.6,
        },
      })),
    };
    expect(formationStillApplied(tightened, trips)).toBe(true);
    // Moving one man alone is not a tighter set, it is a different one — the
    // side scales around him and he no longer sits where the scale puts him.
    const receiver = idOfRole(start, "X");
    const oneManIn: PlayDocument = {
      ...start,
      players: start.players.map((player) =>
        player.id === receiver
          ? {
              ...player,
              position: {
                ...player.position,
                lateralYards: player.position.lateralYards * 0.6,
              },
            }
          : player,
      ),
    };
    expect(formationStillApplied(oneManIn, trips)).toBe(false);

    // Squeezed to under half its width every man still sits where the scale
    // puts him, so only the bounds on the scale itself say this is no longer
    // the set the Coach called.
    const squeezed: PlayDocument = {
      ...start,
      players: start.players.map((player) => ({
        ...player,
        position: {
          ...player.position,
          lateralYards: player.position.lateralYards * 0.3,
        },
      })),
    };
    expect(formationStillApplied(squeezed, trips)).toBe(false);
  });

  it("scales each side of the ball by its own splits, since a Coach tightens one side at a time", () => {
    const trips = setNamed("Gun Trips Right");
    const start = playOn(trips);
    const leftSideIn: PlayDocument = {
      ...start,
      players: start.players.map((player) => ({
        ...player,
        position: {
          ...player.position,
          lateralYards:
            player.position.lateralYards < 0
              ? player.position.lateralYards * 0.6
              : player.position.lateralYards,
        },
      })),
    };
    expect(formationStillApplied(leftSideIn, trips)).toBe(true);

    const back = idOfRole(start, "RB");
    const broken: PlayDocument = {
      ...start,
      players: start.players.map((player) =>
        player.id === back
          ? { ...player, position: { lateralYards: 0, depthYards: -22 } }
          : player,
      ),
    };
    expect(formationStillApplied(broken, trips)).toBe(false);
  });

  it("keeps the name the Coach applied while the set holds, and reads the field once it does not", () => {
    const trips = setNamed("Gun Trips Right");
    const { play } = applyFormation(
      playOn(setNamed("Gun Doubles Right")),
      trips,
      makeId,
    );
    expect(currentFormation(play, stockFormations)?.id).toBe(trips.id);

    const scattered: PlayDocument = {
      ...play,
      players: play.players.map((player, index) =>
        index % 2 === 0
          ? player
          : {
              ...player,
              position: { lateralYards: 0, depthYards: -30 - index },
            },
      ),
    };
    expect(currentFormation(scattered, stockFormations)).toBeUndefined();
  });

  it("names nothing when there is nobody on the field", () => {
    const play = playOn(setNamed("Gun Trips Right"));
    expect(
      currentFormation({ ...play, players: [] }, stockFormations),
    ).toBeUndefined();
  });
});

describe("the offense on the field, kept as a set of its own", () => {
  const named = {
    id: "formation_saved",
    playbookId: "playbook_under_test",
    name: "Andy's Empty",
    slotId: (index: number) => `slot_saved_${index}`,
  };

  it("reads the set off the men, so only the name is the Coach's to give", () => {
    const play = playOn(setNamed("Gun Trips Right"));
    const saved = formationFromOffense(play, named)!;

    // It has to be a Formation before anything else — a set Chalk cannot
    // validate is a set it cannot keep.
    expect(() => formationSchema.parse(saved)).not.toThrow();
    expect(saved.name).toBe("Andy's Empty");
    expect(saved.family).toBe("custom");
    expect(saved.unit).toBe("offense");
    expect(saved.playbookId).toBe("playbook_under_test");

    const offense = play.players.filter(({ unit }) => unit !== "defense");
    expect(saved.slots).toHaveLength(offense.length);
    expect(saved.description).toBe(`${offense.length} pl`);
    // Personnel and strength are what the men say they are, not what the set
    // it came from was called.
    const read = formationMeta(offense);
    expect(saved.personnelLabel).toBe(read.personnelLabel);
    expect(saved.strength).toBe(read.strength);
    // Every man keeps his place, his mark and his letter.
    expect(saved.slots.map(({ position }) => position)).toEqual(
      offense.map(({ position }) => position),
    );
    expect(saved.slots.map(({ label }) => label)).toEqual(
      offense.map(({ label }) => label),
    );
    expect(saved.slots.map(({ symbol }) => symbol)).toEqual(
      offense.map(({ symbol }) => symbol),
    );
  });

  it("names a role for every man, so a route survives being realigned into it", () => {
    const saved = formationFromOffense(
      playOn(setNamed("Gun Doubles Right")),
      named,
    )!;
    expect(saved.slots.every(({ role }) => role.length > 0)).toBe(true);
  });

  it("leaves the defense out — this is the offense he set", () => {
    const play = playOn(setNamed("Gun Trips Right"));
    const withDefense: PlayDocument = {
      ...play,
      players: [
        ...play.players,
        {
          ...play.players[0]!,
          id: "player_defender",
          unit: "defense",
          label: "M",
        },
      ],
    };
    const saved = formationFromOffense(withDefense, named)!;
    expect(saved.slots.every(({ unit }) => unit === "offense")).toBe(true);
    expect(saved.slots).toHaveLength(
      play.players.filter(({ unit }) => unit !== "defense").length,
    );
  });

  it("spots the ball where the men put it, and reads the hash off it", () => {
    const play = playOn(setNamed("Gun Trips Right"));
    const offense = play.players.filter(({ unit }) => unit !== "defense");
    const middle = formationFromOffense(play, named)!;
    expect(middle.ball.position.lateralYards).toBeCloseTo(
      ballLateralYards(offense),
    );
    expect(middle.ball.hash).toBe("middle");

    // Move the whole offense to the right of the field and the set says so.
    const shifted: PlayDocument = {
      ...play,
      players: play.players.map((player) => ({
        ...player,
        position: {
          ...player.position,
          lateralYards: player.position.lateralYards + 12,
        },
      })),
    };
    expect(formationFromOffense(shifted, named)!.ball.hash).toBe("right");
  });

  it("has nothing to keep when there is no offense on the field", () => {
    const play = playOn(setNamed("Gun Trips Right"));
    expect(
      formationFromOffense({ ...play, players: [] }, named),
    ).toBeUndefined();
  });
});
