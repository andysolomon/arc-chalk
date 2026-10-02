import {
  OFF_THE_LINE_YARDS,
  ON_THE_LINE_TOLERANCE_YARDS,
  type Coordinate,
  type FieldProfile,
} from "@chalk/domain";

export type SnapGrid = 0.25 | 0.5 | 1 | "off";

export interface SnapScreenScale {
  readonly lateralPixelsPerYard: number;
  readonly depthPixelsPerYard: number;
}

export interface SnapSettings {
  readonly enabled: boolean;
  readonly grid: SnapGrid;
  readonly activationThresholdPx?: number;
}

export interface SnapReference {
  readonly id: string;
  readonly kind: "player" | "route-node";
  readonly position: Coordinate;
  readonly label?: string;
}

export type SnapGuideSource =
  | "ball"
  | "line-of-scrimmage"
  | "hash"
  | "sideline"
  | "yard-mark"
  | "line"
  | "alignment"
  | "equal-split"
  | "equal-spacing"
  | "gap"
  | "grid"
  | "direction";

/** One measured space between two men, from the left one to the right. */
export interface SnapSpan {
  readonly from: Coordinate;
  readonly to: Coordinate;
}

export interface AxisSnapGuide {
  readonly kind: "axis";
  readonly axis: "lateral" | "depth";
  readonly valueYards: number;
  readonly source: Exclude<SnapGuideSource, "direction">;
  readonly label: string;
  readonly strong: boolean;
  readonly targetId?: string;
  /**
   * Where the men it lines the point up with stand, the point among them,
   * in the order they stand along the guide — so the shell can mark each
   * one, the way a design tool marks what a dragged shape is aligned with.
   */
  readonly members?: readonly Coordinate[];
  /** The equal spaces an even split is measured by, the point's own among them. */
  readonly spans?: readonly SnapSpan[];
  readonly spacingYards?: number;
}

export interface DirectionSnapGuide {
  readonly kind: "direction";
  readonly source: "direction";
  readonly origin: Coordinate;
  readonly endpoint: Coordinate;
  readonly angleDegrees: number;
  readonly label: string;
  readonly strong: boolean;
}

export type SnapGuide = AxisSnapGuide | DirectionSnapGuide;

/**
 * The offense's line, for one of the offense being moved (ADR 0073): level
 * with the snapper is on the line, and a step under it is off the line.
 */
export interface SnapLine {
  readonly depthYards: number;
}

/** A gap between men on the line, which a break in the box lands in. */
export interface SnapGap {
  readonly lateralYards: number;
  readonly name: string;
}

export interface SnapPositionRequest {
  /** The relevant drag anchor. Group members are translated by its snap delta. */
  readonly point: Coordinate;
  readonly movingPoints?: readonly Coordinate[];
  readonly fieldProfile: FieldProfile;
  readonly references?: readonly SnapReference[];
  /**
   * The point is in the tackle box: these gaps claim it across the field
   * ahead of everything else, and the ball does not, because the ball is
   * where the centre stands (issue #164).
   */
  readonly gaps?: readonly SnapGap[];
  readonly line?: SnapLine;
  readonly excludeReferenceIds?: readonly string[];
  readonly screenScale: SnapScreenScale;
  readonly settings: SnapSettings;
}

export interface SnapPositionResult {
  readonly point: Coordinate;
  readonly translation: Coordinate;
  readonly movingPoints: readonly Coordinate[];
  readonly guides: readonly AxisSnapGuide[];
  readonly snapped: boolean;
}

export interface SnapRouteEndpointRequest {
  readonly origin: Coordinate;
  readonly point: Coordinate;
  readonly mode: "off" | "suggest" | "constrain";
  readonly screenScale: SnapScreenScale;
  readonly activationThresholdPx?: number;
}

export interface SnapRouteEndpointResult {
  readonly point: Coordinate;
  readonly guide?: DirectionSnapGuide;
  readonly snapped: boolean;
}

interface AxisCandidate {
  readonly axis: AxisSnapGuide["axis"];
  readonly valueYards: number;
  readonly priority: number;
  readonly distancePx: number;
  readonly source: AxisSnapGuide["source"];
  readonly label: string;
  readonly strong: boolean;
  readonly targetId?: string;
  /** Whether the guide marks the men standing on its value. */
  readonly marksMembers?: boolean;
  readonly spacingYards?: number;
  readonly spans?: (point: Coordinate) => readonly SnapSpan[];
}

const DEFAULT_ACTIVATION_THRESHOLD_PX = 8;
/**
 * How far a gap reaches for a break. Wider than the other landmarks, so a
 * break aimed at a hole finds it, and short of half the width of a man's
 * split at the default zoom, so a gap never reaches past the man beside it.
 */
const GAP_ACTIVATION_THRESHOLD_PX = 12;
const MAX_SNAP_REFERENCES = 2_048;
const PRECISION_DIGITS = 9;
/** Men this close in depth to the point stand in its row, for even splits. */
const ROW_TOLERANCE_YARDS = 0.75;
/** Two splits this close are the same split. */
const SPLIT_MATCH_YARDS = 0.01;
/** Two men this close on an axis stand on the same guide. */
const MEMBER_TOLERANCE_YARDS = 1e-6;
const DIRECTION_INCREMENT_DEGREES = 45;
const DIRECTION_COUNT = 360 / DIRECTION_INCREMENT_DEGREES;

/**
 * A yard mark is every yard, so one is always within reach of a drag; ranked
 * with the hashes, above the men, it kept anyone from lining up level with a
 * teammate. It ranks under them, as a grid does (ADR 0073).
 */
const PRIORITY = Object.freeze({
  footballOrigin: 0,
  fieldLandmark: 1,
  diagramAlignment: 2,
  yardMark: 3,
  grid: 4,
});

function rounded(value: number): number {
  const result = Number(value.toFixed(PRECISION_DIGITS));
  return Object.is(result, -0) ? 0 : result;
}

function coordinate(lateralYards: number, depthYards: number): Coordinate {
  return {
    lateralYards: rounded(lateralYards),
    depthYards: rounded(depthYards),
  };
}

function assertFiniteCoordinate(value: Coordinate, name: string): void {
  if (
    !Number.isFinite(value.lateralYards) ||
    !Number.isFinite(value.depthYards)
  ) {
    throw new RangeError(`${name} must contain finite yard coordinates.`);
  }
}

function activationThreshold(settings: {
  readonly activationThresholdPx?: number;
}): number {
  const threshold =
    settings.activationThresholdPx ?? DEFAULT_ACTIVATION_THRESHOLD_PX;
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError("The snap activation threshold must be non-negative.");
  }
  return threshold;
}

function assertScreenScale(scale: SnapScreenScale): void {
  if (
    !Number.isFinite(scale.lateralPixelsPerYard) ||
    scale.lateralPixelsPerYard <= 0 ||
    !Number.isFinite(scale.depthPixelsPerYard) ||
    scale.depthPixelsPerYard <= 0
  ) {
    throw new RangeError(
      "Snap screen scale must use positive pixels per yard.",
    );
  }
}

function nearestMultiple(value: number, interval: number): number {
  return rounded(Math.round(value / interval) * interval);
}

function isMultiple(value: number, interval: number): boolean {
  const quotient = value / interval;
  return Math.abs(quotient - Math.round(quotient)) <= 1e-9;
}

function formatYards(value: number): string {
  const magnitude = Math.abs(rounded(value));
  const unit = magnitude === 1 ? "yard" : "yards";
  return `${magnitude} ${unit}`;
}

function depthLabel(depthYards: number): string {
  if (depthYards === 0) return "Line of scrimmage";
  return depthYards > 0
    ? formatYards(depthYards)
    : `${formatYards(depthYards)} behind`;
}

function axisDistancePx(
  axis: AxisSnapGuide["axis"],
  from: number,
  to: number,
  scale: SnapScreenScale,
): number {
  const pixelsPerYard =
    axis === "lateral" ? scale.lateralPixelsPerYard : scale.depthPixelsPerYard;
  return Math.abs(to - from) * pixelsPerYard;
}

function compareCandidates(left: AxisCandidate, right: AxisCandidate): number {
  return (
    left.priority - right.priority ||
    left.distancePx - right.distancePx ||
    left.source.localeCompare(right.source) ||
    left.valueYards - right.valueYards ||
    (left.targetId ?? "").localeCompare(right.targetId ?? "")
  );
}

function addCandidate(
  candidates: AxisCandidate[],
  candidate: Omit<AxisCandidate, "distancePx">,
  point: Coordinate,
  scale: SnapScreenScale,
  thresholdPx: number,
): void {
  const from =
    candidate.axis === "lateral" ? point.lateralYards : point.depthYards;
  const distancePx = axisDistancePx(
    candidate.axis,
    from,
    candidate.valueYards,
    scale,
  );
  if (distancePx <= thresholdPx) {
    candidates.push({ ...candidate, distancePx });
  }
}

function referenceName(reference: SnapReference): string {
  if (reference.label?.trim()) return reference.label.trim();
  return reference.kind === "player" ? "player" : "route node";
}

function compareReferencePosition(
  left: SnapReference,
  right: SnapReference,
): number {
  return (
    left.position.lateralYards - right.position.lateralYards ||
    left.id.localeCompare(right.id)
  );
}

function fieldCandidates(
  request: SnapPositionRequest,
  candidates: AxisCandidate[],
  thresholdPx: number,
): void {
  const { fieldProfile, point, screenScale } = request;
  const halfWidth = fieldProfile.widthYards / 2;
  const hashFromMidfield = halfWidth - fieldProfile.hashInsetYards;

  if (request.gaps === undefined) {
    addCandidate(
      candidates,
      {
        axis: "lateral",
        valueYards: 0,
        priority: PRIORITY.footballOrigin,
        source: "ball",
        label: "On the ball",
        strong: true,
      },
      point,
      screenScale,
      thresholdPx,
    );
  }
  for (const gap of request.gaps ?? []) {
    addCandidate(
      candidates,
      {
        axis: "lateral",
        valueYards: rounded(gap.lateralYards),
        priority: PRIORITY.footballOrigin,
        source: "gap",
        label: gap.name,
        strong: true,
      },
      point,
      screenScale,
      Math.max(thresholdPx, GAP_ACTIVATION_THRESHOLD_PX),
    );
  }
  addCandidate(
    candidates,
    {
      axis: "depth",
      valueYards: 0,
      priority: PRIORITY.footballOrigin,
      source: "line-of-scrimmage",
      label: "Line of scrimmage",
      strong: true,
    },
    point,
    screenScale,
    thresholdPx,
  );

  for (const valueYards of [-hashFromMidfield, hashFromMidfield]) {
    addCandidate(
      candidates,
      {
        axis: "lateral",
        valueYards: rounded(valueYards),
        priority: PRIORITY.fieldLandmark,
        source: "hash",
        label: valueYards < 0 ? "On the left hash" : "On the right hash",
        strong: true,
      },
      point,
      screenScale,
      thresholdPx,
    );
  }

  for (const valueYards of [-halfWidth, halfWidth]) {
    addCandidate(
      candidates,
      {
        axis: "lateral",
        valueYards: rounded(valueYards),
        priority: PRIORITY.fieldLandmark,
        source: "sideline",
        label:
          valueYards < 0 ? "On the left sideline" : "On the right sideline",
        strong: true,
      },
      point,
      screenScale,
      thresholdPx,
    );
  }

  const markDepth = nearestMultiple(
    point.depthYards,
    fieldProfile.minorMarkIntervalYards,
  );
  addCandidate(
    candidates,
    {
      axis: "depth",
      valueYards: markDepth,
      priority: PRIORITY.yardMark,
      source: "yard-mark",
      label: depthLabel(markDepth),
      strong: isMultiple(markDepth, fieldProfile.yardLineIntervalYards),
    },
    point,
    screenScale,
    thresholdPx,
  );
}

/**
 * Level with the snapper is the offense's line, and it outranks the men:
 * a lineman dragged along it stays on it. A step under it is off the line,
 * which competes with the men, so a slot can line up with another slot.
 * Neither reaches further than the half yard that decides whether a man is
 * on the line: zoomed out on a phone, eight pixels is nearly two yards, and
 * a line that reached that far would pull back every receiver dragged off
 * it. A snap to the line never changes whether he is on it.
 */
function lineCandidates(
  request: SnapPositionRequest,
  candidates: AxisCandidate[],
  thresholdPx: number,
): void {
  if (!request.line) return;
  assertFiniteCoordinate(
    { lateralYards: 0, depthYards: request.line.depthYards },
    "The line",
  );
  const reachPx = Math.min(
    thresholdPx,
    ON_THE_LINE_TOLERANCE_YARDS * request.screenScale.depthPixelsPerYard,
  );
  const on = rounded(request.line.depthYards);
  addCandidate(
    candidates,
    {
      axis: "depth",
      valueYards: on,
      priority: PRIORITY.footballOrigin,
      source: "line",
      label: "On the line",
      strong: true,
      marksMembers: true,
    },
    request.point,
    request.screenScale,
    reachPx,
  );
  addCandidate(
    candidates,
    {
      axis: "depth",
      valueYards: rounded(on - OFF_THE_LINE_YARDS),
      priority: PRIORITY.diagramAlignment,
      source: "line",
      label: "Off the line",
      strong: false,
      marksMembers: true,
    },
    request.point,
    request.screenScale,
    reachPx,
  );
}

function alignmentCandidates(
  request: SnapPositionRequest,
  candidates: AxisCandidate[],
  thresholdPx: number,
): void {
  const references = referencesFor(request);
  if (references.length > MAX_SNAP_REFERENCES) {
    throw new RangeError(
      `Smart snapping supports at most ${MAX_SNAP_REFERENCES} nearby references.`,
    );
  }
  references.sort(compareReferencePosition);

  for (const reference of references) {
    assertFiniteCoordinate(
      reference.position,
      `Snap reference ${reference.id}`,
    );
    const name = referenceName(reference);
    addCandidate(
      candidates,
      {
        axis: "lateral",
        valueYards: rounded(reference.position.lateralYards),
        priority: PRIORITY.diagramAlignment,
        source: "alignment",
        label: `Aligned with ${name}`,
        strong: false,
        targetId: reference.id,
        marksMembers: true,
      },
      request.point,
      request.screenScale,
      thresholdPx,
    );
    addCandidate(
      candidates,
      {
        axis: "depth",
        valueYards: rounded(reference.position.depthYards),
        priority: PRIORITY.diagramAlignment,
        source: "alignment",
        label: `Same depth as ${name}`,
        strong: false,
        targetId: reference.id,
        marksMembers: true,
      },
      request.point,
      request.screenScale,
      thresholdPx,
    );
  }

  const left = references
    .filter(
      (reference) =>
        reference.position.lateralYards < request.point.lateralYards,
    )
    .at(-1);
  const right = references.find(
    (reference) => reference.position.lateralYards > request.point.lateralYards,
  );
  if (left && right) {
    addCandidate(
      candidates,
      {
        axis: "lateral",
        valueYards: rounded(
          (left.position.lateralYards + right.position.lateralYards) / 2,
        ),
        priority: PRIORITY.diagramAlignment,
        source: "equal-split",
        label: `Equal split between ${referenceName(left)} and ${referenceName(right)}`,
        strong: false,
        targetId: `${left.id}:${right.id}`,
        spacingYards: rounded(
          (right.position.lateralYards - left.position.lateralYards) / 2,
        ),
        spans: (point) => [
          { from: left.position, to: point },
          { from: point, to: right.position },
        ],
      },
      request.point,
      request.screenScale,
      thresholdPx,
    );
  }

  spacingCandidates(request, references, candidates, thresholdPx);
}

/**
 * Even splits, the way a design tool offers equal spacing: the man is put a
 * split from the man beside him that the men of his own row already keep —
 * a tackle dragged back out lands the split his guards keep. The space he is
 * standing in is not one of them: measured by it he would land on the man at
 * its far side. The men in another row keep their own spacing.
 */
function spacingCandidates(
  request: SnapPositionRequest,
  references: readonly SnapReference[],
  candidates: AxisCandidate[],
  thresholdPx: number,
): void {
  const at = request.point.lateralYards;
  const row = references.filter(
    ({ position }) =>
      Math.abs(position.depthYards - request.point.depthYards) <=
      ROW_TOLERANCE_YARDS,
  );
  const left = row.filter(({ position }) => position.lateralYards < at).at(-1);
  const right = row.find(({ position }) => position.lateralYards > at);
  const lateral = (reference: SnapReference) => reference.position.lateralYards;

  // One offer per spot, named for the pair nearest the man: a tackle put back
  // at his guards' split is told "C to RG", not the far end of the line.
  const offers = new Map<
    number,
    { from: SnapReference; to: SnapReference; split: number; reach: number }
  >();
  for (let index = 1; index < row.length; index += 1) {
    const from = row[index - 1]!;
    const to = row[index]!;
    if (from === left && to === right) continue;
    const split = lateral(to) - lateral(from);
    if (split <= SPLIT_MATCH_YARDS) continue;
    const reach = Math.abs((lateral(from) + lateral(to)) / 2 - at);
    const options = [
      ...(left ? [lateral(left) + split] : []),
      ...(right ? [lateral(right) - split] : []),
    ];
    for (const value of options) {
      if (left && value <= lateral(left) + SPLIT_MATCH_YARDS) continue;
      if (right && value >= lateral(right) - SPLIT_MATCH_YARDS) continue;
      const spot = rounded(value);
      const held = offers.get(spot);
      if (!held || reach < held.reach) {
        offers.set(spot, { from, to, split, reach });
      }
    }
  }

  for (const [valueYards, { from, to, split }] of offers) {
    addCandidate(
      candidates,
      {
        axis: "lateral",
        valueYards,
        priority: PRIORITY.diagramAlignment,
        source: "equal-spacing",
        label: `Same split as ${referenceName(from)} to ${referenceName(to)}`,
        strong: false,
        targetId: `${from.id}:${to.id}`,
        spacingYards: rounded(split),
        spans: (point) => matchingSpans(row, point, split),
      },
      request.point,
      request.screenScale,
      thresholdPx,
    );
  }
}

/** Every space in the row, the point now in it, that is this split. */
function matchingSpans(
  row: readonly SnapReference[],
  point: Coordinate,
  split: number,
): SnapSpan[] {
  const standing = [...row.map(({ position }) => position), point].sort(
    (left, right) => left.lateralYards - right.lateralYards,
  );
  const spans: SnapSpan[] = [];
  for (let index = 1; index < standing.length; index += 1) {
    const from = standing[index - 1]!;
    const to = standing[index]!;
    if (
      Math.abs(to.lateralYards - from.lateralYards - split) <= SPLIT_MATCH_YARDS
    ) {
      spans.push({ from, to });
    }
  }
  return spans;
}

function gridCandidates(
  request: SnapPositionRequest,
  candidates: AxisCandidate[],
  thresholdPx: number,
): void {
  if (request.settings.grid === "off") return;
  const interval = request.settings.grid;
  for (const axis of ["lateral", "depth"] as const) {
    const current =
      axis === "lateral"
        ? request.point.lateralYards
        : request.point.depthYards;
    const valueYards = nearestMultiple(current, interval);
    addCandidate(
      candidates,
      {
        axis,
        valueYards,
        priority: PRIORITY.grid,
        source: "grid",
        label: `${formatYards(interval)} grid`,
        strong: false,
      },
      request.point,
      request.screenScale,
      thresholdPx,
    );
  }
}

function selectAxisCandidate(
  candidates: readonly AxisCandidate[],
  axis: AxisSnapGuide["axis"],
): AxisCandidate | undefined {
  return candidates
    .filter((candidate) => candidate.axis === axis)
    .sort(compareCandidates)[0];
}

/** The men standing on a guide's value, and the point, along the guide. */
function membersOf(
  candidate: AxisCandidate,
  point: Coordinate,
  references: readonly SnapReference[],
): Coordinate[] {
  const along = (position: Coordinate) =>
    candidate.axis === "lateral" ? position.lateralYards : position.depthYards;
  const across = (position: Coordinate) =>
    candidate.axis === "lateral" ? position.depthYards : position.lateralYards;
  return [
    ...references
      .map(({ position }) => position)
      .filter(
        (position) =>
          Math.abs(along(position) - candidate.valueYards) <=
          MEMBER_TOLERANCE_YARDS,
      ),
    point,
  ].sort((left, right) => across(left) - across(right));
}

function asGuide(
  candidate: AxisCandidate,
  point: Coordinate,
  references: readonly SnapReference[],
): AxisSnapGuide {
  return {
    kind: "axis",
    axis: candidate.axis,
    valueYards: candidate.valueYards,
    source: candidate.source,
    label: candidate.label,
    strong: candidate.strong,
    ...(candidate.targetId ? { targetId: candidate.targetId } : {}),
    ...(candidate.marksMembers
      ? { members: membersOf(candidate, point, references) }
      : {}),
    ...(candidate.spans ? { spans: candidate.spans(point) } : {}),
    ...(candidate.spacingYards === undefined
      ? {}
      : { spacingYards: candidate.spacingYards }),
  };
}

function referencesFor(request: SnapPositionRequest): SnapReference[] {
  const excluded = new Set(request.excludeReferenceIds ?? []);
  return (request.references ?? []).filter(
    (reference) => !excluded.has(reference.id),
  );
}

/**
 * Ranks football-aware snap candidates in yard space. Priority is invariant:
 * ball/LOS and the offense's line — or, in the tackle box, its gaps/LOS —
 * hashes and sidelines, the men (alignment, even splits, a step off the
 * line), yard marks, then grid (ADR 0073).
 */
export function snapPosition(request: SnapPositionRequest): SnapPositionResult {
  assertFiniteCoordinate(request.point, "Snap point");
  assertScreenScale(request.screenScale);
  const thresholdPx = activationThreshold(request.settings);
  const original = coordinate(
    request.point.lateralYards,
    request.point.depthYards,
  );
  const originalMoving = (request.movingPoints ?? []).map((point, index) => {
    assertFiniteCoordinate(point, `Moving point ${index}`);
    return coordinate(point.lateralYards, point.depthYards);
  });

  if (!request.settings.enabled) {
    return {
      point: original,
      translation: coordinate(0, 0),
      movingPoints: originalMoving,
      guides: [],
      snapped: false,
    };
  }

  const candidates: AxisCandidate[] = [];
  fieldCandidates(request, candidates, thresholdPx);
  lineCandidates(request, candidates, thresholdPx);
  alignmentCandidates(request, candidates, thresholdPx);
  gridCandidates(request, candidates, thresholdPx);

  const lateral = selectAxisCandidate(candidates, "lateral");
  const depth = selectAxisCandidate(candidates, "depth");
  const point = coordinate(
    lateral?.valueYards ?? original.lateralYards,
    depth?.valueYards ?? original.depthYards,
  );
  const translation = coordinate(
    point.lateralYards - original.lateralYards,
    point.depthYards - original.depthYards,
  );
  const references = referencesFor(request);
  const guides = [lateral, depth]
    .filter((candidate): candidate is AxisCandidate => candidate !== undefined)
    .map((candidate) => asGuide(candidate, point, references));

  return {
    point,
    translation,
    movingPoints: originalMoving.map((movingPoint) =>
      coordinate(
        movingPoint.lateralYards + translation.lateralYards,
        movingPoint.depthYards + translation.depthYards,
      ),
    ),
    guides,
    snapped: guides.length > 0,
  };
}

function normalizedDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function angularDistance(left: number, right: number): number {
  const difference = Math.abs(
    normalizedDegrees(left) - normalizedDegrees(right),
  );
  return Math.min(difference, 360 - difference);
}

function pointScreenDistance(
  left: Coordinate,
  right: Coordinate,
  scale: SnapScreenScale,
): number {
  return Math.hypot(
    (right.lateralYards - left.lateralYards) * scale.lateralPixelsPerYard,
    (right.depthYards - left.depthYards) * scale.depthPixelsPerYard,
  );
}

/**
 * Suggests or constrains a route break to grass-true 45-degree increments.
 * Screen scale controls only activation tolerance, never the football angle.
 */
export function snapRouteEndpoint(
  request: SnapRouteEndpointRequest,
): SnapRouteEndpointResult {
  assertFiniteCoordinate(request.origin, "Route origin");
  assertFiniteCoordinate(request.point, "Route endpoint");
  assertScreenScale(request.screenScale);
  const point = coordinate(
    request.point.lateralYards,
    request.point.depthYards,
  );
  if (request.mode === "off") return { point, snapped: false };

  const deltaLateral = point.lateralYards - request.origin.lateralYards;
  const deltaDepth = point.depthYards - request.origin.depthYards;
  const distanceYards = Math.hypot(deltaLateral, deltaDepth);
  if (distanceYards === 0) return { point, snapped: false };

  const rawDegrees = normalizedDegrees(
    (Math.atan2(deltaDepth, deltaLateral) * 180) / Math.PI,
  );
  const angleDegrees = Array.from(
    { length: DIRECTION_COUNT },
    (_, index) => index * DIRECTION_INCREMENT_DEGREES,
  ).sort(
    (left, right) =>
      angularDistance(left, rawDegrees) - angularDistance(right, rawDegrees) ||
      left - right,
  )[0]!;
  const radians = (angleDegrees * Math.PI) / 180;
  const snappedPoint = coordinate(
    request.origin.lateralYards + Math.cos(radians) * distanceYards,
    request.origin.depthYards + Math.sin(radians) * distanceYards,
  );
  const thresholdPx = activationThreshold(request);
  if (
    request.mode === "suggest" &&
    pointScreenDistance(point, snappedPoint, request.screenScale) > thresholdPx
  ) {
    return { point, snapped: false };
  }

  return {
    point: snappedPoint,
    snapped: true,
    guide: {
      kind: "direction",
      source: "direction",
      origin: coordinate(
        request.origin.lateralYards,
        request.origin.depthYards,
      ),
      endpoint: snappedPoint,
      angleDegrees,
      label: `${angleDegrees}° route break`,
      strong: request.mode === "constrain",
    },
  };
}
