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
import { assignmentForPath, buildFieldLandmarks } from "@chalk/domain";

export interface ScenePlayer extends Pick<
  Player,
  | "id"
  | "unit"
  | "symbol"
  | "label"
  | "sublabel"
  | "fill"
  | "color"
  | "role"
  | "group"
> {
  readonly position: Coordinate;
}

export interface ScenePath extends Pick<
  MovementPath,
  | "id"
  | "kind"
  | "playerId"
  | "points"
  | "branches"
  | "style"
  | "variant"
  | "coverageArea"
  | "readOrder"
  | "conversion"
  | "coachingNote"
> {
  /**
   * What the man running this line is told to do. The wording belongs to him
   * rather than to the line (ADR 0011); the scene carries it here because it
   * is drawn at the end of the line it is about.
   */
  readonly assignment?: string;
}

export type SceneLabel = Pick<
  TextLabel,
  | "id"
  | "position"
  | "text"
  | "color"
  | "size"
  | "box"
  | "boxColor"
  | "caps"
  | "mono"
  | "role"
  | "unit"
  | "leader"
>;

export interface RenderScene {
  readonly schemaVersion: 2;
  readonly playId: string;
  readonly playName: string;
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

function resolveLabelPosition(
  play: PlayDocument,
  label: TextLabel,
): Coordinate {
  const binding = label.binding;
  if (!binding) return label.position;

  const path = play.paths.find(({ id }) => id === binding.pathId);
  if (!path || path.points.length < 2) return label.position;

  const segmentIndex = Math.min(
    Math.max(1, binding.segmentIndex),
    path.points.length - 1,
  );
  const start = path.points[segmentIndex - 1]!;
  const end = path.points[segmentIndex]!;
  const progress = binding.progress;
  const remaining = 1 - progress;
  const position = end.control
    ? {
        lateralYards:
          remaining * remaining * start.lateralYards +
          2 * remaining * progress * end.control.lateralYards +
          progress * progress * end.lateralYards,
        depthYards:
          remaining * remaining * start.depthYards +
          2 * remaining * progress * end.control.depthYards +
          progress * progress * end.depthYards,
      }
    : {
        lateralYards:
          start.lateralYards +
          (end.lateralYards - start.lateralYards) * progress,
        depthYards:
          start.depthYards + (end.depthYards - start.depthYards) * progress,
      };

  return {
    lateralYards: position.lateralYards + binding.offset.lateralYards,
    depthYards: position.depthYards + binding.offset.depthYards,
  };
}

export function buildRenderScene(
  play: PlayDocument,
  options: RenderSceneOptions = {},
): RenderScene {
  return {
    schemaVersion: 2,
    playId: play.id,
    playName: play.name,
    field: {
      profile: structuredClone(play.fieldProfile),
      landmarks: buildFieldLandmarks(play.fieldProfile, options.fieldWindow),
      lineOfScrimmageDepthYards: 0,
    },
    players: play.players.map(
      ({
        id,
        unit,
        position,
        symbol,
        label,
        sublabel,
        fill,
        color,
        role,
        group,
      }) => ({
        id,
        unit,
        position,
        symbol,
        label,
        sublabel,
        fill,
        color,
        ...(role === undefined ? {} : { role }),
        ...(group === undefined ? {} : { group }),
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
        readOrder,
        conversion,
        coachingNote,
      }) => {
        const assignment = assignmentForPath(play, id)?.text.trim();
        return {
          id,
          kind,
          playerId,
          points,
          branches,
          style,
          ...(variant === undefined ? {} : { variant }),
          ...(coverageArea === undefined ? {} : { coverageArea }),
          ...(readOrder === undefined ? {} : { readOrder }),
          ...(conversion === undefined ? {} : { conversion }),
          ...(coachingNote === undefined ? {} : { coachingNote }),
          ...(assignment ? { assignment } : {}),
        };
      },
    ),
    labels: play.labels.map((label) => ({
      id: label.id,
      position: resolveLabelPosition(play, label),
      text: label.text,
      color: label.color,
      size: label.size,
      box: label.box,
      boxColor: label.boxColor,
      ...(label.caps === undefined ? {} : { caps: label.caps }),
      ...(label.mono === undefined ? {} : { mono: label.mono }),
      ...(label.role === undefined ? {} : { role: label.role }),
      ...(label.unit === undefined ? {} : { unit: label.unit }),
      ...(label.leader === undefined ? {} : { leader: label.leader }),
    })),
  };
}

export * from "./svg";
