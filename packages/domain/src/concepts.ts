import { isLineman } from "./classifications";
import { stockFormations } from "./formation-catalogue";
import { assignRoles } from "./formations";
import { routePresetPoints } from "./route-catalogue";
import type { Coordinate, PathPoint, Player } from "./schema";

/**
 * The pass concepts, drawn by where the men stand rather than by the letters
 * on them (issue #162).
 *
 * A concept is a distribution: it says what the #1, #2 and #3 receivers on
 * each side do, counted in from the sideline, and what the backs do. Reading
 * those off the alignment is what lets one concept work from a 2×2, a 3×1, a
 * bunch and a two-tight-end set alike. Handing jobs out by letter drew two
 * shallows from the same side in Doubles, and two digs head-on in Ace.
 *
 * Depths here are yards off the line of scrimmage, not off the man. A
 * concept's levels are field depths — the shallow at five, the dig at twelve
 * — and a man who lines up off the ball still runs to them.
 */

type Sign = 1 | -1;

/** Anyone a concept can be drawn on. */
export type ConceptMan = Pick<Player, "id" | "label" | "position" | "role">;

export interface ConceptJob {
  readonly playerId: string;
  /** What the man is told, in the words the card prints. */
  readonly assignment: string;
  /** The call off the route tree, where the line is exactly one. */
  readonly preset?: string;
  readonly ending: "arrow" | "hook";
  readonly points: readonly PathPoint[];
}

export interface ConceptDefinition {
  readonly key: string;
  readonly name: string;
  readonly hint: string;
  /**
   * Every word this concept can put on a route, so a name it wrote can be
   * told apart from one the Coach typed (ADR 0064).
   */
  readonly assignments: readonly string[];
  /**
   * Every man's job in this concept, drawn from where he stands. The men are
   * the offense's eligible ones — the line is left out by the caller — and
   * the quarterback is given nothing.
   */
  jobsFor(
    men: readonly ConceptMan[],
    ballLateralYards: number,
  ): readonly ConceptJob[];
}

/** One side of the formation, its receivers counted in from the sideline. */
interface Side {
  readonly sign: Sign;
  readonly men: readonly ConceptMan[];
}

/** The formation as a concept reads it. */
export interface ConceptAlignment {
  readonly ball: number;
  readonly strong: Side;
  readonly weak: Side;
  /** Nearest the ball first. */
  readonly backs: readonly ConceptMan[];
}

/**
 * A back stands in the backfield inside the tackle box. A man off the ball
 * but split wide — the point of a bunch — is still a receiver.
 */
const BACK_DEPTH_YARDS = -3.5;
const BACK_WIDTH_YARDS = 5.5;

/** How deep a vertical is drawn: most of the way up the view. */
const DEEP_YARDS = 25;
/** How far apart two verticals on one side run, and how near the ball. */
const LANE_SPACING_YARDS = 5;
const SEAM_MIN_YARDS = 2.5;
const LANE_MAX_YARDS = 22;
/** The widest a flat is carried, inside the paint. */
const FLAT_MAX_YARDS = 24;

const lateral = (man: ConceptMan) => man.position.lateralYards;
const at = (lateralYards: number, depthYards: number): Coordinate => ({
  lateralYards,
  depthYards,
});

/**
 * Who is where. The quarterback is whoever the letters say he is; everyone
 * else is a back or a receiver by alignment alone. Strength goes to the side
 * with more receivers, then to the Y, then to any tight end, then to the side
 * the back is offset to, and finally to the right.
 */
export function readConceptAlignment(
  men: readonly ConceptMan[],
  ball: number,
): ConceptAlignment {
  const roles = assignRoles(men);
  const roleOf = new Map(men.map((man, index) => [man, roles[index]]));
  const skill = men.filter((man) => roleOf.get(man) !== "QB");
  const off = (man: ConceptMan) => lateral(man) - ball;
  const isBack = (man: ConceptMan) =>
    man.position.depthYards <= BACK_DEPTH_YARDS &&
    Math.abs(off(man)) <= BACK_WIDTH_YARDS;

  const backs = skill
    .filter(isBack)
    .sort(
      (left, right) =>
        Math.hypot(off(left), left.position.depthYards) -
        Math.hypot(off(right), right.position.depthYards),
    );
  const receivers = skill.filter((man) => !isBack(man));
  // Outside in; of two men stacked at one split, the one on the ball is #1.
  const outsideIn = (list: readonly ConceptMan[]) =>
    [...list].sort(
      (left, right) =>
        Math.abs(off(right)) - Math.abs(off(left)) ||
        right.position.depthYards - left.position.depthYards,
    );
  const left = outsideIn(receivers.filter((man) => off(man) < 0));
  const right = outsideIn(receivers.filter((man) => off(man) >= 0));

  const sideOf = (man: ConceptMan | undefined): Sign | undefined =>
    man === undefined ? undefined : off(man) < 0 ? -1 : 1;
  const strongSign: Sign =
    left.length !== right.length
      ? left.length > right.length
        ? -1
        : 1
      : (sideOf(
          receivers.find((man) => man.label.trim().toUpperCase() === "Y"),
        ) ??
        sideOf(receivers.find((man) => roleOf.get(man) === "TE")) ??
        sideOf(backs.find((man) => Math.abs(off(man)) > 1)) ??
        1);

  const bySign = (sign: Sign): Side => ({
    sign,
    men: sign < 0 ? left : right,
  });
  return {
    ball,
    strong: bySign(strongSign),
    weak: bySign(strongSign === 1 ? -1 : 1),
    backs,
  };
}

type Drawn = Omit<ConceptJob, "playerId" | "ending"> & {
  readonly ending?: ConceptJob["ending"];
};

/** A call off the route tree, run toward his own side's sideline. */
function tree(
  man: ConceptMan,
  key: string,
  outward: Sign,
  assignment: string,
): Drawn {
  return {
    assignment,
    preset: key,
    points: routePresetPoints(key, man.position, { outward })!,
  };
}

/** Straight up his lane, releasing to it first if he is not already on it. */
function vertical(man: ConceptMan, lane: number, assignment: string): Drawn {
  const { lateralYards, depthYards } = man.position;
  const release =
    Math.abs(lane - lateralYards) > 0.5
      ? [at(lane, Math.max(depthYards, 0) + 4)]
      : [];
  return {
    assignment,
    points: [man.position, ...release, at(lane, DEEP_YARDS)],
  };
}

/**
 * The lanes a side's verticals run, outside in: each at least a lane's width
 * inside the one outside it, so a bunch spreads out rather than running up
 * the field on top of itself.
 */
function lanes(
  a: ConceptAlignment,
  side: Side,
  runners: readonly ConceptMan[],
  outsideOf = Infinity,
): number[] {
  let limit = outsideOf;
  return runners.map((man) => {
    const split = Math.max(
      SEAM_MIN_YARDS,
      Math.min(Math.abs(lateral(man) - a.ball), LANE_MAX_YARDS, limit),
    );
    limit = split - LANE_SPACING_YARDS;
    return a.ball + side.sign * split;
  });
}

/** A stem to a depth off the ball, then across at it. */
function across(
  man: ConceptMan,
  depth: number,
  endLateral: number,
  assignment: string,
): Drawn {
  return {
    assignment,
    points: [man.position, at(lateral(man), depth), at(endLateral, depth)],
  };
}

/** Angled in to his depth within a few yards, then flat across the field. */
function shallow(
  man: ConceptMan,
  side: Side,
  depth: number,
  endLateral: number,
  assignment: string,
): Drawn {
  return {
    assignment,
    points: [
      man.position,
      at(lateral(man) - side.sign * 3, depth),
      at(endLateral, depth),
    ],
  };
}

/** How far a man is from the next receiver outside him on his side. */
function roomOutside(a: ConceptAlignment, side: Side, index: number): number {
  const outer = side.men[index - 1];
  if (!outer) return Infinity;
  return (
    Math.abs(lateral(outer) - a.ball) -
    Math.abs(lateral(side.men[index]!) - a.ball)
  );
}

/**
 * Up to six and sit. He settles away from the man outside him when there is
 * room to, and inside when there is not, so he never sits on that man's stem.
 */
function stick(
  a: ConceptAlignment,
  side: Side,
  index: number,
  assignment = "STICK",
): Drawn {
  const man = side.men[index]!;
  const turn = roomOutside(a, side, index) >= 4 ? side.sign : -side.sign;
  return {
    assignment,
    ending: "hook",
    points: [
      man.position,
      at(lateral(man), 6),
      at(lateral(man) + turn * 1.5, 5.5),
    ],
  };
}

/**
 * A receiver to the flat: into the gap outside him when there is one wide
 * enough, and otherwise under everyone and out past the widest man.
 */
function receiverFlat(a: ConceptAlignment, side: Side, index: number): Drawn {
  const man = side.men[index]!;
  const room = roomOutside(a, side, index);
  const split = Math.abs(lateral(man) - a.ball);
  const reach =
    room >= LANE_SPACING_YARDS
      ? split + Math.min(6, room - 2.5)
      : Math.min(
          Math.abs(lateral(side.men[0]!) - a.ball) + 3.5,
          FLAT_MAX_YARDS,
        );
  return {
    assignment: "FLAT",
    points: [
      man.position,
      at(
        lateral(man) + side.sign * 1.5,
        Math.max(man.position.depthYards, 0) + 1,
      ),
      at(a.ball + side.sign * reach, 2),
    ],
  };
}

type Give = (man: ConceptMan | undefined, drawn: Drawn) => void;

interface Recipe {
  readonly key: string;
  readonly name: string;
  readonly hint: string;
  readonly draw: (a: ConceptAlignment, give: Give) => void;
  /** What the first back runs, and which way, when it is not a check. */
  readonly back?: (
    a: ConceptAlignment,
  ) => { readonly assignment: string; readonly toward?: Sign } | undefined;
}

/** The flat to the strong side, when there is no #3 there to run it. */
const strongFlatUnlessThree = (a: ConceptAlignment) =>
  a.strong.men.length < 3
    ? { assignment: "FLAT", toward: a.strong.sign }
    : undefined;

const recipes: readonly Recipe[] = [
  {
    key: "mesh",
    name: "Mesh",
    hint: "shallows cross from each side, corners outside, back to the flat",
    draw(a, give) {
      const { strong, weak } = a;
      const over = strong.men.at(-1);
      const under = weak.men.at(-1);
      if (over && under) {
        // They meet halfway between them, one at six and a half and one at
        // five, and each carries on out to where the other lined up — so the
        // one underneath runs under the other's stem as well as past him.
        const meet = (lateral(over) + lateral(under)) / 2;
        const carry = (other: ConceptMan) =>
          Math.min(15, Math.max(7, Math.abs(lateral(other) - meet)));
        give(
          over,
          shallow(
            over,
            strong,
            6.5,
            meet + weak.sign * carry(under),
            "SHALLOW",
          ),
        );
        give(
          under,
          shallow(under, weak, 5, meet + strong.sign * carry(over), "SHALLOW"),
        );
      } else if (over) {
        give(over, shallow(over, strong, 5, a.ball + weak.sign * 7, "SHALLOW"));
      }
      for (const side of [strong, weak]) {
        for (const [index, man] of side.men.entries()) {
          if (man === side.men.at(-1)) continue;
          give(
            man,
            index === 0
              ? tree(man, "corner", side.sign, "CORNER")
              : across(man, 11, lateral(man) - side.sign * 8, "DIG"),
          );
        }
      }
    },
    back: () => ({ assignment: "FLAT" }),
  },
  {
    key: "stick",
    name: "Stick",
    hint: "fade, stick and flat to the strong side; hitch and slant away",
    draw(a, give) {
      const { strong, weak } = a;
      const [one, two, three] = strong.men;
      if (one) give(one, vertical(one, lanes(a, strong, [one])[0]!, "FADE"));
      if (two) give(two, stick(a, strong, 1));
      if (three) give(three, receiverFlat(a, strong, 2));
      const [away, awayTwo] = weak.men;
      if (away) give(away, tree(away, "hitch", weak.sign, "HITCH"));
      if (awayTwo) give(awayTwo, tree(awayTwo, "slant", weak.sign, "SLANT"));
    },
    back: strongFlatUnlessThree,
  },
  {
    key: "smash",
    name: "Smash",
    hint: "hitch under, corner over the top — high / low on the corner",
    draw(a, give) {
      for (const side of [a.strong, a.weak]) {
        const [one, two, three] = side.men;
        if (one) give(one, tree(one, "hitch", side.sign, "HITCH"));
        if (two) give(two, tree(two, "corner", side.sign, "CORNER"));
        if (two && three) {
          const lane = lanes(
            a,
            side,
            [three],
            Math.abs(lateral(two) - a.ball) - LANE_SPACING_YARDS,
          )[0]!;
          give(three, vertical(three, lane, "SEAM"));
        }
      }
    },
  },
  {
    key: "flood",
    name: "Flood",
    hint: "three levels to one side — deep, intermediate, flat",
    draw(a, give) {
      const { strong, weak } = a;
      const [one, two, three] = strong.men;
      if (one) give(one, vertical(one, lanes(a, strong, [one])[0]!, "GO"));
      if (two) {
        give(two, {
          assignment: "OUT",
          points: [
            two.position,
            at(lateral(two), 11),
            at(lateral(two) + strong.sign * 5, 11),
          ],
        });
      }
      if (three) give(three, receiverFlat(a, strong, 2));
      const [away, awayTwo] = weak.men;
      if (away) give(away, vertical(away, lanes(a, weak, [away])[0]!, "GO"));
      if (awayTwo) {
        give(
          awayTwo,
          across(awayTwo, 12, lateral(awayTwo) - weak.sign * 8, "DIG"),
        );
      }
    },
    back: strongFlatUnlessThree,
  },
  {
    key: "dagger",
    name: "Dagger",
    hint: "seam clears the middle, dig comes in behind it",
    draw(a, give) {
      const { strong, weak } = a;
      const [one, two, three] = strong.men;
      if (one) give(one, across(one, 15, a.ball + strong.sign * 3, "DIG"));
      if (two) give(two, vertical(two, lanes(a, strong, [two])[0]!, "SEAM"));
      if (three) give(three, receiverFlat(a, strong, 2));
      const [away, awayTwo] = weak.men;
      if (away) give(away, vertical(away, lanes(a, weak, [away])[0]!, "GO"));
      if (awayTwo) give(awayTwo, receiverFlat(a, weak, 1));
    },
  },
  {
    key: "drive",
    name: "Drive",
    hint: "shallow drive under a dig from the same side",
    draw(a, give) {
      const { strong, weak } = a;
      const one = strong.men[0];
      const inside = strong.men.length > 1 ? strong.men.at(-1) : undefined;
      if (one) give(one, across(one, 12, a.ball + weak.sign * 2, "DIG"));
      if (inside) {
        give(
          inside,
          shallow(inside, strong, 2.5, a.ball + weak.sign * 9, "DRIVE"),
        );
      }
      for (const man of strong.men.slice(1, -1)) {
        give(man, vertical(man, lanes(a, strong, [man])[0]!, "SEAM"));
      }
      const [away, awayTwo] = weak.men;
      if (away) give(away, vertical(away, lanes(a, weak, [away])[0]!, "GO"));
      if (awayTwo) give(awayTwo, tree(awayTwo, "curl", weak.sign, "CURL"));
    },
  },
  {
    key: "ycross",
    name: "Y-Cross",
    hint: "inside man crosses deep, post on top, back checks",
    draw(a, give) {
      const { strong, weak } = a;
      const one = strong.men[0];
      const crosser = strong.men.length > 1 ? strong.men.at(-1) : undefined;
      if (one) give(one, tree(one, "curl", strong.sign, "CURL"));
      if (crosser) {
        give(crosser, {
          assignment: "CROSS",
          points: [
            crosser.position,
            at(lateral(crosser), 5),
            at(a.ball + weak.sign * 10, 15),
          ],
        });
      }
      for (const index of strong.men.keys()) {
        if (index === 0 || index === strong.men.length - 1) continue;
        give(strong.men[index], receiverFlat(a, strong, index));
      }
      const [away, awayTwo] = weak.men;
      if (away) give(away, tree(away, "post", weak.sign, "POST"));
      if (awayTwo) give(awayTwo, receiverFlat(a, weak, 1));
    },
  },
  {
    key: "levels",
    name: "Levels",
    hint: "two ins at different depths on the same side",
    draw(a, give) {
      const { strong, weak } = a;
      const one = strong.men[0];
      const inside = strong.men.length > 1 ? strong.men.at(-1) : undefined;
      if (one)
        give(one, across(one, 12, lateral(one) - strong.sign * 9, "DIG"));
      if (inside) {
        give(
          inside,
          across(inside, 5, lateral(inside) - strong.sign * 6, "IN"),
        );
      }
      for (const man of strong.men.slice(1, -1)) {
        give(man, vertical(man, lanes(a, strong, [man])[0]!, "SEAM"));
      }
      const [away, awayTwo] = weak.men;
      if (away) give(away, vertical(away, lanes(a, weak, [away])[0]!, "GO"));
      if (awayTwo) give(awayTwo, tree(awayTwo, "slant", weak.sign, "SLANT"));
    },
  },
  {
    key: "spacing",
    name: "Spacing",
    hint: "everybody sits in a window — beats zone, moves the ball",
    draw(a, give) {
      for (const side of [a.strong, a.weak]) {
        for (const [index, man] of side.men.entries()) {
          if (index === 0) give(man, tree(man, "hitch", side.sign, "HITCH"));
          else if (index >= 2 && index === side.men.length - 1) {
            give(man, receiverFlat(a, side, index));
          } else give(man, stick(a, side, index, "SIT"));
        }
      }
    },
  },
  {
    key: "verts",
    name: "4 Verts",
    hint: "four straight up, back checks underneath",
    draw(a, give) {
      // Four go; a fifth receiver, inside to the strong side, sits instead.
      const strong = [...a.strong.men];
      const extra: ConceptMan[] = [];
      while (strong.length + a.weak.men.length > 4 && strong.length > 0) {
        extra.push(strong.pop()!);
      }
      for (const man of extra) {
        give(man, tree(man, "hitch", a.strong.sign, "HITCH"));
      }
      for (const [side, runners] of [
        [a.strong, strong],
        [a.weak, a.weak.men],
      ] as const) {
        const lane = lanes(a, side, runners);
        for (const [index, man] of runners.entries()) {
          give(man, vertical(man, lane[index]!, index === 0 ? "GO" : "SEAM"));
        }
      }
    },
  },
];

function toDefinition(recipe: Recipe): Omit<ConceptDefinition, "assignments"> {
  return {
    key: recipe.key,
    name: recipe.name,
    hint: recipe.hint,
    jobsFor(men, ballLateralYards) {
      const a = readConceptAlignment(men, ballLateralYards);
      const given = new Map<ConceptMan, Drawn>();
      const give: Give = (man, drawn) => {
        if (man && !given.has(man)) given.set(man, drawn);
      };
      recipe.draw(a, give);

      // A receiver the concept has no word for sits down in front of himself,
      // which keeps him off everyone else's lines.
      for (const side of [a.strong, a.weak]) {
        for (const man of side.men) {
          give(man, tree(man, "hitch", side.sign, "HITCH"));
        }
      }
      // The first back runs what the concept asks of him, or checks; he goes
      // to his own side unless told otherwise, or away from strength when he
      // is directly behind the ball. Each back after him checks to the other
      // side from the one before, so two backs never run the same line.
      const call = recipe.back?.(a);
      let last: Sign | undefined;
      for (const back of a.backs) {
        const offset = lateral(back) - a.ball;
        const own: Sign | undefined =
          Math.abs(offset) > 1 ? (offset < 0 ? -1 : 1) : undefined;
        const toward: Sign =
          last === undefined
            ? (call?.toward ?? own ?? a.weak.sign)
            : last === 1
              ? -1
              : 1;
        const assignment =
          last === undefined ? (call?.assignment ?? "CHECK") : "CHECK";
        last = toward;
        give(back, tree(back, "flat", toward, assignment));
      }

      return men.flatMap((man) => {
        const drawn = given.get(man);
        if (!drawn) return [];
        return [
          {
            playerId: man.id,
            assignment: drawn.assignment,
            ...(drawn.preset === undefined ? {} : { preset: drawn.preset }),
            ending: drawn.ending ?? "arrow",
            points: drawn.points,
          },
        ];
      });
    },
  };
}

/**
 * The words a concept writes, read off what it draws on every stock set
 * rather than listed by hand, so the list cannot drift from the recipe. The
 * words any concept can fall back on are added whether a stock set needs
 * them or not.
 */
function withAssignments(
  concept: Omit<ConceptDefinition, "assignments">,
): ConceptDefinition {
  const words = new Set(["HITCH", "CHECK"]);
  for (const formation of stockFormations) {
    const men = formation.slots.filter((slot) => !isLineman(slot));
    for (const job of concept.jobsFor(
      men,
      formation.ball.position.lateralYards,
    )) {
      words.add(job.assignment);
    }
  }
  return { ...concept, assignments: Object.freeze([...words]) };
}

export const stockConcepts: readonly ConceptDefinition[] = Object.freeze(
  recipes.map((recipe) => withAssignments(toDefinition(recipe))),
);
