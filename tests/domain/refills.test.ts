import {
  highSchoolFieldProfile,
  layoutZoneShell,
  playDocumentSchema,
  refillPlanOf,
  settleRefills,
  type MovementPath,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * Refilling the zone a man leaves (ADR 0075, issue #190), in isolation. What a
 * Coach sees — Fire dropping the front into the zones the backers left, the
 * strong safety's own call dropping the end into his curl/flat, a corner's
 * blitz rotating the safety, a call taken off putting everyone back — is
 * `tests/e2e/linebacker-calls.spec.ts`. These are the ways refilling could go
 * wrong where that journey would not notice:
 *
 * - two men the same distance from an open zone: which one fills it depends
 *   on the order the men happen to be stored in, so a saved and reloaded Play,
 *   or one whose men were re-sorted, drops a different man;
 * - settling a Play that is already settled moves a filler, so an edit that
 *   changes nobody's call — a receiver dragged — swaps who drops;
 * - a defensive back rotated across the field to a deep third is laid by the
 *   deep shell on his own side of the ball, not in the third he took over.
 */

const man = (
  id: string,
  label: string,
  lateralYards: number,
  depthYards: number,
  unit: Player["unit"] = "defense",
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

const playOf = (
  players: readonly Player[],
  paths: readonly MovementPath[] = [],
  coverage = "cover3",
): PlayDocument =>
  playDocumentSchema.parse({
    schemaVersion: 3,
    id: "play_refills",
    playbookId: "playbook_refills",
    name: "Under test",
    unit: "defense",
    tags: [],
    notes: "",
    fieldProfile: highSchoolFieldProfile,
    unitCalls: { coverage },
    players,
    assignments: [],
    paths,
    labels: [],
  });

/** A line of the man's own, given by a quick assignment: a blitz up the field. */
const ownBlitz = (owner: Player): MovementPath => ({
  id: `${owner.id}_blitz`,
  kind: "blitz",
  playerId: owner.id,
  points: [owner.position, { ...owner.position, depthYards: -2 }],
  branches: [],
  style: { line: "solid", ending: "arrow", color: "blue" },
  preset: "agap",
});

/** The line the coverage gave a man: his job, drawn as the coverage's. */
const covering = (owner: Player, preset: string): MovementPath => ({
  id: `${owner.id}_${preset}`,
  kind: "zone",
  playerId: owner.id,
  points: [
    owner.position,
    { lateralYards: owner.position.lateralYards, depthYards: 10 },
  ],
  branches: [],
  style: { line: "dashed", ending: "bubble", color: "blue" },
  preset,
  unitCall: "coverage",
});

// Three backers and two tackles: the Mike's hook is over the ball, and the
// two tackles stand the same distance either side of it. The Will and the
// Sam are in the curl/flats the coverage gave them; the Mike is sent.
const will = man("will", "W", -4.6, 4.5);
const mike = man("mike", "M", 0, 4.8);
const sam = man("sam", "S", 4.6, 4.5);
const leftTackle = man("lt", "T", -2.6, 1.2);
const rightTackle = man("rt", "T", 2.6, 1.2);

describe("refilling the zone a man leaves", () => {
  it("drops the same man into a zone two are the same distance from, whatever order they are stored in", () => {
    const men = [will, mike, sam, leftTackle, rightTackle];
    const sent = [
      ownBlitz(mike),
      covering(will, "curlflat"),
      covering(sam, "curlflat"),
    ];
    const stored = refillPlanOf(playOf(men, sent));
    const resorted = refillPlanOf(playOf([...men].reverse(), sent));
    expect(stored.fills.get("mike")).toBeDefined();
    expect(resorted.fills.get("mike")).toBe(stored.fills.get("mike"));
    // The tie goes to the man on the left as the diagram is drawn.
    expect(stored.fills.get("mike")).toBe("lt");
  });

  it("leaves a settled Play exactly as it is when it is settled again", () => {
    const receiver = man("x", "X", -18, -1, "offense");
    const before = playOf(
      [will, mike, sam, leftTackle, rightTackle, receiver],
      [ownBlitz(mike), covering(will, "curlflat"), covering(sam, "curlflat")],
    );
    const settled = settleRefills(undefined, before);
    expect(settled).not.toBe(before);
    expect(settleRefills(undefined, settled)).toEqual(settled);
    // A receiver dragged changes nobody's call, so nobody is refilled.
    const dragged: PlayDocument = {
      ...settled,
      players: settled.players.map((player) =>
        player.id === "x"
          ? { ...player, position: { lateralYards: -15, depthYards: -1 } }
          : player,
      ),
    };
    expect(settleRefills(settled, dragged)).toBe(dragged);
  });
});

describe("a defensive back rotated to a deep zone", () => {
  it("is laid in the third he took over, not the one on his side of the ball", () => {
    const leftCorner = man("lc", "C", -19.7, 6);
    const strongSafety = man("ss", "$", 11, 7);
    const rotated: MovementPath = {
      id: "ss_rotated",
      kind: "zone",
      playerId: "ss",
      points: [strongSafety.position, { lateralYards: 11, depthYards: 16 }],
      branches: [],
      style: { line: "dashed", ending: "bubble", color: "blue" },
      coverageArea: {
        type: "deep",
        radiusLateralYards: 5.5,
        radiusDepthYards: 2.3,
      },
      preset: "deep3",
      unitCall: "coverage",
      fills: "lc",
    };
    const play = layoutZoneShell(playOf([leftCorner, strongSafety], [rotated]));
    const third = highSchoolFieldProfile.widthYards / 3;
    expect(play.paths[0]!.points.at(-1)!.lateralYards).toBeCloseTo(-third, 9);
  });
});
