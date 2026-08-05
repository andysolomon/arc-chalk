import type { Coordinate } from "@chalk/domain";

import type { RenderScene, ScenePath } from "./index";

export interface SvgViewport {
  readonly width: number;
  readonly height: number;
  readonly midfieldX: number;
  readonly lineOfScrimmageY: number;
  readonly pixelsPerYard: number;
}

export interface SvgPoint {
  readonly x: number;
  readonly y: number;
}

export const editorSvgViewport: SvgViewport = Object.freeze({
  width: 1068,
  height: 525,
  midfieldX: 532,
  lineOfScrimmageY: 356,
  pixelsPerYard: 13,
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

export interface SvgRenderScene {
  readonly schemaVersion: 1;
  readonly playId: string;
  readonly viewport: SvgViewport;
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

export function buildSvgRenderScene(
  scene: RenderScene,
  viewport: SvgViewport = editorSvgViewport,
): SvgRenderScene {
  return {
    schemaVersion: 1,
    playId: scene.playId,
    viewport,
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
