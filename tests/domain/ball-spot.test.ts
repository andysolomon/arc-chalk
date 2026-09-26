import {
  applyPlayCommand,
  ballSpotMapping,
  diffPlayDocuments,
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
});

describe("moving the ball, and the Play with it", () => {
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

  it("carries a line past the paint as a shape, and the applied command holds it on the paint", () => {
    const half = stickThunderPlay.fieldProfile.widthYards / 2;
    const { play } = spotBall(stickThunderPlay, "left");
    const outOfBounds = play.paths.flatMap((path) =>
      path.points.filter((point) => point.lateralYards < -half),
    );
    // The X's route already reaches the boundary; taken to the left hash it
    // runs past the paint. The move itself keeps the shape, so a round trip
    // loses nothing — but nothing the Coach sees ever bleeds over a sideline,
    // so the Play the command lands as is held on the paint.
    expect(outOfBounds.length).toBeGreaterThan(0);

    const command = diffPlayDocuments(stickThunderPlay, play, "left");
    const landed = applyPlayCommand(stickThunderPlay, command);
    for (const path of landed.paths) {
      for (const point of [
        ...path.points,
        ...path.branches.flatMap((branch) => branch.points),
      ]) {
        expect(point.lateralYards).toBeGreaterThanOrEqual(-half);
        expect(point.lateralYards).toBeLessThanOrEqual(half);
        if (point.control) {
          expect(point.control.lateralYards).toBeGreaterThanOrEqual(-half);
          expect(point.control.lateralYards).toBeLessThanOrEqual(half);
        }
      }
    }
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
});
