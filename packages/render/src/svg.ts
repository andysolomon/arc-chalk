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
  readonly viewport: SvgViewport;
  readonly field: SvgFieldScene;
  readonly players: readonly (Omit<
    RenderScene["players"][number],
    "position"
  > & {
    readonly position: SvgPoint;
  })[];
  readonly paths: readonly SvgScenePath[];
  readonly labels: readonly (Omit<RenderScene["labels"][number], "position"> & {
    readonly position: SvgPoint;
  })[];
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
    viewport,
    field: buildSvgField(scene, viewport),
    players: scene.players.map((player) => ({
      ...player,
      position: projectCoordinate(player.position, viewport),
    })),
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
    labels: scene.labels.map((label) => ({
      ...label,
      position: projectCoordinate(label.position, viewport),
    })),
  };
}
