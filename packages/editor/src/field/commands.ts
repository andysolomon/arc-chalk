import {
  applyDefensiveCall,
  applyFormation,
  applyPlayCommand,
  assignRoles,
  assignmentForPath,
  ballSpotNames,
  flippedPlayerLabels,
  flipStrengthWords,
  canonicalStringify,
  defensiveLineKinds,
  deletePathsCommand,
  deletePlayersCommand,
  diffPlayDocuments,
  handednessOf,
  isLineman,
  linePresetByKey,
  mirrorPlayGeometry,
  recognizeFormation,
  RECOGNITION_THRESHOLD,
  labelRolePresets,
  routePresetPoints,
  spotBall,
  stockFormations,
  legacyCanvasToYards,
  legacyDepthSpanToYards,
  legacyLateralSpanToYards,
  routeKindStyle,
  yardsToLegacyCanvas,
  type ConceptDefinition,
  type BallSpot,
  type Coordinate,
  type DefensiveCall,
  type DefensiveCallResult,
  type Formation,
  type LabelRole,
  type LinePreset,
  type MovementPath,
  type PathBranch,
  type PathPoint,
  type Player,
  type PlayCommand,
  type PlayDocument,
  type PrimitivePlayCommand,
  type RealignmentResult,
  type TextLabel,
} from "@chalk/domain";

import { snapPosition, type AxisSnapGuide } from "../smart-snapping";
import { coordinate, rounded } from "./geometry";
import type {
  FieldInteractionContext,
  FieldItemRef,
  FieldMoveReadout,
} from "./model";

/**
 * Every Coach edit as a semantic command. A gesture previews by running one
 * of these early and commits by running the same one again, which is what
 * keeps one gesture equal to one undo entry (ADR 0012).
 */

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

function translatePoint(point: PathPoint, translation: Coordinate): PathPoint {
  return {
    ...point,
    lateralYards: rounded(point.lateralYards + translation.lateralYards),
    depthYards: rounded(point.depthYards + translation.depthYards),
    ...(point.control === undefined
      ? {}
      : {
          control: coordinate(
            point.control.lateralYards + translation.lateralYards,
            point.control.depthYards + translation.depthYards,
          ),
        }),
  };
}

function translatePath(
  path: MovementPath,
  translation: Coordinate,
): MovementPath {
  return {
    ...path,
    points: path.points.map((point) => translatePoint(point, translation)),
    branches: path.branches.map((branch) => ({
      ...branch,
      points: branch.points.map((point) => translatePoint(point, translation)),
    })),
  };
}

function translateLabel(label: TextLabel, translation: Coordinate): TextLabel {
  // A bound label keeps riding its route; moving it adjusts the offset the
  // binding already applies. The leader endpoint travels with the label.
  const moved = label.binding
    ? {
        ...label,
        binding: {
          ...label.binding,
          offset: coordinate(
            label.binding.offset.lateralYards + translation.lateralYards,
            label.binding.offset.depthYards + translation.depthYards,
          ),
        },
      }
    : {
        ...label,
        position: coordinate(
          label.position.lateralYards + translation.lateralYards,
          label.position.depthYards + translation.depthYards,
        ),
      };
  return moved.leader
    ? {
        ...moved,
        leader: {
          ...moved.leader,
          endpoint: coordinate(
            moved.leader.endpoint.lateralYards + translation.lateralYards,
            moved.leader.endpoint.depthYards + translation.depthYards,
          ),
        },
      }
    : moved;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function selectionLabel(verb: string, items: readonly FieldItemRef[]): string {
  const kinds = new Set(items.map(({ kind }) => kind));
  if (kinds.size > 1) return `${verb} selection`;
  const count = items.length;
  if (kinds.has("player"))
    return plural(count, `${verb} Player`, `${verb} Players`);
  if (kinds.has("path"))
    return plural(count, `${verb} route`, `${verb} routes`);
  return plural(count, `${verb} label`, `${verb} labels`);
}

/**
 * One completed move — however many items it carried — becomes one batch.
 * Routes attached to a moving Player travel with him, the way the original
 * dragged them as a unit.
 */
export function buildMoveCommand(
  document: PlayDocument,
  items: readonly FieldItemRef[],
  translation: Coordinate,
): PlayCommand | undefined {
  if (
    rounded(translation.lateralYards) === 0 &&
    rounded(translation.depthYards) === 0
  ) {
    return undefined;
  }
  const playerIds = new Set(
    items.filter(({ kind }) => kind === "player").map(({ id }) => id),
  );
  const pathIds = new Set(
    items.filter(({ kind }) => kind === "path").map(({ id }) => id),
  );
  const labelIds = new Set(
    items.filter(({ kind }) => kind === "label").map(({ id }) => id),
  );

  const commands: PrimitivePlayCommand[] = [];
  const moves = document.players
    .filter(({ id }) => playerIds.has(id))
    .map(({ id, position }) => ({
      playerId: id,
      position: coordinate(
        position.lateralYards + translation.lateralYards,
        position.depthYards + translation.depthYards,
      ),
    }));
  if (moves.length > 0) commands.push({ kind: "move-players", moves });

  for (const path of document.paths) {
    // Attachment wins: a route selected alongside its own Player still moves
    // exactly once.
    if (playerIds.has(path.playerId) || pathIds.has(path.id)) {
      commands.push({
        kind: "update-path",
        path: translatePath(path, translation),
      });
    }
  }
  for (const label of document.labels) {
    if (labelIds.has(label.id)) {
      commands.push({
        kind: "update-label",
        label: translateLabel(label, translation),
      });
    }
  }
  if (commands.length === 0) return undefined;
  return {
    kind: "batch",
    label: selectionLabel("Move", items),
    commands,
  };
}

/**
 * Deleting a mixed selection composes the domain's dependent cleanup: Players
 * take their routes and bound labels, routes take theirs, and what remains is
 * removed directly — one batch, one undo step.
 */
export function buildDeleteCommand(
  document: PlayDocument,
  selection: readonly FieldItemRef[],
): PlayCommand | undefined {
  const playerIds = selection
    .filter(({ kind }) => kind === "player")
    .map(({ id }) => id)
    .filter((id) => document.players.some((player) => player.id === id));
  const pathIds = selection
    .filter(({ kind }) => kind === "path")
    .map(({ id }) => id);
  const labelIds = selection
    .filter(({ kind }) => kind === "label")
    .map(({ id }) => id);

  const commands: PrimitivePlayCommand[] = [];
  let working = document;
  if (playerIds.length > 0) {
    const batch = deletePlayersCommand(working, playerIds);
    commands.push(...batch.commands);
    working = applyPlayCommand(working, batch);
  }
  const remainingPaths = pathIds.filter((id) =>
    working.paths.some((path) => path.id === id),
  );
  if (remainingPaths.length > 0) {
    const batch = deletePathsCommand(working, remainingPaths);
    commands.push(...batch.commands);
    working = applyPlayCommand(working, batch);
  }
  const remainingLabels = labelIds.filter((id) =>
    working.labels.some((label) => label.id === id),
  );
  if (remainingLabels.length > 0) {
    commands.push({ kind: "remove-labels", labelIds: remainingLabels });
  }
  if (commands.length === 0) return undefined;
  return {
    kind: "batch",
    label: selectionLabel("Delete", selection),
    commands,
  };
}

function formatYards(value: number): string {
  return `${Math.round(value * 10) / 10}`;
}

export interface MovePreview {
  readonly translation: Coordinate;
  readonly guides: readonly AxisSnapGuide[];
  readonly readout?: FieldMoveReadout;
}

/**
 * A lone Player snaps landmark-first (ADR 0035) and reports his depth the way
 * the original's readout did. A group keeps its shape and moves raw.
 */
export function movePreview(
  context: FieldInteractionContext,
  items: readonly FieldItemRef[],
  start: Coordinate,
  point: Coordinate,
): MovePreview {
  const raw = coordinate(
    point.lateralYards - start.lateralYards,
    point.depthYards - start.depthYards,
  );
  const only = items.length === 1 ? items[0] : undefined;
  if (only?.kind !== "player") return { translation: raw, guides: [] };
  const player = context.document.players.find(({ id }) => id === only.id);
  if (!player) return { translation: raw, guides: [] };

  const result = snapPosition({
    point: coordinate(
      player.position.lateralYards + raw.lateralYards,
      player.position.depthYards + raw.depthYards,
    ),
    fieldProfile: context.document.fieldProfile,
    references: context.document.players
      .filter(({ id }) => id !== player.id)
      .map(({ id, position, label }) => ({
        id,
        kind: "player" as const,
        position,
        ...(label.trim() === "" ? {} : { label }),
      })),
    screenScale: context.screenScale,
    settings: context.snap,
  });
  return {
    translation: coordinate(
      result.point.lateralYards - player.position.lateralYards,
      result.point.depthYards - player.position.depthYards,
    ),
    guides: result.guides,
    readout: {
      position: result.point,
      text: `${formatYards(result.point.depthYards)} yds`,
    },
  };
}
/**
 * Retyping a label is one edit the Coach makes over several keystrokes, so
 * it carries a coalesce key and lands as a single undo entry until he moves
 * on (ADR 0012). Every other label change is its own entry.
 */
export function setLabelTextCommand(
  document: PlayDocument,
  labelId: string,
  text: string,
): PlayCommand | undefined {
  const label = document.labels.find(({ id }) => id === labelId);
  if (!label || label.text === text) return undefined;
  return { kind: "update-label", label: { ...label, text } };
}

export type PlayerAppearance = Partial<
  Pick<Player, "symbol" | "fill" | "color" | "label" | "sublabel">
>;

/**
 * How a man is drawn and what is written on him. One builder covers the
 * appearance and the two pieces of text because they are one update; only the
 * text is dispatched coalescing, so a click on a symbol is its own undo entry
 * while a typed letter joins the keystrokes around it (ADR 0012).
 */
export function setPlayerCommand(
  document: PlayDocument,
  playerId: string,
  appearance: PlayerAppearance,
): PlayCommand | undefined {
  const player = document.players.find(({ id }) => id === playerId);
  if (!player) return undefined;
  const next = { ...player, ...appearance };
  if (canonicalStringify(next) === canonicalStringify(player)) return undefined;
  return { kind: "update-player", player: next };
}

export type LabelAppearance = Partial<
  Pick<
    TextLabel,
    "color" | "size" | "box" | "boxColor" | "caps" | "mono" | "unit"
  >
>;

export function setLabelAppearanceCommand(
  document: PlayDocument,
  labelId: string,
  appearance: LabelAppearance,
): PlayCommand | undefined {
  const label = document.labels.find(({ id }) => id === labelId);
  if (!label) return undefined;
  const next = { ...label, ...appearance };
  // "Belongs to the offense" is the absence of a unit, so clearing it has to
  // drop the key rather than store a value the canonical form would keep.
  if (appearance.unit === "offense") delete next.unit;
  if (canonicalStringify(next) === canonicalStringify(label)) return undefined;
  return { kind: "update-label", label: next };
}

/**
 * Picking a meaning sets the whole look with it: a Landmark reads like every
 * other Landmark on every card the Coach prints.
 */
export function applyLabelRoleCommand(
  document: PlayDocument,
  labelId: string,
  role: LabelRole,
): PlayCommand | undefined {
  const label = document.labels.find(({ id }) => id === labelId);
  if (!label) return undefined;
  const preset = labelRolePresets[role];
  return {
    kind: "update-label",
    label: {
      ...label,
      role,
      color: preset.color,
      box: preset.box,
      boxColor: preset.boxColor,
      size: preset.size,
      mono: preset.mono,
      caps: preset.caps,
    },
  };
}
/** Every id a command brings into existence. */
export function insertedEntityIds(command: PlayCommand): readonly string[] {
  const fromPrimitive = (primitive: PrimitivePlayCommand): string[] => {
    switch (primitive.kind) {
      case "insert-players":
        return primitive.players.map(({ item }) => item.id);
      case "insert-paths":
        return primitive.paths.map(({ item }) => item.id);
      case "insert-labels":
        return primitive.labels.map(({ item }) => item.id);
      default:
        return [];
    }
  };
  return command.kind === "batch"
    ? command.commands.flatMap(fromPrimitive)
    : fromPrimitive(command);
}

/**
 * Which line of a route an edit is aimed at, and whether it was narrowed to
 * one segment of it. This is what segment selection is for: the original
 * styles the whole line unless the Coach has picked out a piece.
 */
export interface RouteEditScope {
  readonly branchIndex?: number;
  readonly segmentIndex?: number;
}

function lineOfPath(
  path: MovementPath,
  branchIndex?: number,
): readonly PathPoint[] {
  if (branchIndex === undefined) return path.points;
  return path.branches[branchIndex]?.points ?? path.points;
}

function replaceLine(
  path: MovementPath,
  branchIndex: number | undefined,
  points: PathPoint[],
): MovementPath {
  if (branchIndex === undefined) return { ...path, points };
  return {
    ...path,
    branches: path.branches.map((branch, index) =>
      index === branchIndex ? { ...branch, points } : branch,
    ),
  };
}

function styleOfLine(
  path: MovementPath,
  branchIndex?: number,
): MovementPath["style"] {
  if (branchIndex === undefined) return path.style;
  return path.branches[branchIndex]?.style ?? path.style;
}

function replaceLineStyle(
  path: MovementPath,
  branchIndex: number | undefined,
  style: MovementPath["style"],
): MovementPath {
  if (branchIndex === undefined) return { ...path, style };
  return {
    ...path,
    branches: path.branches.map((branch, index) =>
      index === branchIndex ? { ...branch, style } : branch,
    ),
  };
}

/**
 * Restyles a route. With a segment picked out it overrides just that piece,
 * the way the original let a Coach dot one leg of an otherwise solid route;
 * otherwise it restyles the whole line and clears the piecemeal overrides,
 * so the line goes back to reading as one thing.
 */
export function setRouteStyleCommand(
  document: PlayDocument,
  pathId: string,
  scope: RouteEditScope,
  style: Partial<MovementPath["style"]>,
): PlayCommand | undefined {
  const path = document.paths.find(({ id }) => id === pathId);
  if (!path) return undefined;
  const line = lineOfPath(path, scope.branchIndex);

  if (scope.segmentIndex !== undefined && line[scope.segmentIndex]) {
    const point = line[scope.segmentIndex]!;
    const segmentStyle = {
      ...point.segmentStyle,
      ...(style.line === undefined ? {} : { line: style.line }),
      ...(style.ending === undefined ? {} : { ending: style.ending }),
    };
    // Colour has no per-segment form in the contract, so a colour change is
    // always the whole line's — the original behaves the same way.
    if (style.color !== undefined) {
      const next = replaceLineStyle(path, scope.branchIndex, {
        ...styleOfLine(path, scope.branchIndex),
        color: style.color,
      });
      return canonicalStringify(next) === canonicalStringify(path)
        ? undefined
        : { kind: "update-path", path: next };
    }
    const points = [...line];
    points[scope.segmentIndex] = { ...point, segmentStyle };
    const next = replaceLine(path, scope.branchIndex, points);
    return canonicalStringify(next) === canonicalStringify(path)
      ? undefined
      : { kind: "update-path", path: next };
  }

  const nextStyle = { ...styleOfLine(path, scope.branchIndex), ...style };
  // A whole-line restyle drops the per-segment overrides it supersedes.
  const points = line.map((point) => {
    if (point.segmentStyle === undefined) return point;
    const cleared = { ...point };
    delete cleared.segmentStyle;
    return cleared;
  });
  const next = replaceLineStyle(
    replaceLine(path, scope.branchIndex, points),
    scope.branchIndex,
    nextStyle,
  );
  return canonicalStringify(next) === canonicalStringify(path)
    ? undefined
    : { kind: "update-path", path: next };
}

/**
 * Changing what a line is changes how it reads: the kind carries its own
 * look, and the piecemeal overrides go with the meaning they described.
 */
export function setRouteKindCommand(
  document: PlayDocument,
  pathId: string,
  kind: MovementPath["kind"],
): PlayCommand | undefined {
  const path = document.paths.find(({ id }) => id === pathId);
  if (!path || path.kind === kind) return undefined;
  const points = path.points.map((point) => {
    if (point.segmentStyle === undefined) return point;
    const cleared = { ...point };
    delete cleared.segmentStyle;
    return cleared;
  });
  return {
    kind: "update-path",
    path: {
      ...path,
      kind,
      points,
      style: routeKindStyle(kind, path.style),
    },
  };
}

/** Takes the bends out of the line the Coach is working on. */
export function straightenRouteCommand(
  document: PlayDocument,
  pathId: string,
  scope: RouteEditScope = {},
): PlayCommand | undefined {
  const path = document.paths.find(({ id }) => id === pathId);
  if (!path) return undefined;
  const line = lineOfPath(path, scope.branchIndex);
  if (!line.some(({ control }) => control !== undefined)) return undefined;
  const points = line.map((point) => {
    if (point.control === undefined) return point;
    // Dropped rather than cleared, so a straightened line hashes like one
    // that was never bent.
    const straight = { ...point };
    delete straight.control;
    return straight;
  });
  return {
    kind: "update-path",
    path: replaceLine(path, scope.branchIndex, points),
  };
}

// ---------------------------------------------------------------------------
// What a route is for
// ---------------------------------------------------------------------------

/**
 * The original's own limits on the Coaching fields, kept where the Coach
 * types rather than in the contract: they are what fits on a card, not what
 * the model can hold, and a Play read back from anywhere else must not fail
 * validation for running long.
 */
export const ROUTE_COACHING_LIMITS = Object.freeze({
  assignment: 18,
  conversion: 44,
  coachingNote: 90,
  readOrder: 99,
});

type RouteCoachingText = "conversion" | "coachingNote";

/**
 * Clearing one of these drops the key rather than storing an empty string,
 * so a route the Coach has emptied hashes like one he never wrote on.
 */
function setRouteField(
  document: PlayDocument,
  pathId: string,
  edit: (path: MovementPath) => MovementPath,
): PlayCommand | undefined {
  const path = document.paths.find(({ id }) => id === pathId);
  if (!path) return undefined;
  const next = edit(path);
  if (canonicalStringify(next) === canonicalStringify(path)) return undefined;
  return { kind: "update-path", path: next };
}

export function setRouteCoachingTextCommand(
  document: PlayDocument,
  pathId: string,
  field: RouteCoachingText,
  value: string,
): PlayCommand | undefined {
  const trimmed = value.slice(0, ROUTE_COACHING_LIMITS[field]);
  return setRouteField(document, pathId, (path) => {
    const next = { ...path };
    if (trimmed.trim() === "") delete next[field];
    else next[field] = trimmed;
    return next;
  });
}

/**
 * Where this line falls in the progression. The original takes digits only
 * and two of them, so a read that reaches nothing is no read at all.
 */
export function setRouteReadCommand(
  document: PlayDocument,
  pathId: string,
  readOrder: number | undefined,
): PlayCommand | undefined {
  const clamped =
    readOrder === undefined || !Number.isInteger(readOrder) || readOrder < 1
      ? undefined
      : Math.min(readOrder, ROUTE_COACHING_LIMITS.readOrder);
  return setRouteField(document, pathId, (path) => {
    const next = { ...path };
    if (clamped === undefined) delete next.readOrder;
    else next.readOrder = clamped;
    return next;
  });
}

/**
 * What the man running this line is told to do. The wording belongs to him
 * rather than to the line (ADR 0011), and the movement action naming the
 * route is what says which of his lines it is about. An Assignment the Coach
 * attached to something else is never overwritten: a route with no wording
 * of its own gets a new one.
 */
export function setRouteAssignmentCommand(
  document: PlayDocument,
  pathId: string,
  text: string,
  createId: () => string,
): PlayCommand | undefined {
  const path = document.paths.find(({ id }) => id === pathId);
  if (!path) return undefined;
  const trimmed = text.slice(0, ROUTE_COACHING_LIMITS.assignment);
  const existing = assignmentForPath(document, pathId);

  if (!existing) {
    if (trimmed.trim() === "") return undefined;
    return {
      kind: "insert-assignments",
      assignments: [
        {
          index: document.assignments.length,
          item: {
            id: createId(),
            playerId: path.playerId,
            text: trimmed,
            actions: [{ id: createId(), kind: "movement", pathId }],
          },
        },
      ],
    };
  }

  if (existing.text === trimmed) return undefined;
  // Emptying the words takes the Assignment with them, unless the Coach has
  // put structured actions on it beyond the one naming this route.
  if (trimmed.trim() === "" && existing.actions.length <= 1) {
    return { kind: "remove-assignments", assignmentIds: [existing.id] };
  }
  return {
    kind: "update-assignment",
    assignment: { ...existing, text: trimmed },
  };
}

// ---------------------------------------------------------------------------
// The other lines he could run
// ---------------------------------------------------------------------------

/**
 * The original's offsets for a new stem, each read on the axis it belongs to:
 * 34 canvas pixels across the field, 36 and 60 of depth, and 150 of depth for
 * the plain stem a man with nothing drawn on him gets.
 */
const ALTERNATE_OFFSET = Object.freeze({
  lateralYards: legacyLateralSpanToYards(34),
  depthYards: legacyDepthSpanToYards(36),
  tipYards: legacyDepthSpanToYards(60),
  plainStemYards: legacyDepthSpanToYards(150),
});

/**
 * Held inside the paint. The original also pinned a stem below the top of its
 * fixed canvas; production's frame follows the camera rather than a pixel
 * row, so depth is left to the drawn frame the way a dragged break is.
 */
function insideSidelines(
  document: PlayDocument,
  point: Coordinate,
): Coordinate {
  const half = document.fieldProfile.widthYards / 2;
  // Rounded before held, so a rounded value cannot cross back over the
  // sideline it was just kept inside.
  const rounded = coordinate(point.lateralYards, point.depthYards);
  return {
    lateralYards: Math.max(-half, Math.min(half, rounded.lateralYards)),
    depthYards: rounded.depthYards,
  };
}

/**
 * A second full line off the same stance: a different call the man could be
 * asked to run, drawn dotted so the base stem still reads first. It is shaped
 * like the last line he has, shifted away from the middle of the field and
 * pushed downfield — and it carries only that shape. The bends, the
 * per-segment styles and the endings of the line it came from are left
 * behind, because this is another call rather than a copy of that one.
 */
export function addAlternateRouteCommand(
  document: PlayDocument,
  playerId: string,
  createId: () => string,
): PlayCommand | undefined {
  const player = document.players.find(({ id }) => id === playerId);
  if (!player) return undefined;
  // Exactly where he stands, not a rounding of it: the stem starts on the man.
  const stance = player.position;
  // Every line he already has, not just his routes: any of them means the new
  // one is an alternate to something, which is what makes it dotted.
  const base = document.paths
    .filter(({ playerId: on }) => on === playerId)
    .at(-1);
  // Away from the middle of the field, so the new stem clears the old one on
  // the side he has room.
  const side = player.position.lateralYards < 0 ? -1 : 1;

  const points: PathPoint[] = base
    ? base.points.map((point, index) =>
        index === 0
          ? stance
          : insideSidelines(document, {
              lateralYards:
                point.lateralYards + side * ALTERNATE_OFFSET.lateralYards,
              depthYards: point.depthYards + ALTERNATE_OFFSET.depthYards,
            }),
      )
    : [
        stance,
        coordinate(
          stance.lateralYards,
          stance.depthYards + ALTERNATE_OFFSET.plainStemYards,
        ),
      ];
  if (base) {
    // The tip runs on past where the base one finished. Held again rather
    // than merely rounded: rounding a value that was just kept inside the
    // sideline can put it back over.
    const tip = points.at(-1)!;
    points[points.length - 1] = insideSidelines(document, {
      lateralYards: tip.lateralYards,
      depthYards: tip.depthYards + ALTERNATE_OFFSET.tipYards,
    });
  }

  const style = routeKindStyle("route", {
    line: "solid",
    ending: "arrow",
    color: "ink",
  });
  return {
    kind: "batch",
    label: "Add alternate route",
    commands: [
      {
        kind: "insert-paths",
        paths: [
          {
            index: document.paths.length,
            item: {
              id: createId(),
              kind: "route",
              playerId,
              points,
              branches: [],
              style: { ...style, ...(base ? { line: "dotted" as const } : {}) },
              ...(base ? { variant: "alternate" as const } : {}),
            },
          },
        ],
      },
    ],
  };
}

/**
 * The original's fork: a little over a quarter turn off the leg the break
 * runs along, and never shorter than 70 canvas pixels.
 */
const CHOICE_TURN_RADIANS = Math.PI / 2.6;
const CHOICE_MIN_LENGTH_PX = 70;

/**
 * A choice forks the same stem at the break the Coach picked: one release,
 * then he reads. Where it points is worked out in the original's own canvas,
 * because that is the frame the turn was measured in — an angle taken in
 * yards would come out somewhere else entirely, the field being 1.525 times
 * denser across than it is deep.
 *
 * One divergence, made deliberately: forking at the end of a line, the
 * original turns off a leg of no length and so sends every such fork the same
 * way whatever the route was doing. Here the leg that reaches the break
 * stands in for the one that would leave it, so a fork off the end continues
 * the line it grew from.
 */
export function addRouteChoiceCommand(
  document: PlayDocument,
  pathId: string,
  fromIndex?: number,
): PlayCommand | undefined {
  const path = document.paths.find(({ id }) => id === pathId);
  if (!path || path.points.length < 2) return undefined;
  const last = path.points.length - 1;
  const from = Math.max(0, Math.min(last, fromIndex ?? last));
  const anchor = yardsToLegacyCanvas(path.points[from]!);
  const leg = yardsToLegacyCanvas(
    path.points[from + 1] ?? path.points[from - 1]!,
  );
  // Reaching the break rather than leaving it, the leg runs the other way.
  const reversed = from === last;
  const dx = (leg.x - anchor.x) * (reversed ? -1 : 1);
  const dy = (leg.y - anchor.y) * (reversed ? -1 : 1);
  const angle = Math.atan2(dy, dx) + CHOICE_TURN_RADIANS;
  const length = Math.max(CHOICE_MIN_LENGTH_PX, Math.hypot(dx, dy));

  const branch: PathBranch = {
    fromIndex: from,
    points: [
      insideSidelines(
        document,
        legacyCanvasToYards({
          x: anchor.x + Math.cos(angle) * length,
          y: anchor.y + Math.sin(angle) * length,
        }),
      ),
    ],
    style: { line: "dashed", ending: "arrow", color: "ink" },
  };
  return {
    kind: "batch",
    label: "Add choice",
    commands: [
      {
        kind: "update-path",
        path: { ...path, branches: [...path.branches, branch] },
      },
    ],
  };
}

export function removeRouteChoiceCommand(
  document: PlayDocument,
  pathId: string,
  branchIndex: number,
): PlayCommand | undefined {
  const path = document.paths.find(({ id }) => id === pathId);
  if (!path || !path.branches[branchIndex]) return undefined;
  return {
    kind: "batch",
    label: "Remove choice",
    commands: [
      {
        kind: "update-path",
        path: {
          ...path,
          branches: path.branches.filter((_, index) => index !== branchIndex),
        },
      },
    ],
  };
}

/**
 * Reflects a point, and whatever bend it carries, about a line running
 * downfield. Nothing is rounded on the way through, the way the domain's own
 * mirror leaves the arithmetic exact: turning a line twice has to give back
 * the line, not a rounding of it.
 */
function reflectPoint(point: PathPoint, axisLateralYards: number): PathPoint {
  const across = (value: number) => 2 * axisLateralYards - value;
  return {
    ...point,
    lateralYards: across(point.lateralYards),
    ...(point.control === undefined
      ? {}
      : {
          control: {
            lateralYards: across(point.control.lateralYards),
            depthYards: point.control.depthYards,
          },
        }),
  };
}

function reflectPath(
  path: MovementPath,
  axisLateralYards: number,
): MovementPath {
  return {
    ...path,
    points: path.points.map((point) => reflectPoint(point, axisLateralYards)),
    branches: path.branches.map((branch) => ({
      ...branch,
      points: branch.points.map((point) =>
        reflectPoint(point, axisLateralYards),
      ),
    })),
  };
}

/**
 * Turns one line the other way without redrawing it. The axis is where the
 * line starts rather than where the man stands, which is the original's own
 * choice and the one that leaves an unattached-looking line hinged on itself.
 */
export function flipRouteCommand(
  document: PlayDocument,
  pathId: string,
): PlayCommand | undefined {
  const path = document.paths.find(({ id }) => id === pathId);
  if (!path || path.points.length === 0) return undefined;
  const next = reflectPath(path, path.points[0]!.lateralYards);
  if (canonicalStringify(next) === canonicalStringify(path)) return undefined;
  return {
    kind: "batch",
    label: "Flip route",
    commands: [{ kind: "update-path", path: next }],
  };
}

/** Turns every line a man has about his own stance, in one entry. */
export function flipPlayerLinesCommand(
  document: PlayDocument,
  playerId: string,
): PlayCommand | undefined {
  const player = document.players.find(({ id }) => id === playerId);
  if (!player) return undefined;
  const commands = document.paths
    .filter(({ playerId: on }) => on === playerId)
    .map((path) => ({
      path,
      next: reflectPath(path, player.position.lateralYards),
    }))
    .filter(
      ({ next, path }) => canonicalStringify(next) !== canonicalStringify(path),
    )
    .map(({ next }): PrimitivePlayCommand => ({
      kind: "update-path",
      path: next,
    }));
  if (commands.length === 0) return undefined;
  return { kind: "batch", label: "Flip his lines", commands };
}

// ---------------------------------------------------------------------------
// Which of them draws on top
// ---------------------------------------------------------------------------

/**
 * One step through the layer. The original swaps neighbours and skips a
 * neighbour that is also picked, so a group of lines keeps its own order as it
 * travels; moving forward walks the list from the back, so two picked lines
 * cannot leapfrog one another on the way.
 */
function reorderLayer<Item extends { readonly id: string }>(
  items: readonly Item[],
  chosen: ReadonlySet<string>,
  direction: 1 | -1,
): Item[] {
  const next = [...items];
  const indices = next.flatMap((item, index) =>
    chosen.has(item.id) ? [index] : [],
  );
  for (const index of direction > 0 ? [...indices].reverse() : indices) {
    const neighbour = index + direction;
    if (neighbour < 0 || neighbour >= next.length) continue;
    if (chosen.has(next[neighbour]!.id)) continue;
    [next[index], next[neighbour]] = [next[neighbour]!, next[index]!];
  }
  return next;
}

/**
 * Brings what the Coach picked forward, or sends it back. Players are not in
 * this: they draw above every line whatever order they are stored in, which is
 * why the original reorders only routes and text.
 */
export function reorderSelectionCommand(
  document: PlayDocument,
  selection: readonly FieldItemRef[],
  direction: 1 | -1,
): PlayCommand | undefined {
  const pathIds = new Set(
    selection.filter(({ kind }) => kind === "path").map(({ id }) => id),
  );
  const labelIds = new Set(
    selection.filter(({ kind }) => kind === "label").map(({ id }) => id),
  );
  const paths =
    pathIds.size > 0
      ? reorderLayer(document.paths, pathIds, direction)
      : document.paths;
  const labels =
    labelIds.size > 0
      ? reorderLayer(document.labels, labelIds, direction)
      : document.labels;
  const order = (items: readonly { readonly id: string }[]) =>
    items.map(({ id }) => id).join(" ");
  if (
    order(paths) === order(document.paths) &&
    order(labels) === order(document.labels)
  ) {
    return undefined;
  }
  // The domain already has an answer for a layer whose order changed: replace
  // it wholesale rather than guess at a move script. Expressing the reorder as
  // an ordinary difference reuses that answer instead of inventing a second.
  return diffPlayDocuments(
    document,
    { ...document, paths, labels },
    direction > 0 ? "Bring forward" : "Send backward",
  );
}

// ---------------------------------------------------------------------------
// Formations
// ---------------------------------------------------------------------------

/**
 * Putting the men in a set. The domain works out who goes where and carries
 * what belongs to each man; expressing the result as an ordinary difference
 * makes it one hash-guarded transaction and one undo entry, whatever it
 * touched — men moved, routes carried, notes taken along, men added.
 */
export function applyFormationCommand(
  document: PlayDocument,
  formation: Formation,
  createId: (prefix: string) => string,
): { readonly command?: PlayCommand; readonly result: RealignmentResult } {
  const result = applyFormation(document, formation, createId);
  const command = diffPlayDocuments(
    document,
    result.play,
    `Applied ${formation.name}`,
  );
  return {
    result,
    ...(command.commands.length > 0 ? { command } : {}),
  };
}

/**
 * Putting a call on the field. As with a set, the domain works out what goes
 * and what arrives, and expressing the result as an ordinary difference makes
 * the whole call — the men, their drops, their blitzes — one transaction and
 * one press of undo.
 */
export function applyDefensiveCallCommand(
  document: PlayDocument,
  call: DefensiveCall,
  createId: (prefix: string) => string,
  options?: { readonly withAssignments?: boolean },
): {
  readonly command?: PlayCommand;
  readonly result: DefensiveCallResult;
} {
  const result = applyDefensiveCall(document, call, createId, options);
  const command = diffPlayDocuments(
    document,
    result.play,
    `Applied ${call.formation.name}`,
  );
  return {
    result,
    ...(command.commands.length > 0 ? { command } : {}),
  };
}

// ---------------------------------------------------------------------------
// The route tree, and the concepts drawn out of it
// ---------------------------------------------------------------------------

/** Held inside the paint, the way a drawn or realigned line is. */
function insidePoints(
  document: PlayDocument,
  points: readonly PathPoint[],
): PathPoint[] {
  return points.map((point) => ({
    ...point,
    ...insideSidelines(document, point),
    ...(point.control
      ? { control: insideSidelines(document, point.control) }
      : {}),
  }));
}

/**
 * Reshaping a line to a call off the route tree. Replacing redraws it from the
 * man's own stance, so the same call lands correctly on a variation that lines
 * him up somewhere else; continuing turns the end of what he has into a real
 * break and runs the shape on from there, which is no longer any one call and
 * so stops being named as one.
 */
export function applyRoutePresetCommand(
  document: PlayDocument,
  pathId: string,
  presetKey: string,
  mode: "replace" | "continue" = "replace",
): PlayCommand | undefined {
  const path = document.paths.find(({ id }) => id === pathId);
  if (!path) return undefined;
  const player = document.players.find(({ id }) => id === path.playerId);
  if (!player) return undefined;

  const continuing = mode === "continue" && path.points.length > 1;
  const anchor = continuing ? path.points.at(-1)! : player.position;
  const shape = routePresetPoints(
    presetKey,
    anchor,
    handednessOf(player.position),
  );
  if (!shape) return undefined;
  // The anchor is left exactly as it is: a man already stands inside the
  // paint, and a break he already has was held there when it was made, so
  // rounding either would only move the line off what it starts on.
  const drawn = [anchor, ...insidePoints(document, shape.slice(1))];

  const next: MovementPath = continuing
    ? {
        ...path,
        points: [...path.points, ...drawn.slice(1)],
        // No longer one call off the tree, so no longer named as one.
        preset: undefined,
      }
    : {
        ...path,
        points: drawn,
        preset: presetKey,
        // A fork hangs off a break, and there may be fewer breaks than before.
        branches: path.branches.map((branch) => ({
          ...branch,
          fromIndex: Math.min(branch.fromIndex, drawn.length - 1),
        })),
      };
  if (next.preset === undefined) delete (next as { preset?: string }).preset;

  return canonicalStringify(next) === canonicalStringify(path)
    ? undefined
    : { kind: "update-path", path: next };
}

/**
 * Who a concept is about: the men who could be given a job in one. A defender
 * is on the other side of it and a lineman blocks, so neither is a target —
 * and being a lineman is read off where a man stands rather than off the
 * position he was given, which is what keeps an extra tackle out of the
 * distribution even though a sixth man on the line reads as a slot.
 *
 * Whether the quarterback has a job is left to the concept: none of the ten
 * gives him one, and a screen that did would be naming him deliberately.
 */
export function conceptTargets(
  document: PlayDocument,
  concept: ConceptDefinition,
): readonly { readonly player: Player; readonly role: string }[] {
  const eligible = document.players.filter(
    (player) => player.unit !== "defense" && !isLineman(player),
  );
  const roles = assignRoles(eligible);
  return eligible.flatMap((player, index) => {
    const role = roles[index];
    if (!role || !concept.roles.includes(role)) return [];
    return [{ player, role }];
  });
}

/** Whether every man a concept is about is already running his job in it. */
export function conceptIsOn(
  document: PlayDocument,
  concept: ConceptDefinition,
): boolean {
  const targets = conceptTargets(document, concept);
  if (targets.length === 0) return false;
  return targets.every(({ player }) =>
    document.paths.some(
      (path) =>
        path.playerId === player.id &&
        path.kind === "route" &&
        path.concept === concept.key,
    ),
  );
}

export interface ConceptResult {
  readonly command?: PlayCommand;
  /** How many men were given a job, or had one taken away. */
  readonly count: number;
  readonly cleared: boolean;
}

/**
 * Drawing a concept. It is a distribution rather than a route: every man it
 * is about is given his job by the position he plays, mirrored to the side he
 * lines up on. Asking for the one already on takes it off again, which is how
 * the original lets the same button put it up and pull it down.
 */
export function applyConceptCommand(
  document: PlayDocument,
  concept: ConceptDefinition,
  createId: (prefix: string) => string,
): ConceptResult {
  const targets = conceptTargets(document, concept);
  if (targets.length === 0) return { count: 0, cleared: false };

  const owners = new Set(targets.map(({ player }) => player.id));
  const replaced = document.paths.filter(
    (path) => owners.has(path.playerId) && path.kind === "route",
  );
  // Removing them through the domain's own delete carries any note pinned to
  // them and unhooks their Assignments, rather than leaving either behind.
  const deleted =
    replaced.length > 0
      ? applyPlayCommand(
          document,
          deletePathsCommand(
            document,
            replaced.map(({ id }) => id),
          ),
        )
      : document;
  // Deleting a line a Coach drew leaves his wording for that man standing,
  // because the words are his and the line was only what they were about
  // (ADR 0011). A concept is not that: it says what each of these men does,
  // so the words it is replacing go with the line they described — which is
  // what the original did by keeping them on the line in the first place.
  const cleared: PlayDocument = {
    ...deleted,
    assignments: deleted.assignments.filter(
      (assignment) =>
        assignment.actions.length > 0 || !owners.has(assignment.playerId),
    ),
  };

  if (conceptIsOn(document, concept)) {
    return {
      count: targets.length,
      cleared: true,
      command: diffPlayDocuments(
        document,
        cleared,
        `${concept.name} — cleared`,
      ),
    };
  }

  const paths: MovementPath[] = [];
  const assignments: PlayDocument["assignments"][number][] = [];
  for (const { player, role } of targets) {
    const job = concept.jobFor(role, player.position);
    if (!job) continue;
    const pathId = createId("path");
    paths.push({
      id: pathId,
      kind: "route",
      playerId: player.id,
      points: [player.position, ...insidePoints(cleared, job.points.slice(1))],
      branches: [],
      style: {
        ...routeKindStyle("route", {
          line: "solid",
          ending: job.ending,
          color: "ink",
        }),
        ending: job.ending,
      },
      ...(job.preset === undefined ? {} : { preset: job.preset }),
      concept: concept.key,
    });
    assignments.push({
      id: createId("assignment"),
      playerId: player.id,
      text: job.assignment,
      actions: [{ id: createId("action"), kind: "movement", pathId }],
    });
  }

  return {
    count: paths.length,
    cleared: false,
    command: diffPlayDocuments(
      document,
      {
        ...cleared,
        paths: [...cleared.paths, ...paths],
        assignments: [...cleared.assignments, ...assignments],
      },
      `Applied ${concept.name}`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Blocking, and what a defender is asked to do
// ---------------------------------------------------------------------------

function presetPath(
  document: PlayDocument,
  player: Player,
  preset: LinePreset,
  id: string,
): MovementPath {
  const drawn = preset.pointsFrom(player.position);
  return {
    id,
    kind: preset.kind,
    playerId: player.id,
    // The stance itself is left exactly as it is; the rest is held in the paint.
    points: [player.position, ...insidePoints(document, drawn.slice(1))],
    branches: [],
    style: {
      ...routeKindStyle(preset.kind, {
        line: preset.style.line,
        ending: preset.style.ending,
        color: preset.kind === "block" ? "ink" : "blue",
      }),
      line: preset.style.line,
      ending: preset.style.ending,
    },
    ...(preset.area
      ? {
          coverageArea: {
            type: preset.area.type,
            radiusLateralYards: preset.area.radiusLateralYards,
            radiusDepthYards: preset.area.radiusDepthYards,
          },
        }
      : {}),
    preset: preset.key,
  };
}

/** Which men a call of this kind replaces the lines of. */
const replacedKindsFor = (kind: LinePreset["kind"]): ReadonlySet<string> =>
  kind === "block" ? new Set(["block"]) : defensiveLineKinds;

/**
 * A call put on the men given. Asking for the one they are all already
 * running takes it off, which is how the same button puts a call on the whole
 * line and pulls it off again. Each man's shape is drawn from where he
 * stands, so one call keeps every one of them his own alignment.
 */
export function applyLinePresetCommand(
  document: PlayDocument,
  playerIds: readonly string[],
  presetKey: string,
  createId: (prefix: string) => string,
): PlayCommand | undefined {
  const preset = linePresetByKey(presetKey);
  if (!preset) return undefined;
  const players = document.players.filter(({ id }) => playerIds.includes(id));
  if (players.length === 0) return undefined;

  const owners = new Set(players.map(({ id }) => id));
  const kinds = replacedKindsFor(preset.kind);
  const already = players.every(({ id }) =>
    document.paths.some(
      (path) => path.playerId === id && path.preset === presetKey,
    ),
  );

  const replaced = document.paths.filter(
    (path) => owners.has(path.playerId) && kinds.has(path.kind),
  );
  const cleared =
    replaced.length > 0
      ? applyPlayCommand(
          document,
          deletePathsCommand(
            document,
            replaced.map(({ id }) => id),
          ),
        )
      : document;

  const next: PlayDocument = already
    ? cleared
    : {
        ...cleared,
        paths: [
          ...cleared.paths,
          ...players.map((player) =>
            presetPath(cleared, player, preset, createId("path")),
          ),
        ],
      };

  const command = diffPlayDocuments(
    document,
    next,
    already ? `${preset.name} — off` : `Applied ${preset.name}`,
  );
  return command.commands.length > 0 ? command : undefined;
}

/** Who a line call is about: the men on the ball, whose job is to block. */
export function linemenOf(document: PlayDocument): readonly Player[] {
  return document.players.filter(
    (player) => player.unit !== "defense" && isLineman(player),
  );
}

/** Whether every man given is already running this call. */
export function linePresetIsOn(
  document: PlayDocument,
  playerIds: readonly string[],
  presetKey: string,
): boolean {
  if (playerIds.length === 0) return false;
  return playerIds.every((playerId) =>
    document.paths.some(
      (path) => path.playerId === playerId && path.preset === presetKey,
    ),
  );
}

/**
 * Spotting the ball. The whole Play travels with it, so this is expressed as
 * an ordinary difference and lands as one transaction and one undo entry.
 */
export function spotBallCommand(
  document: PlayDocument,
  spot: BallSpot,
): { readonly command?: PlayCommand; readonly tightened: boolean } {
  const { play, tightened } = spotBall(document, spot);
  const command = diffPlayDocuments(document, play, ballSpotNames[spot]);
  return {
    tightened,
    ...(command.commands.length > 0 ? { command } : {}),
  };
}

// ---------------------------------------------------------------------------
// The verbs the palette names
// ---------------------------------------------------------------------------

/**
 * Flipping the strength: the mirror the domain already does, and with it the
 * language, so a card that read STRONG RIGHT does not end up describing the
 * picture wrongly. A set the Coach is recognisably in flips through its own
 * named counterpart rather than by reflection alone, which is what keeps an
 * unbalanced alignment and its relationship to the hash coming out right.
 */
export function flipStrengthCommand(
  document: PlayDocument,
  catalogue: readonly Formation[] = stockFormations,
): PlayCommand | undefined {
  const reflected = mirrorPlayGeometry(document);
  const worded: PlayDocument = {
    ...reflected,
    players: reflected.players.map((player) => ({
      ...player,
      label: flippedPlayerLabels[player.label] ?? player.label,
      sublabel: flipStrengthWords(player.sublabel),
    })),
    paths: reflected.paths.map((path) => ({
      ...path,
      ...(path.conversion === undefined
        ? {}
        : { conversion: flipStrengthWords(path.conversion) }),
      ...(path.coachingNote === undefined
        ? {}
        : { coachingNote: flipStrengthWords(path.coachingNote) }),
    })),
    assignments: reflected.assignments.map((assignment) => ({
      ...assignment,
      text: flipStrengthWords(assignment.text),
    })),
    labels: reflected.labels.map((label) => ({
      ...label,
      text: flipStrengthWords(label.text),
    })),
  };

  const read = recognizeFormation(document, catalogue);
  const counterpart =
    read.confidence >= RECOGNITION_THRESHOLD &&
    read.formation?.mirrorFormationId
      ? catalogue.find(({ id }) => id === read.formation!.mirrorFormationId)
      : undefined;
  const next = counterpart
    ? applyFormation(worded, counterpart, () => "", {
        addMissingPlayers: false,
      }).play
    : worded;

  const command = diffPlayDocuments(document, next, "Flip strength");
  return command.commands.length > 0 ? command : undefined;
}

export type PlayerAlignment = "depth" | "splits";

/**
 * Lining men up with one another: all to the same depth, or evenly spread
 * between the two widest. Each man's lines travel with him, the way they do
 * when he is dragged.
 */
export function alignPlayersCommand(
  document: PlayDocument,
  playerIds: readonly string[],
  alignment: PlayerAlignment,
): PlayCommand | undefined {
  const chosen = document.players.filter(({ id }) => playerIds.includes(id));
  if (chosen.length < 2) return undefined;

  const moves = new Map<string, Coordinate>();
  if (alignment === "depth") {
    const depthYards =
      chosen.reduce((total, { position }) => total + position.depthYards, 0) /
      chosen.length;
    for (const player of chosen) {
      moves.set(player.id, {
        lateralYards: 0,
        depthYards: depthYards - player.position.depthYards,
      });
    }
  } else {
    const sorted = [...chosen].sort(
      (left, right) => left.position.lateralYards - right.position.lateralYards,
    );
    const first = sorted[0]!.position.lateralYards;
    const step =
      (sorted.at(-1)!.position.lateralYards - first) / (sorted.length - 1);
    for (const [index, player] of sorted.entries()) {
      moves.set(player.id, {
        lateralYards: first + index * step - player.position.lateralYards,
        depthYards: 0,
      });
    }
  }
  return buildTranslationCommand(document, moves, "Align players");
}

/** Moves the men given by the amounts given, and their lines with them. */
function buildTranslationCommand(
  document: PlayDocument,
  moves: ReadonlyMap<string, Coordinate>,
  label: string,
): PlayCommand | undefined {
  const shift = (point: Coordinate, by: Coordinate): Coordinate => ({
    lateralYards: point.lateralYards + by.lateralYards,
    depthYards: point.depthYards + by.depthYards,
  });
  const next: PlayDocument = {
    ...document,
    players: document.players.map((player) => {
      const by = moves.get(player.id);
      return by ? { ...player, position: shift(player.position, by) } : player;
    }),
    paths: document.paths.map((path) => {
      const by = moves.get(path.playerId);
      if (!by) return path;
      const move = (point: PathPoint): PathPoint => ({
        ...point,
        ...shift(point, by),
        ...(point.control ? { control: shift(point.control, by) } : {}),
      });
      return {
        ...path,
        points: path.points.map(move),
        branches: path.branches.map((branch) => ({
          ...branch,
          points: branch.points.map(move),
        })),
      };
    }),
  };
  const command = diffPlayDocuments(document, next, label);
  return command.commands.length > 0 ? command : undefined;
}

/**
 * Tying things together so they move as one. What the Coach picked becomes a
 * group; picking any one of them afterwards picks the rest, which is what a
 * group is for.
 */
export function groupSelectionCommand(
  document: PlayDocument,
  selection: readonly FieldItemRef[],
  createId: (prefix: string) => string,
): PlayCommand | undefined {
  if (selection.length < 2) return undefined;
  const group = createId("group");
  const picked = (kind: FieldItemRef["kind"], id: string) =>
    selection.some((item) => item.kind === kind && item.id === id);
  const next: PlayDocument = {
    ...document,
    players: document.players.map((player) =>
      picked("player", player.id) ? { ...player, group } : player,
    ),
    paths: document.paths.map((path) =>
      picked("path", path.id) ? { ...path, group } : path,
    ),
    labels: document.labels.map((label) =>
      picked("label", label.id) ? { ...label, group } : label,
    ),
  };
  const command = diffPlayDocuments(document, next, "Group");
  return command.commands.length > 0 ? command : undefined;
}

/** Which groups the things picked belong to. */
function groupsIn(
  document: PlayDocument,
  selection: readonly FieldItemRef[],
): Set<string> {
  const groups = new Set<string>();
  for (const item of selection) {
    const owner =
      item.kind === "player"
        ? document.players.find(({ id }) => id === item.id)
        : item.kind === "path"
          ? document.paths.find(({ id }) => id === item.id)
          : document.labels.find(({ id }) => id === item.id);
    if (owner?.group) groups.add(owner.group);
  }
  return groups;
}

export function ungroupSelectionCommand(
  document: PlayDocument,
  selection: readonly FieldItemRef[],
): PlayCommand | undefined {
  const groups = groupsIn(document, selection);
  if (groups.size === 0) return undefined;
  const loosen = <Item extends { readonly group?: string }>(
    item: Item,
  ): Item =>
    item.group && groups.has(item.group)
      ? (Object.fromEntries(
          Object.entries(item).filter(([key]) => key !== "group"),
        ) as Item)
      : item;
  const command = diffPlayDocuments(
    document,
    {
      ...document,
      players: document.players.map(loosen),
      paths: document.paths.map(loosen),
      labels: document.labels.map(loosen),
    },
    "Ungroup",
  );
  return command.commands.length > 0 ? command : undefined;
}

/**
 * Everything that travels with what the Coach picked. Picking one member of a
 * group picks the whole of it, which is the only thing a group does.
 */
export function expandSelectionToGroups(
  document: PlayDocument,
  selection: readonly FieldItemRef[],
): readonly FieldItemRef[] {
  const groups = groupsIn(document, selection);
  if (groups.size === 0) return selection;
  const out = [...selection];
  const add = (kind: FieldItemRef["kind"], id: string, group?: string) => {
    if (!group || !groups.has(group)) return;
    if (out.some((item) => item.kind === kind && item.id === id)) return;
    out.push({ kind, id });
  };
  for (const player of document.players) add("player", player.id, player.group);
  for (const path of document.paths) add("path", path.id, path.group);
  for (const label of document.labels) add("label", label.id, label.group);
  return out;
}

/**
 * Running a line the other way. A bend belongs to the break it arrives at, so
 * reversing moves each one back a place; the forks are dropped, because a
 * fork hangs off a break measured from the start and there is a new start.
 *
 * The original also detaches the line from the man running it. Production's
 * schema requires a Player on every line, so it stays his — the same
 * divergence already recorded where a line is pasted without him.
 */
export function reverseRouteCommand(
  document: PlayDocument,
  pathId: string,
): PlayCommand | undefined {
  const path = document.paths.find(({ id }) => id === pathId);
  if (!path || path.points.length < 2) return undefined;
  const controls = path.points.map(({ control }) => control);
  const reversed = path.points
    .slice()
    .reverse()
    .map((point) => {
      const { control, ...rest } = point;
      void control;
      return rest;
    });
  const points = reversed.map((point, index) => {
    const control = controls[path.points.length - index];
    return control ? { ...point, control } : point;
  });
  return {
    kind: "update-path",
    path: { ...path, points, branches: [] },
  };
}

/**
 * How the number reads on the card: to the nearest half yard, and written the
 * shortest way that says it — twelve rather than twelve point zero. The
 * original tested for a whole number and formatted the two cases separately,
 * which for a half-yard value is the same string either way.
 */
export function depthLabelText(depthYards: number): string {
  return `${Math.round(depthYards * 2) / 2} Yds`;
}

/**
 * A depth marker pinned to one leg of a line, so it says how far downfield
 * the break is and keeps saying it when the line is moved.
 */
export function addDepthLabelCommand(
  document: PlayDocument,
  pathId: string,
  segmentIndex: number | undefined,
  createId: (prefix: string) => string,
): PlayCommand | undefined {
  const path = document.paths.find(({ id }) => id === pathId);
  if (!path || path.points.length < 2) return undefined;
  const last = path.points.length - 1;
  const at = Math.min(Math.max(1, segmentIndex ?? last), last);
  const preset = labelRolePresets.landmark;
  return {
    kind: "insert-labels",
    labels: [
      {
        index: document.labels.length,
        item: {
          id: createId("label"),
          position: path.points[at]!,
          text: depthLabelText(path.points[at]!.depthYards),
          color: preset.color,
          size: preset.size,
          box: preset.box,
          boxColor: preset.boxColor,
          mono: preset.mono,
          role: "landmark",
          unit: "offense",
          binding: {
            pathId: path.id,
            segmentIndex: at - 1,
            progress: 0.55,
            offset: DEPTH_LABEL_OFFSET,
          },
        },
      },
    ],
  };
}

/** Where the marker sits beside its break: the original's 22 and 6 pixels. */
const DEPTH_LABEL_OFFSET = Object.freeze({
  lateralYards: legacyLateralSpanToYards(22),
  depthYards: legacyDepthSpanToYards(6),
});
