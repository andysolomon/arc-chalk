import { readFilmObservation } from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * A Film Observation arrives from an engine Chalk does not control (ADR 0066).
 * Each case is one way that engine's output could be wrong while still looking
 * like data, written down before `readFilmObservation` existed.
 */

const BALL = -8.89; // the left hash on a high-school field

function man(
  id: string,
  side: "offense" | "defense",
  lateralFromBall: number,
  depthYards: number,
) {
  return {
    id,
    side,
    alignment: { lateralYards: BALL + lateralFromBall, depthYards },
    confidence: 0.9,
  };
}

const OFFENSE = [
  man("o-c", "offense", 0, -0.6),
  man("o-lg", "offense", -1.4, -0.7),
  man("o-rg", "offense", 1.4, -0.7),
  man("o-lt", "offense", -2.8, -0.9),
  man("o-rt", "offense", 2.8, -0.9),
  man("o-qb", "offense", 0, -5),
  man("o-rb", "offense", 1.5, -5.2),
  man("o-x", "offense", -14, -1),
  man("o-h", "offense", -8, -1.2),
  man("o-y", "offense", 7, -1.1),
  man("o-z", "offense", 20, -1),
];

const DEFENSE = [
  man("d-1", "defense", -3.5, 1),
  man("d-2", "defense", -1, 1),
  man("d-3", "defense", 1, 1),
  man("d-4", "defense", 3.5, 1),
  man("d-5", "defense", -2, 4.5),
  man("d-6", "defense", 0, 4.5),
  man("d-7", "defense", 2, 4.5),
  man("d-8", "defense", -14, 7),
  man("d-9", "defense", 20, 7),
  man("d-10", "defense", -6, 12),
  man("d-11", "defense", 8, 12),
];

function observation() {
  return {
    schemaVersion: 1,
    field: "high-school",
    ballLateralYards: BALL,
    players: [...OFFENSE, ...DEFENSE].map((player) => ({
      ...player,
      alignment: { ...player.alignment },
    })),
  };
}

type Observation = ReturnType<typeof observation>;
type ObservedMan = Observation["players"][number] & {
  track?: { atMs: number; lateralYards: number; depthYards: number }[];
};

function withMan(
  source: Observation,
  id: string,
  change: (player: ObservedMan) => ObservedMan,
): Observation {
  return {
    ...source,
    players: source.players.map((player) =>
      player.id === id ? change(player) : player,
    ),
  };
}

describe("reading a Film Observation", () => {
  it("keeps real film: a centre over the ball, a jet motion before the snap, a route out of bounds", () => {
    let real = withMan(observation(), "o-c", (player) => ({
      ...player,
      // Feet read half a yard into the neutral zone: noise, not a flipped field.
      alignment: { ...player.alignment, depthYards: 0.4 },
    }));
    real = withMan(real, "o-h", (player) => ({
      ...player,
      track: [
        { atMs: -900, lateralYards: BALL - 8, depthYards: -1.2 },
        { atMs: 0, lateralYards: BALL + 2, depthYards: -1.5 },
        { atMs: 1_200, lateralYards: BALL + 9, depthYards: 1 },
      ],
    }));
    real = withMan(real, "o-x", (player) => ({
      ...player,
      // A go route that finishes two yards past the sideline.
      track: [
        { atMs: 0, lateralYards: -22.9, depthYards: -1 },
        { atMs: 3_000, lateralYards: -28.6, depthYards: 28 },
      ],
    }));

    expect(readFilmObservation(real)).toEqual({
      status: "read",
      observation: real,
    });
  });

  it("refuses an engine that reports pixels as yards", () => {
    const pixels = withMan(observation(), "d-10", (player) => ({
      ...player,
      alignment: { lateralYards: 640, depthYards: 362 },
    }));

    expect(readFilmObservation(pixels).status).toBe("invalid");
  });

  it("refuses a field read the way the camera faced rather than the way the offense attacks", () => {
    const camera = observation();
    const flipped = {
      ...camera,
      players: camera.players.map((player) => ({
        ...player,
        alignment: {
          ...player.alignment,
          depthYards: -player.alignment.depthYards,
        },
      })),
    };

    expect(readFilmObservation(flipped).status).toBe("invalid");
  });

  it("refuses a referee counted as a twelfth defender", () => {
    const withUmpire = observation();
    withUmpire.players.push(man("d-12", "defense", 0, 6));

    expect(readFilmObservation(withUmpire).status).toBe("invalid");
  });

  it("refuses two men under one id, which a draft would merge into one man", () => {
    const merged = withMan(observation(), "d-11", (player) => ({
      ...player,
      id: "d-10",
    }));

    expect(readFilmObservation(merged).status).toBe("invalid");
  });

  it("refuses a track timed in seconds rather than whole milliseconds", () => {
    const seconds = withMan(observation(), "o-z", (player) => ({
      ...player,
      track: [
        { atMs: 0, lateralYards: 11.1, depthYards: -1 },
        { atMs: 1.5, lateralYards: 11.1, depthYards: 10 },
      ],
    }));

    expect(readFilmObservation(seconds).status).toBe("invalid");
  });

  it("refuses a track that runs backward in time", () => {
    const backward = withMan(observation(), "o-z", (player) => ({
      ...player,
      track: [
        { atMs: 0, lateralYards: 11.1, depthYards: -1 },
        { atMs: 800, lateralYards: 11.1, depthYards: 6 },
        { atMs: 600, lateralYards: 9, depthYards: 10 },
      ],
    }));

    expect(readFilmObservation(backward).status).toBe("invalid");
  });

  it("refuses a confidence given as a percentage, which would pass every man as certain", () => {
    const percent = withMan(observation(), "d-6", (player) => ({
      ...player,
      confidence: 87,
    }));

    expect(readFilmObservation(percent).status).toBe("invalid");
  });

  it("refuses an engine that names what it saw instead of leaving the names to Chalk", () => {
    const namedSet = { ...observation(), formation: "Doubles Right" };
    const namedRoute = withMan(observation(), "o-z", (player) => ({
      ...player,
      route: "Curl",
    }));

    expect(readFilmObservation(namedSet).status).toBe("invalid");
    expect(readFilmObservation(namedRoute).status).toBe("invalid");
  });

  it("tells a newer engine's observation apart from a broken one, so Chalk can ask to be updated", () => {
    const newer = {
      schemaVersion: 2,
      players: "a shape this Chalk has never seen",
    };

    expect(readFilmObservation(newer)).toEqual({
      status: "newer",
      schemaVersion: 2,
    });
  });
});
