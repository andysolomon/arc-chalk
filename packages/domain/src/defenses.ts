import { playBallLateralYards } from "./ball-spot";
import { defensiveLineKinds, routeKindStyle } from "./classifications";
import { coverageMenOf, coverageNamed } from "./coverage-calls";
import type { DefensiveAssignment, DefensiveCall } from "./defense-catalogue";
import { APPLIED_TOLERANCE, MIN_REACH_YARDS } from "./formations";
import {
  classifyZoneCoverage,
  LEGACY_FIELD_GEOMETRY,
  legacyCanvasToYards,
  legacyDepthSpanToYards,
  legacyLateralSpanToYards,
} from "./geometry";
import { isManLine } from "./man-coverage";
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
  // Named as the quick assignment it is, so the roster says so and its
  // button reads pressed.
  const preset =
    assignment.preset === undefined ? {} : { preset: assignment.preset };
  if (assignment.kind === "blitz") {
    return {
      id,
      kind: "blitz",
      playerId,
      points,
      branches: [],
      style: routeKindStyle("blitz", blue),
      ...preset,
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
      ...preset,
    };
  }
  return {
    id,
    kind: "zone",
    playerId,
    points,
    branches: [],
    style: routeKindStyle("zone", blue),
    coverageArea: assignment.coverageArea
      ? { ...assignment.coverageArea }
      : coverageForDrop(points.at(-1)!),
    ...preset,
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

  // The call's lines are its units' rather than any man's own (ADR 0075):
  // the front's for the men on it, the coverage's for everyone who drops, so
  // the next coverage called is free to redraw them. The call names its
  // coverage; a defense put on without its lines has none.
  const coverage =
    options.withAssignments === false
      ? undefined
      : coverageNamed(call.coverage);
  const dropping = new Set(
    coverageMenOf({
      players: [...players, ...added],
      fieldProfile: play.fieldProfile,
    }).map(({ id }) => id),
  );
  const unitDrawn = drawn.map((path): MovementPath => ({
    ...path,
    unitCall: dropping.has(path.playerId) ? "coverage" : "front",
  }));
  const rest: Partial<PlayDocument> = { ...play };
  delete rest.unitCalls;

  return {
    addedPlayerIds: added.map(({ id }) => id),
    addedPathCount: drawn.length,
    replacedPlayerCount: replaced.size,
    play: {
      ...(rest as PlayDocument),
      ...(coverage ? { unitCalls: { coverage } } : {}),
      players: [...players, ...added],
      paths: [...paths, ...unitDrawn],
      labels,
      // Remembered so the Coach can put the men back once he has moved them:
      // the field stops saying which call it was the moment one of them moves.
      defensiveCallSource: {
        callId: call.formation.id,
        slotBindings: [...bySlot].map(([slotId, playerId]) => ({
          slotId,
          playerId,
        })),
      },
    },
  };
}

/**
 * How far a hash can squeeze one side of the ball, or give it back: the room
 * a set is allowed to still be the set the Coach applied, so a defense and
 * the offense in front of it keep or lose their names by one rule.
 */
const withinHashSqueeze = (scale: number) => scale >= 0.42 && scale <= 1.2;

/**
 * Whether these men are standing in this call. Where the call puts a man is
 * measured from the ball, and a hash squeezes each side of the ball by one
 * factor, read off the widest man on that side as it is for a set. A man on
 * one of `manSlots` is in man, standing wherever his receiver put him (ADR
 * 0060), so for him only his letter and his call are compared.
 */
function standsIn(
  defense: readonly Player[],
  inMan: ReadonlySet<string>,
  call: DefensiveCall,
  ball: number,
  manSlots: ReadonlySet<string>,
): boolean {
  const slots = call.formation.slots;
  if (slots.length !== defense.length) return false;
  const slotBall = call.formation.ball.position.lateralYards;
  const placedSlots = slots.filter(({ id }) => !manSlots.has(id));
  const placedMen = defense.filter(({ id }) => !inMan.has(id));
  const reach = (
    list: readonly { readonly position: Coordinate }[],
    from: number,
    sign: 1 | -1,
  ) =>
    Math.max(
      0,
      ...list.map(({ position }) => sign * (position.lateralYards - from)),
    );
  const ratio = (now: number, was: number) =>
    was > MIN_REACH_YARDS && now > MIN_REACH_YARDS ? now / was : 1;
  const scaleLeft = ratio(
    reach(placedMen, ball, -1),
    reach(placedSlots, slotBall, -1),
  );
  const scaleRight = ratio(
    reach(placedMen, ball, 1),
    reach(placedSlots, slotBall, 1),
  );
  if (!withinHashSqueeze(scaleLeft) || !withinHashSqueeze(scaleRight)) {
    return false;
  }

  const remaining = [...defense];
  return slots.every((slot) => {
    const offset = slot.position.lateralYards - slotBall;
    const expected = ball + offset * (offset < 0 ? scaleLeft : scaleRight);
    const index = remaining.findIndex(
      (man) =>
        man.label === slot.label &&
        (manSlots.has(slot.id)
          ? inMan.has(man.id)
          : !inMan.has(man.id) &&
            Math.abs(man.position.lateralYards - expected) <=
              APPLIED_TOLERANCE.lateralYards &&
            Math.abs(man.position.depthYards - slot.position.depthYards) <=
              APPLIED_TOLERANCE.depthYards),
    );
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

/**
 * Which call is on the field. A defense is placed rather than realigned onto
 * the men already there, so unlike a set there are no roles to match up: the
 * men are standing where the call puts them, letters and all, or this is not
 * that call any more. Where the call puts them is measured from the ball, so
 * a call spotted on a hash — or brought back to the middle with the hash's
 * squeeze still in it — is still that call, and a man moved by hand is what
 * loses the name. A call is put on where the catalogue draws it, whatever
 * hash the offense in front of it is on, so it is read from there as well.
 * The men a call puts in man are the exception — they line up on their
 * receivers — so a call read with its man calls on is compared by their
 * letters, and one put on without its lines by where it drew them.
 */
export function currentDefensiveCall(
  play: PlayDocument,
  catalogue: readonly DefensiveCall[],
): DefensiveCall | undefined {
  // No guard for an empty field: nobody on it is no call's eleven, so the
  // answer falls out of the same comparison rather than needing a second one.
  const inMan = new Set(
    play.paths.filter(isManLine).map(({ playerId }) => playerId),
  );
  const defense = play.players.filter(({ unit }) => unit === "defense");
  const ball = playBallLateralYards(play);
  return catalogue.find((call) => {
    const manSlots = new Set(
      call.assignments
        .filter(({ kind }) => kind === "man")
        .map(({ slotId }) => slotId),
    );
    const drawnAt = call.formation.ball.position.lateralYards;
    return [ball, ...(drawnAt === ball ? [] : [drawnAt])].some(
      (from) =>
        standsIn(defense, inMan, call, from, new Set()) ||
        (manSlots.size > 0 && standsIn(defense, inMan, call, from, manSlots)),
    );
  });
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
