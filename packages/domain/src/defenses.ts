import { defensiveLineKinds, routeKindStyle } from "./classifications";
import type { DefensiveAssignment, DefensiveCall } from "./defense-catalogue";
import {
  classifyZoneCoverage,
  LEGACY_FIELD_GEOMETRY,
  legacyCanvasToYards,
  legacyDepthSpanToYards,
  legacyLateralSpanToYards,
} from "./geometry";
import type {
  Coordinate,
  CoverageArea,
  MovementPath,
  PlayDocument,
  Player,
} from "./schema";

/**
 * How much ground a drop owns: the deeper it ends, the wider the area. The
 * original's three sizes are canvas pixels, and each pair is a lateral radius
 * and a depth radius, so they convert on the axis each belongs to rather than
 * both on one.
 */
const depthOf = (y: number) =>
  legacyCanvasToYards({ x: LEGACY_FIELD_GEOMETRY.midfieldX, y }).depthYards;

const COVERAGE_SIZES = [
  { deeperThanYards: depthOf(250), lateralPx: 104, depthPx: 44 },
  { deeperThanYards: depthOf(300), lateralPx: 82, depthPx: 38 },
  { deeperThanYards: -Infinity, lateralPx: 56, depthPx: 28 },
] as const;

/**
 * How much ground a drop that ends here owns. Exported because a card that
 * previews a call has to draw the same areas the field will.
 */
export function coverageForDrop(endpoint: Coordinate): CoverageArea {
  const size = COVERAGE_SIZES.find(
    ({ deeperThanYards }) => endpoint.depthYards > deeperThanYards,
  )!;
  const radiusLateralYards = legacyLateralSpanToYards(size.lateralPx);
  return {
    // Classified by where the drop ends and how much of the field it covers,
    // which is the reading the domain already does for a drop drawn by hand.
    type: classifyZoneCoverage(endpoint, radiusLateralYards),
    radiusLateralYards,
    radiusDepthYards: legacyDepthSpanToYards(size.depthPx),
  };
}

/**
 * What each kind of assignment is drawn as. A drop and a man assignment are
 * both zone lines to the model — the difference a Coach sees is that one owns
 * ground and the other follows a man, which is exactly the presence or
 * absence of an area.
 */
function assignmentPath(
  assignment: DefensiveAssignment,
  id: string,
  playerId: string,
): MovementPath {
  const points = assignment.points.map((point) => ({ ...point }));
  const blue = { line: "dashed", ending: "bubble", color: "blue" } as const;
  if (assignment.kind === "blitz") {
    return {
      id,
      kind: "blitz",
      playerId,
      points,
      branches: [],
      style: routeKindStyle("blitz", blue),
    };
  }
  if (assignment.kind === "man") {
    // A man assignment is a zone line that owns no ground: it is dotted and
    // ends in an arrow at the man it follows, not in an area.
    return {
      id,
      kind: "zone",
      playerId,
      points,
      branches: [],
      style: {
        ...routeKindStyle("zone", blue),
        line: "dotted",
        ending: "arrow",
      },
    };
  }
  return {
    id,
    kind: "zone",
    playerId,
    points,
    branches: [],
    style: routeKindStyle("zone", blue),
    coverageArea: coverageForDrop(points.at(-1)!),
  };
}

export interface DefensiveCallResult {
  readonly play: PlayDocument;
  readonly addedPlayerIds: readonly string[];
  readonly addedPathCount: number;
  /** Defenders the call replaced, so the Coach is told what it cost him. */
  readonly replacedPlayerCount: number;
}

/**
 * Putting a call on the field. Only one defense can be on at a time, so the
 * one being replaced goes entirely — its men, their lines, and the call text
 * that belonged to it — rather than being left underneath the new one.
 */
export function applyDefensiveCall(
  play: PlayDocument,
  call: DefensiveCall,
  createId: (prefix: string) => string,
  options: { readonly withAssignments?: boolean } = {},
): DefensiveCallResult {
  const replaced = new Set(
    play.players.filter(({ unit }) => unit === "defense").map(({ id }) => id),
  );
  const players = play.players.filter(({ id }) => !replaced.has(id));
  const paths = play.paths.filter(
    (path) =>
      !replaced.has(path.playerId) &&
      // The call's own lines go with it whoever was running them. The
      // original forgets the stunt here although its own reading of which
      // side a line belongs to counts one as defensive; production states
      // that reading once and uses it in both places.
      !defensiveLineKinds.has(path.kind),
  );
  const keptPathIds = new Set(paths.map(({ id }) => id));
  const labels = play.labels.filter(
    (label) =>
      label.unit !== "defense" &&
      (!label.binding || keptPathIds.has(label.binding.pathId)),
  );

  const bySlot = new Map<string, string>();
  const added: Player[] = [];
  for (const slot of call.formation.slots) {
    const id = createId("player");
    bySlot.set(slot.id, id);
    added.push({
      id,
      unit: "defense",
      position: slot.position,
      symbol: slot.symbol,
      label: slot.label,
      sublabel: slot.sublabel,
      fill: slot.fill,
      color: slot.color,
    });
  }

  const drawn =
    options.withAssignments === false
      ? []
      : call.assignments.flatMap((assignment) => {
          const playerId = bySlot.get(assignment.slotId);
          return playerId
            ? [assignmentPath(assignment, createId("path"), playerId)]
            : [];
        });

  return {
    addedPlayerIds: added.map(({ id }) => id),
    addedPathCount: drawn.length,
    replacedPlayerCount: replaced.size,
    play: {
      ...play,
      players: [...players, ...added],
      paths: [...paths, ...drawn],
      labels,
    },
  };
}

/**
 * Who is on the field, as one string: each man's letter and where he stands,
 * sorted so the order they were added in does not matter. Comparing two of
 * these settles the whole question at once — no pairing to do, and no man who
 * could be counted twice.
 */
function alignmentSignature(
  men: readonly { readonly label: string; readonly position: Coordinate }[],
): string {
  return men
    .map(
      ({ label, position }) =>
        `${label}@${position.lateralYards},${position.depthYards}`,
    )
    .sort()
    .join("|");
}

/**
 * Which call is on the field. A defense is placed rather than realigned onto
 * the men already there, so unlike a set there is nothing to match up and no
 * proportional reading to make: the men are either standing exactly where the
 * call puts them, letters and all, or this is not that call any more.
 */
export function currentDefensiveCall(
  play: PlayDocument,
  catalogue: readonly DefensiveCall[],
): DefensiveCall | undefined {
  // No guard for an empty field: nobody on it reads as no letters at all,
  // which is not any call's reading, so the answer falls out of the same
  // comparison rather than needing a second one.
  const onField = alignmentSignature(
    play.players.filter(({ unit }) => unit === "defense"),
  );
  return catalogue.find(
    (call) => alignmentSignature(call.formation.slots) === onField,
  );
}

/** How many of a call's lines each kind accounts for, for what the browser says. */
export function countAssignments(
  call: DefensiveCall,
): Readonly<Record<DefensiveAssignment["kind"], number>> {
  return {
    drop: call.assignments.filter(({ kind }) => kind === "drop").length,
    man: call.assignments.filter(({ kind }) => kind === "man").length,
    blitz: call.assignments.filter(({ kind }) => kind === "blitz").length,
  };
}
