import {
  highSchoolFieldProfile,
  layoutZoneShell,
  playDocumentSchema,
  settleZoneShell,
  ZONE_COVERAGE_RADIUS_BOUNDS,
  ZONE_SEAM_YARDS,
  type CoverageArea,
  type MovementPath,
  type PlayDocument,
  type Player,
} from "@chalk/domain";
import { describe, expect, it } from "vitest";

/**
 * The zone shell's geometry in isolation (ADR 0059, ADR 0073). The
 * Coach-visible behaviour — calling, undoing, blitzing, clearing and taking
 * off a zone, two men sharing one, and a catalogue call joined by one more —
 * is `tests/e2e/zone-shell.spec.ts`. These cases are the ways the layout could
 * be wrong while still looking plausible on the field, which that journey
 * would not catch:
 *
 * - a deep call laid out by counting the deep men rather than by its name: a
 *   lone Deep 1/3 given the middle, two Middle 1/3 split into halves, mixed
 *   calls forced into equal shares;
 * - a man's side read off the middle of the field instead of off the ball, or
 *   a man straight over the ball sent to the boundary side;
 * - Deep 1/4 given a quarter other than the one nearest the man;
 * - a deep bubble wider than a zone can be sized, or past a sideline;
 * - deep drops left at their own depths, shallower than a deep drop reads, or
 *   anchored behind a man whose drop is no call;
 * - a deep drop that is no call moved by the shell;
 * - the seam between deep neighbours missing, so bubbles touch or stack;
 * - the depth radius the call gave rewritten along with the width;
 * - a call the Coach never sized left out of the shell;
 * - a bend in the last leg left behind when its bubble moves;
 * - underneath bubbles moved when they were already clear of each other;
 * - two men called to one landmark slid apart instead of sharing it, or a
 *   shared bubble laid beside a neighbour as if it were two;
 * - stacked bubbles pushed one way off each other instead of shared out;
 * - a group spilling past the sideline, or bubbles at depths that never meet
 *   spread as if they did;
 * - a spy, a man call, an alternate or an offensive line pulled into it;
 * - a bubble the Coach dragged re-laid when nobody joined or left.
 */

const WIDTH = highSchoolFieldProfile.widthYards;
const MAX_RADIUS = ZONE_COVERAGE_RADIUS_BOUNDS.lateralYards.max;

const defender = (
  id: string,
  lateralYards: number,
  depthYards: number,
  unit: Player["unit"] = "defense",
): Player => ({
  id,
  unit,
  position: { lateralYards, depthYards },
  symbol: "triangle",
  label: id.toUpperCase(),
  sublabel: "",
  fill: "none",
  color: "ink",
});

/** A drop from a man's stance to `end`, owning the area given. */
const drop = (
  id: string,
  owner: Player,
  end: { readonly lateralYards: number; readonly depthYards: number },
  area?: CoverageArea,
  extra: Partial<MovementPath> = {},
): MovementPath => ({
  id,
  kind: "zone",
  playerId: owner.id,
  points: [owner.position, end],
  branches: [],
  style: { line: "dashed", ending: "bubble", color: "blue" },
  ...(area ? { coverageArea: area } : {}),
  ...extra,
});

const deepArea: CoverageArea = {
  type: "deep",
  radiusLateralYards: 5.7,
  radiusDepthYards: 3.7,
};
const hookArea: CoverageArea = {
  type: "hook",
  radiusLateralYards: 2.8,
  radiusDepthYards: 2.25,
};

const playOf = (
  players: readonly Player[],
  paths: readonly MovementPath[],
): PlayDocument =>
  playDocumentSchema.parse({
    schemaVersion: 3,
    id: "play_zone_shell",
    playbookId: "playbook_zone_shell",
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

const bubble = (play: PlayDocument, pathId: string) => {
  const path = play.paths.find(({ id }) => id === pathId)!;
  return { center: path.points.at(-1)!, area: path.coverageArea };
};

// Two corners and a free safety, as a Cover 3 lines up.
const leftCorner = defender("lc", -20, 7);
const rightCorner = defender("rc", 20, 7);
const freeSafety = defender("fs", 2, 12);

/** A drop drawn as the quick assignment `preset`. */
const called = (
  preset: string,
  id: string,
  owner: Player,
  end: { readonly lateralYards: number; readonly depthYards: number },
  area: CoverageArea | undefined = deepArea,
): MovementPath => drop(id, owner, end, area, { preset });

const THIRD = WIDTH / 3;
/** Where the nth of `count` equal shares of the field is centred. */
const shareCentre = (index: number, count: number) =>
  -WIDTH / 2 + ((index + 0.5) * WIDTH) / count;
const shareRadius = (count: number) =>
  Math.min(MAX_RADIUS, WIDTH / count / 2 - ZONE_SEAM_YARDS / 2);

describe("the deep shell", () => {
  it("puts a lone Deep 1/3 in his own outside third, not the middle a head count gives him", () => {
    const play = layoutZoneShell(
      playOf(
        [leftCorner],
        [
          called("deep3", "l", leftCorner, {
            lateralYards: -20,
            depthYards: 16,
          }),
        ],
      ),
    );
    const { center, area } = bubble(play, "l");
    expect(center.lateralYards).toBeCloseTo(shareCentre(0, 3), 9);
    // Never shallower than a drop that reads as deep.
    expect(center.depthYards).toBeCloseTo(13, 9);
    expect(area!.radiusLateralYards).toBeCloseTo(shareRadius(3), 9);
  });

  it("lets two men called Middle 1/3 share the middle third rather than splitting the field in halves", () => {
    const strongSafety = defender("ss", 8, 10);
    const play = layoutZoneShell(
      playOf(
        [freeSafety, strongSafety],
        [
          called("mid3", "f", freeSafety, { lateralYards: 2, depthYards: 20 }),
          called("mid3", "s", strongSafety, {
            lateralYards: 8,
            depthYards: 14,
          }),
        ],
      ),
    );
    const free = bubble(play, "f");
    const strong = bubble(play, "s");
    expect(free.center.lateralYards).toBeCloseTo(0, 9);
    expect(strong.center).toEqual(free.center);
    expect(strong.area!.radiusLateralYards).toBeCloseTo(shareRadius(3), 9);
    expect(free.area!.radiusLateralYards).toBeCloseTo(shareRadius(3), 9);
  });

  it("lays a Cover 3 called man by man in thirds, at one depth behind the deepest of them", () => {
    const play = layoutZoneShell(
      playOf(
        [leftCorner, rightCorner, freeSafety],
        [
          called("deep3", "l", leftCorner, {
            lateralYards: -18,
            depthYards: 16,
          }),
          called("deep3", "r", rightCorner, {
            lateralYards: 18,
            depthYards: 16,
          }),
          called("mid3", "f", freeSafety, { lateralYards: 2, depthYards: 20 }),
        ],
      ),
    );
    expect(bubble(play, "l").center.lateralYards).toBeCloseTo(-THIRD, 9);
    expect(bubble(play, "f").center.lateralYards).toBeCloseTo(0, 9);
    expect(bubble(play, "r").center.lateralYards).toBeCloseTo(THIRD, 9);
    for (const id of ["l", "f", "r"]) {
      const { center, area } = bubble(play, id);
      // One line of coverage, four yards behind the safety's stance.
      expect(center.depthYards).toBeCloseTo(16, 9);
      // Neighbours meet at a seam and never stack.
      expect(area!.radiusLateralYards).toBeCloseTo(
        THIRD / 2 - ZONE_SEAM_YARDS / 2,
        9,
      );
      // Only the width is the shell's to say; the depth is still the call's.
      expect(area!.radiusDepthYards).toBe(deepArea.radiusDepthYards);
    }
  });

  it("draws mixed calls as called: two quarters on one side and a half on the other", () => {
    const leftSafety = defender("ls", -7, 10);
    const rightSafety = defender("rs", 7, 12);
    const play = layoutZoneShell(
      playOf(
        [leftCorner, leftSafety, rightSafety],
        [
          called("quarter", "lc", leftCorner, {
            lateralYards: -20,
            depthYards: 18,
          }),
          called("quarter", "ls", leftSafety, {
            lateralYards: -7,
            depthYards: 18,
          }),
          called("deep2", "rs", rightSafety, {
            lateralYards: 12,
            depthYards: 18,
          }),
        ],
      ),
    );
    expect(bubble(play, "lc").center.lateralYards).toBeCloseTo(
      shareCentre(0, 4),
      9,
    );
    expect(bubble(play, "ls").center.lateralYards).toBeCloseTo(
      shareCentre(1, 4),
      9,
    );
    expect(bubble(play, "rs").center.lateralYards).toBeCloseTo(
      shareCentre(1, 2),
      9,
    );
    expect(bubble(play, "lc").area!.radiusLateralYards).toBeCloseTo(
      shareRadius(4),
      9,
    );
    expect(bubble(play, "rs").area!.radiusLateralYards).toBeCloseTo(
      shareRadius(2),
      9,
    );
    for (const id of ["lc", "ls", "rs"]) {
      const { center, area } = bubble(play, id);
      expect(center.depthYards).toBeCloseTo(16, 9);
      expect(
        Math.abs(center.lateralYards) + area!.radiusLateralYards,
      ).toBeLessThan(WIDTH / 2);
    }
  });

  it("gives Deep 1/4 the quarter nearest the man: outside for a corner, inside for a safety", () => {
    const corner = defender("c", 19, 7);
    const safety = defender("s", 4, 12);
    const play = layoutZoneShell(
      playOf(
        [corner, safety],
        [
          called("quarter", "c", corner, { lateralYards: 0, depthYards: 18 }),
          called("quarter", "s", safety, { lateralYards: 0, depthYards: 18 }),
        ],
      ),
    );
    expect(bubble(play, "c").center.lateralYards).toBeCloseTo(
      shareCentre(3, 4),
      9,
    );
    expect(bubble(play, "s").center.lateralYards).toBeCloseTo(
      shareCentre(2, 4),
      9,
    );
  });

  // The ball on the left hash, where a front of two lines up on it.
  const onTheLeftHash = [defender("le", -8, 1), defender("re", -4, 1)];

  it("reads a man's side off the ball, not off the middle of the field", () => {
    // Right of the ball, though left of the field's middle.
    const safety = defender("s", -2, 12);
    const play = layoutZoneShell(
      playOf(
        [...onTheLeftHash, safety],
        [called("deep3", "s", safety, { lateralYards: -2, depthYards: 18 })],
      ),
    );
    expect(bubble(play, "s").center.lateralYards).toBeCloseTo(THIRD, 9);
  });

  it("sends a man straight over the ball to the field side, and in the middle of the field to the left", () => {
    const overTheHash = defender("h", -6, 12);
    const hashed = layoutZoneShell(
      playOf(
        [...onTheLeftHash, overTheHash],
        [
          called("deep2", "h", overTheHash, {
            lateralYards: -6,
            depthYards: 18,
          }),
        ],
      ),
    );
    expect(bubble(hashed, "h").center.lateralYards).toBeCloseTo(
      shareCentre(1, 2),
      9,
    );

    const overTheMiddle = defender("m", 0, 12);
    const middle = layoutZoneShell(
      playOf(
        [overTheMiddle],
        [
          called("deep2", "m", overTheMiddle, {
            lateralYards: 0,
            depthYards: 18,
          }),
        ],
      ),
    );
    expect(bubble(middle, "m").center.lateralYards).toBeCloseTo(
      shareCentre(0, 2),
      9,
    );
  });

  it("leaves a deep drop that is no call where it was drawn, and does not settle behind its man", () => {
    const deepMan = defender("d", -18, 20);
    const handDrawn = drop(
      "d",
      deepMan,
      { lateralYards: -18, depthYards: 26 },
      deepArea,
    );
    const before = playOf(
      [deepMan, freeSafety],
      [
        handDrawn,
        called("mid3", "f", freeSafety, { lateralYards: 2, depthYards: 20 }),
      ],
    );
    const play = layoutZoneShell(before);
    expect(play.paths.find(({ id }) => id === "d")).toBe(
      before.paths.find(({ id }) => id === "d"),
    );
    expect(bubble(play, "f").center.depthYards).toBeCloseTo(16, 9);
  });

  it("counts a call the Coach never sized, at the level where it ends", () => {
    const play = layoutZoneShell(
      playOf(
        [leftCorner],
        [
          called(
            "deep3",
            "l",
            leftCorner,
            { lateralYards: -18, depthYards: 16 },
            undefined,
          ),
        ],
      ),
    );
    expect(bubble(play, "l").area?.type).toBe("deep");
    expect(bubble(play, "l").center.lateralYards).toBeCloseTo(-THIRD, 9);
  });

  it("carries a bend in the last leg with the bubble", () => {
    const bent = called("mid3", "f", freeSafety, {
      lateralYards: 2,
      depthYards: 20,
    });
    const play = layoutZoneShell(
      playOf(
        [freeSafety],
        [
          {
            ...bent,
            points: [
              bent.points[0]!,
              {
                ...bent.points[1]!,
                control: { lateralYards: 5, depthYards: 16 },
              },
            ],
          },
        ],
      ),
    );
    // The bubble moved two yards across and four up; so did the bend.
    expect(play.paths[0]!.points[1]!.control!.lateralYards).toBeCloseTo(3, 9);
    expect(play.paths[0]!.points[1]!.control!.depthYards).toBeCloseTo(12, 9);
  });
});

describe("underneath", () => {
  const will = defender("w", -6, 4);
  const mike = defender("m", 0, 5);
  const sam = defender("s", 6, 4);

  it("leaves bubbles that are clear of each other exactly where they were called", () => {
    const before = playOf(
      [will, sam],
      [
        drop("w", will, { lateralYards: -8, depthYards: 8 }, hookArea),
        drop("s", sam, { lateralYards: 8, depthYards: 8 }, hookArea),
      ],
    );
    expect(layoutZoneShell(before)).toBe(before);
  });

  it("slides two stacked bubbles apart until they meet at a seam, around where both were called", () => {
    const play = layoutZoneShell(
      playOf(
        [will, mike],
        [
          drop("w", will, { lateralYards: -1, depthYards: 8 }, hookArea),
          drop("m", mike, { lateralYards: 1, depthYards: 8 }, hookArea),
        ],
      ),
    );
    const left = bubble(play, "w").center;
    const right = bubble(play, "m").center;
    expect(right.lateralYards - left.lateralYards).toBeCloseTo(
      2 * hookArea.radiusLateralYards + ZONE_SEAM_YARDS,
      9,
    );
    // Shared out evenly rather than one pushed off the other.
    expect(left.lateralYards + right.lateralYards).toBeCloseTo(0, 9);
    // Across only: each keeps the depth it was called to.
    expect(left.depthYards).toBe(8);
    expect(right.depthYards).toBe(8);
  });

  it("lets two men called to one landmark share its bubble instead of sliding apart", () => {
    const before = playOf(
      [will, mike],
      [
        drop("w", will, { lateralYards: 0, depthYards: 10 }, hookArea, {
          preset: "hook",
        }),
        drop("m", mike, { lateralYards: 0, depthYards: 10 }, hookArea, {
          preset: "hook",
        }),
      ],
    );
    expect(layoutZoneShell(before)).toBe(before);
  });

  it("lays a shared bubble beside a neighbour as one bubble, not two", () => {
    const play = layoutZoneShell(
      playOf(
        [will, mike, sam],
        [
          drop("w", will, { lateralYards: 0, depthYards: 10 }, hookArea, {
            preset: "hook",
          }),
          drop("m", mike, { lateralYards: 0, depthYards: 10 }, hookArea, {
            preset: "hook",
          }),
          drop("s", sam, { lateralYards: 2, depthYards: 10 }, hookArea),
        ],
      ),
    );
    const shared = bubble(play, "w").center;
    expect(bubble(play, "m").center).toEqual(shared);
    expect(
      bubble(play, "s").center.lateralYards - shared.lateralYards,
    ).toBeCloseTo(2 * hookArea.radiusLateralYards + ZONE_SEAM_YARDS, 9);
    // Shared out between where the hook and the third man were called.
    expect(
      shared.lateralYards + bubble(play, "s").center.lateralYards,
    ).toBeCloseTo(2, 9);
  });

  it("keeps a group that would spill past a sideline on the field", () => {
    const flatArea: CoverageArea = { ...hookArea, type: "flat" };
    const play = layoutZoneShell(
      playOf(
        [will, mike],
        [
          drop("w", will, { lateralYards: 25, depthYards: 6 }, flatArea),
          drop("m", mike, { lateralYards: 25, depthYards: 6 }, flatArea),
        ],
      ),
    );
    const outer = bubble(play, "m").center.lateralYards;
    expect(outer + flatArea.radiusLateralYards).toBeCloseTo(WIDTH / 2, 9);
    expect(outer - bubble(play, "w").center.lateralYards).toBeCloseTo(
      2 * flatArea.radiusLateralYards + ZONE_SEAM_YARDS,
      9,
    );
  });

  it("lets two bubbles sit one above the other when their depths never meet", () => {
    const before = playOf(
      [will, mike],
      [
        drop("w", will, { lateralYards: 0, depthYards: 5 }, hookArea),
        drop(
          "m",
          mike,
          { lateralYards: 0, depthYards: 11 },
          { ...hookArea, type: "curl" },
        ),
      ],
    );
    expect(layoutZoneShell(before)).toBe(before);
  });
});

describe("what is not part of the shell", () => {
  it("leaves a spy, a man assignment, an alternate and an offensive line alone", () => {
    const spy = defender("spy", 0, 6);
    const man = defender("man", -10, 6);
    const other = defender("alt", 1, 6);
    const receiver = defender("x", 1, -1, "offense");
    const before = playOf(
      [spy, man, other, receiver],
      [
        drop(
          "spy",
          spy,
          { lateralYards: 0, depthYards: 5 },
          { ...hookArea, type: "spy" },
        ),
        drop("man", man, { lateralYards: -10, depthYards: 20 }, undefined, {
          style: { line: "dotted", ending: "arrow", color: "blue" },
        }),
        drop("alt", other, { lateralYards: 1, depthYards: 20 }, deepArea, {
          variant: "alternate",
        }),
        drop("x", receiver, { lateralYards: 1, depthYards: 20 }, deepArea),
      ],
    );
    expect(layoutZoneShell(before)).toBe(before);
  });
});

describe("settling the shell after a change", () => {
  const mike = defender("m", 0, 5);
  const shell = playOf(
    [leftCorner, rightCorner, freeSafety, mike],
    [
      drop("l", leftCorner, { lateralYards: -18, depthYards: 16 }, deepArea),
      drop("r", rightCorner, { lateralYards: 18, depthYards: 16 }, deepArea),
      drop("m", mike, { lateralYards: 0, depthYards: 8 }, hookArea),
    ],
  );

  it("changes nothing when nobody was added to or taken from it", () => {
    const moved = {
      ...shell,
      paths: shell.paths.map((path) =>
        path.id === "l"
          ? {
              ...path,
              points: [path.points[0]!, { lateralYards: -22, depthYards: 18 }],
            }
          : path,
      ),
    };
    // A bubble the Coach dragged stays where it was dragged.
    expect(settleZoneShell(shell, moved)).toBe(moved);
  });
});
