import {
  classifyZoneCoverage,
  DEFAULT_ZONE_COVERAGE_RADII,
  LEGACY_FIELD_GEOMETRY,
  type Color,
  type Coordinate,
  type FieldProfile,
  type PathLine,
  type PathPoint,
  type PathStyle,
} from "@chalk/domain";

import type { RenderScene, ScenePath } from "./index";
import {
  labelFontSize,
  type FieldMarkingStyle,
  type TypeDensity,
  type TypePresetId,
} from "./presentation";

/**
 * The frame the field is drawn into. Depth scale is fixed here; the lateral
 * scale is not, because it follows the Field Profile's width — see
 * {@link createSvgProjection}.
 */
export interface SvgViewport {
  readonly width: number;
  readonly height: number;
  readonly midfieldX: number;
  readonly lineOfScrimmageY: number;
  readonly depthPixelsPerYard: number;
  readonly fieldInsetX: number;
}

/**
 * A viewport resolved against one Field Profile.
 *
 * The field is drawn anisotropically, as the original draws it: a full 53 1/3
 * yard width fits across the frame while depth stays at a readable scale, so
 * a yard across the field and a yard downfield are different numbers of
 * pixels. Every projection — players, paths, labels, and field markings alike
 * — must go through this one object. Projecting positions with the depth
 * scale on both axes is what put the seeded Play's split end out of bounds
 * while the stretched sidelines hid it.
 */
export interface SvgProjection extends SvgViewport {
  readonly lateralPixelsPerYard: number;
}

export function createSvgProjection(
  profile: FieldProfile,
  viewport: SvgViewport = editorSvgViewport,
): SvgProjection {
  return {
    ...viewport,
    lateralPixelsPerYard:
      (viewport.width - viewport.fieldInsetX * 2) / profile.widthYards,
  };
}

export interface SvgPoint {
  readonly x: number;
  readonly y: number;
}

export const svgColors: Readonly<Record<Color, string>> = Object.freeze({
  ink: "#171717",
  blue: "#0072F5",
  red: "#E5484D",
  green: "#398E4A",
  orange: "#C2540A",
  gray: "#8F8F8F",
  yellow: "#F5D90A",
});

/** Print type swaps every palette colour for ink so a copier keeps the Play. */
function paint(hex: string, flat: boolean): string {
  return flat ? svgColors.ink : hex;
}

export type SvgShapePrimitive =
  | {
      readonly kind: "circle";
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly fill: string;
      readonly stroke?: string;
      readonly strokeWidth?: number;
    }
  | {
      readonly kind: "rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rx?: number;
      readonly fill: string;
      readonly stroke?: string;
      readonly strokeWidth?: number;
    }
  | {
      readonly kind: "ellipse";
      readonly cx: number;
      readonly cy: number;
      readonly rx: number;
      readonly ry: number;
      readonly fill: string;
      readonly stroke?: string;
      readonly strokeWidth?: number;
    }
  | {
      readonly kind: "path";
      readonly d: string;
      readonly fill: string;
      readonly stroke?: string;
      readonly strokeWidth?: number;
      readonly strokeLinecap?: "round";
      readonly strokeLinejoin?: "round";
    };

export interface SvgTextPrimitive {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fill: string;
  readonly fontFamily: "Geist, sans-serif" | "Geist Mono, monospace";
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly letterSpacing: number;
}

/**
 * The original's own frame. Yard space stays the source of truth; this is
 * only how that space is shown, and it has to be the same rectangle the
 * original drew into or the Play sits in a different picture.
 */
export const editorSvgViewport: SvgViewport = Object.freeze({
  width: LEGACY_FIELD_GEOMETRY.viewWidth,
  height: LEGACY_FIELD_GEOMETRY.viewHeight,
  midfieldX: LEGACY_FIELD_GEOMETRY.midfieldX,
  lineOfScrimmageY: LEGACY_FIELD_GEOMETRY.lineOfScrimmageY,
  depthPixelsPerYard: LEGACY_FIELD_GEOMETRY.depthPixelsPerYard,
  fieldInsetX: LEGACY_FIELD_GEOMETRY.fieldInsetX,
});

export function projectCoordinate(
  coordinate: Coordinate,
  projection: SvgProjection,
): SvgPoint {
  return {
    x: projectLateral(coordinate.lateralYards, projection),
    y: projectDepth(coordinate.depthYards, projection),
  };
}

/**
 * A yard-space translation as a frame offset. Depth grows up the field, so
 * a positive depth shift moves up the SVG (negative y).
 */
export function projectTranslation(
  translation: Coordinate,
  projection: SvgProjection,
): SvgPoint {
  return {
    x: translation.lateralYards * projection.lateralPixelsPerYard,
    y: -translation.depthYards * projection.depthPixelsPerYard,
  };
}

/** Recovers field yards from a point in the drawn frame. */
export function unprojectPoint(
  point: SvgPoint,
  projection: SvgProjection,
): Coordinate {
  return {
    lateralYards:
      (point.x - projection.midfieldX) / projection.lateralPixelsPerYard,
    depthYards:
      (projection.lineOfScrimmageY - point.y) / projection.depthPixelsPerYard,
  };
}

function projectLateral(
  lateralYards: number,
  projection: SvgProjection,
): number {
  return projection.midfieldX + lateralYards * projection.lateralPixelsPerYard;
}

function projectDepth(depthYards: number, projection: SvgProjection): number {
  return (
    projection.lineOfScrimmageY - depthYards * projection.depthPixelsPerYard
  );
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function pointCommand(point: SvgPoint): string {
  return `${formatNumber(point.x)} ${formatNumber(point.y)}`;
}

function standardPathData(
  points: readonly PathPoint[],
  viewport: SvgProjection,
): string {
  const first = points[0];
  if (!first) throw new RangeError("Cannot project an empty movement path.");

  const startPoint = projectCoordinate(first, viewport);
  let data = `M ${pointCommand(startPoint)}`;

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    const projected = projectCoordinate(point, viewport);
    data += point.control
      ? ` Q ${pointCommand(projectCoordinate(point.control, viewport))} ${pointCommand(projected)}`
      : ` L ${pointCommand(projected)}`;
  }

  return data;
}

function zigzagPathData(
  points: readonly PathPoint[],
  viewport: SvgProjection,
): string {
  const first = points[0];
  if (!first) throw new RangeError("Cannot project an empty movement path.");

  const projected = points.map((point) => projectCoordinate(point, viewport));
  let data = `M ${pointCommand(projected[0]!)}`;
  for (let index = 1; index < projected.length; index += 1) {
    const start = projected[index - 1]!;
    const end = projected[index]!;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length < 1) continue;

    const samples = Math.min(4096, Math.max(2, Math.round(length / 11)));
    const unitX = (end.x - start.x) / length;
    const unitY = (end.y - start.y) / length;
    const perpendicularX = -unitY;
    const perpendicularY = unitX;
    for (let sample = 1; sample <= samples; sample += 1) {
      const progress = sample / samples;
      const offset = sample === samples ? 0 : sample % 2 === 1 ? 4.5 : -4.5;
      data += ` L ${pointCommand({
        x: Math.round(
          start.x + unitX * length * progress + perpendicularX * offset,
        ),
        y: Math.round(
          start.y + unitY * length * progress + perpendicularY * offset,
        ),
      })}`;
    }
  }
  return data;
}

function pathData(
  points: readonly PathPoint[],
  line: PathLine,
  viewport: SvgProjection,
): string {
  return line === "zigzag"
    ? zigzagPathData(points, viewport)
    : standardPathData(points, viewport);
}

export interface SvgTick {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

function buildTicks(
  points: readonly PathPoint[],
  viewport: SvgProjection,
): readonly SvgTick[] {
  return points.flatMap((point, index) => {
    if (!point.tick || index === 0) return [];

    const previous = projectCoordinate(points[index - 1]!, viewport);
    const current = projectCoordinate(point, viewport);
    const angle = Math.atan2(current.y - previous.y, current.x - previous.x);
    const perpendicularX = -Math.sin(angle) * 9;
    const perpendicularY = Math.cos(angle) * 9;

    return [
      {
        x1: current.x - perpendicularX,
        y1: current.y - perpendicularY,
        x2: current.x + perpendicularX,
        y2: current.y + perpendicularY,
      },
    ];
  });
}

/**
 * What a route says about itself at the end of the line: the number the
 * quarterback reads it on, and the words stacked the other way — the man's
 * Assignment, what it converts to, and the point the Coach makes off it.
 */
export interface SvgRouteCoaching {
  readonly read?: {
    readonly id: string;
    readonly center: SvgPoint;
    readonly radius: number;
    readonly text: SvgTextPrimitive;
  };
  readonly notes: readonly {
    readonly id: string;
    readonly text: SvgTextPrimitive;
  }[];
}

export interface SvgScenePath {
  readonly id: string;
  readonly kind: ScenePath["kind"];
  /** What this line is, said the way a Coach would say it aloud. */
  readonly ariaLabel: string;
  readonly variant?: ScenePath["variant"];
  readonly coaching?: SvgRouteCoaching;
  readonly strokes: readonly SvgPathStroke[];
  readonly ticks: readonly (SvgTick & { readonly color: Color })[];
  readonly coverageArea?: SvgCoverageArea;
  readonly opacity?: number;
  readonly trail?: boolean;
  readonly branches: readonly {
    readonly id: string;
    readonly strokes: readonly SvgPathStroke[];
    readonly ticks: readonly (SvgTick & { readonly color: Color })[];
  }[];
}

export interface SvgPathStroke {
  readonly id: string;
  readonly d: string;
  readonly style: PathStyle;
}

export interface SvgCoverageArea {
  readonly id: string;
  readonly type: NonNullable<ScenePath["coverageArea"]>["type"];
  readonly center: SvgPoint;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly fill: string;
}

/**
 * What each level of coverage is drawn in. Exported because a thumbnail of a
 * call has to colour its areas the same way the field does — a Coach reading
 * the card and reading the field must be reading the same picture.
 */
/**
 * What a line is, for anybody who cannot see it: the man running it, what
 * kind of line it is, and what he is told to do if the Coach has written it
 * down. This is the only description of the picture a screen reader gets, so
 * it says the football rather than the geometry.
 */
function pathAriaLabel(path: ScenePath, scene: RenderScene): string {
  const player = scene.players.find(({ id }) => id === path.playerId);
  const who = player?.label.trim()
    ? player.label.trim()
    : player
      ? `${player.unit} player`
      : "somebody";
  const what =
    path.kind === "zone" && path.coverageArea
      ? `${path.coverageArea.type} zone`
      : path.kind;
  const told = path.assignment?.trim();
  const order = path.readOrder === undefined ? "" : `, read ${path.readOrder}`;
  return `${who} ${what}${told ? `: ${told}` : ""}${order}`;
}

export const coverageFills: Readonly<Record<SvgCoverageArea["type"], string>> =
  {
    deep: "#1D3FD8",
    curl: "#8B3FE0",
    hook: "#7C8C1E",
    flat: "#00909B",
    spy: "#9A5A16",
  };

function hasSegmentOverrides(points: readonly PathPoint[]): boolean {
  return points.some(
    (point, index) =>
      index > 0 &&
      (point.segmentStyle?.line !== undefined ||
        point.segmentStyle?.ending !== undefined),
  );
}

export function buildPathStrokes(
  id: string,
  points: readonly PathPoint[],
  style: PathStyle,
  viewport: SvgProjection,
): readonly SvgPathStroke[] {
  if (points.length < 2)
    throw new RangeError(`Movement path ${id} needs at least two points.`);

  if (!hasSegmentOverrides(points)) {
    return [{ id, d: pathData(points, style.line, viewport), style }];
  }

  return points.slice(1).map((point, segmentIndex) => {
    const isLast = segmentIndex === points.length - 2;
    const line = point.segmentStyle?.line ?? style.line;
    return {
      id: `${id}-segment-${segmentIndex + 1}`,
      d: pathData([points[segmentIndex]!, point], line, viewport),
      style: {
        line,
        ending: isLast ? style.ending : (point.segmentStyle?.ending ?? "none"),
        color: style.color,
      },
    };
  });
}

export interface SvgLine {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface SvgFieldScene {
  readonly style: FieldMarkingStyle;
  readonly sidelines: readonly SvgLine[];
  readonly yardLines: readonly (SvgLine & {
    readonly isLineOfScrimmage: boolean;
  })[];
  readonly hashMarks: readonly SvgLine[];
  readonly sidelineMarks: readonly SvgLine[];
  readonly numbers: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly value: number;
    readonly fontSize: number;
  }[];
}

export interface SvgRenderScene {
  readonly schemaVersion: 2;
  readonly playId: string;
  readonly playName: string;
  readonly typePreset: TypePresetId;
  readonly viewport: SvgProjection;
  readonly field: SvgFieldScene;
  readonly players: readonly (Omit<
    RenderScene["players"][number],
    "position" | "color" | "label" | "sublabel" | "fill" | "symbol"
  > & {
    readonly position: SvgPoint;
    readonly ariaLabel: string;
    readonly shapes: readonly SvgShapePrimitive[];
    readonly texts: readonly SvgTextPrimitive[];
  })[];
  readonly paths: readonly SvgScenePath[];
  readonly labels: readonly (Pick<
    RenderScene["labels"][number],
    "id" | "role" | "unit"
  > & {
    readonly position: SvgPoint;
    readonly ariaLabel: string;
    readonly box?: SvgShapePrimitive;
    readonly leader?: {
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly stroke: string;
      readonly strokeWidth: number;
      readonly strokeDasharray?: string;
      readonly opacity: number;
      readonly endpointRadius: number;
    };
    readonly text: SvgTextPrimitive;
  })[];
}

function buildSvgPlayer(
  player: RenderScene["players"][number],
  viewport: SvgProjection,
  flat: boolean,
): SvgRenderScene["players"][number] {
  const color = paint(svgColors[player.color], flat);
  const base = player.fill === "solid" ? color : "#FFFFFF";
  const shapes: SvgShapePrimitive[] = [];

  switch (player.symbol) {
    case "circle":
      shapes.push({
        kind: "circle",
        cx: 0,
        cy: 0,
        r: 13,
        fill: base,
        stroke: color,
        strokeWidth: 1.6,
      });
      break;
    case "square":
      shapes.push({
        kind: "rect",
        x: -12,
        y: -12,
        width: 24,
        height: 24,
        fill: base,
        stroke: color,
        strokeWidth: 1.6,
      });
      break;
    case "oval":
      shapes.push({
        kind: "ellipse",
        cx: 0,
        cy: 0,
        rx: 16,
        ry: 11,
        fill: base,
        stroke: color,
        strokeWidth: 1.6,
      });
      break;
    case "triangle":
      shapes.push({
        kind: "path",
        d: "M0 -14 L14 11 L-14 11 Z",
        fill: base,
        stroke: color,
        strokeWidth: 1.6,
        strokeLinejoin: "round",
      });
      break;
    case "x":
      shapes.push(
        { kind: "circle", cx: 0, cy: 0, r: 12, fill: "#FFFFFF" },
        {
          kind: "path",
          d: "M-9 -9 L9 9 M-9 9 L9 -9",
          fill: "none",
          stroke: color,
          strokeWidth: 2.2,
          strokeLinecap: "round",
        },
      );
      break;
    case "none":
      break;
  }

  if (
    player.fill === "half" &&
    player.symbol !== "x" &&
    player.symbol !== "none"
  ) {
    shapes.push({
      kind: "path",
      d:
        player.symbol === "square"
          ? "M0 -12 L12 -12 L12 12 L0 12 Z"
          : "M0 -13 A13 13 0 0 1 0 13 Z",
      fill: color,
    });
  }

  const isBare = player.symbol === "none";
  const texts: SvgTextPrimitive[] = [];
  if (player.label && player.symbol !== "x") {
    texts.push({
      text: player.label,
      x: 0,
      y: isBare ? 6 : player.symbol === "triangle" ? 7 : 4.5,
      fill: isBare
        ? color
        : player.fill === "solid"
          ? "#FFFFFF"
          : svgColors.ink,
      fontFamily: "Geist, sans-serif",
      fontSize: isBare ? 17 : 12.5,
      fontWeight: isBare ? 600 : 500,
      letterSpacing: 0,
    });
  }
  if (player.sublabel) {
    texts.push({
      text: player.sublabel.toUpperCase(),
      x: 0,
      y: 30,
      fill: paint("#4D4D4D", flat),
      fontFamily: "Geist Mono, monospace",
      fontSize: 9,
      fontWeight: 400,
      letterSpacing: 0.8,
    });
  }

  const description =
    player.label || player.sublabel || player.role || "player";
  return {
    id: player.id,
    unit: player.unit,
    ...(player.role === undefined ? {} : { role: player.role }),
    ...(player.group === undefined ? {} : { group: player.group }),
    position: projectCoordinate(player.position, viewport),
    ariaLabel: `${description} ${player.unit} player`,
    shapes,
    texts,
  };
}

function buildSvgLabel(
  label: RenderScene["labels"][number],
  viewport: SvgProjection,
  type: TypeDensity,
): SvgRenderScene["labels"][number] {
  const position = projectCoordinate(label.position, viewport);
  const text = label.caps ? label.text.toUpperCase() : label.text;
  const size = labelFontSize(label.size, type.label);
  const width = Math.max(20, text.length * size * 0.6) + 14;
  const height = size + 10;
  const color = paint(svgColors[label.color], type.flat);
  const boxColor = paint(svgColors[label.boxColor], type.flat);
  const centerY = position.y - size * 0.35;
  let box: SvgShapePrimitive | undefined;

  if (label.box === "circle") {
    box = {
      kind: "circle",
      cx: position.x,
      cy: centerY,
      r: size * 0.95,
      fill: "#FFFFFF",
      stroke: boxColor,
      strokeWidth: 1.6,
    };
  } else if (label.box !== "none") {
    box = {
      kind: "rect",
      x: position.x - width / 2,
      y: position.y - size - 4,
      width,
      height,
      rx: 2,
      fill: label.box === "fill" ? boxColor : "#FFFFFF",
      ...(label.box === "outline"
        ? { stroke: boxColor, strokeWidth: 1.6 }
        : {}),
    };
  }

  let leader: SvgRenderScene["labels"][number]["leader"];
  if (label.leader) {
    const endpoint = projectCoordinate(label.leader.endpoint, viewport);
    const dx = endpoint.x - position.x;
    const dy = endpoint.y - centerY;
    const magnitude = Math.hypot(dx, dy) || 1;
    const distance = Math.min(magnitude, width / 2 + 3);
    const verticalDistance = Math.min(magnitude, height / 2 + 3);
    leader = {
      x1: position.x + (dx / magnitude) * distance,
      y1: centerY + (dy / magnitude) * verticalDistance,
      x2: endpoint.x,
      y2: endpoint.y,
      stroke: boxColor || color,
      strokeWidth: 1.3,
      ...(label.leader.line === "dashed" ? { strokeDasharray: "4 3" } : {}),
      opacity: 0.8,
      endpointRadius: 2.6,
    };
  }

  return {
    id: label.id,
    ...(label.role === undefined ? {} : { role: label.role }),
    ...(label.unit === undefined ? {} : { unit: label.unit }),
    position,
    ariaLabel: label.role ? `${label.role}: ${text}` : text,
    ...(box === undefined ? {} : { box }),
    ...(leader === undefined ? {} : { leader }),
    text: {
      text,
      x: position.x,
      y: position.y,
      fill: color,
      fontFamily: label.mono ? "Geist Mono, monospace" : "Geist, sans-serif",
      fontSize: size,
      fontWeight: 500,
      letterSpacing: label.mono ? 0.6 : 0,
    },
  };
}

function emptyField(style: FieldMarkingStyle): SvgFieldScene {
  return {
    style,
    sidelines: [],
    yardLines: [],
    hashMarks: [],
    sidelineMarks: [],
    numbers: [],
  };
}

function buildSvgField(
  scene: RenderScene,
  viewport: SvgProjection,
): SvgFieldScene {
  const style = scene.field.style;
  if (style === "blank") return emptyField(style);

  const { landmarks, profile } = scene.field;
  const top = projectDepth(landmarks.window.maxDepthYards, viewport);
  const bottom = projectDepth(landmarks.window.minDepthYards, viewport);
  // Markings share the Play's projection, so a Player standing on the sideline
  // is drawn on the sideline.
  const leftSideline = projectLateral(-profile.widthYards / 2, viewport);
  const rightSideline = projectLateral(profile.widthYards / 2, viewport);
  const lateralScale = viewport.lateralPixelsPerYard;

  const yardLines = landmarks.yardLines.map(
    ({ depthYards, isLineOfScrimmage }) => {
      const y = projectDepth(depthYards, viewport);
      return {
        id: `yard-line-${depthYards}`,
        x1: leftSideline,
        y1: y,
        x2: rightSideline,
        y2: y,
        isLineOfScrimmage,
      };
    },
  );

  if (style === "los") {
    return {
      ...emptyField(style),
      yardLines: yardLines.filter(({ isLineOfScrimmage }) => isLineOfScrimmage),
    };
  }

  if (style === "light") {
    return { ...emptyField(style), yardLines };
  }

  return {
    style,
    sidelines: landmarks.sidelines.map(({ lateralYards }, index) => {
      const x = projectLateral(lateralYards, viewport);
      return {
        id: `sideline-${index}`,
        x1: x,
        y1: top,
        x2: x,
        y2: bottom,
      };
    }),
    yardLines,
    hashMarks: landmarks.hashMarks.map(
      ({ lateralYards, depthYards, lengthYards }, index) => {
        const x = projectLateral(lateralYards, viewport);
        const halfLength = (lengthYards * lateralScale) / 2;
        const y = projectDepth(depthYards, viewport);
        return {
          id: `hash-${index}`,
          x1: x - halfLength,
          y1: y,
          x2: x + halfLength,
          y2: y,
        };
      },
    ),
    sidelineMarks: landmarks.sidelineMarks.map(
      ({ side, depthYards, lengthYards }, index) => {
        const y = projectDepth(depthYards, viewport);
        const length = lengthYards * lateralScale;
        const x = side === "left" ? leftSideline : rightSideline;
        return {
          id: `sideline-mark-${index}`,
          x1: side === "left" ? x : x - length,
          y1: y,
          x2: side === "left" ? x + length : x,
          y2: y,
        };
      },
    ),
    numbers: landmarks.numbers.map(
      ({ lateralYards, depthYards, value, heightYards }, index) => ({
        id: `field-number-${index}`,
        x: projectLateral(lateralYards, viewport),
        y:
          projectDepth(depthYards, viewport) +
          (heightYards * viewport.depthPixelsPerYard) / 2 -
          1,
        value,
        // A number's height is a downfield dimension.
        fontSize: heightYards * viewport.depthPixelsPerYard,
      }),
    ),
  };
}

/**
 * The original measures these offsets in its own canvas pixels. The editor
 * frame is that canvas, so the factor is 1; it stays a ratio so a different
 * frame would still keep each mark the distance from the line the original
 * put it rather than a fixed count of pixels nearer.
 */
const MARK_SCALE =
  editorSvgViewport.depthPixelsPerYard /
  LEGACY_FIELD_GEOMETRY.depthPixelsPerYard;
const READ_OFFSET = 20 * MARK_SCALE;
const NOTE_OFFSET = 22 * MARK_SCALE;

/**
 * Every mark hangs off the last leg of the line, so it reads as belonging to
 * where the route finishes: the read number to one side of it and the words
 * to the other, exactly as the original arranges them.
 */
function buildRouteCoaching(
  path: ScenePath,
  viewport: SvgProjection,
  type: TypeDensity,
): SvgRouteCoaching | undefined {
  const end = path.points.at(-1);
  const before = path.points.at(-2);
  if (!end || !before) return undefined;

  const notes: { readonly kind: string; readonly text: SvgTextPrimitive }[] =
    [];
  const hasRead = path.readOrder !== undefined;
  if (!hasRead && !path.assignment && !path.conversion && !path.coachingNote) {
    return undefined;
  }

  const tip = projectCoordinate(end, viewport);
  const tail = projectCoordinate(before, viewport);
  const angle = Math.atan2(tip.y - tail.y, tip.x - tail.x);
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const noteSize = Math.max(10, type.label - 1);
  const noteStep = (type.label + 5) * MARK_SCALE;

  const read =
    path.readOrder === undefined
      ? undefined
      : {
          id: `${path.id}-read`,
          center: {
            x: tip.x + nx * READ_OFFSET,
            y: tip.y + ny * READ_OFFSET,
          },
          radius: type.read * 0.68 * MARK_SCALE,
          text: {
            text: String(path.readOrder),
            x: tip.x + nx * READ_OFFSET,
            y: tip.y + ny * READ_OFFSET,
            fill: paint("#0072F5", type.flat),
            fontFamily: "Geist Mono, monospace" as const,
            fontSize: type.read,
            fontWeight: 500,
            letterSpacing: 0,
          },
        };

  const stack: {
    readonly kind: string;
    readonly value: string;
    readonly fill: string;
    readonly mono: boolean;
    readonly size: number;
    readonly track: number;
  }[] = [];
  if (path.assignment) {
    stack.push({
      kind: "assignment",
      value: path.assignment.toUpperCase(),
      fill: paint("#4D4D4D", type.flat),
      mono: true,
      size: type.label,
      track: 0.7,
    });
  }
  if (path.conversion) {
    stack.push({
      kind: "conversion",
      value: path.conversion,
      fill: paint("#8F8F8F", type.flat),
      mono: true,
      size: noteSize,
      track: 0,
    });
  }
  if (path.coachingNote) {
    stack.push({
      kind: "note",
      value: path.coachingNote,
      fill: paint("#8F8F8F", type.flat),
      mono: false,
      size: noteSize,
      track: 0,
    });
  }
  for (const [index, entry] of stack.entries()) {
    const offset = NOTE_OFFSET + index * noteStep;
    notes.push({
      kind: entry.kind,
      text: {
        text: entry.value,
        x: tip.x - nx * offset,
        y: tip.y - ny * offset,
        fill: entry.fill,
        fontFamily: entry.mono
          ? ("Geist Mono, monospace" as const)
          : ("Geist, sans-serif" as const),
        fontSize: entry.size,
        fontWeight: 500,
        letterSpacing: entry.track,
      },
    });
  }

  return {
    ...(read === undefined ? {} : { read }),
    notes: notes.map(({ kind, text }) => ({ id: `${path.id}-${kind}`, text })),
  };
}

export function buildSvgRenderScene(
  scene: RenderScene,
  frame: SvgViewport = editorSvgViewport,
): SvgRenderScene {
  // Resolved once against this Play's Field Profile, then shared by every
  // projection in the scene.
  const viewport = createSvgProjection(scene.field.profile, frame);
  const type = scene.type;
  const strokeColor = type.flat ? ("ink" as const) : undefined;
  const withFlatColor = <T extends { style: { color: Color } }>(
    stroke: T,
  ): T =>
    strokeColor
      ? { ...stroke, style: { ...stroke.style, color: strokeColor } }
      : stroke;
  return {
    schemaVersion: 2,
    playId: scene.playId,
    playName: scene.playName,
    typePreset: scene.typePreset,
    viewport,
    field: buildSvgField(scene, viewport),
    players: scene.players.map((player) =>
      buildSvgPlayer(player, viewport, type.flat),
    ),
    paths: scene.paths.map((path) => {
      const endpoint = path.points.at(-1);
      // A zone drop that was never sized still owns its default bubble, the
      // way the original draws one until the Coach drags it out.
      const coverage =
        path.coverageArea ??
        (endpoint
          ? {
              type: classifyZoneCoverage(endpoint),
              ...DEFAULT_ZONE_COVERAGE_RADII,
            }
          : undefined);
      const coverageArea =
        path.kind === "zone" &&
        path.style.ending === "bubble" &&
        coverage &&
        endpoint
          ? {
              id: `${path.id}-coverage`,
              type: coverage.type,
              center: projectCoordinate(endpoint, viewport),
              radiusX:
                coverage.radiusLateralYards * viewport.lateralPixelsPerYard,
              radiusY: coverage.radiusDepthYards * viewport.depthPixelsPerYard,
              fill: paint(coverageFills[coverage.type], type.flat),
            }
          : undefined;
      const strokes = buildPathStrokes(
        path.id,
        path.points,
        path.style,
        viewport,
      ).map((stroke, index, all) => {
        const ended =
          coverageArea &&
          index === all.length - 1 &&
          stroke.style.ending === "bubble"
            ? { ...stroke, style: { ...stroke.style, ending: "none" as const } }
            : stroke;
        return withFlatColor(ended);
      });

      const coaching = buildRouteCoaching(path, viewport, type);
      const ink = strokeColor ?? path.style.color;

      return {
        id: path.id,
        kind: path.kind,
        ariaLabel: pathAriaLabel(path, scene),
        ...(path.variant === undefined ? {} : { variant: path.variant }),
        ...(path.trail ? {} : coaching === undefined ? {} : { coaching }),
        ...(path.opacity === undefined ? {} : { opacity: path.opacity }),
        ...(path.trail === undefined ? {} : { trail: path.trail }),
        strokes,
        ticks: buildTicks(path.points, viewport).map((tick) => ({
          ...tick,
          color: ink,
        })),
        ...(coverageArea === undefined ? {} : { coverageArea }),
        branches: path.branches.map((branch, index) => {
          const branchStart = path.points[branch.fromIndex];
          if (!branchStart) {
            throw new RangeError(
              `Movement path ${path.id} branch ${index} has no start point.`,
            );
          }

          const id = `${path.id}-branch-${index}`;
          const points = [branchStart, ...branch.points];
          return {
            id,
            strokes: buildPathStrokes(id, points, branch.style, viewport).map(
              withFlatColor,
            ),
            ticks: buildTicks(points, viewport).map((tick) => ({
              ...tick,
              color: strokeColor ?? branch.style.color,
            })),
          };
        }),
      };
    }),
    labels: scene.labels.map((label) => buildSvgLabel(label, viewport, type)),
  };
}
