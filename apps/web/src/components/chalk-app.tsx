import {
  applyPlayCommand,
  assignmentForPath,
  ballPosition,
  ballSpotNames,
  currentBallSpot,
  createStableId,
  currentDefensiveCall,
  currentFormation,
  deletePathsCommand,
  DEFAULT_ZONE_COVERAGE_RADII,
  defensiveLineKinds,
  defensiveRouteKinds,
  isLineman,
  labelRolePresets,
  offensiveRouteKinds,
  labelSizeChoices,
  playErasureCommand,
  playErasures,
  PRODUCT_NAME,
  blockPresets,
  defensivePresets,
  lineCallKeys,
  linePresetByKey,
  routePresetNames,
  stickThunderPlay,
  stockConcepts,
  formationFromOffense,
  stockDefensiveCalls,
  stockFormations,
  type LabelRole,
  type DefensiveCall,
  type Formation,
  type MovementPath,
  type Player,
  type BallSpot,
  type PlayCommand,
  type PlayDocument,
  type PlayErasure,
  type TextLabel,
} from "@chalk/domain";
import {
  addAlternateRouteCommand,
  addDepthLabelCommand,
  alignPlayersCommand,
  cameraForBounds,
  cameraZoom,
  type FrameBounds,
  centreCamera,
  fitCamera,
  panCamera,
  zoomCamera,
  type Camera,
  addRouteChoiceCommand,
  applyConceptCommand,
  applyDefensiveCallCommand,
  applyFormationCommand,
  applyLabelRoleCommand,
  applyRoutePresetCommand,
  spotBallCommand,
  conceptIsOn,
  applyLinePresetCommand,
  flipStrengthCommand,
  groupSelectionCommand,
  reverseRouteCommand,
  ungroupSelectionCommand,
  type PlayerAlignment,
  linemenOf,
  linePresetIsOn,
  fieldHitOptions,
  fieldInteraction,
  hitTestField,
  reorderSelectionCommand,
  flipPlayerLinesCommand,
  flipRouteCommand,
  removeRouteChoiceCommand,
  setPlayerCommand,
  insertedEntityIds,
  gesturePreviewCommand,
  idleFieldInteraction,
  setLabelAppearanceCommand,
  ROUTE_COACHING_LIMITS,
  setLabelTextCommand,
  setRouteAssignmentCommand,
  setRouteCoachingTextCommand,
  setRouteKindCommand,
  setRouteReadCommand,
  setRouteStyleCommand,
  straightenRouteCommand,
  localSaveMessage,
  localSaveStatus,
  pruneFieldSelection,
  editorScreenQuery,
  idleStylus,
  penInterrupts,
  stylusDown,
  stylusIsPrecise,
  stylusRejects,
  stylusUp,
  touchNavigates,
  type StylusState,
  type EditorUndoState,
  type EditorVersionSummary,
  type FieldDrawingState,
  type FieldGesture,
  lineOf,
  type FieldHandleRef,
  type FieldInteractionContext,
  type FieldInteractionEvent,
  type FieldInteractionModel,
  type FieldItemRef,
  type LabelAppearance,
  type PlayerAppearance,
} from "@chalk/editor";
import {
  buildRenderScene,
  buildSvgRenderScene,
  createSvgProjection,
  editorSvgViewport,
  projectCoordinate,
  unprojectPoint,
  type RenderScene,
  type SvgPoint,
  type SvgProjection,
  type SvgRenderScene,
  type SvgPathStroke,
  type SvgShapePrimitive,
  type SvgTextPrimitive,
} from "@chalk/render";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { ChalkRuntime } from "../app/editor-runtime";
import { type ActionMap } from "./editor-command-surface";
import {
  ClearMenu,
  CommandPalette,
  ContextMenu,
  DefenseBrowser,
  ExportMenu,
  FormationBrowser,
  MoreMenu,
  SaveMenu,
  ShortcutReference,
} from "./editor-overlays";

type View = "Editor" | "Demo" | "Present" | "Print";
type Menu = "more" | "export" | "save" | "clear" | null;
type Overlay = "palette" | "shortcuts" | "formations" | "defenses" | null;
type Tool =
  "select" | "player" | "route" | "motion" | "block" | "zone" | "text";

const views: View[] = ["Editor", "Demo", "Present", "Print"];
const tools: Array<{
  id: Tool;
  label: string;
  shortcut: string;
  glyph: ToolGlyph;
}> = [
  { id: "select", label: "Select", shortcut: "V", glyph: "select" },
  { id: "player", label: "Player", shortcut: "P", glyph: "player" },
  { id: "route", label: "Route", shortcut: "R", glyph: "route" },
  { id: "motion", label: "Motion", shortcut: "M", glyph: "motion" },
  { id: "block", label: "Block", shortcut: "B", glyph: "block" },
  { id: "zone", label: "Zone drop", shortcut: "Z", glyph: "zone" },
  { id: "text", label: "Text", shortcut: "T", glyph: "text" },
];

type ToolGlyph = Tool | "snap";

/** The canonical prototype's rail artwork, kept on its original 18-unit grid. */
function ToolIcon({ glyph }: { glyph: ToolGlyph }) {
  const icons: Record<ToolGlyph, React.ReactNode> = {
    select: (
      <path
        d="M4.5 2.5 L4.5 14.5 L8 11.6 L10 16 L12 15.1 L10 10.8 L14.5 10.5 Z"
        fill="currentColor"
        stroke="none"
      />
    ),
    player: <circle cx="9" cy="9" r="5.5" />,
    route: (
      <>
        <path d="M3.5 15 L9.5 15 L9.5 5" />
        <path d="M6.5 7.5 L9.5 4 L12.5 7.5" />
      </>
    ),
    motion: (
      <>
        <path d="M2.5 12.5 L10.5 12.5" strokeDasharray="2.5 2.5" />
        <path d="M9.5 9 L13 12.5 L9.5 16" />
      </>
    ),
    block: (
      <>
        <path d="M9 15.5 L9 6.5" />
        <path d="M4.5 6.5 L13.5 6.5" strokeWidth="2" />
      </>
    ),
    zone: (
      <>
        <path d="M3 15.5 L7.5 10" strokeDasharray="2.5 2.5" />
        <circle cx="11" cy="6.5" r="4" />
      </>
    ),
    text: (
      <text
        fill="currentColor"
        fontSize="13"
        fontWeight="500"
        stroke="none"
        textAnchor="middle"
        x="9"
        y="13.5"
      >
        T
      </text>
    ),
    snap: (
      <>
        <path d="M4 3.5 L4 14.5 L15 14.5" />
        <path d="M4 8.5 A6 6 0 0 1 10 14.5" strokeDasharray="2.5 2.5" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 18 18">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      >
        {icons[glyph]}
      </g>
    </svg>
  );
}

const stickThunderScene = buildSvgRenderScene(
  buildRenderScene(stickThunderPlay),
);

const sceneColors = {
  ink: "#171717",
  blue: "#0072f5",
  red: "#E5484D",
  green: "#398E4A",
  orange: "#C2540A",
  gray: "#8F8F8F",
  yellow: "#F5D90A",
} as const;

const routeDashes: Record<SvgPathStroke["style"]["line"], string | undefined> =
  {
    solid: undefined,
    dashed: "8 6",
    dotted: "2 6",
    zigzag: undefined,
  };

function RoutePath({
  d,
  id,
  style,
}: {
  d: string;
  id: string;
  style: SvgPathStroke["style"];
}) {
  const markerEnd =
    style.ending === "none"
      ? undefined
      : `url(#chalk-${style.ending}-${style.color})`;

  return (
    <path
      d={d}
      data-scene-path={id}
      fill="none"
      markerEnd={markerEnd}
      stroke={sceneColors[style.color]}
      strokeDasharray={routeDashes[style.line]}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.5"
    />
  );
}

function SceneShape({ shape }: { shape: SvgShapePrimitive }) {
  switch (shape.kind) {
    case "circle":
      return (
        <circle
          cx={shape.cx}
          cy={shape.cy}
          fill={shape.fill}
          r={shape.r}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
        />
      );
    case "rect":
      return (
        <rect
          fill={shape.fill}
          height={shape.height}
          rx={shape.rx}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          width={shape.width}
          x={shape.x}
          y={shape.y}
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={shape.cx}
          cy={shape.cy}
          fill={shape.fill}
          rx={shape.rx}
          ry={shape.ry}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
        />
      );
    case "path":
      return (
        <path
          d={shape.d}
          fill={shape.fill}
          stroke={shape.stroke}
          strokeLinecap={shape.strokeLinecap}
          strokeLinejoin={shape.strokeLinejoin}
          strokeWidth={shape.strokeWidth}
        />
      );
  }
}

function SceneText({ text }: { text: SvgTextPrimitive }) {
  return (
    <text {...text} textAnchor="middle">
      {text.text}
    </text>
  );
}

/** The original's selection blue, used for halos, guides, and the marquee. */
const SELECTION_BLUE = "#0072F5";

/** The original's own wait before a held press becomes a menu. */
const LONG_PRESS_MS = 480;
/**
 * The frame the renderer draws into, which is what the camera looks at. Taken
 * from the renderer rather than written out again, so the two cannot drift.
 */
const EDITOR_FRAME = Object.freeze({
  width: editorSvgViewport.width,
  height: editorSvgViewport.height,
});
/** How long the original leaves what just happened on screen. */
const TOAST_MS = 4200;

/**
 * What a Coach writes on a route beyond drawing it. The read number and the
 * Assignment print on the field; the conversion and the note ride along with
 * the route wherever it goes.
 */
type RouteCoachingField =
  "readOrder" | "assignment" | "conversion" | "coachingNote";

/** Whether the device's own pointer is a blunt one, as the browser sees it. */
function deviceIsCoarse(): boolean {
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(pointer: coarse)").matches
  );
}

/**
 * How big a handle's invisible target is. Touch needs 44 CSS px (ADR 0016),
 * but a mouse does not: at that size a handle swallows the middle of a short
 * segment, and the segment underneath can no longer be clicked at all. A
 * fine pointer keeps the original's smaller targets and its precision.
 *
 * An iPad is the case that decides how this is asked. It calls itself coarse
 * whichever pointer the Coach has picked up, so asking the device would hand a
 * Pencil the finger's targets and lose exactly the precision he reached for it
 * to get. What last touched the field is the better answer.
 */
function handleTargetSize(
  zoom: number,
  precise: boolean,
): {
  readonly node: number;
  readonly control: number;
} {
  const base = precise ? { node: 13, control: 20 } : { node: 22, control: 44 };
  // These are CSS pixels, and the frame is drawn in frame units — so they
  // are divided by how big a frame unit actually is, and a handle stays the
  // size his finger is however far in he has zoomed and however small the
  // screen he is working on.
  return { node: base.node / zoom, control: base.control / zoom };
}

/**
 * What the Coach has picked, as a rectangle of the drawn frame, so the camera
 * can be asked to show it. A route counts every point it has, forks included,
 * because a route half off the screen has not been shown.
 */
function selectionFrameBounds(
  document: PlayDocument,
  selection: readonly FieldItemRef[],
  projection: SvgProjection,
): FrameBounds | undefined {
  const points: SvgPoint[] = [];
  for (const item of selection) {
    if (item.kind === "player") {
      const player = document.players.find(({ id }) => id === item.id);
      if (player) points.push(projectCoordinate(player.position, projection));
    } else if (item.kind === "label") {
      const label = document.labels.find(({ id }) => id === item.id);
      if (label) points.push(projectCoordinate(label.position, projection));
    } else {
      const path = document.paths.find(({ id }) => id === item.id);
      for (const point of path?.points ?? []) {
        points.push(projectCoordinate(point, projection));
      }
      for (const branch of path?.branches ?? []) {
        for (const point of branch.points) {
          points.push(projectCoordinate(point, projection));
        }
      }
    }
  }
  if (points.length === 0) return undefined;
  return {
    minX: Math.min(...points.map(({ x }) => x)),
    minY: Math.min(...points.map(({ y }) => y)),
    maxX: Math.max(...points.map(({ x }) => x)),
    maxY: Math.max(...points.map(({ y }) => y)),
  };
}

/** Tools the interaction machine understands; the rest it never sees. */
function interactionTool(tool: Tool): FieldInteractionContext["tool"] {
  return tool;
}

/** The depth a route may reach without leaving the drawn frame. */
function fieldDepthWindow(projection: SvgProjection) {
  return {
    minDepthYards: unprojectPoint(
      { x: 0, y: projection.height - 6 },
      projection,
    ).depthYards,
    maxDepthYards: unprojectPoint({ x: 0, y: 6 }, projection).depthYards,
  };
}

function selectionKey(kind: "player" | "path" | "label", id: string): string {
  return `${kind}:${id}`;
}

export function FieldDiagram({
  camera,
  scene = stickThunderScene,
  selection,
  overlay,
  routeDotPlayerId,
  onHoverPlayer,
  onStartRoute,
  svgRef,
  ...pointerHandlers
}: {
  /** The part of the drawn frame on screen; absent shows all of it. */
  camera?: Camera;
  scene?: SvgRenderScene;
  /** Keys like "player:q" — absent means a non-interactive rendering. */
  selection?: ReadonlySet<string>;
  overlay?: React.ReactNode;
  /** The Player currently offering the blue draw-a-route dot, if any. */
  routeDotPlayerId?: string;
  onHoverPlayer?: (playerId: string | undefined) => void;
  onStartRoute?: (playerId: string) => void;
  svgRef?: React.Ref<SVGSVGElement>;
  onPointerDown?: React.PointerEventHandler<SVGSVGElement>;
  onPointerMove?: React.PointerEventHandler<SVGSVGElement>;
  onPointerUp?: React.PointerEventHandler<SVGSVGElement>;
  onPointerCancel?: React.PointerEventHandler<SVGSVGElement>;
  onDoubleClick?: React.MouseEventHandler<SVGSVGElement>;
  onContextMenu?: React.MouseEventHandler<SVGSVGElement>;
  onWheel?: React.WheelEventHandler<SVGSVGElement>;
}) {
  const selected = (kind: "player" | "path" | "label", id: string): boolean =>
    selection?.has(selectionKey(kind, id)) === true;
  return (
    <svg
      className="field-diagram"
      role="img"
      aria-label={`${scene.playName} football play`}
      // The field is driven by pointer events; letting mousedown run its
      // default would move focus to the document body, which would tear it
      // straight back out of a note the Coach was put into typing.
      onMouseDown={(event) => event.preventDefault()}
      ref={svgRef}
      viewBox={
        camera
          ? `${camera.x} ${camera.y} ${camera.width} ${camera.height}`
          : `0 0 ${scene.viewport.width} ${scene.viewport.height}`
      }
      {...pointerHandlers}
    >
      <defs>
        {Object.entries(sceneColors).map(([token, color]) => (
          <g key={token}>
            <marker
              id={`chalk-arrow-${token}`}
              markerHeight="13"
              markerUnits="userSpaceOnUse"
              markerWidth="13"
              orient="auto-start-reverse"
              refX="8.5"
              refY="5"
              viewBox="0 0 10 10"
            >
              <path d="M0 0 10 5 0 10z" fill={color} />
            </marker>
            <marker
              id={`chalk-dot-${token}`}
              markerHeight="10"
              markerUnits="userSpaceOnUse"
              markerWidth="10"
              orient="auto"
              refX="5"
              refY="5"
              viewBox="0 0 10 10"
            >
              <circle cx="5" cy="5" fill={color} r="3.6" />
            </marker>
            <marker
              id={`chalk-bar-${token}`}
              markerHeight="14"
              markerUnits="userSpaceOnUse"
              markerWidth="14"
              orient="auto"
              refX="5"
              refY="5"
              viewBox="0 0 10 10"
            >
              <path d="M5 0v10" fill="none" stroke={color} strokeWidth="2" />
            </marker>
            <marker
              id={`chalk-bubble-${token}`}
              markerHeight="20"
              markerUnits="userSpaceOnUse"
              markerWidth="20"
              orient="auto"
              refX="10"
              refY="10"
              viewBox="0 0 20 20"
            >
              <circle
                cx="10"
                cy="10"
                fill="#fff"
                r="7.5"
                stroke={color}
                strokeWidth="2"
              />
            </marker>
            <marker
              id={`chalk-hook-${token}`}
              markerHeight="15"
              markerUnits="userSpaceOnUse"
              markerWidth="15"
              orient="auto"
              refX="2"
              refY="6"
              viewBox="0 0 12 12"
            >
              <path
                d="M2 6a3.4 3.4 0 1 1 6.8 0 3.4 3.4 0 0 1-6.8 0"
                fill="none"
                stroke={color}
                strokeWidth="1.8"
              />
            </marker>
            <marker
              id={`chalk-chevron-${token}`}
              markerHeight="15"
              markerUnits="userSpaceOnUse"
              markerWidth="15"
              orient="auto"
              refX="10"
              refY="6"
              viewBox="0 0 12 12"
            >
              <path
                d="m2 2 4 4-4 4m4-8 4 4-4 4"
                fill="none"
                stroke={color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </marker>
            <marker
              id={`chalk-diamond-${token}`}
              markerHeight="14"
              markerUnits="userSpaceOnUse"
              markerWidth="14"
              orient="auto"
              refX="6"
              refY="6"
              viewBox="0 0 12 12"
            >
              <path
                d="m6 1.5 4.5 4.5L6 10.5 1.5 6z"
                fill="#fff"
                stroke={color}
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </marker>
            <marker
              id={`chalk-square-${token}`}
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              markerWidth="12"
              orient="auto"
              refX="6"
              refY="6"
              viewBox="0 0 12 12"
            >
              <rect fill={color} height="7" width="7" x="2.5" y="2.5" />
            </marker>
          </g>
        ))}
      </defs>
      <rect
        className="field-paper"
        height={scene.viewport.height}
        width={scene.viewport.width}
      />
      {scene.field.yardLines.map((line) => (
        <line
          className={
            line.isLineOfScrimmage ? "line-of-scrimmage" : "field-grid"
          }
          data-field-yard-line={line.id}
          key={line.id}
          x1={line.x1}
          x2={line.x2}
          y1={line.y1}
          y2={line.y2}
        />
      ))}
      {scene.field.sidelines.map((line) => (
        <line
          className="field-grid"
          data-field-sideline={line.id}
          key={line.id}
          x1={line.x1}
          x2={line.x2}
          y1={line.y1}
          y2={line.y2}
        />
      ))}
      {[...scene.field.hashMarks, ...scene.field.sidelineMarks].map((line) => (
        <line
          className="hash"
          data-field-minor-mark={line.id}
          key={line.id}
          x1={line.x1}
          x2={line.x2}
          y1={line.y1}
          y2={line.y2}
        />
      ))}
      <g className="yard-numbers">
        {scene.field.numbers.map((number) => (
          <text
            data-field-number={number.id}
            fontSize={number.fontSize}
            key={number.id}
            x={number.x}
            y={number.y}
          >
            {number.value}
          </text>
        ))}
      </g>
      <g className="routes">
        {scene.paths.map((path) => (
          <g aria-label={path.ariaLabel} key={path.id} role="img">
            <title>{path.ariaLabel}</title>
            {selected("path", path.id)
              ? [
                  ...path.strokes,
                  ...path.branches.flatMap((b) => b.strokes),
                ].map((stroke) => (
                  <path
                    d={stroke.d}
                    data-selected-path={path.id}
                    fill="none"
                    key={`sel-${stroke.id}`}
                    opacity="0.18"
                    pointerEvents="none"
                    stroke={SELECTION_BLUE}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="8.5"
                  />
                ))
              : null}
            {path.coverageArea ? (
              <g data-scene-coverage={path.coverageArea.id}>
                <ellipse
                  cx={path.coverageArea.center.x}
                  cy={path.coverageArea.center.y}
                  fill={path.coverageArea.fill}
                  opacity="0.26"
                  rx={path.coverageArea.radiusX}
                  ry={path.coverageArea.radiusY}
                />
                <ellipse
                  cx={path.coverageArea.center.x}
                  cy={path.coverageArea.center.y}
                  fill="none"
                  rx={path.coverageArea.radiusX}
                  ry={path.coverageArea.radiusY}
                  stroke={path.coverageArea.fill}
                  strokeDasharray="5 4"
                  strokeWidth="1.9"
                />
              </g>
            ) : null}
            {path.strokes.map((stroke) => (
              <RoutePath {...stroke} key={stroke.id} />
            ))}
            {path.ticks.map(({ color, ...tick }, index) => (
              <line
                data-scene-tick={`${path.id}-${index}`}
                key={`${path.id}-tick-${index}`}
                stroke={sceneColors[color]}
                strokeLinecap="round"
                strokeWidth="2.5"
                {...tick}
              />
            ))}
            {path.coaching ? (
              <g className="route-coaching" pointerEvents="none">
                {path.coaching.read ? (
                  <g data-scene-read={path.coaching.read.id}>
                    <circle
                      cx={path.coaching.read.center.x}
                      cy={path.coaching.read.center.y}
                      fill="#fff"
                      r={path.coaching.read.radius}
                      stroke={SELECTION_BLUE}
                      strokeWidth="1.4"
                    />
                    <SceneText
                      text={{
                        ...path.coaching.read.text,
                        // Centred in the circle rather than sitting on its
                        // middle, the way a number in a bubble reads.
                        y:
                          path.coaching.read.text.y +
                          path.coaching.read.text.fontSize * 0.35,
                      }}
                    />
                  </g>
                ) : null}
                {path.coaching.notes.map((note) => (
                  <g data-scene-coaching={note.id} key={note.id}>
                    <SceneText text={note.text} />
                  </g>
                ))}
              </g>
            ) : null}
            {path.branches.flatMap((branch) => [
              ...branch.strokes.map((stroke) => (
                <RoutePath {...stroke} key={stroke.id} />
              )),
              ...branch.ticks.map(({ color, ...tick }, index) => (
                <line
                  data-scene-tick={`${branch.id}-${index}`}
                  key={`${branch.id}-tick-${index}`}
                  stroke={sceneColors[color]}
                  strokeLinecap="round"
                  strokeWidth="2.5"
                  {...tick}
                />
              )),
            ])}
          </g>
        ))}
      </g>
      <g className="field-annotations">
        {scene.labels.map((label) => (
          <g
            aria-label={label.ariaLabel}
            data-label-role={label.role}
            data-scene-label={label.id}
            key={label.id}
            role="img"
          >
            <title>{label.ariaLabel}</title>
            {label.leader ? (
              <>
                <line
                  data-label-leader={label.id}
                  opacity={label.leader.opacity}
                  stroke={label.leader.stroke}
                  strokeDasharray={label.leader.strokeDasharray}
                  strokeWidth={label.leader.strokeWidth}
                  x1={label.leader.x1}
                  x2={label.leader.x2}
                  y1={label.leader.y1}
                  y2={label.leader.y2}
                />
                <circle
                  cx={label.leader.x2}
                  cy={label.leader.y2}
                  fill={label.leader.stroke}
                  r={label.leader.endpointRadius}
                />
              </>
            ) : null}
            {label.box ? <SceneShape shape={label.box} /> : null}
            <SceneText text={label.text} />
            {selected("label", label.id) ? (
              <rect
                data-selected-label={label.id}
                fill="none"
                height={label.text.fontSize + 14}
                pointerEvents="none"
                rx={4}
                stroke={SELECTION_BLUE}
                strokeDasharray="3 3"
                strokeWidth={1}
                width={
                  Math.max(
                    24,
                    label.text.text.length * label.text.fontSize * 0.62,
                  ) + 16
                }
                x={
                  label.position.x -
                  (Math.max(
                    24,
                    label.text.text.length * label.text.fontSize * 0.62,
                  ) +
                    16) /
                    2
                }
                y={label.position.y - label.text.fontSize - 6}
              />
            ) : null}
          </g>
        ))}
      </g>
      <g className="players">
        {scene.players.map((player) => (
          <g
            aria-label={player.ariaLabel}
            className={selected("player", player.id) ? "selected" : undefined}
            data-scene-player={player.id}
            key={player.id}
            onPointerEnter={
              onHoverPlayer ? () => onHoverPlayer(player.id) : undefined
            }
            onPointerLeave={
              onHoverPlayer ? () => onHoverPlayer(undefined) : undefined
            }
            role="img"
            transform={`translate(${player.position.x} ${player.position.y})`}
          >
            <title>{player.ariaLabel}</title>
            {selected("player", player.id) ? (
              <circle
                className="selection-halo"
                fill="none"
                r={19}
                stroke={SELECTION_BLUE}
                strokeWidth={1.5}
                opacity={0.3}
              />
            ) : null}
            {player.shapes.map((shape, index) => (
              <SceneShape key={`${player.id}-shape-${index}`} shape={shape} />
            ))}
            {player.texts.map((text, index) => (
              <SceneText key={`${player.id}-text-${index}`} text={text} />
            ))}
            {routeDotPlayerId === player.id ? (
              <circle
                className="route-dot"
                cx={0}
                cy={-26}
                data-route-dot={player.id}
                fill={SELECTION_BLUE}
                onPointerDown={(event) => {
                  // The dot owns this press: it starts a route rather than
                  // letting the field begin a move.
                  event.stopPropagation();
                  onStartRoute?.(player.id);
                }}
                r={5}
                stroke="#FFFFFF"
                strokeWidth={1.5}
              >
                <title>Drag off to draw a route from this player</title>
              </circle>
            ) : null}
          </g>
        ))}
      </g>
      {overlay}
    </svg>
  );
}

/**
 * The handles on the one selected route: a circle on every break, a square
 * in the middle of every segment to bend it, and the zone corner. Their
 * radii are viewBox units, which the editor draws at no more than one CSS
 * pixel each, so they stay constant on screen and their invisible hit areas
 * clear the 44 CSS px touch minimum (ADR 0016).
 */
function RouteHandles({
  branchIndex,
  onHandleDown,
  path,
  precise,
  projection,
  selectedNodeIndex,
  selectedSegmentIndex,
  zoom,
}: {
  /** Which line of the route carries the handles: a branch, or the main one. */
  branchIndex?: number;
  onHandleDown: (handle: FieldHandleRef, event: React.PointerEvent) => void;
  path: MovementPath;
  /** Whether the pointer in the Coach's hand is a precise one. */
  precise: boolean;
  projection: SvgProjection;
  selectedNodeIndex?: number;
  selectedSegmentIndex?: number;
  /** How many CSS pixels one frame unit is drawn at. */
  zoom: number;
}) {
  const target = handleTargetSize(zoom, precise);
  const line = lineOf(path, branchIndex);
  // A branch runs from the break it was split off at, so that point leads
  // the line and gives the first bend handle something to measure from.
  const branchOrigin =
    branchIndex === undefined
      ? undefined
      : path.points[path.branches[branchIndex]?.fromIndex ?? 0];
  const points = [...(branchOrigin ? [branchOrigin] : []), ...line].map(
    (point) => ({
      ...projectCoordinate(point, projection),
      control: point.control
        ? projectCoordinate(point.control, projection)
        : undefined,
    }),
  );
  // With a branch shown, index 0 is the main-line break it grows from, which
  // belongs to the main line and is not the branch's to move.
  const offset = branchOrigin ? 1 : 0;
  // An unsized drop shows its corner on the default bubble it is drawn with,
  // so the handle is where the Coach can already see the area.
  const coverage =
    path.kind === "zone" && path.style.ending === "bubble"
      ? (path.coverageArea ?? DEFAULT_ZONE_COVERAGE_RADII)
      : undefined;
  const zoneCenter = branchIndex === undefined ? points.at(-1) : undefined;

  /** The drawn shape of one segment, curve included. */
  const segmentPath = (index: number): string => {
    const from = points[index - 1]!;
    const to = points[index]!;
    return to.control
      ? `M ${from.x} ${from.y} Q ${to.control.x} ${to.control.y} ${to.x} ${to.y}`
      : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  };
  // What the Coach has narrowed to: a whole branch, or one segment of the
  // main line. Either is drawn as a thick blue wash under the route.
  const highlighted =
    branchIndex !== undefined
      ? points.slice(1).map((_, index) => segmentPath(index + 1))
      : selectedSegmentIndex !== undefined && points[selectedSegmentIndex]
        ? [segmentPath(selectedSegmentIndex)]
        : [];

  return (
    <g className="route-handles">
      {highlighted.map((d, index) => (
        <path
          d={d}
          data-line-highlight={branchIndex === undefined ? "segment" : "branch"}
          fill="none"
          key={`highlight-${index}`}
          opacity={branchIndex === undefined ? 0.22 : 0.18}
          pointerEvents="none"
          stroke={SELECTION_BLUE}
          strokeLinecap="round"
          strokeWidth={9.5}
        />
      ))}
      {branchIndex === undefined
        ? path.branches.map((branch, index) => {
            const from = path.points[branch.fromIndex];
            if (!from) return null;
            const at = projectCoordinate(from, projection);
            // Where a choice route splits off. Clicking that line selects it.
            return (
              <circle
                cx={at.x}
                cy={at.y}
                data-branch-marker={index}
                fill={SELECTION_BLUE}
                key={`branch-${index}`}
                opacity={0.5}
                pointerEvents="none"
                r={3.5}
              />
            );
          })
        : null}
      {points.map((point, index) => {
        if (index === 0) return null;
        const previous = points[index - 1]!;
        // The bend handle sits where the segment actually passes, which for
        // a curved segment is the quadratic's own midpoint.
        const midpoint = point.control
          ? {
              x: (previous.x + 2 * point.control.x + point.x) / 4,
              y: (previous.y + 2 * point.control.y + point.y) / 4,
            }
          : { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 };
        return (
          <g key={`control-${index}`}>
            <rect
              fill="#FFFFFF"
              height={7}
              pointerEvents="none"
              rx={1.5}
              stroke="#8FC2F8"
              strokeWidth={1.5}
              width={7}
              x={midpoint.x - 3.5}
              y={midpoint.y - 3.5}
            />
            <rect
              className="handle-target"
              data-control-handle={index}
              fill="transparent"
              height={target.control}
              onPointerDown={(event) =>
                onHandleDown(
                  {
                    kind: "control",
                    pathId: path.id,
                    pointIndex: index - offset,
                    ...(branchIndex === undefined ? {} : { branchIndex }),
                  },
                  event,
                )
              }
              width={target.control}
              x={midpoint.x - target.control / 2}
              y={midpoint.y - target.control / 2}
            >
              <title>Curve handle — drag to bend this segment</title>
            </rect>
          </g>
        );
      })}
      {points.map((point, index) => {
        if (branchOrigin && index === 0) return null;
        const active = selectedNodeIndex === index - offset;
        return (
          <g key={`node-${index}`}>
            {active ? (
              <circle
                cx={point.x}
                cy={point.y}
                fill="none"
                opacity={0.35}
                pointerEvents="none"
                r={10}
                stroke={SELECTION_BLUE}
                strokeWidth={1.5}
              />
            ) : null}
            <circle
              cx={point.x}
              cy={point.y}
              fill={active ? SELECTION_BLUE : "#FFFFFF"}
              pointerEvents="none"
              r={active ? 6.5 : 5}
              stroke={SELECTION_BLUE}
              strokeWidth={active ? 2 : 1.5}
            />
            <circle
              className="handle-target"
              cx={point.x}
              cy={point.y}
              data-node-handle={index - offset}
              fill="transparent"
              onPointerDown={(event) =>
                onHandleDown(
                  {
                    kind: "node",
                    pathId: path.id,
                    pointIndex: index - offset,
                    ...(branchIndex === undefined ? {} : { branchIndex }),
                  },
                  event,
                )
              }
              r={target.node}
            >
              <title>
                {index - offset === 0
                  ? "Start — drag to move"
                  : index === points.length - 1
                    ? "End — drag to move"
                    : `Break ${index - offset} — drag to move`}
              </title>
            </circle>
          </g>
        );
      })}
      {coverage && zoneCenter
        ? (() => {
            const corner = {
              x:
                zoneCenter.x +
                coverage.radiusLateralYards * projection.lateralPixelsPerYard,
              y:
                zoneCenter.y -
                coverage.radiusDepthYards * projection.depthPixelsPerYard,
            };
            return (
              <g>
                <rect
                  fill="#FFFFFF"
                  height={7}
                  pointerEvents="none"
                  rx={1.5}
                  stroke={SELECTION_BLUE}
                  strokeWidth={1.5}
                  width={7}
                  x={corner.x - 3.5}
                  y={corner.y - 3.5}
                />
                <rect
                  className="handle-target zone-handle"
                  data-zone-handle={path.id}
                  fill="transparent"
                  height={44}
                  onPointerDown={(event) =>
                    onHandleDown({ kind: "zone", pathId: path.id }, event)
                  }
                  width={44}
                  x={corner.x - 22}
                  y={corner.y - 22}
                >
                  <title>Drag to size the zone he owns</title>
                </rect>
              </g>
            );
          })()
        : null}
    </g>
  );
}

/** The size the renderer draws a man at, so a ghost of him is the same size. */
const GHOST_RADIUS_PX = 12;

/**
 * Where the men would stand if the Coach took the set his pointer is over.
 * Drawn in grey under the browser's own dim, so he can compare it with what
 * is on the field without leaving the list — the picture is the answer.
 */
function FormationGhost({
  formationId,
  formations,
  projection,
}: {
  formationId?: string;
  formations: readonly Formation[];
  projection: SvgProjection;
}) {
  // Both books hold Formations — a set is one, and a call is one with its
  // assignments beside it — so one ghost answers for either.
  const formation = formationId
    ? (formations.find(({ id }) => id === formationId) ??
      stockDefensiveCalls.find(
        ({ formation: value }) => value.id === formationId,
      )?.formation)
    : undefined;
  if (!formation) return null;
  return (
    <g
      className="formation-ghost"
      data-formation-ghost={formation.id}
      pointerEvents="none"
    >
      {formation.slots.map((slot) => {
        const at = projectCoordinate(slot.position, projection);
        return (
          <circle
            cx={at.x}
            cy={at.y}
            fill="none"
            key={slot.id}
            r={GHOST_RADIUS_PX}
            stroke="#8f8f8f"
            strokeWidth={1.5}
          />
        );
      })}
    </g>
  );
}

/**
 * The transient layer of an in-flight gesture: snap guides, the depth
 * readout, and the marquee, drawn the way the original drew them.
 */
function FieldInteractionOverlay({
  drawing,
  gesture,
  projection,
}: {
  drawing?: FieldDrawingState;
  gesture: FieldGesture;
  projection: SvgProjection;
}) {
  if (drawing) {
    const drawn = drawing.points.map((point) => ({
      ...projectCoordinate(point, projection),
      control: point.control
        ? projectCoordinate(point.control, projection)
        : undefined,
    }));
    const cursor = projectCoordinate(drawing.cursor, projection);
    const commands = drawn.map((point, index) =>
      index === 0
        ? `M ${point.x} ${point.y}`
        : point.control
          ? `Q ${point.control.x} ${point.control.y} ${point.x} ${point.y}`
          : `L ${point.x} ${point.y}`,
    );
    return (
      <g className="drawing-overlay" pointerEvents="none">
        <path
          d={`${commands.join(" ")} L ${cursor.x} ${cursor.y}`}
          data-drawing-preview
          fill="none"
          stroke={SELECTION_BLUE}
          strokeDasharray="6 5"
          strokeWidth={2.5}
        />
        {drawn.map((point, index) => (
          <circle
            cx={point.x}
            cy={point.y}
            fill={SELECTION_BLUE}
            key={`draw-point-${index}`}
            r={3}
          />
        ))}
        {drawing.depthBuffer === "" ? null : (
          <text
            data-depth-buffer
            fill={SELECTION_BLUE}
            fontFamily="'Geist Mono', monospace"
            fontSize={11}
            x={cursor.x + 10}
            y={cursor.y - 10}
          >
            {`${drawing.depthBuffer} yds`}
          </text>
        )}
      </g>
    );
  }
  if (gesture.kind === "moving") {
    const readout = gesture.readout
      ? {
          ...projectCoordinate(gesture.readout.position, projection),
          text: gesture.readout.text,
          width: gesture.readout.text.length * 6.5 + 16,
        }
      : undefined;
    return (
      <g className="interaction-overlay" pointerEvents="none">
        {gesture.guides.map((guide) => {
          if (guide.axis === "lateral") {
            const x = projectCoordinate(
              { lateralYards: guide.valueYards, depthYards: 0 },
              projection,
            ).x;
            return (
              <g key={`lateral-${guide.valueYards}`}>
                <line
                  data-snap-guide="lateral"
                  opacity={0.65}
                  stroke={SELECTION_BLUE}
                  strokeDasharray="5 4"
                  strokeWidth={1}
                  x1={x}
                  x2={x}
                  y1={6}
                  y2={projection.height - 6}
                />
                <text
                  fill={SELECTION_BLUE}
                  fontFamily="'Geist Mono', monospace"
                  fontSize={10.5}
                  x={x + 6}
                  y={24}
                >
                  {guide.label}
                </text>
              </g>
            );
          }
          const y = projectCoordinate(
            { lateralYards: 0, depthYards: guide.valueYards },
            projection,
          ).y;
          return (
            <g key={`depth-${guide.valueYards}`}>
              <line
                data-snap-guide="depth"
                opacity={0.65}
                stroke={SELECTION_BLUE}
                strokeDasharray="5 4"
                strokeWidth={guide.strong ? 1.4 : 1}
                x1={projection.fieldInsetX}
                x2={projection.width - projection.fieldInsetX}
                y1={y}
                y2={y}
              />
              <text
                fill={SELECTION_BLUE}
                fontFamily="'Geist Mono', monospace"
                fontSize={10.5}
                x={20}
                y={y - 7}
              >
                {guide.label}
              </text>
            </g>
          );
        })}
        {readout ? (
          <g
            data-move-readout
            transform={`translate(${readout.x} ${readout.y})`}
          >
            <rect
              fill="#171717"
              height={20}
              rx={4}
              width={readout.width}
              x={14}
              y={-28}
            />
            <text
              fill="#FFFFFF"
              fontFamily="'Geist Mono', monospace"
              fontSize={11}
              textAnchor="middle"
              x={14 + readout.width / 2}
              y={-14}
            >
              {readout.text}
            </text>
          </g>
        ) : null}
      </g>
    );
  }
  if (gesture.kind === "marquee" && gesture.active) {
    const anchor = projectCoordinate(gesture.anchor, projection);
    const corner = projectCoordinate(gesture.corner, projection);
    return (
      <rect
        data-marquee
        fill="rgba(0,114,245,0.06)"
        height={Math.abs(corner.y - anchor.y)}
        pointerEvents="none"
        stroke={SELECTION_BLUE}
        strokeDasharray="4 3"
        strokeWidth={1}
        width={Math.abs(corner.x - anchor.x)}
        x={Math.min(anchor.x, corner.x)}
        y={Math.min(anchor.y, corner.y)}
      />
    );
  }
  return null;
}

const labelBoxChoices: ReadonlyArray<{ box: TextLabel["box"]; name: string }> =
  [
    { box: "none", name: "None" },
    { box: "fill", name: "Fill" },
    { box: "outline", name: "Outline" },
  ];

const labelColorChoices: ReadonlyArray<TextLabel["color"]> = [
  "ink",
  "blue",
  "red",
  "yellow",
  "green",
  "orange",
  "gray",
];

/**
 * The original's Text panel, shown only while one label is selected. The
 * idle panels stay exactly as they were when nothing is — which is the state
 * every parity golden captures.
 */
function LabelInspector({
  label,
  onAppearance,
  onDelete,
  onDeselect,
  onRole,
  onText,
  onTextCommitted,
  text,
  textInputRef,
}: {
  label: TextLabel;
  /** The draft the Coach is typing, which leads the committed text. */
  text: string;
  onAppearance: (appearance: LabelAppearance) => void;
  onDelete: () => void;
  onDeselect: () => void;
  onRole: (role: LabelRole) => void;
  onText: (text: string) => void;
  onTextCommitted: () => void;
  textInputRef: React.Ref<HTMLInputElement>;
}) {
  const boxed = label.box !== "none";
  return (
    <div className="label-inspector">
      <div className="section-heading label-heading">
        <button
          aria-label="Back to the play"
          className="back-button"
          onClick={onDeselect}
          title="Back to the play — esc"
          type="button"
        >
          ←
        </button>
        <span>Text</span>
      </div>
      <input
        aria-label="Label text"
        className="label-text"
        onBlur={onTextCommitted}
        onChange={(event) => onText(event.target.value)}
        ref={textInputRef}
        spellCheck={false}
        value={text}
      />
      <span className="field-label">Belongs to</span>
      <div className="segments">
        {(["offense", "defense"] as const).map((unit) => (
          <button
            className={
              (label.unit ?? "offense") === unit ? "active" : undefined
            }
            key={unit}
            onClick={() => onAppearance({ unit })}
            type="button"
          >
            {unit === "offense" ? "Offense" : "Defense"}
          </button>
        ))}
      </div>
      <span className="field-label">Meaning</span>
      <div className="button-grid">
        {(Object.keys(labelRolePresets) as ReadonlyArray<LabelRole>).map(
          (role) => (
            <button
              className={label.role === role ? "active" : undefined}
              key={role}
              onClick={() => onRole(role)}
              type="button"
            >
              {labelRolePresets[role].name}
            </button>
          ),
        )}
      </div>
      <span className="field-label">Size</span>
      <div className="segments">
        {labelSizeChoices.map(({ name, size }) => (
          <button
            className={label.size === size ? "active" : undefined}
            key={name}
            onClick={() => onAppearance({ size })}
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
      <span className="field-label">Box</span>
      <div className="segments">
        {labelBoxChoices.map(({ box, name }) => (
          <button
            className={label.box === box ? "active" : undefined}
            key={box}
            onClick={() => onAppearance({ box })}
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
      {/* A boxed label's colour is its box; an unboxed one's is its text. */}
      <span className="field-label">{boxed ? "Box color" : "Text color"}</span>
      <div className="color-row">
        {labelColorChoices.map((color) => (
          <button
            aria-label={color}
            aria-pressed={(boxed ? label.boxColor : label.color) === color}
            className={
              (boxed ? label.boxColor : label.color) === color
                ? "swatch active"
                : "swatch"
            }
            key={color}
            onClick={() =>
              onAppearance(boxed ? { boxColor: color } : { color })
            }
            style={{ background: sceneColors[color] }}
            type="button"
          />
        ))}
      </div>
      <p>
        Boxed labels are for calls and reminders — a yellow fill for coaching
        notes like “MAX SPLIT +4”, a red outline for a decision like “YES / NO”.
      </p>
      <div className="help-row">
        <button className="danger" onClick={onDelete} type="button">
          Delete
        </button>
      </div>
    </div>
  );
}

const lineStyleChoices: ReadonlyArray<{
  line: MovementPath["style"]["line"];
  glyph: string;
  name: string;
}> = [
  { line: "solid", glyph: "—", name: "Solid" },
  { line: "dashed", glyph: "– –", name: "Dashed" },
  { line: "dotted", glyph: "· · ·", name: "Dotted" },
  { line: "zigzag", glyph: "∿", name: "Zigzag — motion" },
];

/** The original's words for what a line ends in, not the shape's own name. */
const endingChoices: ReadonlyArray<{
  ending: MovementPath["style"]["ending"];
  name: string;
}> = [
  { ending: "arrow", name: "Arrow" },
  { ending: "bar", name: "Stop" },
  { ending: "dot", name: "Dot" },
  { ending: "bubble", name: "Zone" },
  { ending: "hook", name: "Curl" },
  { ending: "diamond", name: "Read" },
  { ending: "square", name: "Land" },
  { ending: "chevron", name: "Cont" },
  { ending: "none", name: "None" },
];

const routeColorChoices: ReadonlyArray<MovementPath["style"]["color"]> = [
  "ink",
  "blue",
  "red",
  "green",
  "orange",
  "gray",
];

/** The six shapes the original draws a man with, and its own glyphs for them. */
const playerSymbolChoices: ReadonlyArray<{
  symbol: Player["symbol"];
  glyph: string;
  name: string;
}> = [
  { symbol: "circle", glyph: "○", name: "Circle — receiver" },
  { symbol: "square", glyph: "□", name: "Square — center" },
  { symbol: "triangle", glyph: "△", name: "Triangle" },
  { symbol: "oval", glyph: "⬭", name: "Oval — back" },
  { symbol: "x", glyph: "✕", name: "X" },
  { symbol: "none", glyph: "A", name: "Letter only — defender" },
];

const playerFillChoices: ReadonlyArray<{
  fill: Player["fill"];
  name: string;
}> = [
  { fill: "none", name: "None" },
  { fill: "half", name: "Half" },
  { fill: "solid", name: "Solid" },
];

/**
 * What the Coach calls each of a man's lines. The original numbers them in the
 * order he drew them — the first is the call, the rest are alternates — and
 * says how it is drawn and how many ways it forks.
 */
function lineName(
  path: MovementPath,
  index: number,
  assignment: string | undefined,
): string {
  if (defensiveLineKinds.has(path.kind)) {
    return `${assignment?.trim() || path.kind} · ${path.style.line}`;
  }
  if (path.kind === "block") return `Block · ${path.style.line}`;
  const stem = index === 0 ? "Base stem" : `Alternate ${index}`;
  const choices =
    path.branches.length > 0 ? ` · ${path.branches.length} choice` : "";
  return `${stem} · ${path.style.line}${choices}`;
}

/**
 * The original's Player panel: the man himself, then every line he has and the
 * button that gives him another one. Which of those it offers follows what he
 * is — a lineman blocks and has no route to run, a defender is given a call.
 */
function PlayerInspector({
  lines,
  onAddAlternate,
  onApplyPreset,
  onAppearance,
  onDeselect,
  onFlip,
  onRemoveLine,
  onSelectLine,
  onText,
  onTextCommitted,
  player,
  text,
}: {
  lines: readonly {
    readonly id: string;
    readonly name: string;
    /** The calls that belong to this kind of line, if it has any. */
    readonly presets: readonly {
      readonly key: string;
      readonly name: string;
    }[];
    /** Which call off the tree it was last drawn as, if it was. */
    readonly preset?: string;
  }[];
  onAddAlternate: () => void;
  onApplyPreset: (pathId: string, presetKey: string) => void;
  onAppearance: (appearance: PlayerAppearance) => void;
  onDeselect: () => void;
  onFlip: () => void;
  onRemoveLine: (pathId: string) => void;
  onSelectLine: (pathId: string) => void;
  onText: (field: "label" | "sublabel", value: string) => void;
  onTextCommitted: (field: "label" | "sublabel") => void;
  player: Player;
  text: Readonly<Record<"label" | "sublabel", string>>;
}) {
  const lineman = isLineman(player);
  const defense = player.unit === "defense";
  const heading = defense
    ? "Assignments"
    : lineman
      ? "Blocking"
      : "Routes & alternates";
  const nothingYet = defense
    ? "No assignment yet. Press Z for a zone drop and B for a blitz path."
    : lineman
      ? "No block yet. Press B and click him to draw one."
      : "No route yet. Press R and click this player to draw one.";

  return (
    <div className="label-inspector">
      <div className="section-heading label-heading">
        <button
          aria-label="Back to the play"
          className="back-button"
          onClick={onDeselect}
          title="Back to the play — esc"
          type="button"
        >
          ←
        </button>
        <span>Player</span>
      </div>
      <div className="symbol-row">
        {playerSymbolChoices.map((choice) => (
          <button
            aria-label={choice.name}
            aria-pressed={player.symbol === choice.symbol}
            className={player.symbol === choice.symbol ? "active" : undefined}
            key={choice.symbol}
            onClick={() => onAppearance({ symbol: choice.symbol })}
            title={choice.name}
            type="button"
          >
            <span aria-hidden="true">{choice.glyph}</span>
          </button>
        ))}
      </div>
      <span className="field-label">Fill</span>
      <div className="segments">
        {playerFillChoices.map((choice) => (
          <button
            className={player.fill === choice.fill ? "active" : undefined}
            key={choice.fill}
            onClick={() => onAppearance({ fill: choice.fill })}
            type="button"
          >
            {choice.name}
          </button>
        ))}
      </div>
      <div className="color-row">
        {routeColorChoices.map((color) => (
          <button
            aria-label={color}
            aria-pressed={player.color === color}
            className={player.color === color ? "swatch active" : "swatch"}
            key={color}
            onClick={() => onAppearance({ color })}
            style={{ background: sceneColors[color] }}
            type="button"
          />
        ))}
      </div>
      <input
        aria-label="Letter"
        onBlur={() => onTextCommitted("label")}
        onChange={(event) => onText("label", event.target.value)}
        placeholder="Letter — X, Y, Z, Q…"
        spellCheck={false}
        value={text.label}
      />
      <input
        aria-label="Tag under"
        onBlur={() => onTextCommitted("sublabel")}
        onChange={(event) => onText("sublabel", event.target.value)}
        placeholder="Tag under — FLAT, STICK…"
        spellCheck={false}
        value={text.sublabel}
      />
      <span className="section-heading">{heading}</span>
      {lines.length === 0 ? (
        <p>{nothingYet}</p>
      ) : (
        <div className="line-list">
          {lines.map((line) => (
            <div className="line-row" key={line.id}>
              <span>{line.name}</span>
              {line.presets.length > 0 ? (
                <select
                  aria-label={`Quick call for ${line.name}`}
                  onChange={(event) => {
                    if (event.target.value === "") return;
                    onApplyPreset(line.id, event.target.value);
                  }}
                  title="Redraw this line as one of the calls it can be"
                  value={line.preset ?? ""}
                >
                  <option value="">Quick call…</option>
                  {line.presets.map(({ key, name }) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : null}
              <button onClick={() => onSelectLine(line.id)} type="button">
                Edit
              </button>
              <button
                aria-label={`Delete ${line.name}`}
                className="remove"
                onClick={() => onRemoveLine(line.id)}
                title="Delete this option"
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {lines.length > 0 && (
        <div className="help-row">
          <button
            onClick={onFlip}
            title="Mirror every line he has about his stance"
            type="button"
          >
            {defense
              ? "Flip his assignments"
              : lineman
                ? "Flip his block"
                : "Flip his routes"}
          </button>
        </div>
      )}
      {!defense && !lineman && (
        <>
          <div className="help-row">
            <button onClick={onAddAlternate} type="button">
              + Alternate route — new stem from stance
            </button>
          </div>
          <p>
            An <strong>alternate</strong> starts over at his stance: a different
            call he could be asked to run, drawn dotted. A{" "}
            <strong>choice</strong> stays inside one stem — he runs it, then
            reads and forks. Select a line to add one.
          </p>
        </>
      )}
      {lineman && (
        <p>
          One block per lineman. Select the line and drag its break to set where
          contact happens.
        </p>
      )}
    </div>
  );
}

/**
 * The original's Route panel. What it changes follows what the Coach has
 * picked out: a segment takes the line style on its own, a branch takes it
 * for that line, and otherwise the whole route does.
 */
function RouteInspector({
  branchIndex,
  coaching,
  nodeIndex,
  onAddChoice,
  onCoaching,
  onCoachingCommitted,
  onDelete,
  onDeselect,
  onFlip,
  onKind,
  onRemoveChoice,
  onStraighten,
  onStyle,
  path,
  segmentIndex,
  unit,
}: {
  branchIndex?: number;
  coaching: Readonly<Record<RouteCoachingField, string>>;
  nodeIndex?: number;
  onAddChoice: () => void;
  onCoaching: (field: RouteCoachingField, value: string) => void;
  onCoachingCommitted: (field: RouteCoachingField) => void;
  onDelete: () => void;
  onDeselect: () => void;
  onFlip: () => void;
  onKind: (kind: MovementPath["kind"]) => void;
  onRemoveChoice: () => void;
  onStraighten: () => void;
  onStyle: (style: Partial<MovementPath["style"]>) => void;
  path: MovementPath;
  segmentIndex?: number;
  unit: "offense" | "defense" | "special-teams";
}) {
  // With no break picked, a choice forks off the end, which is where the
  // original puts it too.
  const lastNode = path.points.length - 1;
  const forkAt = Math.max(0, Math.min(lastNode, nodeIndex ?? lastNode));
  const nodeName =
    forkAt === 0
      ? "the start"
      : forkAt === lastNode
        ? "the end"
        : `break ${forkAt}`;
  const line =
    branchIndex === undefined
      ? path.points
      : (path.branches[branchIndex]?.points ?? path.points);
  const style =
    branchIndex === undefined
      ? path.style
      : (path.branches[branchIndex]?.style ?? path.style);
  // With a segment picked out, its own override is what the buttons reflect.
  const shownLine =
    segmentIndex !== undefined
      ? (line[segmentIndex]?.segmentStyle?.line ?? style.line)
      : style.line;
  const shownEnding =
    segmentIndex !== undefined
      ? (line[segmentIndex]?.segmentStyle?.ending ?? style.ending)
      : style.ending;
  const kinds = unit === "defense" ? defensiveRouteKinds : offensiveRouteKinds;
  const scope =
    segmentIndex !== undefined
      ? `Segment ${segmentIndex}`
      : branchIndex !== undefined
        ? `Branch ${branchIndex + 1}`
        : `${line.length} breaks`;

  return (
    <div className="label-inspector">
      <div className="section-heading label-heading">
        <button
          aria-label="Back to the play"
          className="back-button"
          onClick={onDeselect}
          title="Back to the play — esc"
          type="button"
        >
          ←
        </button>
        <span>Route</span>
        <span className="scope-tag">{scope}</span>
      </div>
      <div className="segments">
        {kinds.map((choice) => (
          <button
            className={path.kind === choice.kind ? "active" : undefined}
            key={choice.kind}
            onClick={() => onKind(choice.kind)}
            type="button"
          >
            {choice.name}
          </button>
        ))}
      </div>
      <span className="field-label">Line</span>
      <div className="button-grid">
        {lineStyleChoices.map((choice) => (
          <button
            // The glyph is the picture of the line; the name is what it is.
            // Without this a screen reader announces "– –".
            aria-label={choice.name}
            className={shownLine === choice.line ? "active" : undefined}
            key={choice.line}
            onClick={() => onStyle({ line: choice.line })}
            title={choice.name}
            type="button"
          >
            <span aria-hidden="true">{choice.glyph}</span>
          </button>
        ))}
      </div>
      <span className="field-label">Ending</span>
      <div className="button-grid">
        {endingChoices.map((choice) => (
          <button
            className={shownEnding === choice.ending ? "active" : undefined}
            key={choice.ending}
            onClick={() => onStyle({ ending: choice.ending })}
            type="button"
          >
            {choice.name}
          </button>
        ))}
      </div>
      <span className="field-label">Color</span>
      <div className="color-row">
        {routeColorChoices.map((color) => (
          <button
            aria-label={color}
            aria-pressed={style.color === color}
            className={style.color === color ? "swatch active" : "swatch"}
            key={color}
            onClick={() => onStyle({ color })}
            style={{ background: sceneColors[color] }}
            type="button"
          />
        ))}
      </div>
      <p>
        The ending carries the coaching. Arrow means run through, a dot means
        throttle down and sit, a bar is a block.
      </p>
      <span className="section-heading">Coaching</span>
      <div className="coaching-row">
        <label className="read-field">
          <span>Read</span>
          <input
            inputMode="numeric"
            onBlur={() => onCoachingCommitted("readOrder")}
            onChange={(event) =>
              onCoaching(
                "readOrder",
                event.target.value.replaceAll(/\D/g, "").slice(0, 2),
              )
            }
            spellCheck={false}
            value={coaching.readOrder}
          />
        </label>
        <input
          aria-label="Assignment"
          maxLength={ROUTE_COACHING_LIMITS.assignment}
          onBlur={() => onCoachingCommitted("assignment")}
          onChange={(event) => onCoaching("assignment", event.target.value)}
          placeholder="Assignment — STICK"
          spellCheck={false}
          value={coaching.assignment}
        />
      </div>
      <input
        aria-label="Conversion"
        maxLength={ROUTE_COACHING_LIMITS.conversion}
        onBlur={() => onCoachingCommitted("conversion")}
        onChange={(event) => onCoaching("conversion", event.target.value)}
        placeholder="Conversion — vs man / vs zone"
        spellCheck={false}
        value={coaching.conversion}
      />
      <input
        aria-label="Coaching note"
        maxLength={ROUTE_COACHING_LIMITS.coachingNote}
        onBlur={() => onCoachingCommitted("coachingNote")}
        onChange={(event) => onCoaching("coachingNote", event.target.value)}
        placeholder="Coaching note"
        spellCheck={false}
        value={coaching.coachingNote}
      />
      <p>
        Read number and assignment print on the field. Conversion and note ride
        along with the route — they follow it through mirror, duplicate and
        save.
      </p>
      <span className="section-heading">Choice within this stem</span>
      <div className="help-row">
        <button onClick={onAddChoice} type="button">
          + Choice at {nodeName}
        </button>
      </div>
      {branchIndex === undefined ? undefined : (
        <div className="help-row">
          <button className="danger" onClick={onRemoveChoice} type="button">
            Remove this choice
          </button>
        </div>
      )}
      <p>
        A <strong>choice</strong> forks this same stem at the break you picked —
        one release, then he reads. For a whole second line off his stance, use{" "}
        <strong>alternate route</strong> in the player panel.
      </p>
      <div className="help-row">
        <button
          onClick={onFlip}
          title="Mirror this line about where it starts — turns it in the other direction without redrawing"
          type="button"
        >
          Flip
        </button>
        <button onClick={onStraighten} type="button">
          Straighten
        </button>
        <button className="danger" onClick={onDelete} type="button">
          Delete
        </button>
      </div>
    </div>
  );
}

function Inspector({
  ballSpots,
  call,
  concepts,
  defenderCount,
  lineCalls,
  linemanCount,
  onConcept,
  onLineCall,
  onSpotBall,
  formation,
  formationHint,
  labelEditor,
  onOpenDefenses,
  onOpenFormations,
  onOpenPalette,
  onOpenShortcuts,
}: {
  ballSpots: readonly {
    readonly spot: BallSpot;
    readonly name: string;
    readonly title: string;
    readonly on: boolean;
    readonly available: boolean;
  }[];
  call?: DefensiveCall;
  concepts: Readonly<
    Record<string, { readonly on: boolean; readonly available: boolean }>
  >;
  defenderCount: number;
  lineCalls: readonly {
    readonly key: string;
    readonly name: string;
    readonly on: boolean;
    readonly available: boolean;
  }[];
  onConcept: (key: string) => void;
  onLineCall: (key: string) => void;
  onSpotBall: (spot: BallSpot) => void;
  linemanCount: number;
  formation?: Formation;
  formationHint: string;
  labelEditor?: React.ReactNode;
  onOpenDefenses: () => void;
  onOpenFormations: () => void;
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
}) {
  if (labelEditor) {
    return (
      <aside className="inspector" aria-label="Play inspector">
        {labelEditor}
      </aside>
    );
  }
  return (
    <aside className="inspector" aria-label="Play inspector">
      <InspectorSection title="Formation">
        <button
          className="wide-picker"
          data-current-formation={formation?.id}
          onClick={onOpenFormations}
          title="Browse formations — ⇧⌘F"
        >
          <span>{formation?.name ?? "Custom alignment"}</span>
          <span>{formation?.personnelLabel ?? "–"} &nbsp;›</span>
        </button>
        <button className="round-add" aria-label="Save current formation">
          +
        </button>
        <div className="segment-row">
          <span>Ball on</span>
          <div className="segments">
            {ballSpots.map((spot) => (
              <button
                aria-pressed={spot.on}
                className={spot.on ? "active" : undefined}
                disabled={!spot.available}
                key={spot.spot}
                onClick={() => onSpotBall(spot.spot)}
                title={spot.title}
              >
                {spot.name}
              </button>
            ))}
          </div>
        </div>
        <p>{formationHint}</p>
      </InspectorSection>
      <InspectorSection title="Line call">
        <div className="button-grid">
          {lineCalls.map((call) => (
            <button
              aria-pressed={call.on}
              className={call.on ? "active" : undefined}
              disabled={!call.available}
              key={call.key}
              onClick={() => onLineCall(call.key)}
              title={
                call.on
                  ? "Click again to take this call off the whole line"
                  : `Give the whole line ${call.name}`
              }
            >
              {call.name}
            </button>
          ))}
        </div>
        <p>
          Applies to all {linemanCount} linemen at once — each one keeps his own
          alignment. Set left and Set right take the whole line the same way;
          the others mirror about the ball.
        </p>
      </InspectorSection>
      <InspectorSection title="Concept">
        <div className="button-grid">
          {stockConcepts.map((concept) => (
            <button
              aria-pressed={concepts[concept.key]?.on ?? false}
              className={concepts[concept.key]?.on ? "active" : undefined}
              disabled={!concepts[concept.key]?.available}
              key={concept.key}
              onClick={() => onConcept(concept.key)}
              title={concept.hint}
            >
              {concept.name}
            </button>
          ))}
        </div>
        <p>
          Draws the whole distribution by role — X, Z, H, Y and the back each
          get their job, mirrored to the side they line up on. Replaces their
          routes; blocking and coverage stay.
        </p>
      </InspectorSection>
      <InspectorSection title="Defense">
        <button
          className="wide-picker"
          data-current-defense={call?.formation.id}
          onClick={onOpenDefenses}
          title="Browse defenses — ⇧⌘D"
        >
          <span>
            {call
              ? call.formation.name
              : defenderCount > 0
                ? "Custom front"
                : "No defense yet"}
          </span>
          <span>
            {call
              ? call.formation.description
              : defenderCount > 0
                ? `${defenderCount} men`
                : "–"}{" "}
            &nbsp;›
          </span>
        </button>
        <p>
          Each call replaces the last one and leaves the offense untouched. Just
          the front and secondary — letter symbols only, so you can draw your
          own coverage on top. Press Z to add your own drop.
        </p>
      </InspectorSection>
      <section className="inspector-section library-preview">
        <div className="section-heading library-heading">
          <span>Library · 10</span>
          <span>
            <button>Save</button>
            <button className="link-button">+ Variation</button>
          </span>
        </div>
        <span className="scope-label">Applies to</span>
        <div className="segments scope">
          <button className="active">This play</button>
          <button>Whole concept</button>
          <button>Pick…</button>
        </div>
        <p>Every change stays in the play you have open.</p>
        <div className="library-row current">
          <strong>Stick — Thunder</strong>
          <span>3rd down</span>
        </div>
        <div className="library-row">
          Jet Touch Pass <span>Pass</span>
        </div>
        <div className="library-row">
          Four Verticals <span>Pass</span>
        </div>
      </section>
      <InspectorSection title="Help">
        <div className="help-row">
          <button onClick={onOpenPalette} type="button">
            Commands ⌘K
          </button>
          <button onClick={onOpenShortcuts} type="button">
            Shortcuts ?
          </button>
        </div>
      </InspectorSection>
    </aside>
  );
}

function InspectorSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="inspector-section">
      <div className="section-heading">{title}</div>
      {children}
    </section>
  );
}

export function ChalkApp({ runtime }: { runtime: ChalkRuntime }) {
  const { editorStore } = runtime;
  const [activeView, setActiveView] = useState<View>("Editor");
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [openMenu, setOpenMenu] = useState<Menu>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  // The original gives each panel its own toggle and calls hiding both "Focus
  // mode"; it does not carry a third piece of state for focus.
  const [railOpen, setRailOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [zonesHidden, setZonesHidden] = useState(false);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const [freedStorage, setFreedStorage] = useState<ChalkRuntime["storage"]>();
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [interaction, setInteraction] = useState(idleFieldInteraction);
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string>();
  // Pointer events can outpace React's render loop; the ref is the machine's
  // authoritative model so no event ever reduces against a stale one.
  const interactionRef = useRef<FieldInteractionModel>(interaction);
  const fieldSvgRef = useRef<SVGSVGElement | null>(null);
  const labelTextInputRef = useRef<HTMLInputElement | null>(null);
  // A label the Coach has just placed is waiting to be typed into. A ref,
  // not state: nothing renders from it, and clearing it must not re-render.
  const labelAwaitingTextRef = useRef<string | undefined>(undefined);
  /**
   * What the Coach is typing into a note, held here until he leaves the
   * field. The committed text arrives asynchronously (ADR 0012), so binding
   * the input straight to it would drop keystrokes that land mid-save — the
   * same reason the Play name has a draft in the EditorStore.
   */
  const [labelTextDraft, setLabelTextDraft] = useState<{
    readonly id: string;
    readonly text: string;
  }>();
  /**
   * The Coaching field the Coach is typing into, held for the same reason the
   * note's text is: the committed value arrives asynchronously, and only one
   * of these fields has the caret at a time.
   */
  const [coachingDraft, setCoachingDraft] = useState<{
    readonly pathId: string;
    readonly field: RouteCoachingField;
    readonly value: string;
  }>();
  /** The letter or tag the Coach is typing onto a man, held for the same reason. */
  const [playerDraft, setPlayerDraft] = useState<{
    readonly playerId: string;
    readonly field: "label" | "sublabel";
    readonly value: string;
  }>();
  /** Where the Coach asked what he can do to the thing under his pointer. */
  const [contextMenu, setContextMenu] = useState<{
    readonly x: number;
    readonly y: number;
  }>();
  /**
   * Where the Coach is looking. It is not part of the Play — panning is not
   * an edit and none of it is undoable — so it lives beside the interaction
   * model rather than in the document.
   */
  const [camera, setCamera] = useState<Camera>(() => fitCamera(EDITOR_FRAME));
  /** How wide the field is really drawn, watched so a resize is felt. */
  const [fieldWidthPx, setFieldWidthPx] = useState(EDITOR_FRAME.width);
  /**
   * How many CSS pixels one frame unit is actually drawn at. Every rule the
   * original wrote in pixels — how far a press may travel before it is a
   * drag, how near a line has to be pressed, how big a handle is — is a rule
   * about the Coach's finger and his screen, not about the frame. Measuring
   * it here is what makes those rules mean the same thing on a phone as on a
   * desk, and what stops a smaller screen quietly handing a coarse pointer a
   * smaller target.
   */
  const cssPerFrameUnit = fieldWidthPx / camera.width;
  /** The set or call under the Coach's pointer in a browser, drawn on the field. */
  const [previewFormationId, setPreviewFormationId] = useState<string>();
  /**
   * Whether a call arrives with its drops and blitzes drawn. Off to begin
   * with, as the original has it: a call dropped in as an alignment is
   * something to draw your own coverage on top of, and a Coach who wants the
   * assignments asks for them. It is remembered between visits, because
   * whichever he wants he tends to want every time.
   */
  const [callAssignments, setCallAssignments] = useState(false);
  /**
   * What just happened, said where he is already looking, with one undo
   * within reach. The original holds it for a little over four seconds.
   */
  const [toast, setToast] = useState<{
    readonly name: string;
    readonly text: string;
  }>();
  // A press held still on a touch or a Pencil opens the same menu the mouse
  // opens with its right button, so the timer is armed on the press and
  // disarmed by anything that turns it into a gesture.
  const longPressRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Fingers on the field, so two of them can be read as a pinch. */
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    distance: number;
    midX: number;
    midY: number;
  }>(undefined);
  /** Where a pan gesture last was, in client pixels. */
  const panRef = useRef<{ x: number; y: number }>(undefined);
  /**
   * Which pointer the Coach has in his hand. An iPad calls itself coarse
   * whichever one it is, so the field watches what actually touches it
   * (ADR 0016).
   */
  const stylusRef = useRef<StylusState>(idleStylus);
  const [precisePointer, setPrecisePointer] = useState(() => !deviceIsCoarse());
  /**
   * Whether this screen is too small to work on, and so shows the Play to be
   * read instead. A phone on the sideline is for looking at what was called,
   * and a thumb on the glass must not move a man on it.
   */
  const [reading, setReading] = useState(false);
  /** Whether space is down, which turns any drag into a pan. */
  const spaceHeldRef = useRef(false);
  // Entities the Coach has just made whose commit has not landed. Selection
  // must not be pruned of something that is still on its way.
  const pendingInsertsRef = useRef<Set<string>>(new Set());
  // The runtime reports storage health; freeing space supersedes that reading.
  const storage = freedStorage ?? runtime.storage;
  const editor = useSyncExternalStore(
    editorStore.subscribe,
    editorStore.getSnapshot,
    editorStore.getSnapshot,
  );

  /**
   * The sets the Coach saved himself and what he starred in either book. Held
   * here and written through to the device, so the browser answers at once
   * and the answer survives closing Chalk. A favorite is about this Coach on
   * this device rather than about the Play, so none of it enters a document.
   */
  const [coachFormations, setCoachFormations] = useState<readonly Formation[]>(
    runtime.coachSets.formations,
  );
  const [favoriteFormationIds, setFavoriteFormationIds] = useState<
    readonly string[]
  >(runtime.coachSets.favoriteFormationIds);
  const [favoriteCallIds, setFavoriteCallIds] = useState<readonly string[]>(
    runtime.coachSets.favoriteCallIds,
  );
  /** Both books at once: what Chalk ships, then what the Coach kept. */
  const allFormations = useMemo(
    (): readonly Formation[] => [...stockFormations, ...coachFormations],
    [coachFormations],
  );

  const toggled = (ids: readonly string[], id: string): readonly string[] =>
    ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];

  const toggleFavoriteFormation = (formationId: string): void => {
    const next = toggled(favoriteFormationIds, formationId);
    setFavoriteFormationIds(next);
    void runtime.setFavoriteFormations(next);
  };

  const toggleFavoriteCall = (callId: string): void => {
    const next = toggled(favoriteCallIds, callId);
    setFavoriteCallIds(next);
    void runtime.setFavoriteCalls(next);
  };

  /**
   * The offense on the field, kept as a set of its own. The Coach named it to
   * reach for it, so — as the original does — it is starred the moment it is
   * saved rather than waiting to be starred later.
   */
  const saveCoachFormation = (name: string): void => {
    const formation = formationFromOffense(editor.document, {
      id: createStableId("formation"),
      playbookId: editor.document.playbookId,
      name,
      slotId: () => createStableId("slot"),
    });
    if (!formation) return;
    // A second set under a name he already used replaces the first, so the
    // name a Coach reaches for means one thing.
    setCoachFormations((current) => [
      ...current.filter((kept) => kept.name !== name),
      formation,
    ]);
    void runtime.saveCoachFormation(formation);
    const next = [
      ...favoriteFormationIds.filter((id) => id !== formation.id),
      formation.id,
    ];
    setFavoriteFormationIds(next);
    void runtime.setFavoriteFormations(next);
    setToast({ name: formation.name, text: "— saved as a formation" });
  };

  const removeCoachFormation = (formationId: string): void => {
    setCoachFormations((current) =>
      current.filter(({ id }) => id !== formationId),
    );
    void runtime.removeCoachFormation(formationId);
  };
  // Mid-drag the Coach sees the committed document with the gesture's own
  // command previewed on top — the exact document a release would commit.
  const previewCommand = gesturePreviewCommand(interaction, editor.document);
  const previewDocument = useMemo(
    () =>
      previewCommand
        ? applyPlayCommand(editor.document, previewCommand)
        : editor.document,
    [editor.document, previewCommand],
  );
  const scene = useMemo(
    () => buildSvgRenderScene(buildRenderScene(previewDocument)),
    [previewDocument],
  );
  const selectionKeys = useMemo(
    () =>
      new Set(
        interaction.selection.map(({ kind, id }) => selectionKey(kind, id)),
      ),
    [interaction.selection],
  );
  /** The one selected label, whose Text panel replaces the idle inspector. */
  const selectedLabel =
    interaction.selection.length === 1 &&
    interaction.selection[0]?.kind === "label"
      ? editor.document.labels.find(
          ({ id }) => id === interaction.selection[0]!.id,
        )
      : undefined;
  // A selected label with a leader offers a handle at the end it points to.
  const leaderHandleAt = (() => {
    const leader = previewDocument.labels.find(
      ({ id }) => id === selectedLabel?.id,
    )?.leader;
    return leader
      ? projectCoordinate(leader.endpoint, scene.viewport)
      : undefined;
  })();
  const runLabelCommand = (
    command: PlayCommand | undefined,
    options?: { coalesce?: boolean },
  ): void => {
    if (!command) return;
    void editorStore.applyCommand(command, options).catch(() => undefined);
  };
  /**
   * What the Coaching fields show: the committed value, unless the Coach has
   * the caret in one of them, in which case what he has typed.
   */
  const routeCoaching = (
    path: MovementPath,
  ): Readonly<Record<RouteCoachingField, string>> => {
    const committed = {
      readOrder: path.readOrder === undefined ? "" : String(path.readOrder),
      assignment: assignmentForPath(editor.document, path.id)?.text ?? "",
      conversion: path.conversion ?? "",
      coachingNote: path.coachingNote ?? "",
    };
    return coachingDraft?.pathId === path.id
      ? { ...committed, [coachingDraft.field]: coachingDraft.value }
      : committed;
  };
  /**
   * Typing here coalesces into one undo entry until the Coach leaves the
   * field, the way retyping a note does (ADR 0012).
   */
  const editRouteCoaching = (
    pathId: string,
    field: RouteCoachingField,
    value: string,
  ): void => {
    setCoachingDraft({ pathId, field, value });
    // Built against the Play as it will be when the edit runs, not as it is
    // now: saves are serialised, and a command carries whole entities, so one
    // built a save out of date puts back the field the save before it had
    // just changed. Typing four coaching fields quickly is exactly that case.
    void editorStore
      .applyEdit(
        (current) =>
          field === "readOrder"
            ? setRouteReadCommand(
                current,
                pathId,
                value === "" ? undefined : Number(value),
              )
            : field === "assignment"
              ? setRouteAssignmentCommand(current, pathId, value, () =>
                  createStableId("assignment"),
                )
              : setRouteCoachingTextCommand(current, pathId, field, value),
        { coalesce: true },
      )
      .catch(() => undefined);
  };
  /**
   * Handles belong to exactly one selected route, as in the original: a
   * multi-selection is being moved as a group, not edited node by node.
   */
  const selectedPath =
    activeTool === "select" &&
    !interaction.drawing &&
    interaction.selection.length === 1 &&
    interaction.selection[0]?.kind === "path"
      ? previewDocument.paths.find(
          ({ id }) => id === interaction.selection[0]!.id,
        )
      : undefined;
  /** The one selected man, whose Player panel replaces the idle inspector. */
  const selectedPlayer =
    activeTool === "select" &&
    !interaction.drawing &&
    interaction.selection.length === 1 &&
    interaction.selection[0]?.kind === "player"
      ? editor.document.players.find(
          ({ id }) => id === interaction.selection[0]!.id,
        )
      : undefined;
  /** Every line he has, named the way the original names them. */
  const playerLines = (player: Player) =>
    editor.document.paths
      .filter(({ playerId }) => playerId === player.id)
      .map((path, index) => ({
        id: path.id,
        name: lineName(
          path,
          index,
          assignmentForPath(editor.document, path.id)?.text,
        ),
        // Each kind of line is offered the calls that belong to it: a route
        // gets the tree, a block gets the blocking calls, and a defender's
        // line gets the drops, the man calls and the rushes. A motion and a
        // ball flight have no catalogue of their own, so they are offered
        // none rather than somebody else's.
        presets:
          path.kind === "route"
            ? routePresetNames
            : path.kind === "block"
              ? blockPresets.map(({ key, name }) => ({ key, name }))
              : defensiveLineKinds.has(path.kind)
                ? defensivePresets.map(({ key, name }) => ({ key, name }))
                : [],
        ...(path.preset === undefined ? {} : { preset: path.preset }),
      }));
  const playerText = (
    player: Player,
  ): Readonly<Record<"label" | "sublabel", string>> => {
    const committed = { label: player.label, sublabel: player.sublabel };
    return playerDraft?.playerId === player.id
      ? { ...committed, [playerDraft.field]: playerDraft.value }
      : committed;
  };
  /** Moves what the Coach is working on without changing the Play itself. */
  const focusInteraction = (next: Partial<FieldInteractionModel>): void => {
    const model = { ...interactionRef.current, ...next };
    interactionRef.current = model;
    setInteraction(model);
  };
  /**
   * A panel action that also moves what the Coach is working on: giving a man
   * another line selects it, forking a stem narrows to the fork. The insert is
   * registered as pending for the same reason a drawn route is — the selection
   * must survive the instant before the save lands.
   */
  /**
   * Entities a command is about to make, held as pending until the commit
   * lands. Kept in one stable callback so reaching the ref stays out of
   * render, however the command arrived.
   */
  const markInsertsPending = useCallback((command: PlayCommand): void => {
    for (const id of insertedEntityIds(command)) {
      pendingInsertsRef.current.add(id);
    }
  }, []);

  const runPanelCommand = (
    command: PlayCommand | undefined,
    next: Partial<FieldInteractionModel>,
  ): void => {
    if (!command) return;
    markInsertsPending(command);
    focusInteraction(next);
    void editorStore.applyCommand(command).catch(() => undefined);
  };
  /**
   * The original offers the draw-a-route dot on the selected or hovered
   * Player, under the select tool, when nothing is being drawn or dragged.
   */
  const routeDotPlayerId =
    activeTool === "select" &&
    !interaction.drawing &&
    interaction.gesture.kind === "idle"
      ? (interaction.selection.find(({ kind }) => kind === "player")?.id ??
        hoveredPlayerId)
      : undefined;

  const dispatchField = (event: FieldInteractionEvent): void => {
    const document = editorStore.getSnapshot().document;
    // The scene is only consulted for hit tests, so build it on demand.
    let renderScene: RenderScene | undefined;
    const result = fieldInteraction(interactionRef.current, event, {
      document,
      get scene() {
        renderScene ??= buildRenderScene(document);
        return renderScene;
      },
      // What a screen pixel is worth in yards changes with the camera and
      // with the size of the screen, and this is measured from both — so a
      // tolerance the original wrote in pixels stays that many pixels under
      // the Coach's finger wherever he is working.
      screenScale: {
        lateralPixelsPerYard:
          scene.viewport.lateralPixelsPerYard * cssPerFrameUnit,
        depthPixelsPerYard: scene.viewport.depthPixelsPerYard * cssPerFrameUnit,
      },
      snap: { enabled: snapEnabled, grid: "off" },
      tool: interactionTool(activeTool),
      depthWindow: fieldDepthWindow(scene.viewport),
      createId: createStableId,
    });
    interactionRef.current = result.model;
    setInteraction(result.model);
    if (result.command) {
      markInsertsPending(result.command);
      void editorStore.applyCommand(result.command).catch(() => undefined);
    }
    // Finishing a route hands the Coach back the select tool, as the
    // original does, so the route he just drew is his to adjust.
    if (result.requestedTool) setActiveTool(result.requestedTool);
    if (result.editingLabelId)
      labelAwaitingTextRef.current = result.editingLabelId;
  };
  // The keyboard listener registers once per menu state; these refs keep it
  // dispatching against the current closure and reading the live drawing.
  const dispatchFieldRef = useRef(dispatchField);
  const drawingRef = useRef(interaction.drawing);

  /** Switching tools abandons any route in progress, as the original does. */
  const selectTool = (tool: Tool): void => {
    if (interactionRef.current.drawing) dispatchField({ type: "escape" });
    setActiveTool(tool);
  };
  const selectToolRef = useRef(selectTool);
  useEffect(() => {
    dispatchFieldRef.current = dispatchField;
    drawingRef.current = interaction.drawing;
    selectToolRef.current = selectTool;
  });

  /**
   * A label the Coach just placed says "5 Yds" until he types over it, so
   * the field is focused and selected the moment the panel appears — one
   * gesture from pressing the field to writing the note.
   */
  useEffect(() => {
    if (!labelAwaitingTextRef.current) return;
    if (selectedLabel?.id !== labelAwaitingTextRef.current) return;
    labelAwaitingTextRef.current = undefined;
    labelTextInputRef.current?.focus();
    labelTextInputRef.current?.select();
  }, [selectedLabel?.id]);

  // An undo, redo, or restore may remove what the selection points at.
  useEffect(() => {
    const pending = pendingInsertsRef.current;
    for (const id of [...pending]) {
      const arrived =
        editor.document.players.some((entity) => entity.id === id) ||
        editor.document.paths.some((entity) => entity.id === id) ||
        editor.document.labels.some((entity) => entity.id === id);
      if (arrived) pending.delete(id);
    }
    const pruned = pruneFieldSelection(
      interactionRef.current,
      editor.document,
      pending,
    );
    if (pruned !== interactionRef.current) {
      interactionRef.current = pruned;
      setInteraction(pruned);
    }
  }, [editor.document]);

  /**
   * Client pixels to field yards. Measured against the field element itself
   * rather than the event target, because a handle's own rect is a target
   * too and would otherwise supply the wrong frame.
   */
  const framePointFromClient = (clientX: number, clientY: number) => {
    const bounds = fieldSvgRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    // Through the camera, not the whole frame: what a client pixel is worth
    // depends on how much of the frame is on screen.
    return {
      x: camera.x + ((clientX - bounds.left) / bounds.width) * camera.width,
      y: camera.y + ((clientY - bounds.top) / bounds.height) * camera.height,
    };
  };
  const fieldPointFromClient = (clientX: number, clientY: number) =>
    unprojectPoint(framePointFromClient(clientX, clientY), scene.viewport);
  const fieldPointerInput = (event: React.PointerEvent) => ({
    point: fieldPointFromClient(event.clientX, event.clientY),
    pointerId: event.pointerId,
    shiftKey: event.shiftKey,
    button: event.button,
    pointerType: event.pointerType,
  });
  /**
   * What the Coach pointed at, if anything he can act on. Labels are left out
   * because the original opens this menu over a Player or a route only.
   */
  const pointedAt = (
    clientX: number,
    clientY: number,
    pointerType?: string,
  ) => {
    const document = editorStore.getSnapshot().document;
    const found = hitTestField(
      buildRenderScene(document),
      fieldPointFromClient(clientX, clientY),
      {
        lateralPixelsPerYard: scene.viewport.lateralPixelsPerYard,
        depthPixelsPerYard: scene.viewport.depthPixelsPerYard,
      },
      // A finger is allowed the same wider reach here as it is everywhere
      // else; asking with mouse precision would make the menu the one thing
      // on the field a touch had to be accurate to open.
      fieldHitOptions(pointerType),
    );
    return found?.item.kind === "label" ? undefined : found?.item;
  };
  const openContextMenu = (
    clientX: number,
    clientY: number,
    pointerType?: string,
  ): void => {
    const item = pointedAt(clientX, clientY, pointerType);
    if (!item) return;
    dispatchField({ type: "point-at", item });
    // Held clear of the far edges, at the original's own margin, so a menu
    // opened near the corner is still whole.
    setContextMenu({
      x: Math.round(Math.min(clientX, globalThis.innerWidth - 210)),
      y: Math.round(Math.min(clientY, globalThis.innerHeight - 210)),
    });
  };
  const cancelLongPress = (): void => {
    if (longPressRef.current === undefined) return;
    clearTimeout(longPressRef.current);
    longPressRef.current = undefined;
  };
  /** Remember what touched the field, and size its targets for it. */
  const noteStylus = (next: StylusState): void => {
    stylusRef.current = next;
    setPrecisePointer(stylusIsPrecise(next, deviceIsCoarse()));
  };
  /** Give up whatever the fingers had started, without touching the pen's. */
  const abandonTouchGesture = (): void => {
    touchesRef.current.clear();
    pinchRef.current = undefined;
    panRef.current = undefined;
    cancelLongPress();
    dispatchField({ type: "pointer-cancel" });
  };
  const onFieldPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    // The hand holding a Pencil rests on the glass. While the tip is down,
    // everything else touching the screen is that hand.
    if (stylusRejects(stylusRef.current, event.pointerType)) return;
    // And the heel of it usually lands first, so by the time the tip arrives
    // the field may already believe it is being panned. It is not.
    if (penInterrupts(stylusRef.current, event.pointerType))
      abandonTouchGesture();
    noteStylus(stylusDown(stylusRef.current, event.pointerType));
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is best-effort; the gesture survives without it.
    }
    if (event.pointerType === "touch") {
      touchesRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (touchesRef.current.size === 2) {
        // A second finger turns the gesture into a pinch, so whatever the
        // first one had started is abandoned rather than dragged along.
        pinchRef.current = pinchOf();
        panRef.current = undefined;
        cancelLongPress();
        dispatchField({ type: "pointer-cancel" });
        return;
      }
      // A third finger joins the pinch and does nothing of its own. Two are
      // what a pinch is measured between, and the rest of the hand landing
      // must not start something underneath it.
      if (touchesRef.current.size > 2) {
        cancelLongPress();
        return;
      }
    }
    // Held space or a held alt moves the field instead of what is on it —
    // the gestures every drawing tool has trained into him. So does a finger,
    // once a Pencil has been out: the tip draws and the hand moves the field,
    // which is what ADR 0016 means by leaving touch the viewport. On a screen
    // too small to work on, moving the field is all any pointer does.
    if (
      reading ||
      spaceHeldRef.current ||
      event.altKey ||
      touchNavigates(stylusRef.current, event.pointerType)
    ) {
      panRef.current = { x: event.clientX, y: event.clientY };
      cancelLongPress();
      return;
    }
    dispatchField({ type: "pointer-down", input: fieldPointerInput(event) });
    cancelLongPress();
    // A mouse has a button for this; every other pointer holds still instead.
    if (event.pointerType === "mouse" || event.button !== 0) return;
    const { clientX, clientY, pointerType } = event;
    longPressRef.current = setTimeout(() => {
      longPressRef.current = undefined;
      openContextMenu(clientX, clientY, pointerType);
    }, LONG_PRESS_MS);
  };
  const onFieldPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (
      event.pointerType === "touch" &&
      touchesRef.current.has(event.pointerId)
    ) {
      touchesRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }
    const pinch = pinchRef.current;
    if (pinch && touchesRef.current.size >= 2) {
      const now = pinchOf();
      if (!now) return;
      const element = fieldSvgRef.current;
      const perPixel = camera.width / (element?.clientWidth ?? 1);
      const anchor = framePointFromClient(now.midX, now.midY);
      setCamera((current) =>
        panCamera(
          zoomCamera(
            current,
            pinch.distance / now.distance,
            EDITOR_FRAME,
            anchor,
          ),
          -(now.midX - pinch.midX) * perPixel,
          -(now.midY - pinch.midY) * perPixel,
          EDITOR_FRAME,
        ),
      );
      pinchRef.current = now;
      return;
    }
    const from = panRef.current;
    if (from) {
      const perPixel = camera.width / (fieldSvgRef.current?.clientWidth ?? 1);
      panRef.current = { x: event.clientX, y: event.clientY };
      setCamera((current) =>
        panCamera(
          current,
          -(event.clientX - from.x) * perPixel,
          -(event.clientY - from.y) * perPixel,
          EDITOR_FRAME,
        ),
      );
      return;
    }
    // The hand that was resting while the Pencil drew is still resting when it
    // comes up, and it slides. Its press was refused, so the machine has no
    // gesture of its own to end — but a route left part-drawn would follow it
    // anyway, which is the one thing a rejected palm can still reach.
    if (touchNavigates(stylusRef.current, event.pointerType)) return;
    dispatchField({ type: "pointer-move", input: fieldPointerInput(event) });
    // Asked after the move, not before it: this very event is what turns a
    // still press into a drag, and reading the gesture first would always find
    // the press it is about to stop being.
    //
    // The original allowed six pixels of tremor before giving up on the menu.
    // Production asks the machine instead, which lets go at two — one press
    // cannot both be dragging a man and offering a menu about him, and the
    // machine is what already decides which of those is happening.
    if (interactionRef.current.gesture.kind !== "pressing") cancelLongPress();
  };
  const onFieldPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const rejected = stylusRejects(stylusRef.current, event.pointerType);
    noteStylus(stylusUp(stylusRef.current, event.pointerType));
    if (rejected) return;
    cancelLongPress();
    const pinching = pinchRef.current !== undefined;
    touchesRef.current.delete(event.pointerId);
    if (touchesRef.current.size < 2) pinchRef.current = undefined;
    // A pinch that loses a finger becomes a pan under the one still down. It
    // is picked up where that finger actually is, so the field does not jump
    // to wherever the pinch started.
    const [remaining] = touchesRef.current.values();
    if (pinching && remaining && touchesRef.current.size === 1) {
      panRef.current = { ...remaining };
      return;
    }
    if (panRef.current) {
      panRef.current = undefined;
      return;
    }
    dispatchField({ type: "pointer-up", input: fieldPointerInput(event) });
  };
  const onFieldContextMenu = (event: React.MouseEvent<SVGSVGElement>) => {
    // The field's own menu replaces the browser's over a Player or a route,
    // and over open grass the browser keeps it.
    if (!pointedAt(event.clientX, event.clientY, "mouse")) return;
    event.preventDefault();
    openContextMenu(event.clientX, event.clientY, "mouse");
  };
  const onHandleDown = (
    handle: FieldHandleRef,
    event: React.PointerEvent,
  ): void => {
    // The handle owns this press; the field must not also start a move.
    event.stopPropagation();
    if (stylusRejects(stylusRef.current, event.pointerType)) return;
    // Which means the field never sees it, so the pointer in hand is recorded
    // here too — otherwise a Pencil that only ever grabs handles would keep
    // being handed a finger's targets.
    if (penInterrupts(stylusRef.current, event.pointerType))
      abandonTouchGesture();
    noteStylus(stylusDown(stylusRef.current, event.pointerType));
    const target = fieldSvgRef.current;
    try {
      target?.setPointerCapture(event.pointerId);
    } catch {
      // Capture is best-effort; the drag survives without it.
    }
    dispatchField({
      type: "handle-down",
      handle,
      input: fieldPointerInput(event),
    });
  };
  const onFieldDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (interactionRef.current.drawing) {
      dispatchField({ type: "finish-drawing" });
      return;
    }
    // Double-clicking the selected route adds a break where the Coach
    // pointed, the way the original did.
    const selected = interactionRef.current.selection.find(
      ({ kind }) => kind === "path",
    );
    if (!selected) return;
    dispatchField({
      type: "insert-node",
      pathId: selected.id,
      point: fieldPointFromClient(event.clientX, event.clientY),
    });
  };
  const onFieldPointerCancel = (event: React.PointerEvent<SVGSVGElement>) => {
    const rejected = stylusRejects(stylusRef.current, event.pointerType);
    noteStylus(stylusUp(stylusRef.current, event.pointerType));
    if (rejected) return;
    touchesRef.current.delete(event.pointerId);
    if (touchesRef.current.size < 2) pinchRef.current = undefined;
    panRef.current = undefined;
    dispatchField({ type: "pointer-cancel" });
  };
  const commitPlayName = () => {
    void editorStore.commitPlayName().catch(() => undefined);
  };
  // The acknowledgement is a status, not a durability button: the only thing
  // to press is a retry when a local save failed (ADR 0012).
  const retrySave = () => {
    if (editor.localSave.phase !== "error") return;
    void editorStore.retryLocalSave().catch(() => undefined);
  };
  const createVersion = (label: string) => {
    void editorStore.createVersion(label).catch(() => undefined);
  };
  const restoreVersion = (revisionId: string) => {
    void editorStore.restoreVersion(revisionId).catch(() => undefined);
  };
  const releaseStorage = () => {
    void runtime
      .releaseDerivedStorage()
      .then(setFreedStorage)
      .catch(() => undefined);
  };
  const undo = () => {
    void editorStore.undo().catch(() => undefined);
  };
  const redo = () => {
    void editorStore.redo().catch(() => undefined);
  };
  const focused = !railOpen && !inspectorOpen;
  const toggleMenu = (menu: Exclude<Menu, null>) =>
    setOpenMenu((current) => (current === menu ? null : menu));
  const setPanels = (shown: boolean) => {
    setRailOpen(shown);
    setInspectorOpen(shown);
  };

  /**
   * What each Clear would take. The original greys a Clear from the same
   * number that would run it, so a button never looks dead and still takes a
   * click; here the answer is the command itself, and no command means no
   * action, which is what leaves the button disabled.
   */
  const erasures = useMemo(() => {
    const built = {} as Record<PlayErasure, PlayCommand | undefined>;
    for (const erasure of playErasures) {
      built[erasure] = playErasureCommand(editor.document, erasure);
    }
    return built;
  }, [editor.document]);
  const clearAction = (erasure: PlayErasure): (() => void) | undefined => {
    const command = erasures[erasure];
    if (!command) return undefined;
    return () => {
      setOpenMenu(null);
      void editorStore.applyCommand(command).catch(() => undefined);
    };
  };

  /**
   * Everything on the field, in the order a Coach would read it out: his men
   * first, then what each of them is asked to do, then the notes. Stepping
   * through it is the only way to reach a Player without a pointer, which
   * ADR 0016 asks of every one of these.
   */
  const fieldItems: readonly FieldItemRef[] = useMemo(
    () => [
      ...editor.document.players.map(({ id }) => ({
        kind: "player" as const,
        id,
      })),
      ...editor.document.paths.map(({ id }) => ({ kind: "path" as const, id })),
      ...editor.document.labels.map(({ id }) => ({
        kind: "label" as const,
        id,
      })),
    ],
    [editor.document],
  );
  const pickFieldItem = (item: FieldItemRef): void => {
    focusInteraction({
      selection: [item],
      selectedBranchIndex: undefined,
      selectedSegmentIndex: undefined,
      selectedNodeIndex: undefined,
    });
  };
  /** What each of them is called, said the way a Coach would say it aloud. */
  const fieldItemName = (item: FieldItemRef): string =>
    (item.kind === "player"
      ? scene.players.find(({ id }) => id === item.id)?.ariaLabel
      : item.kind === "path"
        ? scene.paths.find(({ id }) => id === item.id)?.ariaLabel
        : scene.labels.find(({ id }) => id === item.id)?.ariaLabel) ??
    item.kind;
  const activeItem = interaction.selection[0];
  /**
   * What was just picked, said out loud. The halo is the answer for anybody
   * who can see it; this is the same answer for anybody who cannot, and it
   * says how many when he has picked more than one.
   */
  const activeItemName = activeItem
    ? `${fieldItemName(activeItem)}${
        interaction.selection.length > 1
          ? `, and ${interaction.selection.length - 1} more`
          : ""
      }`
    : "Nothing picked";

  /**
   * A wheel pushes the field in and out about the pointer. A trackpad swipe
   * moves it instead — sideways on its own, and sideways from a held shift,
   * which is the gesture every drawing tool has trained into him.
   */
  /** The two fingers as one gesture: how far apart, and where between them. */
  const pinchOf = () => {
    const [first, second] = [...touchesRef.current.values()];
    if (!first || !second) return undefined;
    return {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      midX: (first.x + second.x) / 2,
      midY: (first.y + second.y) / 2,
    };
  };

  const onFieldWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const acrossFirst =
      event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (acrossFirst) {
      const perPixel = camera.width / (fieldSvgRef.current?.clientWidth ?? 1);
      const across =
        event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
      const down = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
      setCamera((current) =>
        panCamera(current, across * perPixel, down * perPixel, EDITOR_FRAME),
      );
      return;
    }
    const anchor = framePointFromClient(event.clientX, event.clientY);
    setCamera((current) =>
      zoomCamera(
        current,
        event.deltaY > 0 ? 1.12 : 1 / 1.12,
        EDITOR_FRAME,
        anchor,
      ),
    );
  };

  /**
   * Shows what he picked, or the whole field when he picked nothing. Read
   * from the live Play and the live selection rather than from the render
   * that offered the button, so the keyboard and the palette agree with it.
   */
  const showSelection = (): void => {
    const document = editorStore.getSnapshot().document;
    const bounds = selectionFrameBounds(
      document,
      interactionRef.current.selection,
      createSvgProjection(document.fieldProfile),
    );
    setCamera(
      bounds ? cameraForBounds(bounds, EDITOR_FRAME) : fitCamera(EDITOR_FRAME),
    );
  };
  const showTheBall = (): void => {
    const document = editorStore.getSnapshot().document;
    const at = projectCoordinate(
      ballPosition(document),
      createSvgProjection(document.fieldProfile),
    );
    setCamera((current) => centreCamera(current, at, EDITOR_FRAME));
  };

  /**
   * The verbs the palette names, each one unavailable exactly when it would
   * do nothing — the same rule the Clear menu and the reorder items use, so
   * grey and inert always come from one answer.
   */
  const selectedPlayerIds = interaction.selection
    .filter(({ kind }) => kind === "player")
    .map(({ id }) => id);
  const alignAction = (
    alignment: PlayerAlignment,
  ): (() => void) | undefined => {
    const command = alignPlayersCommand(
      editor.document,
      selectedPlayerIds,
      alignment,
    );
    if (!command) return undefined;
    return () => {
      void editorStore.applyCommand(command).catch(() => undefined);
    };
  };
  const groupAction = ((): (() => void) | undefined => {
    const command = groupSelectionCommand(
      editor.document,
      interaction.selection,
      createStableId,
    );
    if (!command) return undefined;
    return () => {
      void editorStore.applyCommand(command).catch(() => undefined);
    };
  })();
  const ungroupAction = ((): (() => void) | undefined => {
    const command = ungroupSelectionCommand(
      editor.document,
      interaction.selection,
    );
    if (!command) return undefined;
    return () => {
      void editorStore.applyCommand(command).catch(() => undefined);
    };
  })();
  /** The one line the Coach has picked out, for the verbs that need just one. */
  const lonePathId =
    interaction.selection.length === 1 &&
    interaction.selection[0]?.kind === "path"
      ? interaction.selection[0].id
      : undefined;
  const reverseAction = ((): (() => void) | undefined => {
    if (!lonePathId) return undefined;
    const command = reverseRouteCommand(editor.document, lonePathId);
    if (!command) return undefined;
    return () => {
      void editorStore.applyCommand(command).catch(() => undefined);
    };
  })();
  /**
   * Marking how deep a break is. Built from the live Play inside the handler,
   * the way the other verbs that follow the Coach onto what they made are,
   * so nothing is captured while the panel is being drawn.
   */
  const addDepthMarker = (): void => {
    const document = editorStore.getSnapshot().document;
    const model = interactionRef.current;
    const pathId =
      model.selection.length === 1 && model.selection[0]?.kind === "path"
        ? model.selection[0].id
        : undefined;
    if (!pathId) return;
    const command = addDepthLabelCommand(
      document,
      pathId,
      model.selectedSegmentIndex === undefined
        ? undefined
        : model.selectedSegmentIndex + 1,
      createStableId,
    );
    if (!command) return;
    const [labelId] = insertedEntityIds(command);
    runPanelCommand(
      command,
      labelId ? { selection: [{ kind: "label", id: labelId }] } : {},
    );
  };
  const depthLabelAction = ((): (() => void) | undefined => {
    if (!lonePathId) return undefined;
    const command = addDepthLabelCommand(
      editor.document,
      lonePathId,
      interaction.selectedSegmentIndex === undefined
        ? undefined
        : interaction.selectedSegmentIndex + 1,
      createStableId,
    );
    return command ? addDepthMarker : undefined;
  })();

  /** Which set is on the field, by name, as the browser and the panel say it. */
  const onFieldFormation = useMemo(
    () => currentFormation(editor.document, allFormations),
    [allFormations, editor.document],
  );
  const zoomPercentage = Math.round(cameraZoom(camera, EDITOR_FRAME) * 100);
  const formationStatus =
    interaction.selection.length > 0 || interaction.drawing
      ? ""
      : editor.document.players.some(({ unit }) => unit !== "defense")
        ? onFieldFormation
          ? `${onFieldFormation.name.toUpperCase()} · ${onFieldFormation.personnelLabel}`
          : "CUSTOM ALIGNMENT"
        : "";
  /** Which call is on the field, by name, as the browser says it. */
  const onFieldCall = useMemo(
    () => currentDefensiveCall(editor.document, stockDefensiveCalls),
    [editor.document],
  );
  /**
   * Putting a call on the field. Only one defense can be on at a time, so
   * this replaces rather than adds, and says what it cost him.
   */
  const applyCallPick = (callId: string): void => {
    const call = stockDefensiveCalls.find(
      ({ formation }) => formation.id === callId,
    );
    if (!call) return;
    setOverlay(null);
    setPreviewFormationId(undefined);
    const { command, result } = applyDefensiveCallCommand(
      editor.document,
      call,
      createStableId,
      { withAssignments: callAssignments },
    );
    setToast({
      name: call.formation.name,
      text: callAssignments
        ? "— alignment and assignments"
        : "— alignment only",
    });
    runPanelCommand(command, { selection: [], drawing: undefined });
    void result;
  };

  /**
   * Each concept, and what pressing it would do. A concept with nobody to
   * draw it on is no command at all, which is what greys the button offering
   * it — grey and inert from the same answer, as the Clear menu already does.
   */
  const conceptCommands = useMemo(
    () =>
      // Read off the men on the field rather than remembered, so a concept
      // becomes available the moment there is somebody to draw it on.
      stockConcepts.map((concept) => ({
        concept,
        on: conceptIsOn(editor.document, concept),
        ...applyConceptCommand(editor.document, concept, createStableId),
      })),
    [editor.document],
  );
  const conceptActions = Object.fromEntries(
    conceptCommands.map(({ concept, on, command }) => [
      concept.key,
      { on, available: command !== undefined },
    ]),
  );
  /**
   * Drawing or clearing a concept. Built from the live Play rather than from
   * the render that offered the button, which is the same reason the reorder
   * shortcut rebuilds its own command.
   */
  const runConcept = (key: string): void => {
    const concept = stockConcepts.find((value) => value.key === key);
    if (!concept) return;
    const document = editorStore.getSnapshot().document;
    const { command, cleared, count } = applyConceptCommand(
      document,
      concept,
      createStableId,
    );
    if (!command) return;
    setToast({
      name: concept.name,
      text: cleared ? "— routes cleared" : `— ${count} routes drawn`,
    });
    runPanelCommand(command, { selection: [], drawing: undefined });
  };

  /**
   * The six calls the original puts on the whole line at once. As with the
   * concepts, a call with no line to give it to is no command at all, which
   * is what greys the button.
   */
  const linemen = useMemo(() => linemenOf(editor.document), [editor.document]);
  const lineCallCommands = useMemo(
    () =>
      lineCallKeys.map((key) => {
        const preset = linePresetByKey(key)!;
        const playerIds = linemen.map((player) => player.id);
        return {
          key,
          name: preset.name.replace(/^Pass set (left|right)$/, (_, side) =>
            side === "left" ? "Set left" : "Set right",
          ),
          on: linePresetIsOn(editor.document, playerIds, key),
          command: applyLinePresetCommand(
            editor.document,
            playerIds,
            key,
            createStableId,
          ),
        };
      }),
    [editor.document, linemen],
  );
  const lineCallActions = lineCallCommands.map(({ command, ...call }) => ({
    ...call,
    available: command !== undefined,
  }));
  const runLineCall = (key: string): void => {
    const document = editorStore.getSnapshot().document;
    const command = applyLinePresetCommand(
      document,
      linemenOf(document).map((player) => player.id),
      key,
      createStableId,
    );
    // The selection is left where it was: picking the line would swap in
    // another panel and unmount the very buttons just pressed.
    if (command) runPanelCommand(command, {});
  };

  /**
   * The three places the official can spot the ball. The whole Play travels
   * with it, defense included, so each is one transaction — and the one it is
   * already on is no command at all, which greys it.
   */
  const ballSpotCommands = useMemo(() => {
    const on = currentBallSpot(editor.document);
    return (["left", "middle", "right"] as const).map((spot) => ({
      spot,
      name:
        spot === "middle" ? "Middle" : spot === "left" ? "L hash" : "R hash",
      title: ballSpotNames[spot],
      on: on === spot,
      ...spotBallCommand(editor.document, spot),
    }));
  }, [editor.document]);
  /**
   * Spotting the ball is the Coach's whole gesture, the way picking a set is:
   * move it, then say what it cost him. Built from the live Play rather than
   * from the render that offered the button.
   */
  const spotTheBall = (spot: BallSpot): void => {
    const { command, tightened } = spotBallCommand(
      editorStore.getSnapshot().document,
      spot,
    );
    if (!command) return;
    setToast({
      name: ballSpotNames[spot],
      text: tightened ? "— boundary splits tightened to stay in bounds" : "",
    });
    runPanelCommand(command, { selection: [], drawing: undefined });
  };
  const ballSpotActions = ballSpotCommands.map(({ command, ...spot }) => ({
    ...spot,
    available: command !== undefined,
  }));

  /** What a realignment would leave alone, said before he asks for one. */
  const formationHint = useMemo(() => {
    const offense = editor.document.players.filter(
      ({ unit }) => unit !== "defense",
    ).length;
    if (offense === 0) {
      return "There is no offense on the field yet, so this drops the formation in as it is.";
    }
    const defenders = editor.document.players.length - offense;
    const notes = editor.document.labels.length;
    const kept = [
      defenders > 0
        ? `${defenders} defender${defenders > 1 ? "s" : ""}`
        : undefined,
      notes > 0 ? `${notes} label${notes > 1 ? "s" : ""}` : undefined,
    ].filter(Boolean);
    return `Players move to the new alignment and every route stays attached to the man running it.${
      kept.length > 0 ? ` Your ${kept.join(" and ")} stay put.` : ""
    }`;
  }, [editor.document]);

  /**
   * Putting the men in a set is the Coach's whole gesture: apply it, follow
   * him onto the men it had to add, and say what happened where he is already
   * looking. One transaction, so one press of undo takes all of it back.
   */
  const applyFormationPick = (formationId: string): void => {
    const formation = allFormations.find(({ id }) => id === formationId);
    if (!formation) return;
    setOverlay(null);
    setPreviewFormationId(undefined);
    const { command, result } = applyFormationCommand(
      editor.document,
      formation,
      createStableId,
    );
    const { plan } = result;
    const parts = [
      plan.movedCount > 0 ? `${plan.movedCount} moved` : undefined,
      plan.carriedPathCount > 0
        ? `${plan.carriedPathCount} ${plan.carriedPathCount === 1 ? "route" : "routes"} carried`
        : undefined,
      result.addedPlayerIds.length > 0
        ? `${result.addedPlayerIds.length} added`
        : undefined,
      plan.orphans.length > 0
        ? `${plan.orphans.length} left in place`
        : undefined,
    ].filter(Boolean);
    setToast({
      name: formation.name,
      text: parts.length > 0 ? `— ${parts.join(", ")}` : "— already aligned",
    });
    runPanelCommand(command, {
      selection: result.addedPlayerIds.map((id) => ({
        kind: "player" as const,
        id,
      })),
      drawing: undefined,
    });
  };

  /**
   * Bringing forward and sending back are unavailable when the selection is
   * already as far as it goes — or is only Players, who draw above every line
   * whatever order they are stored in. Grey and inert come from one answer.
   */
  const reorderAction = (direction: 1 | -1): (() => void) | undefined => {
    const command = reorderSelectionCommand(
      editor.document,
      interaction.selection,
      direction,
    );
    if (!command) return undefined;
    return () => {
      void editorStore.applyCommand(command).catch(() => undefined);
    };
  };

  /**
   * What production can run today. A command the editor cannot yet perform is
   * deliberately absent so the menus show it as unavailable rather than
   * accepting a click and doing nothing.
   */
  const actions: ActionMap = {
    toolSelect: () => selectTool("select"),
    toolPlayer: () => selectTool("player"),
    toolRoute: () => selectTool("route"),
    toolMotion: () => selectTool("motion"),
    toolBlock: () => selectTool("block"),
    toolZone: () => selectTool("zone"),
    toolText: () => selectTool("text"),
    focus: () => setPanels(false),
    showPanels: () => setPanels(true),
    toggleInspector: () => setInspectorOpen((shown) => !shown),
    toggleRail: () => setRailOpen((shown) => !shown),
    toggleZones: () => setZonesHidden((hidden) => !hidden),
    // Reflects what the Coach has picked, or the whole Play when he has
    // picked nothing — the same call either way.
    mirror: () => {
      dispatchFieldRef.current({ type: "mirror" });
      setOpenMenu(null);
    },
    present: () => setActiveView("Present"),
    print: () => setActiveView("Print"),
    shortcuts: () => setOverlay("shortcuts"),
    // Chalk saves continuously (ADR 0012); an explicit Save flushes whatever
    // the Coach is still typing rather than pretending durability is manual.
    savePlay: () => {
      commitPlayName();
      setOpenMenu(null);
    },
    clearRoutesOffense: clearAction("offensive-lines"),
    clearRoutesDefense: clearAction("defensive-lines"),
    clearAllLines: clearAction("lines"),
    clearOffense: clearAction("offense"),
    clearDefense: clearAction("defense"),
    clearText: clearAction("text"),
    clearField: clearAction("field"),
    duplicate: () => dispatchFieldRef.current({ type: "duplicate" }),
    deleteSelection: () => dispatchFieldRef.current({ type: "delete" }),
    bringForward: reorderAction(1),
    sendBackward: reorderAction(-1),
    toggleSnapping: () => setSnapEnabled((enabled) => !enabled),
    flipStrength: () => {
      const command = flipStrengthCommand(editorStore.getSnapshot().document);
      if (command) {
        void editorStore.applyCommand(command).catch(() => undefined);
      }
    },
    alignDepth: alignAction("depth"),
    alignSplits: alignAction("splits"),
    group: groupAction,
    ungroup: ungroupAction,
    reverseRoute: reverseAction,
    addDepthLabel: depthLabelAction,
    fitField: () => setCamera(fitCamera(EDITOR_FRAME)),
    fitToSelection: showSelection,
    zoomToSelection: showSelection,
    centerBall: showTheBall,
    ballLeft: () => spotTheBall("left"),
    ballMiddle: () => spotTheBall("middle"),
    ballRight: () => spotTheBall("right"),
    formations: () => {
      setOpenMenu(null);
      setOverlay("formations");
    },
    defenses: () => {
      setOpenMenu(null);
      setOverlay("defenses");
    },
    ...Object.fromEntries(
      stockDefensiveCalls.map((call) => [
        `defense:${call.formation.id}`,
        () => applyCallPick(call.formation.id),
      ]),
    ),
    ...Object.fromEntries(
      stockFormations.map((formation) => [
        `formation:${formation.id}`,
        () => applyFormationPick(formation.id),
      ]),
    ),
  };

  useEffect(() => {
    const element = fieldSvgRef.current;
    if (!element || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width;
      if (width && width > 0) setFieldWidthPx(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Watched rather than read once, because a phone turned on its side is a
  // different screen and the Coach turns it over without reloading anything.
  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return;
    const query = globalThis.matchMedia(editorScreenQuery);
    const read = () => {
      const tooSmall = !query.matches;
      setReading(tooSmall);
      // Whatever corner of the field he had been working in, a screen he can
      // only read shows the Play whole to begin with. He can still go in for
      // a closer look; he should not have to come back out for the first one.
      if (tooSmall) setCamera(fitCamera(EDITOR_FRAME));
    };
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Held by the keyboard listener, and stable, since everything it needs it
  // reads live rather than closing over.
  const showSelectionOnKey = useCallback(() => {
    const document = editorStore.getSnapshot().document;
    const bounds = selectionFrameBounds(
      document,
      interactionRef.current.selection,
      createSvgProjection(document.fieldProfile),
    );
    setCamera(
      bounds ? cameraForBounds(bounds, EDITOR_FRAME) : fitCamera(EDITOR_FRAME),
    );
  }, [editorStore]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A keyboard reaches a phone too — paired, or on a screen the browser
      // has shrunk — and every shortcut below this line changes the Play.
      if (reading) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      /*
       * A control the Coach has tabbed to activates on Enter and on Space,
       * and those are the two keys the field also wants. The control wins,
       * except where the field is plainly the thing being aimed at:
       * swallowing them here left every button in the app dead to anyone
       * working without a pointer.
       */
      const activating =
        target?.closest?.(
          "button, a[href], summary, [role='button'], [role='menuitem'], [role='option']",
        ) != null;
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (event.key === "Escape") {
        if (contextMenu) {
          setContextMenu(undefined);
          return;
        }
        if (overlay !== null || openMenu !== null) {
          setOverlay(null);
          setOpenMenu(null);
          return;
        }
        // With no chrome to close, Escape cancels the gesture or clears the
        // selection, the way the original stepped outward.
        if (!typing) dispatchFieldRef.current({ type: "escape" });
        return;
      }
      if (meta && (key === "0" || key === "2")) {
        event.preventDefault();
        if (key === "0") setCamera(fitCamera(EDITOR_FRAME));
        else showSelectionOnKey();
        return;
      }
      if (meta && (key === "=" || key === "+" || key === "-")) {
        event.preventDefault();
        setCamera((current) =>
          zoomCamera(current, key === "-" ? 1.25 : 1 / 1.25, EDITOR_FRAME),
        );
        return;
      }
      if (meta && event.shiftKey && (key === "f" || key === "d")) {
        event.preventDefault();
        setOpenMenu(null);
        setOverlay(key === "f" ? "formations" : "defenses");
        return;
      }
      if (meta && key === "k") {
        event.preventDefault();
        setOpenMenu(null);
        setOverlay("palette");
        return;
      }
      if (meta && key === "s") {
        event.preventDefault();
        setOverlay(null);
        setOpenMenu((current) => (current === "save" ? null : "save"));
        return;
      }
      if (meta && key === "z" && !typing) {
        // The shortcut panel has always listed these; until now only the
        // header buttons ran them. Left to the browser inside a text field,
        // where undo means the words rather than the Play.
        event.preventDefault();
        void (event.shiftKey ? editorStore.redo() : editorStore.undo()).catch(
          () => undefined,
        );
        return;
      }
      if (meta && key === "a" && !typing) {
        event.preventDefault();
        dispatchFieldRef.current({ type: "select-all" });
        return;
      }
      if (meta && !typing && key === "g") {
        event.preventDefault();
        const document = editorStore.getSnapshot().document;
        const selection = interactionRef.current.selection;
        const command = event.shiftKey
          ? ungroupSelectionCommand(document, selection)
          : groupSelectionCommand(document, selection, createStableId);
        if (command) {
          void editorStore.applyCommand(command).catch(() => undefined);
        }
        return;
      }
      if (meta && !typing && (key === "]" || key === "[")) {
        event.preventDefault();
        // Built from the live document and selection rather than from the
        // render that registered this listener, which may be older.
        const command = reorderSelectionCommand(
          editorStore.getSnapshot().document,
          interactionRef.current.selection,
          key === "]" ? 1 : -1,
        );
        if (command) {
          void editorStore.applyCommand(command).catch(() => undefined);
        }
        return;
      }
      if (meta && !typing && (key === "c" || key === "v" || key === "d")) {
        event.preventDefault();
        dispatchFieldRef.current({
          type: key === "c" ? "copy" : key === "v" ? "paste" : "duplicate",
        });
        return;
      }
      if (event.key === "?" && !typing) {
        event.preventDefault();
        setOverlay("shortcuts");
        return;
      }
      if (typing || meta || event.altKey) return;
      if (event.key === " " && !activating) {
        // Held space turns a drag into a pan. It is not a tool key and has no
        // other job, so it is swallowed rather than scrolling the page.
        event.preventDefault();
        spaceHeldRef.current = true;
        return;
      }
      if (event.key === "Enter" && (!activating || drawingRef.current)) {
        // Enter ends the route being drawn. Mid-route it belongs to the
        // field even when a tool button still holds focus — pressing the
        // field does not move focus, so that button would otherwise keep a
        // key the Coach is plainly aiming at the route.
        event.preventDefault();
        dispatchFieldRef.current({ type: "finish-drawing" });
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        dispatchFieldRef.current({ type: "delete" });
        return;
      }
      if (drawingRef.current && /^[0-9.]$/.test(event.key)) {
        // Digits typed mid-route set the next break's exact depth, so they
        // must never also pick a tool.
        event.preventDefault();
        dispatchFieldRef.current({ type: "depth-digit", digit: event.key });
        return;
      }
      const nudges: Record<string, readonly [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, 1],
        ArrowDown: [0, -1],
      };
      const nudge = nudges[event.key];
      if (nudge) {
        event.preventDefault();
        // Half a yard per press; Shift refines to a tenth (ADR 0016's
        // keyboard alternative to dragging — the original had no nudge).
        const step = event.shiftKey ? 0.1 : 0.5;
        dispatchFieldRef.current({
          type: "nudge",
          lateralYards: nudge[0] * step,
          depthYards: nudge[1] * step,
        });
        return;
      }
      if (event.shiftKey) return;
      const toolKeys: Record<string, Tool> = {
        v: "select",
        p: "player",
        r: "route",
        m: "motion",
        b: "block",
        z: "zone",
        t: "text",
      };
      const tool = toolKeys[key];
      if (tool) {
        selectToolRef.current(tool);
        return;
      }
      if (key === "s") setSnapEnabled((enabled) => !enabled);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") spaceHeldRef.current = false;
    };
    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("keyup", onKeyUp);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("keyup", onKeyUp);
    };
  }, [
    contextMenu,
    editorStore,
    openMenu,
    overlay,
    reading,
    showSelectionOnKey,
  ]);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".menu")) return;
      setOpenMenu(null);
    };
    globalThis.addEventListener("pointerdown", onPointerDown);
    return () => globalThis.removeEventListener("pointerdown", onPointerDown);
  }, [openMenu]);

  const header = (
    <Header
      actions={actions}
      activeView={activeView}
      commitPlayName={commitPlayName}
      focused={focused}
      onCloseMenu={() => setOpenMenu(null)}
      onCreateVersion={createVersion}
      onMenu={toggleMenu}
      onRedo={redo}
      onRestoreVersion={restoreVersion}
      onUndo={undo}
      onView={setActiveView}
      openMenu={openMenu}
      playName={editor.draftPlayName}
      resetPlayName={editorStore.resetPlayNameDraft}
      runtime={runtime}
      setPlayName={editorStore.setPlayNameDraft}
      undo={editor.undo}
      versions={editor.versions}
      zonesHidden={zonesHidden}
    />
  );

  if (reading) {
    // A phone shows the Play and nothing that changes it. The field still
    // moves — a Coach on the sideline wants a closer look at one man — but
    // every pointer here only moves the camera, so the picture in his hand is
    // the picture that was called.
    return (
      <div className="chalk-shell view-reading">
        <header className="topbar reading-topbar">
          <div className="chalk-mark" aria-hidden="true">
            <i />
          </div>
          <strong className="brand">{PRODUCT_NAME}</strong>
          <span className="reading-name">{editor.document.name}</span>
          <span className="reading-chip">Read only</span>
        </header>
        <main className="editor-stage">
          <div className="field-wrap">
            <FieldDiagram
              camera={camera}
              onPointerCancel={onFieldPointerCancel}
              onPointerDown={onFieldPointerDown}
              onPointerMove={onFieldPointerMove}
              onPointerUp={onFieldPointerUp}
              scene={scene}
              svgRef={fieldSvgRef}
            />
            <ul aria-label="Everything on the field" className="field-outline">
              {fieldItems.map((item) => (
                <li key={`${item.kind}:${item.id}`}>{fieldItemName(item)}</li>
              ))}
            </ul>
          </div>
        </main>
        <p className="reading-note">
          This screen is too small to work on. Open the Play on a tablet or a
          computer to change it.
        </p>
      </div>
    );
  }

  if (activeView !== "Editor") {
    return (
      <div className={`chalk-shell view-${activeView.toLowerCase()}`}>
        {header}
        <div className="mode-placeholder">
          <FieldDiagram scene={scene} />
          <div className="mode-label">{activeView} mode</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chalk-shell">
      {header}
      <div className="workspace">
        {railOpen ? (
          <nav className="tool-rail" aria-label="Drawing tools">
            {tools.map((tool) => (
              <button
                className={activeTool === tool.id ? "active" : ""}
                key={tool.id}
                onClick={() => selectTool(tool.id)}
                title={`${tool.label} — ${tool.shortcut}`}
                aria-label={`${tool.label} — ${tool.shortcut}`}
              >
                <ToolIcon glyph={tool.glyph} />
              </button>
            ))}
            <span className="rail-spacer" />
            <ClearMenu
              actions={actions}
              onDismiss={() => setOpenMenu(null)}
              onToggle={() => toggleMenu("clear")}
              open={openMenu === "clear"}
            />
            <button
              aria-label="Angle snap 45 degrees — S"
              aria-pressed={snapEnabled}
              className="snap-toggle"
              onClick={() => setSnapEnabled((enabled) => !enabled)}
              title="Angle snap 45° — S (hold Shift to toggle while drawing)"
              type="button"
            >
              <ToolIcon glyph="snap" />
            </button>
            <button
              className="rail-collapse"
              aria-label="Hide the tools"
              onClick={() => setRailOpen(false)}
              title="Hide the tools — ⌥2"
            >
              ‹
            </button>
          </nav>
        ) : null}
        <main className="editor-stage">
          <DeviceNotices
            onDismissRecovery={() => setRecoveryDismissed(true)}
            onReleaseStorage={releaseStorage}
            recovery={recoveryDismissed ? undefined : runtime.recovery}
            storage={storage}
          />
          <div
            className="field-wrap"
            data-drawing={interaction.drawing ? "true" : undefined}
            data-tool={activeTool}
          >
            <FieldDiagram
              camera={camera}
              onWheel={onFieldWheel}
              onContextMenu={onFieldContextMenu}
              onPointerCancel={onFieldPointerCancel}
              onPointerDown={onFieldPointerDown}
              onPointerMove={onFieldPointerMove}
              onPointerUp={onFieldPointerUp}
              onDoubleClick={onFieldDoubleClick}
              onHoverPlayer={setHoveredPlayerId}
              onStartRoute={(playerId) =>
                dispatchField({ type: "start-route", playerId })
              }
              overlay={
                <>
                  <FieldInteractionOverlay
                    drawing={interaction.drawing}
                    gesture={interaction.gesture}
                    projection={scene.viewport}
                  />
                  {selectedPath ? (
                    <RouteHandles
                      branchIndex={interaction.selectedBranchIndex}
                      onHandleDown={onHandleDown}
                      path={selectedPath}
                      precise={precisePointer}
                      projection={scene.viewport}
                      selectedNodeIndex={interaction.selectedNodeIndex}
                      selectedSegmentIndex={interaction.selectedSegmentIndex}
                      zoom={cssPerFrameUnit}
                    />
                  ) : null}
                  <FormationGhost
                    formationId={previewFormationId}
                    formations={allFormations}
                    projection={scene.viewport}
                  />
                  {leaderHandleAt ? (
                    <circle
                      className="handle-target"
                      cx={leaderHandleAt.x}
                      cy={leaderHandleAt.y}
                      data-leader-handle={selectedLabel!.id}
                      fill="transparent"
                      onPointerDown={(event) =>
                        onHandleDown(
                          { kind: "leader", labelId: selectedLabel!.id },
                          event,
                        )
                      }
                      r={22}
                    >
                      <title>Drag to point the leader line</title>
                    </circle>
                  ) : null}
                </>
              }
              routeDotPlayerId={routeDotPlayerId}
              scene={scene}
              selection={selectionKeys}
              svgRef={fieldSvgRef}
            />
            {/*
              The picture is a picture; this is the same field as something to
              work through without a pointer. Ordinary buttons rather than a
              focus trap over the drawing, so the tab order a screen reader
              already gives him is the order he reads the Play in, and every
              one of them picks what it names (ADR 0016).
            */}
            <ul aria-label="Everything on the field" className="field-outline">
              {fieldItems.map((item) => (
                <li key={`${item.kind}:${item.id}`}>
                  <button
                    aria-pressed={
                      activeItem?.kind === item.kind &&
                      activeItem.id === item.id
                    }
                    onClick={() => pickFieldItem(item)}
                    type="button"
                  >
                    {fieldItemName(item)}
                  </button>
                </li>
              ))}
            </ul>
            <p aria-live="polite" className="visually-hidden">
              {activeItemName}
            </p>
            {toast ? (
              <div className="toast" role="status">
                <span>
                  <strong>{toast.name}</strong> {toast.text}
                </span>
                <button
                  onClick={() => {
                    setToast(undefined);
                    undo();
                  }}
                  title="Undo — ⌘Z"
                  type="button"
                >
                  Undo
                </button>
              </div>
            ) : null}
          </div>
          <div className="timeline" aria-label="Playback controls">
            <button aria-label="Play">▶</button>
            <span className="scrubber">
              <i />
            </span>
            <code>0.0s / 3.1s</code>
            <span className="speed">
              <button>0.5×</button>
              <button className="active">1×</button>
              <button>2×</button>
            </span>
            <button aria-label="Reset">⟲</button>
          </div>
        </main>
        {inspectorOpen ? (
          <Inspector
            labelEditor={
              selectedPath ? (
                <RouteInspector
                  branchIndex={interaction.selectedBranchIndex}
                  coaching={routeCoaching(selectedPath)}
                  nodeIndex={interaction.selectedNodeIndex}
                  onAddChoice={() =>
                    runPanelCommand(
                      addRouteChoiceCommand(
                        editor.document,
                        selectedPath.id,
                        interaction.selectedNodeIndex,
                      ),
                      {
                        // The Coach lands on the fork he just made, the way
                        // the original narrows to it.
                        selectedBranchIndex: selectedPath.branches.length,
                        selectedSegmentIndex: undefined,
                      },
                    )
                  }
                  onCoaching={(field, value) =>
                    editRouteCoaching(selectedPath.id, field, value)
                  }
                  onCoachingCommitted={(field) => {
                    editorStore.endCoalescing();
                    // Only the field being left lets go of the draft. A blur
                    // can arrive after the Coach has already moved on and
                    // typed into the next field — and clearing it then would
                    // wipe what he has just written out from under him.
                    setCoachingDraft((draft) =>
                      draft?.field === field ? undefined : draft,
                    );
                  }}
                  onDelete={() => dispatchField({ type: "delete" })}
                  onDeselect={() => dispatchField({ type: "escape" })}
                  onFlip={() =>
                    runLabelCommand(
                      flipRouteCommand(editor.document, selectedPath.id),
                    )
                  }
                  onRemoveChoice={() =>
                    runPanelCommand(
                      interaction.selectedBranchIndex === undefined
                        ? undefined
                        : removeRouteChoiceCommand(
                            editor.document,
                            selectedPath.id,
                            interaction.selectedBranchIndex,
                          ),
                      // What he narrowed to is gone, so the whole line is his
                      // again.
                      { selectedBranchIndex: undefined },
                    )
                  }
                  onKind={(kind) =>
                    runLabelCommand(
                      setRouteKindCommand(
                        editor.document,
                        selectedPath.id,
                        kind,
                      ),
                    )
                  }
                  onStraighten={() =>
                    runLabelCommand(
                      straightenRouteCommand(editor.document, selectedPath.id, {
                        branchIndex: interaction.selectedBranchIndex,
                      }),
                    )
                  }
                  onStyle={(style) =>
                    runLabelCommand(
                      setRouteStyleCommand(
                        editor.document,
                        selectedPath.id,
                        {
                          branchIndex: interaction.selectedBranchIndex,
                          segmentIndex: interaction.selectedSegmentIndex,
                        },
                        style,
                      ),
                    )
                  }
                  path={selectedPath}
                  segmentIndex={interaction.selectedSegmentIndex}
                  unit={editor.document.unit}
                />
              ) : selectedPlayer ? (
                <PlayerInspector
                  lines={playerLines(selectedPlayer)}
                  onApplyPreset={(pathId, presetKey) => {
                    const line = editor.document.paths.find(
                      ({ id }) => id === pathId,
                    );
                    // A route is reshaped in place, keeping its forks and
                    // everything the Coach wrote on it. A block or a drop is
                    // a whole call rather than a shape, so it replaces what
                    // the man was doing — which is what the original does,
                    // and why the two go through different commands.
                    runPanelCommand(
                      line?.kind === "route"
                        ? applyRoutePresetCommand(
                            editor.document,
                            pathId,
                            presetKey,
                          )
                        : applyLinePresetCommand(
                            editor.document,
                            line ? [line.playerId] : [],
                            presetKey,
                            createStableId,
                          ),
                      {
                        ...(line?.kind === "route"
                          ? { selection: [{ kind: "path", id: pathId }] }
                          : {}),
                        selectedNodeIndex: undefined,
                        selectedBranchIndex: undefined,
                        selectedSegmentIndex: undefined,
                      },
                    );
                  }}
                  onAddAlternate={() => {
                    const id = createStableId("path");
                    runPanelCommand(
                      addAlternateRouteCommand(
                        editor.document,
                        selectedPlayer.id,
                        () => id,
                      ),
                      // The new stem is his to shape, so he lands on it.
                      {
                        selection: [{ kind: "path", id }],
                        selectedBranchIndex: undefined,
                        selectedSegmentIndex: undefined,
                        selectedNodeIndex: undefined,
                      },
                    );
                  }}
                  onAppearance={(appearance) =>
                    runLabelCommand(
                      setPlayerCommand(
                        editor.document,
                        selectedPlayer.id,
                        appearance,
                      ),
                    )
                  }
                  onDeselect={() => dispatchField({ type: "escape" })}
                  onFlip={() =>
                    runLabelCommand(
                      flipPlayerLinesCommand(
                        editor.document,
                        selectedPlayer.id,
                      ),
                    )
                  }
                  onRemoveLine={(pathId) =>
                    runLabelCommand(
                      deletePathsCommand(editor.document, [pathId]),
                    )
                  }
                  onSelectLine={(pathId) =>
                    focusInteraction({
                      selection: [{ kind: "path", id: pathId }],
                      selectedBranchIndex: undefined,
                      selectedSegmentIndex: undefined,
                      selectedNodeIndex: undefined,
                    })
                  }
                  onText={(field, value) => {
                    setPlayerDraft({
                      playerId: selectedPlayer.id,
                      field,
                      value,
                    });
                    void editorStore
                      .applyEdit(
                        (current) =>
                          setPlayerCommand(current, selectedPlayer.id, {
                            [field]: value,
                          }),
                        // Keystrokes merge into one undo entry until he leaves
                        // the field, the way a note's text does (ADR 0012).
                        { coalesce: true },
                      )
                      .catch(() => undefined);
                  }}
                  onTextCommitted={(field) => {
                    editorStore.endCoalescing();
                    // As with the coaching fields: a blur that arrives after
                    // he has moved on must not clear the draft of the field
                    // he moved on to.
                    setPlayerDraft((draft) =>
                      draft?.field === field ? undefined : draft,
                    );
                  }}
                  player={selectedPlayer}
                  text={playerText(selectedPlayer)}
                />
              ) : selectedLabel ? (
                <LabelInspector
                  label={selectedLabel}
                  onAppearance={(appearance) =>
                    runLabelCommand(
                      setLabelAppearanceCommand(
                        editor.document,
                        selectedLabel.id,
                        appearance,
                      ),
                    )
                  }
                  onDelete={() => dispatchField({ type: "delete" })}
                  onDeselect={() => dispatchField({ type: "escape" })}
                  onRole={(role) =>
                    runLabelCommand(
                      applyLabelRoleCommand(
                        editor.document,
                        selectedLabel.id,
                        role,
                      ),
                    )
                  }
                  onText={(text) => {
                    setLabelTextDraft({ id: selectedLabel.id, text });
                    void editorStore
                      .applyEdit(
                        (current) =>
                          setLabelTextCommand(current, selectedLabel.id, text),
                        // Consecutive keystrokes merge into one undo entry
                        // until the Coach leaves the field (ADR 0012).
                        { coalesce: true },
                      )
                      .catch(() => undefined);
                  }}
                  onTextCommitted={() => {
                    editorStore.endCoalescing();
                    setLabelTextDraft(undefined);
                  }}
                  text={
                    labelTextDraft?.id === selectedLabel.id
                      ? labelTextDraft.text
                      : selectedLabel.text
                  }
                  textInputRef={labelTextInputRef}
                />
              ) : undefined
            }
            ballSpots={ballSpotActions}
            call={onFieldCall}
            concepts={conceptActions}
            lineCalls={lineCallActions}
            linemanCount={linemen.length}
            defenderCount={
              editor.document.players.filter(({ unit }) => unit === "defense")
                .length
            }
            formation={onFieldFormation}
            formationHint={formationHint}
            onConcept={runConcept}
            onLineCall={runLineCall}
            onSpotBall={spotTheBall}
            onOpenDefenses={() => setOverlay("defenses")}
            onOpenFormations={() => setOverlay("formations")}
            onOpenPalette={() => setOverlay("palette")}
            onOpenShortcuts={() => setOverlay("shortcuts")}
          />
        ) : (
          <button
            className="inspector-stub"
            onClick={() => setInspectorOpen(true)}
            title="Show the inspector — ⌥1"
            type="button"
          >
            Inspector
          </button>
        )}
      </div>
      <div className="statusbar">
        <span>
          drag the blue dot above a player to draw his route — double-click a
          line to add a node · ⌫ delete
        </span>
        <div className="status-controls">
          <div className="status-zoom">
            <button
              aria-label="Zoom out"
              onClick={() =>
                setCamera((current) => zoomCamera(current, 1.25, EDITOR_FRAME))
              }
              title="Zoom out — ⌘-"
              type="button"
            >
              −
            </button>
            <button
              aria-label={`Fit the field — ${zoomPercentage}% zoom`}
              className="zoom-percentage"
              onClick={() => setCamera(fitCamera(EDITOR_FRAME))}
              title="Fit the field — ⌘0"
              type="button"
            >
              {zoomPercentage}%
            </button>
            <button
              aria-label="Zoom in"
              onClick={() =>
                setCamera((current) =>
                  zoomCamera(current, 1 / 1.25, EDITOR_FRAME),
                )
              }
              title="Zoom in — ⌘="
              type="button"
            >
              +
            </button>
          </div>
          <button
            aria-label="Fit to selection"
            onClick={showSelection}
            title="Fit to selection — ⌘2"
            type="button"
          >
            SELECTION
          </button>
          <button
            aria-label="Center on the ball"
            onClick={showTheBall}
            title="Center on the ball"
            type="button"
          >
            BALL
          </button>
          <span data-formation-status>{formationStatus}</span>
          <span>SNAP {snapEnabled ? "ON" : "OFF"}</span>
          <span>
            {editor.document.players.length}P · {editor.document.paths.length}R
          </span>
          <button
            aria-label={localSaveMessage(editor.localSave)}
            className={`save-state ${editor.localSave.phase}`}
            data-save-duration-ms={
              "durationMs" in editor.localSave
                ? editor.localSave.durationMs
                : undefined
            }
            data-save-within-budget={
              "withinBudget" in editor.localSave
                ? editor.localSave.withinBudget
                : undefined
            }
            disabled={editor.localSave.phase !== "error"}
            onClick={retrySave}
          >
            {localSaveStatus(editor.localSave)}
          </button>
        </div>
      </div>
      {overlay === "palette" ? (
        <CommandPalette actions={actions} onClose={() => setOverlay(null)} />
      ) : null}
      {overlay === "shortcuts" ? (
        <ShortcutReference onClose={() => setOverlay(null)} />
      ) : null}
      {overlay === "defenses" ? (
        <DefenseBrowser
          calls={stockDefensiveCalls}
          favoriteIds={favoriteCallIds}
          currentCallId={onFieldCall?.formation.id}
          onClose={() => {
            setOverlay(null);
            setPreviewFormationId(undefined);
          }}
          onPick={applyCallPick}
          onPreview={setPreviewFormationId}
          onToggleAssignments={() => setCallAssignments((on) => !on)}
          onToggleFavorite={toggleFavoriteCall}
          withAssignments={callAssignments}
        />
      ) : null}
      {overlay === "formations" ? (
        <FormationBrowser
          currentFormationId={onFieldFormation?.id}
          favoriteIds={favoriteFormationIds}
          formations={allFormations}
          offensivePlayerCount={
            editor.document.players.filter(({ unit }) => unit !== "defense")
              .length
          }
          onClose={() => {
            setOverlay(null);
            setPreviewFormationId(undefined);
          }}
          onPick={applyFormationPick}
          onPreview={setPreviewFormationId}
          onRemove={removeCoachFormation}
          onSave={saveCoachFormation}
          onToggleFavorite={toggleFavoriteFormation}
        />
      ) : null}
      <ContextMenu
        actions={actions}
        at={contextMenu}
        onDismiss={() => setContextMenu(undefined)}
      />
    </div>
  );
}

const storageMessages: Record<string, string> = {
  watch: "This device is running low on space for Chalk.",
  critical: "This device is nearly out of space for Chalk.",
};

type BackupState =
  | { readonly phase: "idle" }
  | { readonly phase: "working" }
  | { readonly phase: "done"; readonly message: string }
  | { readonly phase: "error"; readonly message: string };

function BackupPanel({ runtime }: { runtime: ChalkRuntime }) {
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [state, setState] = useState<BackupState>({ phase: "idle" });

  const download = (contents: string) => {
    const url = URL.createObjectURL(
      new Blob([contents], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "chalk-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const backUp = () => {
    setState({ phase: "working" });
    runtime
      .exportEncryptedBackup(passphrase)
      .then((contents) => {
        download(contents);
        setPassphrase("");
        setState({ phase: "done", message: "Backup saved to this device." });
      })
      .catch(() =>
        setState({
          phase: "error",
          message: "Chalk could not write a backup.",
        }),
      );
  };

  const restore = (file: File) => {
    setState({ phase: "working" });
    file
      .text()
      .then((contents) => runtime.importEncryptedBackup(contents, passphrase))
      .then((result) => {
        setPassphrase("");
        setState({
          phase: "done",
          message: `Restored ${result.plays} ${
            result.plays === 1 ? "Play" : "Plays"
          }. Newer work on this device was kept.`,
        });
      })
      .catch(() =>
        setState({
          phase: "error",
          message:
            "That passphrase does not open this backup, or the file has been altered.",
        }),
      );
  };

  return (
    <div className="backup-section">
      <button
        aria-expanded={open}
        className="menu-entry"
        onClick={() => setOpen((shown) => !shown)}
        type="button"
      >
        Backup
      </button>
      <div className="backup-panel" hidden={!open}>
        <label className="backup-field">
          <span>Passphrase</span>
          <input
            aria-label="Backup passphrase"
            autoComplete="off"
            onChange={(event) => setPassphrase(event.target.value)}
            type="password"
            value={passphrase}
          />
        </label>
        <p className="version-empty">
          Chalk encrypts the backup on this device. A passphrase you lose cannot
          be recovered.
        </p>
        <button
          disabled={!passphrase || state.phase === "working"}
          onClick={backUp}
          type="button"
        >
          Back up my Playbooks
        </button>
        <label className="backup-field">
          <span>Restore a backup</span>
          <input
            accept="application/json"
            aria-label="Backup file"
            disabled={!passphrase || state.phase === "working"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) restore(file);
            }}
            type="file"
          />
        </label>
        {state.phase === "done" || state.phase === "error" ? (
          <p className={`backup-status ${state.phase}`} role="status">
            {state.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DeviceNotices({
  onDismissRecovery,
  onReleaseStorage,
  recovery,
  storage,
}: {
  onDismissRecovery: () => void;
  onReleaseStorage: () => void;
  recovery: ChalkRuntime["recovery"] | undefined;
  storage: ChalkRuntime["storage"];
}) {
  const storageMessage = storageMessages[storage.pressure];
  if (!recovery?.interrupted && !storageMessage) return null;

  return (
    <div className="device-notices">
      {recovery?.interrupted ? (
        <div className="notice recovery" role="status">
          <span>
            Chalk closed unexpectedly
            {recovery.previousStartedAtMs === undefined
              ? ""
              : ` on ${new Date(recovery.previousStartedAtMs).toLocaleDateString()}`}
            . Every edit saved on this device is here.
          </span>
          <button onClick={onDismissRecovery} type="button">
            Dismiss
          </button>
        </div>
      ) : null}
      {storageMessage ? (
        <div
          className="notice storage"
          data-storage={storage.pressure}
          role="status"
        >
          <span>{storageMessage}</span>
          <button onClick={onReleaseStorage} type="button">
            Free space
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Header({
  actions,
  activeView,
  commitPlayName,
  focused,
  onCloseMenu,
  onCreateVersion,
  onMenu,
  onRedo,
  onRestoreVersion,
  onUndo,
  onView,
  openMenu,
  playName,
  resetPlayName,
  runtime,
  setPlayName,
  undo,
  versions,
  zonesHidden,
}: {
  actions: ActionMap;
  activeView: View;
  commitPlayName: () => void;
  focused: boolean;
  onCloseMenu: () => void;
  onCreateVersion: (label: string) => void;
  onMenu: (menu: "more" | "export" | "save") => void;
  onRedo: () => void;
  onRestoreVersion: (revisionId: string) => void;
  onUndo: () => void;
  onView: (view: View) => void;
  openMenu: Menu;
  playName: string;
  resetPlayName: () => void;
  runtime: ChalkRuntime;
  setPlayName: (name: string) => void;
  undo: EditorUndoState;
  versions: readonly EditorVersionSummary[];
  zonesHidden: boolean;
}) {
  return (
    <header className="topbar">
      <div className="chalk-mark" aria-hidden="true">
        <i />
      </div>
      <strong className="brand">{PRODUCT_NAME}</strong>
      <nav className="view-tabs" aria-label="Workspace views">
        {views.map((view) => (
          <button
            className={activeView === view ? "active" : ""}
            key={view}
            onClick={() => onView(view)}
          >
            {view}
          </button>
        ))}
      </nav>
      <span className="slash">/</span>
      <input
        aria-label="Play name"
        className="play-name"
        onBlur={commitPlayName}
        onChange={(event) => setPlayName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            resetPlayName();
            event.currentTarget.blur();
          }
        }}
        spellCheck={false}
        value={playName}
      />
      <label className="play-type">
        <i />
        <select aria-label="Play type" defaultValue="Pass">
          <option>Pass</option>
          <option>Run</option>
          <option>RPO</option>
          <option>Screen</option>
          <option>Defense</option>
          <option>Special</option>
        </select>
      </label>
      <span className="top-spacer" />
      <button
        className="quiet"
        disabled={!undo.canUndo}
        onClick={onUndo}
        title={undo.undoLabel ? `Undo ${undo.undoLabel}` : "Nothing to undo"}
      >
        Undo
      </button>
      <button
        className="quiet"
        disabled={!undo.canRedo}
        onClick={onRedo}
        title={undo.redoLabel ? `Redo ${undo.redoLabel}` : "Nothing to redo"}
      >
        Redo
      </button>
      <span className="divider" />
      <MoreMenu
        actions={actions}
        focused={focused}
        onDismiss={onCloseMenu}
        onToggle={() => onMenu("more")}
        open={openMenu === "more"}
        zonesHidden={zonesHidden}
      >
        <BackupPanel runtime={runtime} />
      </MoreMenu>
      <ExportMenu
        actions={actions}
        onDismiss={onCloseMenu}
        onToggle={() => onMenu("export")}
        open={openMenu === "export"}
        playName={playName}
      />
      <SaveMenu
        actions={actions}
        onDismiss={onCloseMenu}
        onSnapshot={onCreateVersion}
        onToggle={() => onMenu("save")}
        open={openMenu === "save"}
        saveLabel="Save"
      >
        {versions.length > 0 ? (
          <ul className="snapshot-list">
            {versions.map((version) => (
              <li key={version.id}>
                <span>{version.label ?? "Unnamed version"}</span>
                <button
                  onClick={() => onRestoreVersion(version.id)}
                  type="button"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </SaveMenu>
    </header>
  );
}
