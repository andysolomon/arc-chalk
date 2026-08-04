import type {
  Coordinate,
  MovementPath,
  PlayDocument,
  Player,
  TextLabel,
} from "@chalk/domain";

export interface ScenePlayer extends Pick<
  Player,
  "id" | "unit" | "symbol" | "label" | "sublabel" | "fill" | "color"
> {
  readonly position: Coordinate;
}

export type ScenePath = Pick<
  MovementPath,
  "id" | "kind" | "playerId" | "points" | "branches" | "style"
>;

export type SceneLabel = Pick<
  TextLabel,
  "id" | "position" | "text" | "color" | "size" | "box" | "boxColor"
>;

export interface RenderScene {
  readonly schemaVersion: 1;
  readonly playId: string;
  readonly field: {
    readonly widthYards: number;
    readonly endZoneDepthYards: number;
    readonly hashOffsetYards: number;
    readonly lineOfScrimmageDepthYards: 0;
  };
  readonly players: readonly ScenePlayer[];
  readonly paths: readonly ScenePath[];
  readonly labels: readonly SceneLabel[];
}

export function buildRenderScene(play: PlayDocument): RenderScene {
  return {
    schemaVersion: 1,
    playId: play.id,
    field: {
      widthYards: play.fieldProfile.widthYards,
      endZoneDepthYards: play.fieldProfile.endZoneDepthYards,
      hashOffsetYards: play.fieldProfile.hashOffsetYards,
      lineOfScrimmageDepthYards: 0,
    },
    players: play.players.map(
      ({ id, unit, position, symbol, label, sublabel, fill, color }) => ({
        id,
        unit,
        position,
        symbol,
        label,
        sublabel,
        fill,
        color,
      }),
    ),
    paths: play.paths.map(
      ({ id, kind, playerId, points, branches, style }) => ({
        id,
        kind,
        playerId,
        points,
        branches,
        style,
      }),
    ),
    labels: play.labels.map(
      ({ id, position, text, color, size, box, boxColor }) => ({
        id,
        position,
        text,
        color,
        size,
        box,
        boxColor,
      }),
    ),
  };
}
