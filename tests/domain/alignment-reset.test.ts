import {
  applyDefensiveCall,
  applyFormation,
  applyPlayCommand,
  applyPlayCommandWithInverse,
  baseDefensiveCall,
  baseFormation,
  canonicalStringify,
  chosenAlignment,
  currentDefensiveCall,
  currentFormation,
  deletePlayersCommand,
  emptyPlayDocument,
  highSchoolFieldProfile,
  playDocumentSchema,
  playErasureCommand,
  resetAlignment,
  spotBall,
  stockDefensiveCalls,
  stockFormations,
  type Coordinate,
  type Formation,
  type PlayDocument,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

const setNamed = (name: string): Formation => {
  const formation = stockFormations.find((value) => value.name === name);
  if (!formation) throw new Error(`No such set: ${name}`);
  return formation;
};
const callNamed = (name: string) => {
  const call = stockDefensiveCalls.find(
    ({ formation }) => formation.name === name,
  );
  if (!call) throw new Error(`No such call: ${name}`);
  return call;
};

let nextId = 0;
const makeId = (prefix: string) => `${prefix}_${(nextId += 1)}`;

/** Gun Trips Right against Nickel Cover 2, both put on from the browsers. */
function alignedPlay(): PlayDocument {
  const blank = emptyPlayDocument({
    playbookId: "playbook_reset",
    fieldProfile: highSchoolFieldProfile,
    id: "play_reset",
  });
  const offense = applyFormation(blank, setNamed("Gun Trips Right"), makeId);
  return playDocumentSchema.parse(
    applyDefensiveCall(offense.play, callNamed("Nickel Cover 2"), makeId).play,
  );
}

const man = (play: PlayDocument, label: string, unit = "offense") => {
  const found = play.players.find(
    (player) => player.label === label && player.unit === unit,
  );
  if (!found) throw new Error(`Nobody lettered ${label}`);
  return found;
};

const centre = (play: PlayDocument) =>
  play.players.find(
    ({ symbol, unit }) => symbol === "square" && unit === "offense",
  )!;

/** A man dragged by hand, and whatever he runs dragged with him. */
function drag(
  play: PlayDocument,
  playerId: string,
  by: Coordinate,
): PlayDocument {
  const move = (point: Coordinate): Coordinate => ({
    lateralYards: point.lateralYards + by.lateralYards,
    depthYards: point.depthYards + by.depthYards,
  });
  return {
    ...play,
    players: play.players.map((player) =>
      player.id === playerId
        ? { ...player, position: move(player.position) }
        : player,
    ),
    paths: play.paths.map((path) =>
      path.playerId === playerId
        ? {
            ...path,
            points: path.points.map((point) => ({ ...point, ...move(point) })),
          }
        : path,
    ),
  };
}

const positions = (play: PlayDocument) =>
  new Map(play.players.map(({ id, position }) => [id, position]));

describe("putting the men back in the set he chose", () => {
  it("returns the men he moved to their slots and leaves everyone else exactly where they stand", () => {
    const aligned = alignedPlay();
    const x = man(aligned, "X");
    const h = man(aligned, "H");
    const moved = drag(
      drag(aligned, x.id, { lateralYards: 4, depthYards: -1 }),
      h.id,
      { lateralYards: -3, depthYards: 0 },
    );
    expect(currentFormation(moved, stockFormations)).toBeUndefined();

    const reset = resetAlignment(moved, "offense", "chosen")!;
    expect(reset.alignment.name).toBe("Gun Trips Right");
    expect(reset.movedCount).toBe(2);
    expect(positions(reset.play)).toEqual(positions(aligned));
    expect(reset.play.formationSource).toEqual(aligned.formationSource);
    expect(currentFormation(reset.play, stockFormations)?.name).toBe(
      "Gun Trips Right",
    );
  });

  it("brings each man's route back with him, shape and all", () => {
    const aligned = alignedPlay();
    const x = man(aligned, "X");
    const withRoute: PlayDocument = {
      ...aligned,
      paths: [
        ...aligned.paths,
        {
          id: "route_x",
          kind: "route",
          playerId: x.id,
          points: [
            x.position,
            { lateralYards: x.position.lateralYards, depthYards: 12 },
            { lateralYards: x.position.lateralYards + 6, depthYards: 14 },
          ],
          branches: [],
          style: { line: "solid", ending: "arrow", color: "ink" },
        },
      ],
    };
    const moved = drag(withRoute, x.id, { lateralYards: 5, depthYards: -2 });

    const reset = resetAlignment(moved, "offense", "chosen")!;
    expect(reset.play.paths.find(({ id }) => id === "route_x")).toEqual(
      withRoute.paths.find(({ id }) => id === "route_x"),
    );
  });

  it("puts a defender back in the call and takes his drop with him", () => {
    const aligned = alignedPlay();
    expect(aligned.defensiveCallSource?.callId).toBe(
      callNamed("Nickel Cover 2").formation.id,
    );
    expect(aligned.defensiveCallSource?.slotBindings).toHaveLength(11);
    const mike = man(aligned, "M", "defense");
    const moved = drag(aligned, mike.id, { lateralYards: 3, depthYards: 2 });
    expect(currentDefensiveCall(moved, stockDefensiveCalls)).toBeUndefined();

    const reset = resetAlignment(moved, "defense", "chosen")!;
    expect(reset.movedCount).toBe(1);
    expect(canonicalStringify(reset.play)).toBe(canonicalStringify(aligned));
    expect(
      currentDefensiveCall(reset.play, stockDefensiveCalls)?.formation.name,
    ).toBe("Nickel Cover 2");
  });

  it("keeps the ball on the hash he spotted it on, even with the centre dragged off it", () => {
    const aligned = alignedPlay();
    const { play: spotted, tightened } = spotBall(aligned, "left");
    // The widest men are squeezed to stay in bounds, and the reset must not
    // undo that for the men he never touched.
    expect(tightened).toBe(true);
    const x = man(spotted, "X");
    const corner = spotted.players.find(
      ({ unit, label, position }) =>
        unit === "defense" && label === "C" && position.lateralYards < 0,
    )!;
    const moved = drag(
      drag(
        drag(spotted, x.id, { lateralYards: 3, depthYards: 0 }),
        centre(spotted).id,
        { lateralYards: 2, depthYards: -1 },
      ),
      corner.id,
      { lateralYards: 4, depthYards: 3 },
    );

    const offense = resetAlignment(moved, "offense", "chosen")!;
    expect(offense.movedCount).toBe(2);
    const defense = resetAlignment(offense.play, "defense", "chosen")!;
    expect(defense.movedCount).toBe(1);
    for (const [id, position] of positions(defense.play)) {
      const was = positions(spotted).get(id)!;
      expect(position.lateralYards).toBeCloseTo(was.lateralYards, 9);
      expect(position.depthYards).toBeCloseTo(was.depthYards, 9);
    }
  });

  it("does not bring back a man he deleted, and leaves one the set never had where he is", () => {
    const aligned = alignedPlay();
    const z = man(aligned, "Z");
    const x = man(aligned, "X");
    const withoutZ = applyPlayCommand(
      aligned,
      deletePlayersCommand(aligned, [z.id]),
    );
    expect(
      withoutZ.formationSource?.slotBindings.map(({ playerId }) => playerId),
    ).not.toContain(z.id);
    const extra = {
      ...x,
      id: "extra_man",
      label: "W",
      position: { lateralYards: 5, depthYards: -8 },
    };
    const drawn = drag(
      { ...withoutZ, players: [...withoutZ.players, extra] },
      x.id,
      { lateralYards: 2, depthYards: 0 },
    );

    const reset = resetAlignment(drawn, "offense", "chosen")!;
    expect(reset.play.players.some(({ id }) => id === z.id)).toBe(false);
    expect(reset.play.players.find(({ id }) => id === "extra_man")).toEqual(
      extra,
    );
    expect(man(reset.play, "X").position).toEqual(x.position);
  });

  it("has nothing to go back to when no set or call was ever chosen", () => {
    const aligned = alignedPlay();
    const byHand: PlayDocument = { ...aligned };
    delete (byHand as { formationSource?: unknown }).formationSource;
    delete (byHand as { defensiveCallSource?: unknown }).defensiveCallSource;
    expect(chosenAlignment(byHand, "offense")).toBeUndefined();
    expect(resetAlignment(byHand, "offense", "chosen")).toBeUndefined();
    expect(resetAlignment(byHand, "defense", "chosen")).toBeUndefined();
  });

  it("finds a set the Coach saved himself, not only the stock ones", () => {
    const aligned = alignedPlay();
    const mine: Formation = {
      ...setNamed("Gun Trips Right"),
      id: "formation_mine",
      playbookId: "playbook_reset",
      name: "Trips Right Tight",
      family: "custom",
    };
    const { play } = applyFormation(aligned, mine, makeId);
    expect(resetAlignment(play, "offense", "chosen")).toBeUndefined();
    const moved = drag(play, man(play, "X").id, {
      lateralYards: 3,
      depthYards: 0,
    });
    const reset = resetAlignment(moved, "offense", "chosen", [
      ...stockFormations,
      mine,
    ])!;
    expect(reset.alignment.name).toBe("Trips Right Tight");
    expect(positions(reset.play)).toEqual(positions(play));
  });
});

describe("putting the men in the base alignment", () => {
  it("is Gun Doubles Right on offense and 4-3 Cover 3 on defense", () => {
    expect(baseFormation.name).toBe("Gun Doubles Right");
    expect(baseDefensiveCall.name).toBe("4-3 Cover 3");
  });

  it("realigns the offense into the base set by role, adds nobody, and remembers base as the set", () => {
    const aligned = alignedPlay();
    const short = applyPlayCommand(
      aligned,
      deletePlayersCommand(aligned, [man(aligned, "H").id]),
    );
    const offenseCount = (play: PlayDocument) =>
      play.players.filter(({ unit }) => unit === "offense").length;

    const reset = resetAlignment(short, "offense", "base")!;
    expect(reset.alignment.id).toBe(baseFormation.id);
    expect(offenseCount(reset.play)).toBe(offenseCount(short));
    expect(reset.play.formationSource?.formationId).toBe(baseFormation.id);
    const baseX = baseFormation.slots.find(({ role }) => role === "X")!;
    const baseZ = baseFormation.slots.find(({ role }) => role === "Z")!;
    expect(man(reset.play, "X").position).toEqual(baseX.position);
    expect(man(reset.play, "Z").position).toEqual(baseZ.position);
    // The defense is the other side's business.
    for (const defender of short.players.filter(
      ({ unit }) => unit === "defense",
    )) {
      expect(
        reset.play.players.find(({ id }) => id === defender.id)!.position,
      ).toEqual(defender.position);
    }
  });

  it("puts a hand-drawn front in the base call letter by letter, and leaves a letter it has no place for alone", () => {
    const aligned = alignedPlay();
    const handDrawn: PlayDocument = {
      ...aligned,
      players: aligned.players.map((player) =>
        player.unit === "defense" && player.label === "N"
          ? { ...player, label: "Q" }
          : player,
      ),
    };
    delete (handDrawn as { defensiveCallSource?: unknown }).defensiveCallSource;

    const reset = resetAlignment(handDrawn, "defense", "base")!;
    expect(reset.alignment.id).toBe(baseDefensiveCall.id);
    expect(reset.play.defensiveCallSource?.callId).toBe(baseDefensiveCall.id);
    const lettered = handDrawn.players.find(
      ({ unit, label }) => unit === "defense" && label === "Q",
    );
    if (lettered) {
      expect(
        reset.play.players.find(({ id }) => id === lettered.id)!.position,
      ).toEqual(lettered.position);
    }
    // Both corners go to the corner spots on their own sides.
    const corners = reset.play.players
      .filter(({ unit, label }) => unit === "defense" && label === "C")
      .map(({ position }) => position.lateralYards)
      .sort((left, right) => left - right);
    const baseCorners = baseDefensiveCall.slots
      .filter(({ label }) => label === "C")
      .map(({ position }) => position.lateralYards)
      .sort((left, right) => left - right);
    expect(corners).toEqual(baseCorners);
    // Offense untouched.
    for (const player of handDrawn.players.filter(
      ({ unit }) => unit === "offense",
    )) {
      expect(
        reset.play.players.find(({ id }) => id === player.id)!.position,
      ).toEqual(player.position);
    }
  });

  it("has nobody to move when that side of the ball is empty", () => {
    const blank = emptyPlayDocument({
      playbookId: "playbook_reset",
      fieldProfile: highSchoolFieldProfile,
    });
    expect(resetAlignment(blank, "offense", "base")).toBeUndefined();
    expect(resetAlignment(blank, "defense", "base")).toBeUndefined();
  });
});

describe("remembering the call", () => {
  it("forgets a deleted defender's slot, and the Play still reads", () => {
    const aligned = alignedPlay();
    const cleared = applyPlayCommand(
      aligned,
      playErasureCommand(aligned, "defense")!,
    );
    expect(cleared.defensiveCallSource?.slotBindings).toEqual([]);
    expect(() => playDocumentSchema.parse(cleared)).not.toThrow();
  });

  it("refuses a call binding to a man who is not on the field", () => {
    const aligned = alignedPlay();
    const result = playDocumentSchema.safeParse({
      ...aligned,
      defensiveCallSource: {
        callId: aligned.defensiveCallSource!.callId,
        slotBindings: [{ slotId: "slot_a", playerId: "nobody" }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("undoes a change to the remembered call like any other edit", () => {
    const aligned = alignedPlay();
    const { document, inverse } = applyPlayCommandWithInverse(aligned, {
      kind: "set-defensive-call-source",
    });
    expect(document.defensiveCallSource).toBeUndefined();
    expect(canonicalStringify(applyPlayCommand(document, inverse))).toBe(
      canonicalStringify(aligned),
    );
  });
});
