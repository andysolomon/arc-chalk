import {
  defensiveFieldOf,
  sideOfBall,
  type DefensiveField,
} from "./defensive-field";
import { defensivePositions, type DefensivePosition } from "./positions";
import type { MovementPath, PlayDocument, Player } from "./schema";
import { deepGroundOf } from "./zone-shell";

/**
 * The coverage: the unit call that is in charge of the defense (ADR 0075). It
 * names the zones the defense plays and who is in man, and gives a job to
 * every man who drops — the secondary and the linebackers. The front is not
 * in it; its own call says what it does.
 *
 * Each job is one of the quick assignments, so a coverage draws exactly what
 * the Coach would by calling the men one at a time, and the zone shell and
 * man match settle it the same way.
 */
export type CoverageKey =
  | "cover0"
  | "cover1"
  | "cover2"
  | "tampa2"
  | "cover2man"
  | "cover3"
  | "cover4"
  | "cover6";

export interface CoverageCall {
  readonly key: CoverageKey;
  readonly name: string;
  /** What it asks, in a line, for the catalogue. */
  readonly hint: string;
}

export const coverageCalls: readonly CoverageCall[] = Object.freeze([
  {
    key: "cover0",
    name: "Cover 0",
    hint: "Everyone who drops is in man, with nobody deep",
  },
  {
    key: "cover1",
    name: "Cover 1",
    hint: "The free safety in the middle third, everyone else in man",
  },
  {
    key: "cover2",
    name: "Cover 2",
    hint: "The safeties split the deep halves, the corners sink to the flats",
  },
  {
    key: "tampa2",
    name: "Tampa 2",
    hint: "Cover 2 with the Mike running the deep middle",
  },
  {
    key: "cover2man",
    name: "Cover 2 Man",
    hint: "The safeties split the deep halves, everyone else in man",
  },
  {
    key: "cover3",
    name: "Cover 3",
    hint: "The corners take the outside thirds, the free safety the middle",
  },
  {
    key: "cover4",
    name: "Cover 4",
    hint: "The corners and safeties take a deep quarter each",
  },
  {
    key: "cover6",
    name: "Cover 6",
    hint: "Quarters to the strong safety's side, a half to the other",
  },
] as const);

export const coverageCallByKey = (key: string): CoverageCall | undefined =>
  coverageCalls.find((call) => call.key === key);

/** The coverage on a Play, if it is one this version knows. */
export function coverageCallOf(
  play: Pick<PlayDocument, "unitCalls">,
): CoverageCall | undefined {
  const key = play.unitCalls?.coverage;
  return key === undefined ? undefined : coverageCallByKey(key);
}

/** The words a defensive call in the catalogue uses for its coverage. */
const COVERAGE_WORDS: Readonly<Record<string, CoverageKey>> = Object.freeze({
  "cover 0": "cover0",
  "cover 1": "cover1",
  "cover 2": "cover2",
  "tampa 2": "tampa2",
  "cover 2 man": "cover2man",
  "2 man": "cover2man",
  "cover 3": "cover3",
  // Three deep and three under behind the pressure.
  "fire zone": "cover3",
  "cover 4": "cover4",
  quarters: "cover4",
  "cover 6": "cover6",
});

/** The coverage a defensive call's words name, when they name one. */
export function coverageNamed(words: string): CoverageKey | undefined {
  return COVERAGE_WORDS[words.trim().toLowerCase()];
}

/**
 * What each defender plays, by id, read off the alignment as the roster reads
 * it (ADR 0066): his group and his position's name.
 */
function positionsOf(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
): Map<string, DefensivePosition> {
  const defense = play.players.filter(({ unit }) => unit === "defense");
  const positions = defensivePositions(play);
  return new Map(defense.map(({ id }, index) => [id, positions[index]!]));
}

/**
 * Who a coverage is put on: every defender the roster does not put on the
 * front — the linebackers and the secondary.
 */
export function coverageMenOf(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
): readonly Player[] {
  const positions = positionsOf(play);
  return play.players.filter(
    ({ id, unit }) =>
      unit === "defense" && positions.get(id)?.group !== "front",
  );
}

const SAFETIES: ReadonlySet<string> = new Set([
  "Free safety",
  "Strong safety",
  "Safety",
]);

/** The men a coverage reads, by what each plays. */
interface Secondary {
  readonly corners: readonly Player[];
  readonly freeSafety?: Player;
  readonly strongSafety?: Player;
  readonly mike?: Player;
}

/**
 * The free safety is the man the roster calls one, else the deepest safety;
 * the strong safety the man it calls one, else the deepest safety left. The
 * Mike is the backer it calls the Mike, else the backer nearest the ball.
 * A nickel or a dime is neither: he plays underneath, or in man.
 */
function secondaryOf(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
  men: readonly Player[],
  field: DefensiveField,
): Secondary {
  const positions = positionsOf(play);
  const named = (man: Player) => positions.get(man.id)?.name ?? "";
  const deepestFirst = (left: Player, right: Player) =>
    right.position.depthYards - left.position.depthYards ||
    left.position.lateralYards - right.position.lateralYards;
  const safeties = men
    .filter((man) => SAFETIES.has(named(man)))
    .sort(deepestFirst);
  const freeSafety =
    safeties.find((man) => named(man) === "Free safety") ?? safeties[0];
  const rest = safeties.filter((man) => man !== freeSafety);
  const strongSafety =
    rest.find((man) => named(man) === "Strong safety") ?? rest[0];
  const backers = men.filter(
    ({ id }) => positions.get(id)?.group === "linebackers",
  );
  const mike =
    backers.find((man) => named(man) === "Mike") ??
    [...backers].sort(
      (left, right) =>
        Math.abs(left.position.lateralYards - field.ballLateralYards) -
        Math.abs(right.position.lateralYards - field.ballLateralYards),
    )[0];
  return {
    corners: men.filter((man) => named(man) === "Corner"),
    ...(freeSafety ? { freeSafety } : {}),
    ...(strongSafety ? { strongSafety } : {}),
    ...(mike ? { mike } : {}),
  };
}

/**
 * Underneath, by where they stand: on each side of the ball the man widest
 * out takes the curl/flat and the men inside him the hooks. A side whose
 * curl/flat a corner already has is hooks only.
 */
function underneath(
  men: readonly Player[],
  field: DefensiveField,
  flatTaken: ReadonlySet<-1 | 1>,
  jobs: Map<string, string>,
): void {
  for (const side of [-1, 1] as const) {
    const onSide = men
      .filter((man) => sideOfBall(field, man.position.lateralYards) === side)
      .sort(
        (left, right) =>
          side * (right.position.lateralYards - left.position.lateralYards),
      );
    onSide.forEach((man, index) =>
      jobs.set(
        man.id,
        index === 0 && !flatTaken.has(side) ? "curlflat" : "hook",
      ),
    );
  }
}

/**
 * The job the coverage gives each man it is put on, as the key of the quick
 * assignment that draws it. Every man the coverage is put on has one.
 */
export function coverageJobsOf(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
  key: CoverageKey,
): ReadonlyMap<string, string> {
  const field = defensiveFieldOf(play);
  const men = coverageMenOf(play);
  const { corners, freeSafety, strongSafety, mike } = secondaryOf(
    play,
    men,
    field,
  );
  const jobs = new Map<string, string>();
  const give = (man: Player | undefined, job: string) => {
    if (man) jobs.set(man.id, job);
  };
  const rest = () => men.filter(({ id }) => !jobs.has(id));
  const halves = () => {
    give(freeSafety, "deep2");
    give(strongSafety, "deep2");
  };
  switch (key) {
    case "cover0":
      break;
    case "cover1":
      give(freeSafety, "mid3");
      break;
    case "cover2man":
      halves();
      break;
    case "cover2":
    case "tampa2": {
      halves();
      if (key === "tampa2") give(mike, "mid3");
      for (const corner of corners) give(corner, "curlflat");
      const flats = new Set(
        corners.map((corner) =>
          sideOfBall(field, corner.position.lateralYards),
        ),
      );
      underneath(rest(), field, flats, jobs);
      break;
    }
    case "cover3":
      for (const corner of corners) give(corner, "deep3");
      give(freeSafety, "mid3");
      underneath(rest(), field, new Set(), jobs);
      break;
    case "cover4":
      for (const corner of corners) give(corner, "quarter");
      give(freeSafety, "quarter");
      give(strongSafety, "quarter");
      underneath(rest(), field, new Set(), jobs);
      break;
    case "cover6": {
      const strong = strongSafetySide(strongSafety, field);
      for (const corner of corners) {
        give(
          corner,
          sideOfBall(field, corner.position.lateralYards) === strong
            ? "quarter"
            : "curlflat",
        );
      }
      give(strongSafety, "quarter");
      give(freeSafety, "deep2");
      underneath(rest(), field, new Set([-strong as -1 | 1]), jobs);
      break;
    }
  }
  // Everyone the coverage has given no zone to is in man.
  for (const man of rest()) jobs.set(man.id, "man");
  return jobs;
}

/** Cover 6's quarters go to the strong safety's side, or the right without one. */
function strongSafetySide(
  strongSafety: Player | undefined,
  field: DefensiveField,
): -1 | 1 {
  return strongSafety
    ? sideOfBall(field, strongSafety.position.lateralYards)
    : 1;
}

/** A zone a coverage must have a man in, and what the roster calls it. */
export interface Ground {
  readonly id: string;
  readonly name: string;
}

const SIDE_WORDS = { [-1]: "left", 1: "right" } as const;

/** One deep share of the field: which of `count`, and its name. */
function deepShare(count: 2 | 3 | 4, index: number): Ground {
  const names: Record<2 | 3 | 4, readonly string[]> = {
    2: ["Deep 1/2 left", "Deep 1/2 right"],
    3: ["Deep 1/3 left", "Middle 1/3", "Deep 1/3 right"],
    4: [
      "Deep 1/4 outside left",
      "Deep 1/4 inside left",
      "Deep 1/4 inside right",
      "Deep 1/4 outside right",
    ],
  };
  return { id: `deep:${count}:${index}`, name: names[count][index]! };
}

const curlFlat = (side: -1 | 1): Ground => ({
  id: `curlflat:${side}`,
  name: `Curl / flat ${SIDE_WORDS[side]}`,
});

/**
 * The zones a coverage plays that must have a man in them: its deep shell,
 * and the curl/flat on each side. Hooks are played by whoever is left, so a
 * hook is never open; nor is a man in man, whom man match answers for.
 */
export function coverageGroundsOf(
  key: CoverageKey,
  play: Pick<PlayDocument, "players" | "fieldProfile">,
): readonly Ground[] {
  const flats = [curlFlat(-1), curlFlat(1)];
  switch (key) {
    case "cover0":
      return [];
    case "cover1":
      return [deepShare(3, 1)];
    case "cover2man":
      return [deepShare(2, 0), deepShare(2, 1)];
    case "cover2":
      return [deepShare(2, 0), deepShare(2, 1), ...flats];
    case "tampa2":
      return [deepShare(2, 0), deepShare(3, 1), deepShare(2, 1), ...flats];
    case "cover3":
      return [deepShare(3, 0), deepShare(3, 1), deepShare(3, 2), ...flats];
    case "cover4":
      return [0, 1, 2, 3].map((index) => deepShare(4, index)).concat(flats);
    case "cover6": {
      const field = defensiveFieldOf(play);
      const { strongSafety } = secondaryOf(play, coverageMenOf(play), field);
      const strong = strongSafetySide(strongSafety, field);
      return [
        ...(strong < 0
          ? [deepShare(4, 0), deepShare(4, 1), deepShare(2, 1)]
          : [deepShare(2, 0), deepShare(4, 2), deepShare(4, 3)]),
        ...flats,
      ];
    }
  }
}

/**
 * The ground a defender's line covers, when it is a zone a coverage counts,
 * read from `stance`: his own, or that of the man whose zone he took over.
 */
export function groundOfLine(
  path: MovementPath,
  stance: Player["position"],
  field: DefensiveField,
): string | undefined {
  if (path.kind !== "zone" || path.style.ending !== "bubble") return undefined;
  if (path.preset === "curlflat") {
    return curlFlat(sideOfBall(field, stance.lateralYards)).id;
  }
  const width = field.halfWidthYards * 2;
  const ground = deepGroundOf(
    path.preset,
    stance,
    field.ballLateralYards,
    width,
  );
  if (!ground) return undefined;
  const count = Math.round(width / ground.shareYards) as 2 | 3 | 4;
  const index = Math.round(
    (ground.lateralYards + width / 2) / ground.shareYards - 0.5,
  );
  return deepShare(count, index).id;
}
