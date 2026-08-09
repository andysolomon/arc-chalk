import {
  ballPosition,
  ballSpotMapping,
  currentBallSpot,
  hashSpots,
  highSchoolFieldProfile,
  playDocumentSchema,
  spotBall,
  stickThunderPlay,
  type PlayDocument,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

const widest = (play: PlayDocument) =>
  Math.max(
    ...play.players.map(({ position }) => Math.abs(position.lateralYards)),
  );

describe("where the official spots the ball", () => {
  it("puts the hashes where this field puts them, either side of the middle", () => {
    const spots = hashSpots(stickThunderPlay);
    expect(spots.middle).toBe(0);
    expect(spots.left).toBeCloseTo(-spots.right, 9);
    expect(spots.right).toBeCloseTo(
      highSchoolFieldProfile.widthYards / 2 -
        highSchoolFieldProfile.hashInsetYards,
      9,
    );
  });

  it("reads the spot off the men, and says nothing when the ball is between two", () => {
    expect(currentBallSpot(stickThunderPlay)).toBe("middle");
    const spots = hashSpots(stickThunderPlay);
    const drifted: PlayDocument = {
      ...stickThunderPlay,
      players: stickThunderPlay.players.map((player) => ({
        ...player,
        position: {
          ...player.position,
          lateralYards: player.position.lateralYards + spots.right / 2,
        },
      })),
    };
    expect(currentBallSpot(drifted)).toBeUndefined();
  });

  it("looks under the centre for the ball, and at the middle when nobody is drawn as one", () => {
    // Moved to a hash, the ball is under the centre wherever he now stands —
    // not still in the middle of the field.
    const onTheHash = spotBall(stickThunderPlay, "left").play;
    expect(ballPosition(onTheHash).lateralYards).toBeCloseTo(
      hashSpots(stickThunderPlay).left,
      6,
    );
    expect(ballPosition({ ...stickThunderPlay, players: [] })).toEqual({
      lateralYards: 0,
      depthYards: 0,
    });
  });
});

describe("moving the ball, and the Play with it", () => {
  it("takes every man to the new spot, and the ball reads there afterwards", () => {
    for (const spot of ["left", "middle", "right"] as const) {
      const { play } = spotBall(stickThunderPlay, spot);
      expect(() => playDocumentSchema.parse(play)).not.toThrow();
      expect(currentBallSpot(play)).toBe(spot);
      expect(play.players).toHaveLength(stickThunderPlay.players.length);
    }
  });

  it("keeps the splits exactly as drawn when the hash leaves room for them", () => {
    const { play, tightened, mapping } = spotBall(stickThunderPlay, "left");
    expect(tightened).toBe(false);
    expect(mapping.leftScale).toBe(1);
    expect(mapping.rightScale).toBe(1);
    const before = stickThunderPlay.players.map(
      ({ position }) => position.lateralYards,
    );
    const shift = hashSpots(stickThunderPlay).left;
    for (const [index, player] of play.players.entries()) {
      expect(player.position.lateralYards).toBeCloseTo(
        before[index]! + shift,
        9,
      );
    }
  });

  it("tightens the boundary split rather than standing a man out of bounds", () => {
    const { play, tightened, mapping } = spotBall(stickThunderPlay, "right");
    expect(tightened).toBe(true);
    // The wide side is squeezed; the field side is given some of it back.
    expect(mapping.rightScale).toBeLessThan(1);
    expect(mapping.leftScale).toBeGreaterThan(1);
    // And a margin is kept off the paint, so the widest man has grass under
    // him rather than standing on the minimum.
    const half = stickThunderPlay.fieldProfile.widthYards / 2;
    expect(widest(play)).toBeLessThan(half - 2.9);

    // Each side is placed by its own ratio: the boundary men come in, and the
    // field men go out by the amount given back to them.
    const ball = mapping.ballLateralYards;
    for (const [index, player] of play.players.entries()) {
      const offset =
        stickThunderPlay.players[index]!.position.lateralYards - ball;
      expect(player.position.lateralYards).toBeCloseTo(
        hashSpots(stickThunderPlay).right +
          offset * (offset < 0 ? mapping.leftScale : mapping.rightScale),
        9,
      );
    }
  });

  it("keeps its margin off the paint, squeezing a set that would otherwise just fit", () => {
    // Sixteen yards of split fits inside the sideline from the left hash, and
    // does not fit once the margin is kept off the paint. What the margin is
    // for is that the widest man has grass under him rather than standing on
    // the minimum, so this is the case that decides it.
    const wideLeft: PlayDocument = {
      ...stickThunderPlay,
      players: stickThunderPlay.players.map((player) =>
        player.label === "X"
          ? {
              ...player,
              position: { ...player.position, lateralYards: -16 },
            }
          : player,
      ),
      paths: [],
      labels: [],
      assignments: [],
    };
    const { mapping, tightened, play } = spotBall(wideLeft, "left");
    expect(tightened).toBe(true);
    expect(mapping.leftScale).toBeLessThan(1);
    const half = wideLeft.fieldProfile.widthYards / 2;
    expect(widest(play)).toBeLessThan(half - 2.9);
  });

  it("spots a Play with no line and no centre off the men playing the offense", () => {
    const skillOnly: PlayDocument = playDocumentSchema.parse({
      ...stickThunderPlay,
      players: [
        {
          id: "receiver",
          unit: "offense",
          position: { lateralYards: -4, depthYards: 0 },
          symbol: "circle",
          label: "X",
          sublabel: "",
          fill: "none",
          color: "ink",
        },
        {
          id: "flanker",
          unit: "offense",
          position: { lateralYards: 4, depthYards: 0 },
          symbol: "circle",
          label: "Z",
          sublabel: "",
          fill: "none",
          color: "ink",
        },
        {
          id: "far_corner",
          unit: "defense",
          position: { lateralYards: 26, depthYards: 10 },
          symbol: "none",
          label: "C",
          sublabel: "",
          fill: "none",
          color: "ink",
        },
      ],
      paths: [],
      labels: [],
      assignments: [],
    });
    // With nobody on the ball to read it off, the spot is the middle of the
    // two receivers — the defender standing wide does not drag it with him.
    expect(ballSpotMapping(skillOnly, 0).ballLateralYards).toBeCloseTo(0, 9);
  });

  it("carries a line by its man even when the line does not start on him", () => {
    const first = stickThunderPlay.paths[0]!;
    const detached: PlayDocument = {
      ...stickThunderPlay,
      paths: [
        {
          ...first,
          points: first.points.map((point) => ({
            ...point,
            lateralYards: point.lateralYards + 6,
          })),
        },
      ],
    };
    const { play, mapping } = spotBall(detached, "right");
    const player = play.players.find(({ id }) => id === first.playerId)!;
    const wasAt = detached.players.find(({ id }) => id === first.playerId)!;
    const moved = player.position.lateralYards - wasAt.position.lateralYards;
    expect(play.paths[0]!.points[0]!.lateralYards).toBeCloseTo(
      detached.paths[0]!.points[0]!.lateralYards + moved,
      9,
    );
    // Placing it by where it starts instead would put it somewhere else,
    // because the two sit on differently scaled sides of the ball.
    expect(moved).not.toBeCloseTo(
      mapping.at(detached.paths[0]!.points[0]!.lateralYards) -
        detached.paths[0]!.points[0]!.lateralYards,
      6,
    );
  });

  it("carries each line with the man running it, exactly as drawn", () => {
    const { play } = spotBall(stickThunderPlay, "right");
    for (const path of play.paths) {
      const before = stickThunderPlay.paths.find(({ id }) => id === path.id)!;
      const player = play.players.find(({ id }) => id === path.playerId)!;
      const wasAt = stickThunderPlay.players.find(
        ({ id }) => id === path.playerId,
      )!;
      const moved = player.position.lateralYards - wasAt.position.lateralYards;
      for (const [index, point] of path.points.entries()) {
        expect(point.lateralYards).toBeCloseTo(
          before.points[index]!.lateralYards + moved,
          9,
        );
        expect(point.depthYards).toBe(before.points[index]!.depthYards);
      }
      for (const [bi, branch] of path.branches.entries()) {
        for (const [pi, point] of branch.points.entries()) {
          expect(point.lateralYards).toBeCloseTo(
            before.branches[bi]!.points[pi]!.lateralYards + moved,
            9,
          );
        }
      }
    }
  });

  it("lets a line keep its length past the paint rather than cutting it there", () => {
    const half = stickThunderPlay.fieldProfile.widthYards / 2;
    const { play } = spotBall(stickThunderPlay, "left");
    const outOfBounds = play.paths.flatMap((path) =>
      path.points.filter((point) => point.lateralYards < -half),
    );
    // The X's route already reaches the boundary; taken to the left hash it
    // runs past the paint, and it is left running past the paint rather than
    // being cut short there. The original cuts it, and then has to remember
    // the shape so that moving back gives the length again; nothing is lost
    // here, so there is nothing to remember.
    expect(outOfBounds.length).toBeGreaterThan(0);
  });

  it("gives a Play back exactly when the move needed no squeezing", () => {
    // Left leaves this set all the room it wants, so out and back is the
    // identity. A squeeze is not undone — the same as the original — because
    // it is a change to the splits rather than a change of spot.
    const out = spotBall(stickThunderPlay, "left");
    expect(out.tightened).toBe(false);
    const back = spotBall(out.play, "middle");
    expect(back.tightened).toBe(false);
    for (const [index, player] of back.play.players.entries()) {
      expect(player.position.lateralYards).toBeCloseTo(
        stickThunderPlay.players[index]!.position.lateralYards,
        6,
      );
    }
    for (const [index, path] of back.play.paths.entries()) {
      for (const [pi, point] of path.points.entries()) {
        expect(point.lateralYards).toBeCloseTo(
          stickThunderPlay.paths[index]!.points[pi]!.lateralYards,
          6,
        );
      }
    }
  });

  it("places a loose note and takes a pinned one's leader, leaving the note to ride its line", () => {
    const pinnedTo = stickThunderPlay.paths[0]!;
    const withNotes: PlayDocument = {
      ...stickThunderPlay,
      labels: [
        {
          id: "loose",
          position: { lateralYards: 12, depthYards: 8 },
          text: "Landmark",
          color: "ink",
          size: 11,
          box: "none",
          boxColor: "yellow",
          leader: {
            endpoint: { lateralYards: 10, depthYards: 6 },
            line: "solid",
          },
        },
        {
          id: "pinned",
          position: { lateralYards: -6, depthYards: 9 },
          text: "12",
          color: "ink",
          size: 11,
          box: "none",
          boxColor: "yellow",
          binding: {
            pathId: pinnedTo.id,
            segmentIndex: 0,
            progress: 0.5,
            offset: { lateralYards: 1, depthYards: 0 },
          },
        },
      ],
    };
    // Spotted right, where the two sides scale differently, so carrying the
    // leader and placing it are two different answers.
    const { play, mapping } = spotBall(withNotes, "right");
    const noteAt = (id: string) =>
      play.labels.find((label) => label.id === id)!;
    expect(noteAt("loose").position.lateralYards).toBeCloseTo(
      mapping.at(12),
      9,
    );
    // The leader travels the distance the note did, so it keeps pointing at
    // the same thing rather than being placed on its own.
    expect(noteAt("loose").leader!.endpoint.lateralYards).toBeCloseTo(
      10 + (mapping.at(12) - 12),
      9,
    );
    expect(mapping.at(10)).not.toBeCloseTo(10 + (mapping.at(12) - 12), 6);
    // A pinned note rides its line, so its own position is left alone.
    expect(noteAt("pinned").position).toEqual({
      lateralYards: -6,
      depthYards: 9,
    });
  });

  it("takes the defense with the ball too", () => {
    const withDefender: PlayDocument = {
      ...stickThunderPlay,
      players: [
        ...stickThunderPlay.players,
        {
          id: "corner",
          unit: "defense",
          position: { lateralYards: 20, depthYards: 6 },
          symbol: "none",
          label: "C",
          sublabel: "",
          fill: "none",
          color: "ink",
        },
      ],
    };
    const { play } = spotBall(withDefender, "left");
    const corner = play.players.find(({ id }) => id === "corner")!;
    expect(corner.position.lateralYards).not.toBe(20);
  });

  it("spots the ball off the offense, not off whoever else is standing about", () => {
    // A defender parked far to one side must not drag the spot with him.
    const lopsided: PlayDocument = {
      ...stickThunderPlay,
      players: [
        ...stickThunderPlay.players,
        {
          id: "far_defender",
          unit: "defense",
          position: { lateralYards: 26, depthYards: 12 },
          symbol: "none",
          label: "C",
          sublabel: "",
          fill: "none",
          color: "ink",
        },
      ],
    };
    expect(ballSpotMapping(lopsided, 0).ballLateralYards).toBeCloseTo(
      ballSpotMapping(stickThunderPlay, 0).ballLateralYards,
      9,
    );
  });
});
