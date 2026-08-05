import type { Coordinate, FieldProfile } from "@chalk/domain";

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

function pathData(
  points: ScenePath["points"],
  viewport: SvgViewport,
  start?: Coordinate,
): string {
  const first = start ?? points[0];
  if (!first) throw new RangeError("Cannot project an empty movement path.");

  const startPoint = projectCoordinate(first, viewport);
  const firstPointIndex = start ? 0 : 1;
  let data = `M ${pointCommand(startPoint)}`;

  for (let index = firstPointIndex; index < points.length; index += 1) {
    const point = points[index]!;
    const projected = projectCoordinate(point, viewport);
    data += point.control
      ? ` Q ${pointCommand(projectCoordinate(point.control, viewport))} ${pointCommand(projected)}`
      : ` L ${pointCommand(projected)}`;
  }

  return data;
}

export interface SvgTick {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

function buildTicks(
  points: ScenePath["points"],
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
  readonly d: string;
  readonly style: ScenePath["style"];
  readonly ticks: readonly SvgTick[];
  readonly branches: readonly {
    readonly id: string;
    readonly d: string;
    readonly style: ScenePath["branches"][number]["style"];
  }[];
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
    paths: scene.paths.map((path) => ({
      id: path.id,
      d: pathData(path.points, viewport),
      style: path.style,
      ticks: buildTicks(path.points, viewport),
      branches: path.branches.map((branch, index) => {
        const branchStart = path.points[branch.fromIndex];
        if (!branchStart) {
          throw new RangeError(
            `Movement path ${path.id} branch ${index} has no start point.`,
          );
        }

        return {
          id: `${path.id}-branch-${index}`,
          d: pathData(branch.points, viewport, branchStart),
          style: branch.style,
        };
      }),
    })),
    labels: scene.labels.map((label) => ({
      ...label,
      position: projectCoordinate(label.position, viewport),
    })),
  };
}
