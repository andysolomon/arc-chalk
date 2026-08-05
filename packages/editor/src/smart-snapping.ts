import type { Coordinate, FieldProfile } from "@chalk/domain";

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
  | "alignment"
  | "equal-split"
  | "grid"
  | "direction";

export interface AxisSnapGuide {
  readonly kind: "axis";
  readonly axis: "lateral" | "depth";
  readonly valueYards: number;
  readonly source: Exclude<SnapGuideSource, "direction">;
  readonly label: string;
  readonly strong: boolean;
  readonly targetId?: string;
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

export interface SnapPositionRequest {
  /** The relevant drag anchor. Group members are translated by its snap delta. */
  readonly point: Coordinate;
  readonly movingPoints?: readonly Coordinate[];
  readonly fieldProfile: FieldProfile;
  readonly references?: readonly SnapReference[];
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
}

const DEFAULT_ACTIVATION_THRESHOLD_PX = 8;
const MAX_SNAP_REFERENCES = 2_048;
const PRECISION_DIGITS = 9;
const DIRECTION_INCREMENT_DEGREES = 45;
const DIRECTION_COUNT = 360 / DIRECTION_INCREMENT_DEGREES;

const PRIORITY = Object.freeze({
  footballOrigin: 0,
  fieldLandmark: 1,
  diagramAlignment: 2,
  grid: 3,
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
      priority: PRIORITY.fieldLandmark,
      source: "yard-mark",
      label: depthLabel(markDepth),
      strong: isMultiple(markDepth, fieldProfile.yardLineIntervalYards),
    },
    point,
    screenScale,
    thresholdPx,
  );
}

function alignmentCandidates(
  request: SnapPositionRequest,
  candidates: AxisCandidate[],
  thresholdPx: number,
): void {
  const excluded = new Set(request.excludeReferenceIds ?? []);
  const references = (request.references ?? []).filter(
    (reference) => !excluded.has(reference.id),
  );
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
      },
      request.point,
      request.screenScale,
      thresholdPx,
    );
  }
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

function asGuide(candidate: AxisCandidate): AxisSnapGuide {
  return {
    kind: "axis",
    axis: candidate.axis,
    valueYards: candidate.valueYards,
    source: candidate.source,
    label: candidate.label,
    strong: candidate.strong,
    ...(candidate.targetId ? { targetId: candidate.targetId } : {}),
  };
}

/**
 * Ranks football-aware snap candidates in yard space. Priority is invariant:
 * ball/LOS, Field Profile landmarks, nearby diagram alignment, then grid.
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
  const guides = [lateral, depth]
    .filter((candidate): candidate is AxisCandidate => candidate !== undefined)
    .map(asGuide);

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
