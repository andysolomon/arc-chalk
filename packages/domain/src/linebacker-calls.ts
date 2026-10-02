import { defensiveFieldOf, ownGapOf } from "./defensive-field";
import { defensivePositions } from "./positions";
import type { PlayDocument, Player } from "./schema";

/**
 * The linebackers' call (ADR 0075, issue #190): which backers are sent after
 * the passer. The coverage is in charge of everyone who drops, so this call
 * says only who leaves it — and the coverage refills the zones they leave.
 */
export type LinebackerKey = "base" | "mike" | "will" | "sam" | "fire" | "spy";

export interface LinebackerCall {
  readonly key: LinebackerKey;
  readonly name: string;
  /** What it asks, in a line, for the catalogue. */
  readonly hint: string;
}

export const linebackerCalls: readonly LinebackerCall[] = Object.freeze([
  {
    key: "base",
    name: "Base",
    hint: "Nobody sent: every backer plays the coverage",
  },
  {
    key: "mike",
    name: "Mike",
    hint: "The Mike through the gap his alignment owns",
  },
  {
    key: "will",
    name: "Will",
    hint: "The Will through the gap his alignment owns",
  },
  {
    key: "sam",
    name: "Sam",
    hint: "The Sam through the gap his alignment owns",
  },
  {
    key: "fire",
    name: "Fire",
    hint: "Every backer through the gap he owns",
  },
  { key: "spy", name: "Spy", hint: "The Mike on the quarterback" },
] as const);

export const linebackerCallByKey = (key: string): LinebackerCall | undefined =>
  linebackerCalls.find((call) => call.key === key);

/** The linebacker call on a Play, if it is one this version knows. */
export function linebackerCallOf(
  play: Pick<PlayDocument, "unitCalls">,
): LinebackerCall | undefined {
  const key = play.unitCalls?.linebackers;
  return key === undefined ? undefined : linebackerCallByKey(key);
}

/** The men the roster puts at the second level (ADR 0066). */
export function linebackerMenOf(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
): readonly Player[] {
  const defense = play.players.filter(({ unit }) => unit === "defense");
  const positions = defensivePositions(play);
  return defense.filter(
    (_, index) => positions[index]?.group === "linebackers",
  );
}

/**
 * The Mike, the Will and the Sam, as the roster names them. The Mike is the
 * backer it calls the Mike, else the one nearest the ball — as the coverage
 * reads him. A Will or a Sam the roster does not name is the backer nearest
 * the Mike on his left, or on his right.
 */
function backersByName(play: Pick<PlayDocument, "players" | "fieldProfile">): {
  readonly mike?: Player;
  readonly will?: Player;
  readonly sam?: Player;
} {
  const defense = play.players.filter(({ unit }) => unit === "defense");
  const positions = defensivePositions(play);
  const names = new Map(
    defense.map(({ id }, index) => [id, positions[index]?.name ?? ""]),
  );
  const backers = linebackerMenOf(play);
  const ball = defensiveFieldOf(play).ballLateralYards;
  const named = (name: string) =>
    backers.find(({ id }) => names.get(id) === name);
  const mike =
    named("Mike") ??
    [...backers].sort(
      (left, right) =>
        Math.abs(left.position.lateralYards - ball) -
        Math.abs(right.position.lateralYards - ball),
    )[0];
  const beside = (side: -1 | 1) =>
    mike
      ? [...backers]
          .filter(
            (man) =>
              man !== mike &&
              side * (man.position.lateralYards - mike.position.lateralYards) >
                0,
          )
          .sort(
            (left, right) =>
              side * (left.position.lateralYards - right.position.lateralYards),
          )[0]
      : undefined;
  const will = named("Will") ?? beside(-1);
  const sam = named("Sam") ?? beside(1);
  return {
    ...(mike ? { mike } : {}),
    ...(will && will !== mike ? { will } : {}),
    ...(sam && sam !== mike && sam !== will ? { sam } : {}),
  };
}

const GAP_JOBS = ["agap", "bgap", "cgap", "dgap"] as const;

/**
 * The line the call gives each backer it takes out of the coverage, as the
 * key of the quick assignment that draws it: through the gap his alignment
 * owns for a man sent, over the quarterback for the spy. A backer the call
 * does not name is not in it; he plays the coverage.
 */
export function linebackerJobsOf(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
  key: LinebackerKey,
): ReadonlyMap<string, string> {
  const field = defensiveFieldOf(play);
  const gapJob = (man: Player) =>
    GAP_JOBS[Math.min(ownGapOf(field, man.position).index, 3)]!;
  const { mike, will, sam } = backersByName(play);
  const jobs = new Map<string, string>();
  const send = (man: Player | undefined) => {
    if (man) jobs.set(man.id, gapJob(man));
  };
  switch (key) {
    case "base":
      break;
    case "mike":
      send(mike);
      break;
    case "will":
      send(will);
      break;
    case "sam":
      send(sam);
      break;
    case "fire":
      for (const man of linebackerMenOf(play)) send(man);
      break;
    case "spy":
      if (mike) jobs.set(mike.id, "spy");
      break;
  }
  return jobs;
}
