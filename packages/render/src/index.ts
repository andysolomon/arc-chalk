import type {
  Coordinate,
  FieldLandmarks,
  FieldProfile,
  FieldWindow,
  MovementPath,
  PlayDocument,
  Player,
  TextLabel,
} from "@chalk/domain";
import { buildFieldLandmarks } from "@chalk/domain";

export interface ScenePlayer extends Pick<
  Player,
  "id" | "unit" | "symbol" | "label" | "sublabel" | "fill" | "color"
> {
  readonly position: Coordinate;
}

export type ScenePath = Pick<
  MovementPath,
  | "id"
  | "kind"
  | "playerId"
  | "points"
  | "branches"
  | "style"
  | "variant"
  | "coverageArea"
>;

export type SceneLabel = Pick<
  TextLabel,
  "id" | "position" | "text" | "color" | "size" | "box" | "boxColor"
>;

export interface RenderScene {
  readonly schemaVersion: 2;
  readonly playId: string;
  readonly field: {
    readonly profile: FieldProfile;
    readonly landmarks: FieldLandmarks;
    readonly lineOfScrimmageDepthYards: 0;
  };
  readonly players: readonly ScenePlayer[];
  readonly paths: readonly ScenePath[];
  readonly labels: readonly SceneLabel[];
}

export interface RenderSceneOptions {
  readonly fieldWindow?: FieldWindow;
}

export function buildRenderScene(
  play: PlayDocument,
  options: RenderSceneOptions = {},
): RenderScene {
  return {
    schemaVersion: 2,
    playId: play.id,
    field: {
      profile: structuredClone(play.fieldProfile),
      landmarks: buildFieldLandmarks(play.fieldProfile, options.fieldWindow),
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
      ({
        id,
        kind,
        playerId,
        points,
        branches,
        style,
        variant,
        coverageArea,
      }) => ({
        id,
        kind,
        playerId,
        points,
        branches,
        style,
        ...(variant === undefined ? {} : { variant }),
        ...(coverageArea === undefined ? {} : { coverageArea }),
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

export * from "./svg";
