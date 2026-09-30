import {
  highSchoolFieldProfile,
  playSideOf,
  snapSpotOf,
  tackleBoxOf,
  type MovementPath,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * The run game's reading of a Play in isolation (issue #164). The Coach's
 * journey — a power right whose pulls go right, a jet motion that leads into
 * the sweep, a break in the box that lands in a gap — is
 * `tests/e2e/run-game.spec.ts`. These are the ways the reading could be
 * wrong while the picture still looks plausible:
 *
 * - a down block read as going the way it moves, so pulls go backside;
 * - a centre's down block ignored because he stands on the ball;
 * - a down block the Coach flipped still read the preset's way;
 * - the man being given the pull deciding the side with his own old pull;
 * - a pass route by a receiver outside read as a ball-carrier's path;
 * - a play with nothing to read given a side anyway;
 * - the tight end left out of the box, so the C gap sits outside him;
 * - a split end on the line read as part of the box;
 * - a lone lineman given a box with no gaps between anybody;
 * - a route drawn after motion measured from his stance, not the motion's end.
 */

const man = (
  id: string,
  lateralYards: number,
  depthYards: number,
  label = "",
): Player => ({
  id,
  unit: "offense",
  position: { lateralYards, depthYards },
  symbol: "circle",
  label,
  sublabel: "",
  fill: "none",
  color: "ink",
});

const LINE_DEPTH = -1.5;
const line = [
  man("lt", -3.93, LINE_DEPTH),
  man("lg", -1.97, LINE_DEPTH),
  man("c", 0, LINE_DEPTH),
  man("rg", 1.97, LINE_DEPTH),
  man("rt", 3.93, LINE_DEPTH),
];

const path = (
  id: string,
  owner: Player,
  kind: MovementPath["kind"],
  to: readonly (readonly [number, number])[],
  preset?: string,
): MovementPath => ({
  id,
  kind,
  playerId: owner.id,
  points: [
    owner.position,
    ...to.map(([lateralYards, depthYards]) => ({ lateralYards, depthYards })),
  ],
  branches: [],
  style: { line: "solid", ending: "bar", color: "ink" },
  ...(preset === undefined ? {} : { preset }),
});

const play = (
  players: readonly Player[],
  paths: readonly MovementPath[] = [],
): PlayDocument =>
  ({
    fieldProfile: highSchoolFieldProfile,
    players: [...players],
    paths: [...paths],
    labels: [],
    assignments: [],
  }) as unknown as PlayDocument;

/** A down block: in toward the ball and up, the way the preset draws it. */
const down = (owner: Player, lateralYards = -1.6): MovementPath =>
  path(
    `down-${owner.id}`,
    owner,
    "block",
    [[owner.position.lateralYards + lateralYards, LINE_DEPTH + 2.2]],
    "down",
  );

describe("which way the run is going", () => {
  it("reads a power right off the down blocks, not the way they move", () => {
    const [, , c, rg, rt] = line;
    const power = play(line, [down(c!), down(rg!), down(rt!)]);
    expect(playSideOf(power)).toBe(1);
  });

  it("counts the centre's down block though he stands on the ball", () => {
    const [, , c] = line;
    expect(playSideOf(play(line, [down(c!)]))).toBe(1);
  });

  it("reads a down block the Coach flipped the way it now goes", () => {
    const [, lg, c] = line;
    // Flipped, the centre and the left guard block down to the right: the
    // play is going left.
    const flipped = play(line, [down(c!, 1.6), down(lg!, 1.6)]);
    expect(playSideOf(flipped)).toBe(-1);
  });

  it("leaves out the man being given the call", () => {
    const [, lg] = line;
    const pulled = play(line, [path("pull", lg!, "block", [[4, 1]], "wrap")]);
    expect(playSideOf(pulled)).toBe(1);
    expect(playSideOf(pulled, lg!.id)).toBeUndefined();
  });

  it("follows the back's path when the line has not been given a call", () => {
    const back = man("f", 0, -6, "F");
    expect(
      playSideOf(
        play(
          [...line, back],
          [
            path("sweep", back, "route", [
              [-8, -5],
              [-12, 4],
            ]),
          ],
        ),
      ),
    ).toBe(-1);
  });

  it("does not read a receiver's pass route as the run", () => {
    const x = man("x", -20, LINE_DEPTH + 0.3, "X");
    expect(
      playSideOf(
        play(
          [...line, x],
          [
            path("out", x, "route", [
              [-20, 8],
              [-25, 8],
            ]),
          ],
        ),
      ),
    ).toBeUndefined();
  });

  it("gives no side when there is nothing to read", () => {
    expect(playSideOf(play(line))).toBeUndefined();
  });
});

describe("the tackle box", () => {
  it("names the gaps out from the ball, with the C gap outside the tackle", () => {
    const box = tackleBoxOf(play(line))!;
    const right = box.gaps.filter(({ lateralYards }) => lateralYards > 0);
    expect(right.map(({ name }) => name)).toEqual([
      "A gap right",
      "B gap right",
      "C gap right",
    ]);
    expect(right[0]!.lateralYards).toBeCloseTo(0.985, 2);
    expect(right[1]!.lateralYards).toBeCloseTo(2.95, 2);
    expect(right[2]!.lateralYards).toBeGreaterThan(3.93);
  });

  it("takes in the tight end, so the C gap is inside him", () => {
    const y = man("y", 6.45, -1.67, "Y");
    const box = tackleBoxOf(play([...line, y]))!;
    const c = box.gaps.find(({ name }) => name === "C gap right")!;
    expect(c.lateralYards).toBeGreaterThan(3.93);
    expect(c.lateralYards).toBeLessThan(6.45);
    expect(box.gaps.some(({ name }) => name === "D gap right")).toBe(true);
    expect(box.edges.right).toBeCloseTo(6.45, 2);
  });

  it("leaves a split end on the line out of it", () => {
    const x = man("x", -20, LINE_DEPTH, "X");
    const box = tackleBoxOf(play([...line, x]))!;
    expect(box.edges.left).toBeCloseTo(-3.93, 2);
  });

  it("has no box with one man on the line", () => {
    expect(tackleBoxOf(play([line[2]!]))).toBeUndefined();
  });
});

describe("where a man is at the snap", () => {
  it("is where his motion leaves him", () => {
    const h = man("h", -12, LINE_DEPTH, "H");
    expect(
      snapSpotOf(
        play(
          [h],
          [
            path("jet", h, "motion", [
              [-6, -2],
              [-1, -2],
            ]),
          ],
        ),
        "h",
      ),
    ).toEqual({ lateralYards: -1, depthYards: -2 });
    expect(snapSpotOf(play([h]), "h")).toEqual(h.position);
  });
});
