import {
  defensiveFieldOf,
  defensivePresetsFor,
  highSchoolFieldProfile,
  linePresetByKey,
  playDocumentSchema,
  twistPartnerOf,
  type Coordinate,
  type PathPoint,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * Where a defender's quick assignment lands, in isolation (issue #165). The
 * Coach's journey — a call put on, a safety rolled down to curl/flat, a
 * backer sent through a gap, a twist on the end — is
 * `tests/e2e/defensive-landmarks.spec.ts`. These cases are the ways the
 * geometry could be wrong while the drawing still looks plausible, which a
 * screenshot of one front and one coverage would not catch:
 *
 * - an underneath drop left at the defender's own depth, so a safety's
 *   curl/flat sits in the deep third;
 * - a drop landing on the wrong side of the ball, or past the sideline when
 *   the ball is on the hash;
 * - a hook called on a man split wide left out on the numbers;
 * - a spy drawn at the defender's depth rather than over the quarterback, or
 *   nowhere when there is no quarterback on the field;
 * - a blitz that stops short of the line of scrimmage, or goes through the
 *   gap on the other side of the ball;
 * - gaps read off a centred line when the offense is on the hash;
 * - a tight end ignored, so the C and D gaps are where they would be
 *   without one;
 * - a lineman's own gap read outside him when he is head up;
 * - a contain rush that never gets outside the tackle, or never turns in;
 * - a twist drawn on one man without his partner, or the two crossing the
 *   wrong way;
 * - front calls offered to a corner pressed at the line.
 */

const WIDTH = highSchoolFieldProfile.widthYards;

const man = (
  id: string,
  unit: Player["unit"],
  label: string,
  lateralYards: number,
  depthYards: number,
): Player => ({
  id,
  unit,
  position: { lateralYards, depthYards },
  symbol: unit === "defense" ? "triangle" : "circle",
  label,
  sublabel: "",
  fill: "none",
  color: "ink",
});

/** Five linemen two yards apart, a yard and a half off the ball. */
const lineAt = (ball: number): Player[] =>
  (["LT", "LG", "C", "RG", "RT"] as const).map((label, index) =>
    man(`o_${label}`, "offense", label, ball + (index - 2) * 2, -1.5),
  );

const playOf = (players: readonly Player[]): PlayDocument =>
  playDocumentSchema.parse({
    schemaVersion: 3,
    id: "play_defensive_field",
    playbookId: "playbook_defensive_field",
    name: "Under test",
    unit: "defense",
    tags: [],
    notes: "",
    fieldProfile: highSchoolFieldProfile,
    players,
    assignments: [],
    paths: [],
    labels: [],
  });

/** Where a call ends when this man is given it on this field. */
function drawn(play: PlayDocument, key: string, playerId: string) {
  const player = play.players.find(({ id }) => id === playerId)!;
  const points = linePresetByKey(key)!.pointsFrom(
    player.position,
    defensiveFieldOf(play),
  );
  return { points, end: points.at(-1)! };
}

/** Where a drawn line crosses the line of scrimmage, across the field. */
function crossing(points: readonly PathPoint[]): number | undefined {
  for (let index = 1; index < points.length; index += 1) {
    const from: Coordinate = points[index - 1]!;
    const to: Coordinate = points[index]!;
    if (from.depthYards >= 0 && to.depthYards <= 0) {
      if (from.depthYards === to.depthYards) return to.lateralYards;
      const along = from.depthYards / (from.depthYards - to.depthYards);
      return from.lateralYards + along * (to.lateralYards - from.lateralYards);
    }
  }
  return undefined;
}

const quarterback = man("o_q", "offense", "Q", 0, -5);

describe("zone drops land at their landmark", () => {
  it("brings a safety standing 18 yards deep down to curl/flat depth", () => {
    const play = playOf([
      ...lineAt(0),
      quarterback,
      man("s", "defense", "S", 11, 18),
    ]);
    const { end } = drawn(play, "curlflat", "s");
    expect(end.depthYards).toBeGreaterThanOrEqual(9);
    expect(end.depthYards).toBeLessThanOrEqual(12);
    // Out between the hash and the numbers on his own side.
    expect(end.lateralYards).toBeGreaterThan(8);
    expect(end.lateralYards).toBeLessThan(WIDTH / 2 - 4);
  });

  it("lands a curl/flat on the left for a man on the left", () => {
    const play = playOf([
      ...lineAt(0),
      quarterback,
      man("w", "defense", "W", -4, 7),
    ]);
    expect(drawn(play, "curlflat", "w").end.lateralYards).toBeLessThan(-8);
  });

  it("keeps a curl/flat to the boundary inside the sideline with the ball on the hash", () => {
    const ball = -(WIDTH / 2 - highSchoolFieldProfile.hashInsetYards);
    const play = playOf([
      ...lineAt(ball),
      { ...quarterback, position: { lateralYards: ball, depthYards: -5 } },
      man("c", "defense", "C", ball - 8, 5),
    ]);
    const { end } = drawn(play, "curlflat", "c");
    const area = linePresetByKey("curlflat")!.area!;
    expect(end.lateralYards - area.radiusLateralYards).toBeGreaterThanOrEqual(
      -WIDTH / 2,
    );
    expect(end.lateralYards).toBeLessThan(ball);
  });

  it("pulls a hook called on a man split out wide back inside to the box", () => {
    const play = playOf([
      ...lineAt(0),
      quarterback,
      man("n", "defense", "N", 14, 5),
    ]);
    const { end } = drawn(play, "hook", "n");
    expect(end.lateralYards).toBeGreaterThan(0);
    expect(end.lateralYards).toBeLessThanOrEqual(6);
    expect(end.depthYards).toBeGreaterThanOrEqual(8);
    expect(end.depthYards).toBeLessThanOrEqual(12);
  });

  it("puts a spy five to seven yards off the ball over the quarterback, not at the spy's own depth", () => {
    const play = playOf([
      ...lineAt(3),
      { ...quarterback, position: { lateralYards: 3, depthYards: -5 } },
      man("f", "defense", "F", -6, 20),
    ]);
    const { end } = drawn(play, "spy", "f");
    expect(end.lateralYards).toBeCloseTo(3, 6);
    expect(end.depthYards).toBeGreaterThanOrEqual(5);
    expect(end.depthYards).toBeLessThanOrEqual(7);
  });

  it("puts a spy over the ball when there is no offense on the field", () => {
    const play = playOf([
      man("e", "defense", "E", -4, 2),
      man("t", "defense", "T", 4, 2),
      man("f", "defense", "F", -6, 20),
    ]);
    const { end } = drawn(play, "spy", "f");
    expect(end.lateralYards).toBeCloseTo(0, 6);
    expect(end.depthYards).toBeLessThanOrEqual(7);
  });
});

describe("pressure goes through a named gap to the line of scrimmage", () => {
  it("sends an A-gap blitz past the line between the center and the guard on his side", () => {
    const play = playOf([
      ...lineAt(0),
      quarterback,
      man("m", "defense", "M", 1, 7),
    ]);
    const { points, end } = drawn(play, "agap", "m");
    expect(end.depthYards).toBeLessThan(0);
    const at = crossing(points)!;
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(2);
  });

  it("goes through the gap on the other side when the man is on the other side", () => {
    const play = playOf([
      ...lineAt(0),
      quarterback,
      man("w", "defense", "W", -3, 7),
    ]);
    const at = crossing(drawn(play, "bgap", "w").points)!;
    expect(at).toBeLessThan(-2);
    expect(at).toBeGreaterThan(-4);
  });

  it("reads the gaps off the offense where it stands, on the hash", () => {
    const play = playOf([
      ...lineAt(-10),
      { ...quarterback, position: { lateralYards: -10, depthYards: -5 } },
      man("s", "defense", "S", -7, 7),
    ]);
    const at = crossing(drawn(play, "bgap", "s").points)!;
    expect(at).toBeGreaterThan(-10 + 2);
    expect(at).toBeLessThan(-10 + 4);
  });

  it("puts the C gap between tackle and tight end, and the D gap outside him", () => {
    const play = playOf([
      ...lineAt(0),
      quarterback,
      man("o_y", "offense", "Y", 6, -1.5),
      man("e", "defense", "E", 7, 2),
      man("le", "defense", "E", -7, 2),
    ]);
    const cRight = crossing(drawn(play, "cgap", "e").points)!;
    expect(cRight).toBeGreaterThan(4);
    expect(cRight).toBeLessThan(6);
    const dRight = crossing(drawn(play, "dgap", "e").points)!;
    expect(dRight).toBeGreaterThan(6);
    // No tight end on the left: C is just outside the tackle.
    const cLeft = crossing(drawn(play, "cgap", "le").points)!;
    expect(cLeft).toBeLessThan(-4);
    expect(cLeft).toBeGreaterThan(-6);
  });
});

describe("the front's own calls", () => {
  const front = () =>
    playOf([
      ...lineAt(0),
      quarterback,
      man("le", "defense", "E", -5.9, 2.2),
      man("lt", "defense", "T", -2.6, 2.2),
      man("rt", "defense", "T", 2.6, 2.2),
      man("re", "defense", "E", 5.9, 2.2),
      man("m", "defense", "M", 0, 7.5),
      man("c", "defense", "C", 19, 1),
    ]);

  it("rushes a 3 technique through the B gap, and an end split between C and D through C", () => {
    const play = front();
    const tackle = crossing(drawn(play, "rush", "rt").points)!;
    expect(tackle).toBeGreaterThan(2);
    expect(tackle).toBeLessThan(4);
    const end = crossing(drawn(play, "rush", "re").points)!;
    expect(end).toBeGreaterThan(4);
    expect(end).toBeLessThan(6);
  });

  it("takes a contain rush outside the tackle and turns it back in at the quarterback", () => {
    const play = front();
    const { points, end } = drawn(play, "contain", "le");
    const widest = Math.min(...points.map(({ lateralYards }) => lateralYards));
    expect(widest).toBeLessThan(-5);
    expect(end.lateralYards).toBeGreaterThan(widest);
    expect(end.depthYards).toBeLessThan(-2);
  });

  it("gives a tackle's twist to his end too, and crosses them the right way", () => {
    const play = front();
    expect(twistPartnerOf(play, "rt")?.id).toBe("re");
    expect(twistPartnerOf(play, "re")?.id).toBe("rt");
    // T-E: the tackle goes first, outside into the end's gap; the end loops
    // inside into the tackle's.
    const tackle = crossing(drawn(play, "tetwist", "rt").points)!;
    const end = crossing(drawn(play, "tetwist", "re").points)!;
    expect(tackle).toBeGreaterThan(end);
    expect(end).toBeGreaterThan(2);
    expect(end).toBeLessThan(4);
    // E-T: the end crashes inside, the tackle loops outside.
    const crash = crossing(drawn(play, "ettwist", "re").points)!;
    const loop = crossing(drawn(play, "ettwist", "rt").points)!;
    expect(loop).toBeGreaterThan(crash);
  });

  it("offers front calls to the men on the line, not to a corner pressed at it or a backer", () => {
    const play = front();
    const keys = (id: string) =>
      defensivePresetsFor(
        play,
        play.players.find((player) => player.id === id)!,
      ).map(({ key }) => key);
    expect(keys("re")).toContain("contain");
    expect(keys("re")).toContain("tetwist");
    expect(keys("c")).not.toContain("contain");
    expect(keys("m")).not.toContain("rush");
    // Everyone can still be sent through a gap or dropped into a zone.
    for (const id of ["re", "m", "c"]) {
      expect(keys(id)).toContain("agap");
      expect(keys(id)).toContain("curlflat");
    }
  });
});
