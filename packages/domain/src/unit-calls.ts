import { coverageCallOf, coverageJobsOf } from "./coverage-calls";
import { defensiveFieldOf, frontCallFor } from "./defensive-field";
import { linebackerCallOf, linebackerJobsOf } from "./linebacker-calls";
import { defensivePositions } from "./positions";
import type { MovementPath, PlayDocument, Player } from "./schema";

/**
 * What the defense's unit calls ask of one man (ADR 0075). The coverage, the
 * front's call and the linebackers' call each give the men of their unit a
 * job; this is where a caller asks which job a man has, whichever unit he is
 * in, without knowing how each call is read.
 */
export type UnitCallName = NonNullable<MovementPath["unitCall"]>;

/** The men the roster puts on the front (ADR 0066). */
export function frontMenOf(
  play: Pick<PlayDocument, "players" | "fieldProfile">,
): readonly Player[] {
  const defense = play.players.filter(({ unit }) => unit === "defense");
  const positions = defensivePositions(play);
  return defense.filter((_, index) => positions[index]?.group === "front");
}

/**
 * The job the front gives a man on it, as the key of the quick assignment
 * that draws it; nothing for a man who is not on the front. With no front
 * call this version knows, the outside man on each side keeps contain and
 * everyone inside him rushes his gap — what a defensive call leaves its front
 * doing (ADR 0064). A man the coverage drops off the front to fill a zone
 * goes back to this when the zone is his no longer.
 */
export function frontJobOf(
  play: Pick<PlayDocument, "players" | "fieldProfile" | "unitCalls">,
  playerId: string,
): string | undefined {
  const man = frontMenOf(play).find(({ id }) => id === playerId);
  if (!man) return undefined;
  return frontCallFor(man.position, defensiveFieldOf(play));
}

/** The job a unit call gives a man: the quick assignment, its unit and its call's name. */
export interface UnitJob {
  readonly unitCall: UnitCallName;
  readonly job: string;
  readonly callName: string;
}

/**
 * The job a man's unit call gives him, when his unit has a call on: what
 * pressing his own call again hands him back to. Nothing when no unit call
 * covers him, and pressing his own call takes it off as it always has.
 */
export function unitJobOf(
  play: Pick<PlayDocument, "players" | "fieldProfile" | "unitCalls">,
  playerId: string,
): UnitJob | undefined {
  // A backer the linebacker call sends, or puts on the quarterback, goes
  // back to that; one it leaves in the coverage, to the coverage's job.
  const linebackers = linebackerCallOf(play);
  const sent = linebackers
    ? linebackerJobsOf(play, linebackers.key).get(playerId)
    : undefined;
  if (linebackers && sent) {
    return { unitCall: "linebackers", job: sent, callName: linebackers.name };
  }
  const coverage = coverageCallOf(play);
  const job = coverage
    ? coverageJobsOf(play, coverage.key).get(playerId)
    : undefined;
  if (coverage && job) {
    return { unitCall: "coverage", job, callName: coverage.name };
  }
  return undefined;
}
