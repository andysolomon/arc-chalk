import {
  canRunLine,
  defensiveLineKinds,
  lineKindNames,
} from "./classifications";
import { assignRoles } from "./formations";
import type { MovementPath, PlayDocument } from "./schema";

/** The backs, who take the snap or the handoff and so can put the ball in the air. */
const BALL_HANDLERS: ReadonlySet<string> = new Set(["QB", "RB"]);

/** Every kind, in the order a Coach is offered them. */
const KIND_ORDER = Object.keys(lineKindNames) as MovementPath["kind"][];

/**
 * The kinds a line already on the field can be turned into from its panel.
 * `lineKindsFor` says what a man could ever be given; this says what this
 * line could still be. A route and a motion are both where he goes, drawn
 * two ways, so one becomes the other. A block is a block — a receiver's
 * route is never retyped into one, it is drawn with the Block tool. The
 * ball's flight is offered only on a back's line, since the throw or pitch
 * starts in his hands, not a receiver's. A defender's drop, blitz and stunt
 * are all his call and trade freely. The line's own kind is always offered,
 * so a line drawn before this rule still shows what it is.
 */
export function lineKindChoices(
  play: Pick<PlayDocument, "players">,
  path: Pick<MovementPath, "kind" | "playerId">,
): readonly MovementPath["kind"][] {
  const owner = play.players.find(({ id }) => id === path.playerId);
  if (!owner) return [path.kind];
  const family = new Set<MovementPath["kind"]>([path.kind]);
  if (defensiveLineKinds.has(path.kind)) {
    for (const kind of defensiveLineKinds) family.add(kind);
  } else if (path.kind !== "block") {
    family.add("route");
    family.add("motion");
    if (handlesBall(play, owner)) family.add("ball");
  }
  return KIND_ORDER.filter(
    (kind) =>
      family.has(kind) && (kind === path.kind || canRunLine(owner, kind)),
  );
}

function handlesBall(
  play: Pick<PlayDocument, "players">,
  owner: PlayDocument["players"][number],
): boolean {
  if (owner.unit === "defense") return false;
  const offense = play.players.filter(({ unit }) => unit !== "defense");
  const role = assignRoles(offense)[offense.indexOf(owner)];
  return role !== undefined && BALL_HANDLERS.has(role);
}
