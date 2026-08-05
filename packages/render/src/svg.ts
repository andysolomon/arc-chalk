import type {
  Color,
  Coordinate,
  FieldProfile,
  PathLine,
  PathPoint,
  PathStyle,
} from "@chalk/domain";

import type { RenderScene, ScenePath } from "./index";

export interface SvgViewport {
  readonly width: number;
  readonly height: number;
  readonly midfieldX: number;
  readonly lineOfScrimmageY: number;
  readonly pixelsPerYard: number;
  readonly fieldInsetX: number;
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

export const editorSvgViewport: SvgViewport = Object.freeze({
  width: 1068,
  height: 525,
  midfieldX: 532,
  lineOfScrimmageY: 394,
  pixelsPerYard: 13,
  fieldInsetX: 12,
});

export function projectCoordinate(
  coordinate: Coordinate,
  viewport: SvgViewport = editorSvgViewport,
): SvgPoint {
  return {
    x: viewport.midfieldX + coordinate.lateralYards * viewport.pixelsPerYard,
    y:
      viewport.lineOfScrimmageY -
      coordinate.depthYards * viewport.pixelsPerYard,
  };
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function pointCommand(point: SvgPoint): string {
  return `${formatNumber(point.x)} ${formatNumber(point.y)}`;
}

function standardPathData(
  points: readonly PathPoint[],
  viewport: SvgViewport,
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
  viewport: SvgViewport,
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
  viewport: SvgViewport,
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
  viewport: SvgViewport,
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

export interface SvgScenePath {
  readonly id: string;
  readonly kind: ScenePath["kind"];
  readonly variant?: ScenePath["variant"];
  readonly strokes: readonly SvgPathStroke[];
  readonly ticks: readonly (SvgTick & { readonly color: Color })[];
  readonly coverageArea?: SvgCoverageArea;
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

const coverageFills: Record<SvgCoverageArea["type"], string> = {
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

function buildPathStrokes(
  id: string,
  points: readonly PathPoint[],
  style: PathStyle,
  viewport: SvgViewport,
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
  readonly viewport: SvgViewport;
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
  viewport: SvgViewport,
): SvgRenderScene["players"][number] {
  const color = svgColors[player.color];
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
      fill: "#4D4D4D",
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
  viewport: SvgViewport,
): SvgRenderScene["labels"][number] {
  const position = projectCoordinate(label.position, viewport);
  const text = label.caps ? label.text.toUpperCase() : label.text;
  const width = Math.max(20, text.length * label.size * 0.6) + 14;
  const height = label.size + 10;
  const color = svgColors[label.color];
  const boxColor = svgColors[label.boxColor];
  const centerY = position.y - label.size * 0.35;
  let box: SvgShapePrimitive | undefined;

  if (label.box === "circle") {
    box = {
      kind: "circle",
      cx: position.x,
      cy: centerY,
      r: label.size * 0.95,
      fill: "#FFFFFF",
      stroke: boxColor,
      strokeWidth: 1.6,
    };
  } else if (label.box !== "none") {
    box = {
      kind: "rect",
      x: position.x - width / 2,
      y: position.y - label.size - 4,
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
      fontSize: label.size,
      fontWeight: 500,
      letterSpacing: label.mono ? 0.6 : 0,
    },
  };
}

function fieldPixelsPerYard(
  profile: FieldProfile,
  viewport: SvgViewport,
): number {
  return (viewport.width - viewport.fieldInsetX * 2) / profile.widthYards;
}

function projectFieldLateral(
  lateralYards: number,
  profile: FieldProfile,
  viewport: SvgViewport,
): number {
  return (
    viewport.width / 2 + lateralYards * fieldPixelsPerYard(profile, viewport)
  );
}

function projectDepth(depthYards: number, viewport: SvgViewport): number {
  return viewport.lineOfScrimmageY - depthYards * viewport.pixelsPerYard;
}

function buildSvgField(
  scene: RenderScene,
  viewport: SvgViewport,
): SvgFieldScene {
  const { landmarks, profile } = scene.field;
  const top = projectDepth(landmarks.window.maxDepthYards, viewport);
  const bottom = projectDepth(landmarks.window.minDepthYards, viewport);
  const leftSideline = projectFieldLateral(
    -profile.widthYards / 2,
    profile,
    viewport,
  );
  const rightSideline = projectFieldLateral(
    profile.widthYards / 2,
    profile,
    viewport,
  );
  const lateralScale = fieldPixelsPerYard(profile, viewport);

  return {
    sidelines: landmarks.sidelines.map(({ lateralYards }, index) => {
      const x = projectFieldLateral(lateralYards, profile, viewport);
      return {
        id: `sideline-${index}`,
        x1: x,
        y1: top,
        x2: x,
        y2: bottom,
      };
    }),
    yardLines: landmarks.yardLines.map(({ depthYards, isLineOfScrimmage }) => {
      const y = projectDepth(depthYards, viewport);
      return {
        id: `yard-line-${depthYards}`,
        x1: leftSideline,
        y1: y,
        x2: rightSideline,
        y2: y,
        isLineOfScrimmage,
      };
    }),
    hashMarks: landmarks.hashMarks.map(
      ({ lateralYards, depthYards, lengthYards }, index) => {
        const x = projectFieldLateral(lateralYards, profile, viewport);
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
        x: projectFieldLateral(lateralYards, profile, viewport),
        y:
          projectDepth(depthYards, viewport) +
          (heightYards * viewport.pixelsPerYard) / 2 -
          1,
        value,
        fontSize: heightYards * viewport.pixelsPerYard,
      }),
    ),
  };
}

export function buildSvgRenderScene(
  scene: RenderScene,
  viewport: SvgViewport = editorSvgViewport,
): SvgRenderScene {
  return {
    schemaVersion: 2,
    playId: scene.playId,
    playName: scene.playName,
    viewport,
    field: buildSvgField(scene, viewport),
    players: scene.players.map((player) => buildSvgPlayer(player, viewport)),
    paths: scene.paths.map((path) => {
      const endpoint = path.points.at(-1);
      const coverageArea =
        path.kind === "zone" &&
        path.style.ending === "bubble" &&
        path.coverageArea &&
        endpoint
          ? {
              id: `${path.id}-coverage`,
              type: path.coverageArea.type,
              center: projectCoordinate(endpoint, viewport),
              radiusX:
                path.coverageArea.radiusLateralYards * viewport.pixelsPerYard,
              radiusY:
                path.coverageArea.radiusDepthYards * viewport.pixelsPerYard,
              fill: coverageFills[path.coverageArea.type],
            }
          : undefined;
      const strokes = buildPathStrokes(
        path.id,
        path.points,
        path.style,
        viewport,
      ).map((stroke, index, all) =>
        coverageArea &&
        index === all.length - 1 &&
        stroke.style.ending === "bubble"
          ? { ...stroke, style: { ...stroke.style, ending: "none" as const } }
          : stroke,
      );

      return {
        id: path.id,
        kind: path.kind,
        ...(path.variant === undefined ? {} : { variant: path.variant }),
        strokes,
        ticks: buildTicks(path.points, viewport).map((tick) => ({
          ...tick,
          color: path.style.color,
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
            strokes: buildPathStrokes(id, points, branch.style, viewport),
            ticks: buildTicks(points, viewport).map((tick) => ({
              ...tick,
              color: branch.style.color,
            })),
          };
        }),
      };
    }),
    labels: scene.labels.map((label) => buildSvgLabel(label, viewport)),
  };
}
