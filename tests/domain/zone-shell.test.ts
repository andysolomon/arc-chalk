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

describe("the deep shell", () => {
  it("gives a lone deep defender the middle of the field, as wide as a zone can be", () => {
    const play = layoutZoneShell(
      playOf(
        [freeSafety],
        [drop("f", freeSafety, { lateralYards: 2, depthYards: 20 }, deepArea)],
      ),
    );
    const { center, area } = bubble(play, "f");
    expect(center.lateralYards).toBeCloseTo(0, 9);
    // Four yards behind the safety's stance.
    expect(center.depthYards).toBeCloseTo(16, 9);
    expect(area!.radiusLateralYards).toBeCloseTo(MAX_RADIUS, 9);
    // Only the width is the shell's to say; the depth is still the call's.
    expect(area!.radiusDepthYards).toBe(deepArea.radiusDepthYards);
  });

  it("splits the field in halves for two, and in thirds for three, left to right as they line up", () => {
    const halves = layoutZoneShell(
      playOf(
        [rightCorner, leftCorner],
        [
          drop(
            "r",
            rightCorner,
            { lateralYards: 18, depthYards: 16 },
            deepArea,
          ),
          drop(
            "l",
            leftCorner,
            { lateralYards: -18, depthYards: 16 },
            deepArea,
          ),
        ],
      ),
    );
    expect(bubble(halves, "l").center.lateralYards).toBeCloseTo(-WIDTH / 4, 9);
    expect(bubble(halves, "r").center.lateralYards).toBeCloseTo(WIDTH / 4, 9);

    const thirds = layoutZoneShell(
      playOf(
        [leftCorner, rightCorner, freeSafety],
        [
          drop(
            "l",
            leftCorner,
            { lateralYards: -18, depthYards: 16 },
            deepArea,
          ),
          drop(
            "r",
            rightCorner,
            { lateralYards: 18, depthYards: 16 },
            deepArea,
          ),
          drop("f", freeSafety, { lateralYards: 2, depthYards: 20 }, deepArea),
        ],
      ),
    );
    const third = WIDTH / 3;
    expect(bubble(thirds, "l").center.lateralYards).toBeCloseTo(-third, 9);
    expect(bubble(thirds, "f").center.lateralYards).toBeCloseTo(0, 9);
    expect(bubble(thirds, "r").center.lateralYards).toBeCloseTo(third, 9);
    for (const id of ["l", "f", "r"]) {
      const { center, area } = bubble(thirds, id);
      // One line of coverage, anchored behind the deepest of them.
      expect(center.depthYards).toBeCloseTo(16, 9);
      // Neighbours meet at a seam and never stack.
      expect(area!.radiusLateralYards).toBeCloseTo(
        third / 2 - ZONE_SEAM_YARDS / 2,
        9,
      );
    }
  });

  it("splits it in quarters for four, every bubble inside the sidelines", () => {
    const men = [-20, -7, 7, 20].map((x, index) => defender(`d${index}`, x, 8));
    const play = layoutZoneShell(
      playOf(
        men,
        men.map((man, index) =>
          drop(`q${index}`, man, { lateralYards: 0, depthYards: 18 }, deepArea),
        ),
      ),
    );
    const quarter = WIDTH / 4;
    men.forEach((_, index) => {
      const { center, area } = bubble(play, `q${index}`);
      expect(center.lateralYards).toBeCloseTo(
        -WIDTH / 2 + (index + 0.5) * quarter,
        9,
      );
      expect(
        Math.abs(center.lateralYards) + area!.radiusLateralYards,
      ).toBeLessThan(WIDTH / 2);
      // Never shallower than a drop that reads as deep.
      expect(center.depthYards).toBeCloseTo(13, 9);
    });
  });

  it("counts a drop the Coach never sized, at the level where it ends", () => {
    const play = layoutZoneShell(
      playOf(
        [leftCorner, rightCorner],
        [
          drop("l", leftCorner, { lateralYards: -18, depthYards: 16 }),
          drop(
            "r",
            rightCorner,
            { lateralYards: 18, depthYards: 16 },
            deepArea,
          ),
        ],
      ),
    );
    expect(bubble(play, "l").area?.type).toBe("deep");
    expect(bubble(play, "l").center.lateralYards).toBeCloseTo(-WIDTH / 4, 9);
  });

  it("carries a bend in the last leg with the bubble", () => {
    const bent = drop(
      "f",
      freeSafety,
      { lateralYards: 2, depthYards: 20 },
      deepArea,
    );
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

  it("re-lays only the level that gained or lost a drop", () => {
    const withSafety = {
      ...shell,
      paths: [
        ...shell.paths,
        drop("f", freeSafety, { lateralYards: 2, depthYards: 20 }, deepArea),
      ],
    };
    const settled = settleZoneShell(shell, withSafety);
    // The corners give up the middle third to the safety.
    expect(bubble(settled, "l").center.lateralYards).toBeCloseTo(-WIDTH / 3, 9);
    expect(bubble(settled, "f").center.lateralYards).toBeCloseTo(0, 9);
    // The hook underneath is untouched.
    expect(settled.paths.find(({ id }) => id === "m")).toBe(
      withSafety.paths.find(({ id }) => id === "m"),
    );

    // And when the safety leaves, the corners take the halves back.
    const without = {
      ...settled,
      paths: settled.paths.filter(({ id }) => id !== "f"),
    };
    const halves = settleZoneShell(settled, without);
    expect(bubble(halves, "l").center.lateralYards).toBeCloseTo(-WIDTH / 4, 9);
    expect(bubble(halves, "r").center.lateralYards).toBeCloseTo(WIDTH / 4, 9);
  });
});
