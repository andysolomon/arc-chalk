import {
  defensiveFieldOf,
  sideOfBall,
  type DefensiveField,
  type SideOfBall,
} from "./defensive-field";
import { defensivePositions } from "./positions";
import type { PlayDocument, Player } from "./schema";

/**
 * The front's call: one call for the whole defensive line (ADR 0075, issue
 * #189). Each gives every man on the front one of the front's own quick
 * assignments (ADR 0064), drawn from where he stands and aimed at the
 * offense on the field, so a front call draws what the Coach would by
 * calling the men one at a time.
 *
 * Who is on the front is the roster's reading (ADR 0066): the ends, the
 * tackles and the nose. A backer standing up on the line is a linebacker,
 * whose job is the linebackers' call or the coverage, not the front's.
 */
export type FrontCallKey =
  "rush" | "contain" | "pinch" | "slantleft" | "slantright" | "twist";

export interface FrontCall {
  readonly key: FrontCallKey;
  readonly name: string;
  /** What it asks, in a line, for the catalogue. */
  readonly hint: string;
}

export const frontCalls: readonly FrontCall[] = Object.freeze([
  {
    key: "rush",
    name: "Rush",
    hint: "Every man on the front rushes through the gap he owns",
  },
  {
    key: "contain",
    name: "Contain",
    hint: "The ends keep contain, and the men inside them rush",
  },
  {
    key: "pinch",
    name: "Pinch",
    hint: "Every man slants one gap inside",
  },
  {
    key: "slantleft",
    name: "Slant left",
    hint: "Every man slants one gap to the left",
  },
  {
    key: "slantright",
    name: "Slant right",
    hint: "Every man slants one gap to the right",
  },
  {
    key: "twist",
    name: "Twist",
    hint: "Each end and the tackle beside him run a T-E twist; anyone else rushes",
  },
] as const);

export const frontCallByKey = (key: string): FrontCall | undefined =>
  frontCalls.find((call) => call.key === key);

/** The front's call on a Play, if it is one this version knows. */
export function frontCallOf(
  play: Pick<PlayDocument, "unitCalls">,
): FrontCall | undefined {
  const key = play.unitCalls?.front;
  return key === undefined ? undefined : frontCallByKey(key);
}

/** The men on the front, and what the roster calls each. */
function frontOf(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
): readonly { readonly man: Player; readonly name: string }[] {
  const defense = play.players.filter(({ unit }) => unit === "defense");
  const positions = defensivePositions(play);
  return defense.flatMap((man, index) => {
    const position = positions[index];
    return position?.group === "front" ? [{ man, name: position.name }] : [];
  });
}

/** How far out on his side of the ball a man stands. */
const outOf = (field: DefensiveField, man: Player, side: SideOfBall) =>
  side * (man.position.lateralYards - field.ballLateralYards);

/**
 * The men on each side of the ball, the widest first. Read off the front
 * alone, so a backer standing outside an end does not make the end a
 * tackle.
 */
function sidesOf(
  men: readonly Player[],
  field: DefensiveField,
): ReadonlyMap<SideOfBall, readonly Player[]> {
  return new Map(
    ([-1, 1] as const).map((side) => [
      side,
      men
        .filter((man) => sideOfBall(field, man.position.lateralYards) === side)
        .sort(
          (left, right) => outOf(field, right, side) - outOf(field, left, side),
        ),
    ]),
  );
}

/**
 * The job the front call gives each man on the front, as the key of the
 * quick assignment that draws it.
 *
 * - Rush: everyone through the gap he owns.
 * - Contain: the widest man on each side keeps contain, everyone inside him
 *   rushes.
 * - Pinch: everyone one gap inside.
 * - Slant left and right: everyone one gap that way, which is out for a man
 *   on that side of the ball and in for a man on the other.
 * - Twist: on each side, the end and the tackle beside him run a T-E twist.
 *   A nose is no side's tackle, and a man left over — the nose, an end with
 *   no tackle beside him, a third man on one side — rushes.
 */
export function frontJobsOf(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
  key: FrontCallKey,
): ReadonlyMap<string, string> {
  const field = defensiveFieldOf(play);
  const front = frontOf(play);
  const men = front.map(({ man }) => man);
  const jobs = new Map<string, string>();
  const every = (job: (man: Player) => string) => {
    for (const man of men) jobs.set(man.id, job(man));
  };
  const side = (man: Player) => sideOfBall(field, man.position.lateralYards);
  switch (key) {
    case "rush":
      every(() => "rush");
      break;
    case "contain": {
      const widest = new Set(
        [...sidesOf(men, field).values()].flatMap((onSide) =>
          onSide.length > 0 ? [onSide[0]!.id] : [],
        ),
      );
      every(({ id }) => (widest.has(id) ? "contain" : "rush"));
      break;
    }
    case "pinch":
      every(() => "slantin");
      break;
    case "slantleft":
      every((man) => (side(man) < 0 ? "slantout" : "slantin"));
      break;
    case "slantright":
      every((man) => (side(man) > 0 ? "slantout" : "slantin"));
      break;
    case "twist": {
      const noses = new Set(
        front.filter(({ name }) => name === "Nose").map(({ man }) => man.id),
      );
      const paired = new Set(
        [
          ...sidesOf(
            men.filter(({ id }) => !noses.has(id)),
            field,
          ).values(),
        ].flatMap((onSide) =>
          onSide.length >= 2 ? [onSide[0]!.id, onSide[1]!.id] : [],
        ),
      );
      every(({ id }) => (paired.has(id) ? "tetwist" : "rush"));
      break;
    }
  }
  return jobs;
}
