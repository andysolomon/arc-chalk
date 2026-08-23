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
import {
  assignmentForPath,
  buildFieldLandmarks,
  evaluatePlayAt,
  GHOST_TRAIL_OPACITY,
  playbackShowsAnimation,
  planPlay,
} from "@chalk/domain";

import {
  defaultPresentation,
  effectiveLayers,
  pageKindSpec,
  resolveTypeDensity,
  type FieldMarkingStyle,
  type Presentation,
  type TypeDensity,
  type TypePresetId,
} from "./presentation";

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
  /**
   * A man faded back rather than removed — the Position view keeps the
   * other groups on the field at 22% so the sheet keeps its context.
   */
  readonly opacity?: number;
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
  /** Ghosted routes sit behind the traveled trail. */
  readonly opacity?: number;
  /** The traveled portion of a line at the current frame. */
  readonly trail?: boolean;
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
    readonly style: FieldMarkingStyle;
  };
  readonly typePreset: TypePresetId;
  readonly type: TypeDensity;
  /** Route stroke width in frame pixels; absent draws the editor's 2.5. */
  readonly lineWeight?: number;
  readonly players: readonly ScenePlayer[];
  readonly paths: readonly ScenePath[];
  readonly labels: readonly SceneLabel[];
}

export interface RenderSceneOptions {
  readonly fieldWindow?: FieldWindow;
  readonly presentation?: Presentation;
  /**
   * Absolute timeline time. Snap is 0. Absent, or at rest at the timeline
   * start, keeps the static diagram — players at stance, routes at full
   * weight.
   */
  readonly atMs?: number;
  readonly playing?: boolean;
  /**
   * The men a sheet is about. Everyone else stays on the field faded to
   * `fadedOpacity` (the original's 22%) with their coaching text taken off,
   * so a position coach's handout still shows where his men fit.
   */
  readonly emphasis?: {
    readonly playerIds: ReadonlySet<string>;
    readonly fadedOpacity?: number;
  };
  /** Route stroke width override — wristband thumbnails draw at 1.5. */
  readonly lineWeight?: number;
}

export const FADED_GROUP_OPACITY = 0.22;

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
  const presentation = options.presentation ?? defaultPresentation;
  const page = pageKindSpec(presentation.pageKind);
  const layers = effectiveLayers(presentation);
  const plan = options.atMs === undefined ? undefined : planPlay(play);
  const animated =
    plan !== undefined &&
    options.atMs !== undefined &&
    playbackShowsAnimation(
      options.atMs,
      plan.startMs,
      options.playing === true,
    );
  const frame =
    animated && options.atMs !== undefined && plan !== undefined
      ? evaluatePlayAt(play, options.atMs, plan)
      : undefined;
  const emphasis = options.emphasis;
  const fadedOpacity = emphasis?.fadedOpacity ?? FADED_GROUP_OPACITY;
  const faded = (playerId: string): boolean =>
    emphasis !== undefined && !emphasis.playerIds.has(playerId);
  return {
    schemaVersion: 2,
    playId: play.id,
    playName: play.name,
    ...(options.lineWeight === undefined
      ? {}
      : { lineWeight: options.lineWeight }),
    field: {
      profile: structuredClone(play.fieldProfile),
      landmarks: buildFieldLandmarks(
        play.fieldProfile,
        options.fieldWindow ?? page.window,
      ),
      lineOfScrimmageDepthYards: 0,
      style: page.style,
    },
    typePreset: presentation.typePreset,
    type: resolveTypeDensity(presentation),
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
        position: frame?.playerPositions[id] ?? position,
        symbol,
        label,
        sublabel,
        fill,
        color,
        ...(role === undefined ? {} : { role }),
        ...(group === undefined ? {} : { group }),
        ...(faded(id) ? { opacity: fadedOpacity } : {}),
      }),
    ),
    paths: [
      ...play.paths.map(
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
          if (faded(playerId)) {
            return {
              id,
              kind,
              playerId,
              points,
              branches,
              style,
              ...(variant === undefined ? {} : { variant }),
              ...(coverageArea === undefined ? {} : { coverageArea }),
              opacity: fadedOpacity,
            };
          }
          return {
            id,
            kind,
            playerId,
            points,
            branches,
            style,
            ...(variant === undefined ? {} : { variant }),
            ...(coverageArea === undefined ? {} : { coverageArea }),
            ...(layers.reads && readOrder !== undefined ? { readOrder } : {}),
            ...(layers.notes && conversion !== undefined ? { conversion } : {}),
            ...(layers.notes && coachingNote !== undefined
              ? { coachingNote }
              : {}),
            ...(layers.assigns && assignment ? { assignment } : {}),
            ...(frame === undefined ? {} : { opacity: GHOST_TRAIL_OPACITY }),
          };
        },
      ),
      ...(frame?.trails ?? []).flatMap((trail) => {
        const source = play.paths.find(({ id }) => id === trail.pathId);
        if (!source || trail.points.length < 2) return [];
        return [
          {
            id: `${source.id}-trail`,
            kind: source.kind,
            playerId: source.playerId,
            points: trail.points.map((point) => ({
              lateralYards: point.lateralYards,
              depthYards: point.depthYards,
            })),
            branches: [],
            style: {
              ...source.style,
              line: "solid" as const,
              ending: "none" as const,
            },
            trail: true,
          },
        ];
      }),
    ],
    labels: layers.text
      ? play.labels.map((label) => ({
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
        }))
      : [],
  };
}

export * from "./presentation";
export * from "./svg";
