import {
  assignmentForPath,
  ballPosition,
  ballSpotNames,
  currentBallSpot,
  createStableId,
  currentDefensiveCall,
  currentFormation,
  deletePathsCommand,
  DEFAULT_ZONE_COVERAGE_RADII,
  DEMO_HEADER_TITLE,
  demoCursor,
  demoHandoffPlay,
  demoItemOpacity,
  demoPanelRowOn,
  demoPlayLabel,
  demoPulses,
  demoToolIds,
  demoToolShortcuts,
  demoTour,
  demoTours,
  gotoDemoStep,
  startDemo,
  tickDemo,
  toggleDemoPlay,
  type DemoPlayback,
  type DemoTour,
  defensiveLineKinds,
  defensiveRouteKinds,
  evaluatePlayAt,
  formatPlaybackClock,
  isLineman,
  labelRolePresets,
  planPlay,
  playbackShowsAnimation,
  resolvePathTiming,
  offensiveRouteKinds,
  labelSizeChoices,
  playErasureCommand,
  playErasures,
  legacyCanvasToYards,
  PRODUCT_NAME,
  blockPresets,
  defensivePresets,
  lineCallKeys,
  linePresetByKey,
  routePresetNames,
  stockConcepts,
  formationFromOffense,
  stockDefensiveCalls,
  stockFormations,
  baseAlignment,
  addCoachPlayType,
  formatClassification,
  type Concept,
  type LabelRole,
  type DefensiveCall,
  type FieldProfile,
  type Formation,
  type MovementPath,
  type Player,
  type BallSpot,
  type AlignmentResetTarget,
  type PlayCommand,
  type PlayDocument,
  type PlayerSideOfBall,
  type PlayUnit,
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
  isAtFit,
  panCamera,
  zoomCamera,
  type Camera,
  addRouteChoiceCommand,
  applyConceptCommand,
  applyDefensiveCallCommand,
  applyFormationCommand,
  resetAlignmentCommand,
  applyLabelRoleCommand,
  applyPlayerRoutePresetCommand,
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
  affectedLiveEntities,
  createLiveSnapshotStore,
  createPaintLoop,
  idleFieldInteraction,
  liveHandlePath,
  livePaintCanHold,
  setLabelAppearanceCommand,
  ROUTE_COACHING_LIMITS,
  setLabelTextCommand,
  setRouteAssignmentCommand,
  setRouteCoachingTextCommand,
  clampPlaybackTime,
  idlePlayback,
  pausePlayback,
  resetPlayback,
  seekPlayback,
  setPlaybackRate,
  tickPlayback,
  togglePlayback,
  setRouteKindCommand,
  setRouteReadCommand,
  setRouteStyleCommand,
  setRouteTimingCommand,
  type PlaybackClock,
  type PlaybackRate,
  type RouteTimingField,
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
  type FieldDrawingKind,
  type FieldDrawingMode,
  type FieldDrawingState,
  type FieldGesture,
  lineOf,
  type FieldHandleRef,
  type FieldPointerInput,
  type FieldInteractionContext,
  type FieldInteractionEvent,
  type FieldInteractionModel,
  type FieldItemRef,
  type PaintLoopSample,
  type LabelAppearance,
  type PlayerAppearance,
} from "@chalk/editor";
import {
  buildPathStrokes,
  buildRenderScene,
  buildSvgRenderScene,
  createSvgProjection,
  projectTranslation,
  editorSvgViewport,
  projectCoordinate,
  unprojectPoint,
  type RenderScene,
  type SvgPoint,
  type SvgProjection,
  type SvgRenderScene,
  defaultPresentation,
  fieldLayerCatalog,
  shadowShown,
  resolveTypeDensity,
  typePresetCatalog,
  type FieldLayerId,
  type Presentation,
} from "@chalk/render";
import type { IdentityPort, SyncOrchestrator, SyncSnapshot } from "@chalk/sync";
import { UnavailableIdentity } from "@chalk/sync";
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from "react";

import type { AppLifecycle } from "../app/app-lifecycle";
import {
  defaultChromeState,
  type ChalkRuntime,
  type ChromeState,
} from "../app/editor-runtime";
import {
  FieldProfileSection,
  NewProfileForm,
} from "../library/field-profile-section";
import { LibraryPanel } from "../library/library-panel";
import { ScopeBar } from "../library/scope-bar";
import { PlaybookBrowser } from "../library/playbook-browser";
import { GamePlansWorkspace } from "../library/game-plans-workspace";
import { GameDayView } from "../library/game-day-view";
import { defaultOutputSpec, type OutputSpec } from "../output/output-spec";
import { OutputWorkspace } from "../output/output-workspace";
import { usePlaybookLibrary } from "../library/use-playbook-library";
import { AccountPanel } from "./account-panel";
import { LifecycleIndicator, LifecycleNotices } from "./lifecycle-notices";
import { syncStatusLabel } from "./sync-status";
import { ConflictInboxHost } from "./conflict-inbox";
import {
  callSheetHtml,
  exportFileName,
  installPageHtml,
  libraryOrder,
  playbookHtml,
  positionGroup,
  positionViewHtml,
  practiceCardPlays,
  practiceCardsHtml,
  quizHtml,
  scoutCardPlays,
  scoutCardsHtml,
  slideHtml,
  rememberPreset,
  standaloneSvg,
  wristbandHtml,
  type OutputPreset,
  type PositionGroupId,
} from "@chalk/exports";

import {
  paletteCommands,
  type ActionMap,
  type MenuEntry,
} from "./editor-command-surface";
import {
  CommandPalette,
  ContextMenu,
  DefenseBrowser,
  ExportMenu,
  FormationBrowser,
  HelpMenu,
  MoreMenu,
  NewPlayMenu,
  SaveMenu,
  ShortcutReference,
  type WristbandPicker,
} from "./editor-overlays";
import {
  Disclosure,
  type FieldLayerToggle,
  Hint,
  LayersPopover,
  LayerToggles,
  PresetPicker,
} from "./inspector-sections";
import type { PresetChoice } from "./preset-choices";
import { editorStatusHint } from "./editor-status-hint";
import {
  drawChoicesFor,
  drawKindForKey,
  tools,
  type ToolId,
} from "./tool-labels";
import { FieldMinimap } from "./field-minimap";
import { applyLiveFieldPaint, type LiveFieldPaint } from "./live-field-paint";
import { FieldDiagram } from "./field-diagram";
import { SELECTION_BLUE, sceneColors, selectionKey } from "./field-marks";
import { PlaybackBar } from "./playback-bar";
import { SettingsOverlay } from "./settings-overlay";
import {
  PlayClassificationControl,
  type AddPlayTypeOutcome,
} from "./play-classification-control";
import { PlaySharePanel } from "./play-share-panel";
import { readPlaybackNow } from "./playback-now";
import { createDiagramRenderer } from "./export-diagram";
import { downloadBlob, downloadText, pngFromSvg } from "./export-files";
import { openPrintField, svgMarkupForPrint } from "./print-field";
import { openPrintWindow } from "./print-window";
import {
  downloadFrameSequence,
  openProgressionStrip,
} from "./print-progression";
import { RailIcon } from "./rail-icons";
import { renderToStaticMarkup } from "react-dom/server";

export { FieldDiagram };

/**
 * Where the Coach can be. Editor, Playbooks and Game Day are the three
 * destinations in the header (issue #65); Demo lives under Help, Present is
 * an action, and Print is the preview behind Print & export.
 */
type View = "Editor" | "Playbooks" | "GameDay" | "Demo" | "Present" | "Print";
type Menu =
  | "more"
  | "export"
  | "save"
  | "help"
  | "classify"
  | "layers"
  | "new"
  /** The Playbooks page's own New play, apart from the header's. */
  | "newPage"
  | null;
type Overlay =
  | "palette"
  | "shortcuts"
  | "formations"
  | "defenses"
  | "playbook"
  | "game-plans"
  | "presets"
  | "conflicts"
  | "settings"
  | null;
type Tool = ToolId;

/** The three destinations in the header (issue #65). */
const destinations: readonly { readonly view: View; readonly label: string }[] =
  [
    { view: "Editor", label: "Editor" },
    { view: "Playbooks", label: "Playbooks" },
    { view: "GameDay", label: "Game Day" },
  ];

/** The original's own wait before a held press becomes a menu. */
const LONG_PRESS_MS = 480;
/**
 * How far a finger may wander between landing on the grass and lifting and
 * still have tapped it. A fingertip is not a mouse: it rolls a few pixels on
 * the way down and on the way up, and the machine's own two-pixel move
 * threshold, which suits a Pencil, would turn most taps into the smallest
 * possible pan and leave the selection standing.
 */
const FINGER_TAP_SLOP_PX = 10;
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

/** What the line in hand is called, so Done and Cancel say what they end. */
function drawingNoun(kind: FieldDrawingKind, capital = false): string {
  const noun = {
    route: "route",
    motion: "motion",
    block: "block",
    zone: "zone drop",
    blitz: "blitz path",
  }[kind];
  return capital ? noun.charAt(0).toUpperCase() + noun.slice(1) : noun;
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

/**
 * The handles on the one selected route: a circle on every break, an unseen
 * target in the middle of every segment to bend it, and the zone corner. Their
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
        // The segment square is not drawn for now; its target stays, so a
        // segment still bends from its middle.
        return (
          <g key={`control-${index}`}>
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
    // A stroke being traced is drawn as ink under the pointer, with no aim
    // line running ahead of it and no dot at each of its many samples.
    const tracing = drawing.mode === "free" && drawing.pointerDown;
    return (
      <g className="drawing-overlay" pointerEvents="none">
        <path
          d={
            tracing
              ? commands.join(" ")
              : `${commands.join(" ")} L ${cursor.x} ${cursor.y}`
          }
          data-drawing-mode={drawing.mode}
          data-drawing-preview
          fill="none"
          stroke={SELECTION_BLUE}
          strokeDasharray={tracing ? undefined : "6 5"}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
        />
        {drawn.map((point, index) =>
          drawing.points[index]?.traced ? null : (
            <circle
              cx={point.x}
              cy={point.y}
              fill={SELECTION_BLUE}
              key={`draw-point-${index}`}
              r={3}
            />
          ),
        )}
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

/**
 * Overlay that re-renders from the live interaction snapshot, not from the
 * shell. A drag can therefore update guides, the marquee, and handles on
 * animation frames without rebuilding the committed FieldDiagram.
 */
function FieldLiveOverlay({
  document,
  formations,
  getZoom,
  onHandleDown,
  precise,
  previewFormationId,
  projection,
  store,
}: {
  document: PlayDocument;
  formations: readonly Formation[];
  getZoom: () => number;
  onHandleDown: (handle: FieldHandleRef, event: React.PointerEvent) => void;
  precise: boolean;
  previewFormationId?: string;
  projection: SvgProjection;
  store: {
    readonly subscribe: (listener: () => void) => () => void;
    readonly getSnapshot: () => FieldInteractionModel;
  };
}) {
  const model = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const zoom = getZoom();
  const selectedPathId =
    model.selection.length === 1 && model.selection[0]?.kind === "path"
      ? model.selection[0].id
      : undefined;
  const selectedPath =
    liveHandlePath(model.gesture) ??
    (selectedPathId
      ? document.paths.find(({ id }) => id === selectedPathId)
      : undefined);
  const selectedLabel =
    model.selection.length === 1 && model.selection[0]?.kind === "label"
      ? document.labels.find(({ id }) => id === model.selection[0]!.id)
      : undefined;
  const leader = selectedLabel?.leader
    ? projectCoordinate(selectedLabel.leader.endpoint, projection)
    : undefined;
  const handleShift = ((): string | undefined => {
    if (model.gesture.kind !== "moving" || !selectedPath) return undefined;
    if (
      !affectedLiveEntities(document, model.gesture.items).pathIds.includes(
        selectedPath.id,
      )
    ) {
      return undefined;
    }
    const delta = projectTranslation(model.gesture.translation, projection);
    return `translate(${delta.x} ${delta.y})`;
  })();

  return (
    <>
      <FieldInteractionOverlay
        drawing={model.drawing}
        gesture={model.gesture}
        projection={projection}
      />
      {selectedPath ? (
        <g transform={handleShift}>
          <RouteHandles
            branchIndex={model.selectedBranchIndex}
            onHandleDown={onHandleDown}
            path={selectedPath}
            precise={precise}
            projection={projection}
            selectedNodeIndex={model.selectedNodeIndex}
            selectedSegmentIndex={model.selectedSegmentIndex}
            zoom={zoom}
          />
        </g>
      ) : null}
      <FormationGhost
        formationId={previewFormationId}
        formations={formations}
        projection={projection}
      />
      {leader && selectedLabel ? (
        <circle
          className="handle-target"
          cx={leader.x}
          cy={leader.y}
          data-leader-handle={selectedLabel.id}
          fill="transparent"
          onPointerDown={(event) =>
            onHandleDown({ kind: "leader", labelId: selectedLabel.id }, event)
          }
          r={22}
        >
          <title>Drag to point the leader line</title>
        </circle>
      ) : null}
    </>
  );
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
 * The catalogues the Player panel offers a man, reduced to what a button needs
 * to say and named once at the module rather than rebuilt each render. The
 * route tree already arrives in that shape, so it is used as it comes.
 */
const quickBlockCalls: readonly {
  readonly key: string;
  readonly name: string;
}[] = blockPresets.map(({ key, name }) => ({ key, name }));
const quickAssignmentCalls: readonly {
  readonly key: string;
  readonly name: string;
}[] = defensivePresets.map(({ key, name }) => ({ key, name }));

/**
 * A catalogue as a grid of buttons, which is how the original offers one: the
 * Coach has already picked the man out, so the calls he could be given are
 * right there rather than behind a picker on a line he has not got yet.
 */
function QuickCallGrid({
  calls,
  heading,
  hint,
  kind,
  onApply,
  running,
}: {
  calls: readonly { readonly key: string; readonly name: string }[];
  heading: string;
  hint?: string;
  /** A route reshapes his stem; everything else is a whole call he is given. */
  kind: "route" | "line";
  onApply: (presetKey: string, kind: "route" | "line") => void;
  /** The calls he is already running. */
  running: ReadonlySet<string>;
}) {
  return (
    <>
      <span className="section-heading">{heading}</span>
      <div className="button-grid pairs">
        {calls.map(({ key, name }) => (
          <button
            aria-pressed={running.has(key)}
            className={running.has(key) ? "active" : undefined}
            key={key}
            onClick={() => onApply(key, kind)}
            title={
              kind === "route"
                ? `Run ${name} — drawn from his own stance`
                : running.has(key)
                  ? `Click again to take ${name} off him`
                  : `Give him ${name}`
            }
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
      {hint === undefined ? null : <p>{hint}</p>}
    </>
  );
}

/**
 * The phone's quick tray: a row above the tools that offers what the Coach
 * could give the thing he has picked out, so a route is one tap on the glass
 * rather than a trip into the inspector sheet. It follows the editor — a man
 * gets the calls his kind can run, a line gets the calls it can be redrawn
 * as — and it is not there at all when nothing is picked, so the field keeps
 * the glass.
 */
function QuickTray({
  calls,
  heading,
  onApply,
  running,
  title,
}: {
  calls: readonly { readonly key: string; readonly name: string }[];
  /** What the row offers, said short: Routes, Blocks, Assignments. */
  heading: string;
  onApply: (presetKey: string) => void;
  /** The calls already on him, or the one this line was drawn as. */
  running: ReadonlySet<string>;
  /** Whom or what the row is for, said the way the Coach would. */
  title: string;
}) {
  return (
    <nav aria-label="Quick calls" className="quick-tray">
      <span className="quick-tray-heading" title={title}>
        {heading}
      </span>
      {calls.map(({ key, name }) => (
        <button
          aria-pressed={running.has(key)}
          key={key}
          onClick={() => onApply(key)}
          title={`${name} — ${title}`}
          type="button"
        >
          {name}
        </button>
      ))}
    </nav>
  );
}

/**
 * The original's Player panel: the man himself, then every line he has and the
 * button that gives him another one. Which of those it offers follows what he
 * is — a lineman blocks and has no route to run, a defender is given a call.
 * Coaching comes first — his lines, the calls he could be given — and how he
 * is drawn folds away under Appearance (issue #64).
 */
function PlayerInspector({
  activePresets,
  freeDraw,
  scopeBadge,
  lines,
  onAddAlternate,
  onApplyPreset,
  onAppearance,
  onDeselect,
  onDraw,
  onFlip,
  onFreeDraw,
  onQuickCall,
  onRemoveLine,
  onSelectLine,
  onText,
  onTextCommitted,
  onToggle,
  open,
  player,
  text,
}: {
  /** Every call he is already running, so a button can say so. */
  activePresets: ReadonlySet<string>;
  /** Start a line of this kind by hand from his stance (ADR 0052). */
  onDraw: (kind: FieldDrawingKind) => void;
  /** Whether a line by hand is traced under the pointer or clicked in breaks. */
  freeDraw: boolean;
  onFreeDraw: (enabled: boolean) => void;
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
  onQuickCall: (presetKey: string, kind: "route" | "line") => void;
  onRemoveLine: (pathId: string) => void;
  onSelectLine: (pathId: string) => void;
  onText: (field: "label" | "sublabel", value: string) => void;
  onTextCommitted: (field: "label" | "sublabel") => void;
  onToggle: (id: string) => void;
  open: Readonly<Record<string, boolean>>;
  player: Player;
  text: Readonly<Record<"label" | "sublabel", string>>;
  scopeBadge?: string;
}) {
  const lineman = isLineman(player);
  const defense = player.unit === "defense";
  const heading = defense
    ? "Assignments"
    : lineman
      ? "Blocking"
      : "Routes & alternates";
  const nothingYet = defense
    ? "No assignment yet. Pick one below, or draw his zone drop or blitz path from here."
    : lineman
      ? "No block yet. Pick one below, or draw one from here."
      : "No route yet. Pick one below, or draw one from here.";
  const drawChoices = drawChoicesFor(player);
  const symbolName =
    playerSymbolChoices.find(({ symbol }) => symbol === player.symbol)?.name ??
    player.symbol;
  const fillName =
    playerFillChoices.find(({ fill }) => fill === player.fill)?.name ??
    player.fill;

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
        {scopeBadge ? <span className="scope-tag">{scopeBadge}</span> : null}
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
      <div className="draw-row" role="group" aria-label="Draw by hand">
        <span className="section-heading">Draw</span>
        {drawChoices.map((choice) => (
          <button
            key={choice.kind}
            onClick={() => onDraw(choice.kind)}
            title={`Draw his ${choice.label.toLowerCase()} from his stance — ${choice.shortcut}, then ${
              freeDraw
                ? "draw it on the field with the pointer held down; lifting finishes"
                : "click the field for each break; Done or Enter finishes"
            }`}
            type="button"
          >
            {choice.label}
            <kbd aria-hidden="true">{choice.shortcut}</kbd>
          </button>
        ))}
        <button
          // A switch, not another line: on, every line by hand — these
          // buttons, the keys and the blue dot — is traced under the pointer
          // and finished the moment it lifts; off, each click is a break.
          aria-checked={freeDraw}
          className="draw-mode"
          onClick={() => onFreeDraw(!freeDraw)}
          role="switch"
          title={
            freeDraw
              ? "Free draw is on: trace his line with the pointer held down; lifting finishes it. Switch off to click each break"
              : "Free draw is off: click each break. Switch on to trace his line with the pointer held down"
          }
          type="button"
        >
          Free draw
        </button>
      </div>
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
        <QuickCallGrid
          calls={routePresetNames}
          heading="Quick routes"
          kind="route"
          onApply={onQuickCall}
          running={activePresets}
        />
      )}
      {!defense && (
        <QuickCallGrid
          calls={quickBlockCalls}
          heading="Quick blocks"
          hint={
            lineman
              ? "Bar endings for contact, dashed for a pull, a tick where he chips before releasing. Click the one he has to take it off."
              : "Backs and tight ends block too — a block sits alongside his route rather than replacing it."
          }
          kind="line"
          onApply={onQuickCall}
          running={activePresets}
        />
      )}
      {defense && (
        <QuickCallGrid
          calls={quickAssignmentCalls}
          heading="Quick assignments"
          hint="Coverage drops draw dashed to a zone bubble, man dotted, blitz solid red, stunt orange. Each one replaces what he was doing and names it under the line."
          kind="line"
          onApply={onQuickCall}
          running={activePresets}
        />
      )}
      {!defense && !lineman && (
        <div className="help-row">
          <button onClick={onAddAlternate} type="button">
            + Alternate route — new stem from stance
          </button>
          <Hint about="alternates and choices">
            An <strong>alternate</strong> starts over at his stance: a different
            call he could be asked to run, drawn dotted. A{" "}
            <strong>choice</strong> stays inside one stem — he runs it, then
            reads and forks. Select a line to add one.
          </Hint>
        </div>
      )}
      {lineman && (
        <p>
          One block per lineman. Select the line and drag its break to set where
          contact happens.
        </p>
      )}
      <Disclosure
        id="player-appearance"
        onToggle={onToggle}
        open={open["player-appearance"] ?? false}
        summary={`${symbolName} · ${fillName} · ${player.color}`}
        title="Appearance"
      >
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
      </Disclosure>
    </div>
  );
}

/**
 * The original's Route panel. What it changes follows what the Coach has
 * picked out: a segment takes the line style on its own, a branch takes it
 * for that line, and otherwise the whole route does. The coaching — read,
 * assignment, conversion, note — comes first; how the line is drawn and when
 * it runs fold away under Appearance and Advanced (issue #64).
 */
function RouteInspector({
  branchIndex,
  coaching,
  scopeBadge,
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
  onTiming,
  onTimingCommitted,
  onToggle,
  open,
  path,
  segmentIndex,
  timing,
  unit,
}: {
  branchIndex?: number;
  coaching: Readonly<Record<RouteCoachingField, string>>;
  scopeBadge?: string;
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
  onTiming: (field: RouteTimingField, value: string) => void;
  onTimingCommitted: (field: RouteTimingField) => void;
  onToggle: (id: string) => void;
  open: Readonly<Record<string, boolean>>;
  path: MovementPath;
  segmentIndex?: number;
  timing: Readonly<Record<RouteTimingField, string>>;
  /** The unit of the man running the line — a shadow defender's drop is still a drop. */
  unit: PlayUnit;
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
  const lineName =
    lineStyleChoices.find((choice) => choice.line === shownLine)?.name ??
    shownLine;
  const endingName =
    endingChoices.find((choice) => choice.ending === shownEnding)?.name ??
    shownEnding;
  const timed =
    timing.delay !== "" || timing.hold !== "" || timing.speed !== "";

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
        {scopeBadge ? <span className="scope-tag">{scopeBadge}</span> : null}
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
      <span className="section-heading">
        Coaching
        <Hint about="coaching">
          Read number and assignment print on the field. Conversion and note
          ride along with the route — they follow it through mirror, duplicate
          and save.
        </Hint>
      </span>
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
      <div className="help-row">
        <button onClick={onAddChoice} type="button">
          + Choice at {nodeName}
        </button>
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
        <Hint about="choices">
          A <strong>choice</strong> forks this same stem at the break you picked
          — one release, then he reads. For a whole second line off his stance,
          use <strong>alternate route</strong> in the player panel.
        </Hint>
      </div>
      {branchIndex === undefined ? undefined : (
        <div className="help-row">
          <button className="danger" onClick={onRemoveChoice} type="button">
            Remove this choice
          </button>
        </div>
      )}
      <Disclosure
        id="route-appearance"
        onToggle={onToggle}
        open={open["route-appearance"] ?? false}
        summary={`${lineName} · ${endingName} · ${style.color}`}
        title="Appearance"
      >
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
      </Disclosure>
      <Disclosure
        id="route-advanced"
        onToggle={onToggle}
        open={open["route-advanced"] ?? false}
        summary={timed ? "Timing set" : "Timing · delete"}
        title="Advanced"
      >
        <span className="section-heading">Timing</span>
        <div className="timing-row">
          <label className="read-field">
            <span>Delay</span>
            <input
              aria-label="Delay"
              inputMode="decimal"
              onBlur={() => onTimingCommitted("delay")}
              onChange={(event) => onTiming("delay", event.target.value)}
              spellCheck={false}
              value={timing.delay}
            />
          </label>
          <label className="read-field">
            <span>Speed</span>
            <input
              aria-label="Speed"
              inputMode="decimal"
              onBlur={() => onTimingCommitted("speed")}
              onChange={(event) => onTiming("speed", event.target.value)}
              spellCheck={false}
              value={timing.speed}
            />
          </label>
          <label className="read-field">
            <span>Hold</span>
            <input
              aria-label="Hold"
              inputMode="decimal"
              onBlur={() => onTimingCommitted("hold")}
              onChange={(event) => onTiming("hold", event.target.value)}
              spellCheck={false}
              value={timing.hold}
            />
          </label>
        </div>
        <p>
          Delay is beats after the snap. Hold is how long he sits down at the
          end.
        </p>
        <div className="help-row">
          <button className="danger" onClick={onDelete} type="button">
            Delete this route
          </button>
        </div>
      </Disclosure>
    </div>
  );
}

/** What one Reset button would put a side of the ball back in. */
interface AlignmentResetOption {
  readonly name: string;
  /** Whether pressing it would move anyone. */
  readonly available: boolean;
}

/**
 * The resets a side of the ball offers: back to the set or call the Play
 * remembers for it, if there is one, and to the base alignment.
 */
interface SideResets {
  readonly chosen?: AlignmentResetOption;
  readonly base: AlignmentResetOption;
}

/**
 * Putting one side back, under its picker. The row appears once the Play
 * remembers a set or call for that side and stays, so the inspector does not
 * jump the moment a man is dragged; each button is grey when it would move
 * nobody. A Play drawn by hand reaches base from the palette, which is also
 * what keeps the untouched starter Play's inspector as the original drew it.
 */
function ResetRow({
  onReset,
  resets,
  side,
}: {
  onReset: (side: PlayerSideOfBall, target: AlignmentResetTarget) => void;
  resets: SideResets;
  side: PlayerSideOfBall;
}) {
  const { base, chosen } = resets;
  if (!chosen) return null;
  const lines = side === "defense" ? "drops" : "routes";
  return (
    <div className="segment-row reset-row">
      <span>Reset to</span>
      <div className="segments">
        <button
          aria-label={`Reset ${side} to ${chosen.name}`}
          disabled={!chosen.available}
          onClick={() => onReset(side, "chosen")}
          title={
            chosen.available
              ? `Put the ${side} back in ${chosen.name} — each man keeps his ${lines}`
              : `Every man already stands where ${chosen.name} puts him`
          }
          type="button"
        >
          {chosen.name}
        </button>
        <button
          aria-label={`Reset ${side} to base — ${base.name}`}
          disabled={!base.available}
          onClick={() => onReset(side, "base")}
          title={
            base.available
              ? `Put the ${side} in the base ${side === "defense" ? "call" : "formation"}, ${base.name} — each man keeps his ${lines}`
              : `Every man already stands where ${base.name} puts him`
          }
          type="button"
        >
          Base
        </button>
      </div>
    </div>
  );
}

function Inspector({
  ballSpots,
  call,
  scopeBadge,
  currentConcept,
  currentLineCall,
  defenderCount,
  layers,
  layersPopover,
  library,
  librarySummary,
  linemanCount,
  onCollapse,
  onOpenPresets,
  onSpotBall,
  onToggle,
  onToggleLayer,
  open,
  formation,
  formationHint,
  labelEditor,
  onOpenDefenses,
  onOpenFormations,
  onOpenPalette,
  onOpenShortcuts,
  sheet = false,
  shadowOn,
  onToggleShadow,
  resets,
  onReset,
  unit,
}: {
  ballSpots: readonly {
    readonly spot: BallSpot;
    readonly name: string;
    readonly title: string;
    readonly on: boolean;
    readonly available: boolean;
  }[];
  call?: DefensiveCall;
  scopeBadge?: string;
  /** The concept drawn on the field now, if one is. */
  currentConcept?: string;
  currentLineCall?: string;
  defenderCount: number;
  /** The field layers, for the sheet's own "Show on the field" fold. */
  layers: readonly FieldLayerToggle[];
  layersPopover?: React.ReactNode;
  library?: React.ReactNode;
  /** One line about the open Play's family, for the folded Library heading. */
  librarySummary: string;
  onCollapse: () => void;
  onOpenPresets: (group: "concept" | "line") => void;
  onSpotBall: (spot: BallSpot) => void;
  onToggle: (id: string) => void;
  onToggleLayer: (id: string) => void;
  /** Which folded sections the Coach has opened, remembered per device. */
  open: Readonly<Record<string, boolean>>;
  linemanCount: number;
  formation?: Formation;
  formationHint: string;
  labelEditor?: React.ReactNode;
  onOpenDefenses: () => void;
  onOpenFormations: () => void;
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
  /**
   * A sheet over a phone's field (issue #92): the bar is the sheet's handle,
   * and a tap anywhere along it puts the sheet away. The layer switches then
   * fold into the sheet itself, since the bar no longer holds them.
   */
  sheet?: boolean;
  unit: PlayDocument["unit"];
  /** Whether the other unit's shadow is on the field (ADR 0053). */
  shadowOn: boolean;
  onToggleShadow: () => void;
  /** Putting each side of the ball back (ADR 0055). */
  resets: Readonly<Record<PlayerSideOfBall, SideResets>>;
  onReset: (side: PlayerSideOfBall, target: AlignmentResetTarget) => void;
}) {
  const defense = unit === "defense";
  const shadowName = defense ? "Shadow offense" : "Shadow defense";
  const layersShown = layers.filter(({ on }) => on).length;
  const bar = sheet ? (
    <div className="inspector-bar">
      <button
        aria-label="Hide the inspector"
        className="inspector-sheet-handle"
        onClick={onCollapse}
        title="Hide the inspector"
        type="button"
      >
        <span>Inspector</span>
        <span aria-hidden="true" className="inspector-sheet-caret">
          ›
        </span>
      </button>
    </div>
  ) : (
    <div className="inspector-bar">
      {layersPopover}
      <span className="top-spacer" />
      <button
        aria-label="Hide the inspector"
        className="inspector-bar-button inspector-collapse"
        onClick={onCollapse}
        title="Hide the inspector — ⌥1"
        type="button"
      >
        ›
      </button>
    </div>
  );
  if (labelEditor) {
    return (
      <aside className="inspector" aria-label="Play inspector">
        {bar}
        {labelEditor}
      </aside>
    );
  }
  const formationPicker = (
    <>
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
      <ResetRow onReset={onReset} resets={resets.offense} side="offense" />
      <Hint about="the formation">{formationHint}</Hint>
    </>
  );
  const defensePicker = (
    <>
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
      <ResetRow onReset={onReset} resets={resets.defense} side="defense" />
      <Hint about="defensive calls">
        Start with a call — each one replaces the last and leaves the offense
        untouched. Just the front and secondary — letter symbols only, so you
        can draw your own coverage on top. Press Z to add your own drop.
      </Hint>
    </>
  );
  const conceptRows = (
    <>
      <button
        className="wide-picker preset-summary"
        onClick={() => onOpenPresets("concept")}
        title="Concepts — draw the whole distribution by role"
        type="button"
      >
        <span>{currentConcept ?? "No concept yet"}</span>
        <span>Concept &nbsp;›</span>
      </button>
      <button
        className="wide-picker preset-summary"
        onClick={() => onOpenPresets("line")}
        title={`Line calls — give all ${linemanCount} linemen the same call`}
        type="button"
      >
        <span>{currentLineCall ?? "No line call yet"}</span>
        <span>Line call &nbsp;›</span>
      </button>
      <Hint about="concepts and line calls">
        A concept draws every route by role — X, Z, H, Y and the back each get
        their job — and replaces their routes; blocking and coverage stay. A
        line call gives all {linemanCount} linemen one call at once.
      </Hint>
    </>
  );
  const shadowLook = defense
    ? (formation?.name ?? "Custom alignment")
    : call
      ? call.formation.name
      : defenderCount > 0
        ? "Custom front"
        : "No defense yet";
  const shadowSummary = shadowOn ? shadowLook : `${shadowLook} · hidden`;
  return (
    <aside className="inspector" aria-label="Play inspector">
      {bar}
      <InspectorSection
        badge={scopeBadge}
        title={defense ? "Defensive call" : "Play setup"}
      >
        {defense ? defensePicker : formationPicker}
        {defense ? null : conceptRows}
      </InspectorSection>
      <Disclosure
        id="opponent"
        onToggle={onToggle}
        open={open.opponent ?? false}
        summary={shadowSummary}
        title={shadowName}
      >
        <div className="segment-row shadow-row">
          <span>{shadowName}</span>
          <div className="segments">
            <button
              aria-pressed={shadowOn}
              className={shadowOn ? "active" : undefined}
              onClick={() => {
                if (!shadowOn) onToggleShadow();
              }}
              title={`Draw the ${shadowName.toLowerCase()} under the play`}
              type="button"
            >
              Shown
            </button>
            <button
              aria-pressed={!shadowOn}
              className={shadowOn ? undefined : "active"}
              onClick={() => {
                if (shadowOn) onToggleShadow();
              }}
              title={`Take the ${shadowName.toLowerCase()} off the field — it stays in the play`}
              type="button"
            >
              Hidden
            </button>
          </div>
        </div>
        {defense ? formationPicker : defensePicker}
        <Hint about="the shadow">
          {defense
            ? "The offense here is a look to draw the call against, not the play. Hide it to read the call alone; it stays in the play, off the field."
            : "The defense here is a look to draw against, not the play. Hide it to read the concept alone; it stays in the play, off the field."}
        </Hint>
      </Disclosure>
      <Disclosure
        badge={scopeBadge}
        id="library"
        onToggle={onToggle}
        open={open.library ?? false}
        summary={librarySummary}
        title="Library"
      >
        {library}
      </Disclosure>
      {sheet ? (
        <Disclosure
          id="layers"
          onToggle={onToggle}
          open={open.layers ?? false}
          summary={
            layersShown < layers.length
              ? `${layersShown} of ${layers.length}`
              : "All shown"
          }
          title="Show on the field"
        >
          <LayerToggles layers={layers} onToggle={onToggleLayer} />
        </Disclosure>
      ) : null}
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
  badge,
  children,
  title,
}: {
  badge?: string;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="inspector-section">
      <div className="section-heading">
        {title}
        {badge ? <span className="scope-tag">{badge}</span> : null}
      </div>
      {children}
    </section>
  );
}

const unsignedIdentity = new UnavailableIdentity();
const localSyncSnapshot: SyncSnapshot = {
  status: "local",
  pendingCount: 0,
  conflictCount: 0,
};

export function ChalkApp({
  runtime,
  identity = unsignedIdentity,
  lifecycle,
  sync,
}: {
  runtime: ChalkRuntime;
  identity?: IdentityPort;
  /** The installed shell's offline, update, and install states. */
  lifecycle?: AppLifecycle;
  sync?: SyncOrchestrator;
}) {
  const { editorStore } = runtime;
  const identitySession = useSyncExternalStore(
    (listener) => identity.subscribe(listener),
    () => identity.getSession(),
  );
  const syncSnapshot: SyncSnapshot = useSyncExternalStore(
    sync?.subscribe ??
      ((listener: () => void) => {
        void listener;
        return () => undefined;
      }),
    sync?.getSnapshot ?? (() => localSyncSnapshot),
  );
  const [activeView, setActiveView] = useState<View>("Editor");
  const [presentation, setPresentation] =
    useState<Presentation>(defaultPresentation);
  const [demoPlayName, setDemoPlayName] = useState(
    () => demoTour("tools").playName,
  );
  /** Which tour Help opened; the Demo tabs take over from there. */
  const [demoTourId, setDemoTourId] = useState<DemoTour["id"]>("tools");
  /** Plays or Game plans inside the Playbooks destination. */
  const [playbooksTab, setPlaybooksTab] = useState<"plays" | "plans">("plays");
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [openMenu, setOpenMenu] = useState<Menu>(null);
  /**
   * The library the paper outputs read — wristband, scout cards, practice
   * cards, call sheet, playbook. Read from the repository when the Export
   * menu opens, so the action itself stays inside the click that raises the
   * print window; the open Play's current revision stands in for its stored
   * copy. Until the read lands, or where there is no library, the open Play
   * is the library.
   */
  const [library, setLibrary] = useState<{
    readonly plays: readonly PlayDocument[];
    readonly concepts: readonly Concept[];
  }>();
  /** Which library Plays the wristband prints, at most eight. */
  const [wristbandPicks, setWristbandPicks] = useState<readonly string[]>();
  const [overlay, setOverlay] = useState<Overlay>(null);
  // The original gives each panel its own toggle and calls hiding both "Focus
  // mode"; it does not carry a third piece of state for focus.
  const [railOpen, setRailOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  /**
   * How the Coach left the chrome on this device — panels, unfolded
   * inspector sections, starred and recent presets (issue #64). Loaded once;
   * every change is written back as it happens.
   */
  const [chrome, setChrome] = useState<ChromeState>(defaultChromeState);
  const chromeRef = useRef<ChromeState>(defaultChromeState);
  const chromeLoadedRef = useRef(false);
  const [presetGroup, setPresetGroup] = useState<"concept" | "line">();
  const [zonesHidden, setZonesHidden] = useState(false);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const [freedStorage, setFreedStorage] = useState<ChalkRuntime["storage"]>();
  const [snapEnabled, setSnapEnabled] = useState(true);
  // Free draw traces a line under the held pointer; off, each click is a
  // break. Remembered per device with the rest of the chrome.
  const [freeDraw, setFreeDraw] = useState(false);
  const drawingMode: FieldDrawingMode = freeDraw ? "free" : "breaks";
  const [interaction, setInteraction] = useState(idleFieldInteraction);
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string>();
  // Pointer events can outpace React's render loop; the ref is the machine's
  // authoritative model so no event ever reduces against a stale one.
  const interactionRef = useRef<FieldInteractionModel>(interaction);
  const fieldSvgRef = useRef<SVGSVGElement | null>(null);
  const livePreviewRef = useRef<LiveFieldPaint | undefined>(undefined);
  const heldLiveRef = useRef<LiveFieldPaint | undefined>(undefined);
  /**
   * A completed drag writes the Play asynchronously. Until that document
   * lands, the last live translation stays on the SVG so the man does not
   * snap back to where he started. Escape, and any idle with no command,
   * must not hold — there is no save coming to clear it.
   */
  const pendingCommitPaintRef = useRef(false);
  const publishLiveVisualsRef = useRef<
    (model: FieldInteractionModel, metrics?: PaintLoopSample) => void
  >(() => undefined);
  /**
   * Moves waiting for the next paint. A drag only needs the latest point.
   * A free stroke needs every sample: the fit runs through the hand's path,
   * and keeping only the last point in the frame straightens the bend.
   */
  const pendingPointersRef = useRef<FieldInteractionEvent[]>([]);
  const [paintLoop] = useState(() =>
    createPaintLoop({
      now: () => performance.now(),
      requestAnimationFrame: (callback) => requestAnimationFrame(callback),
      cancelAnimationFrame: (handle) => cancelAnimationFrame(handle),
    }),
  );
  const [liveStore] = useState(() =>
    createLiveSnapshotStore<FieldInteractionModel>(idleFieldInteraction),
  );
  /** What Print & export opens on, and the outputs run lately (issue #69). */
  const [outputSpec, setOutputSpec] = useState<OutputSpec>(() =>
    defaultOutputSpec(defaultPresentation),
  );
  const [outputPresets, setOutputPresets] = useState<readonly OutputPreset[]>(
    [],
  );
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
  const [timingDraft, setTimingDraft] = useState<{
    readonly pathId: string;
    readonly field: RouteTimingField;
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
  const [camera, setCameraState] = useState<Camera>(() =>
    fitCamera(EDITOR_FRAME),
  );
  const cameraRef = useRef(camera);
  const setCamera = (next: Camera | ((current: Camera) => Camera)) => {
    setCameraState((current) => {
      // React 18 Strict Mode invokes this updater twice in development with
      // the same previous state. Zoom and pan must be functions of that
      // state — reading a mutated cameraRef would apply the step twice and
      // lie about the status-bar percentage.
      const resolved = typeof next === "function" ? next(current) : next;
      cameraRef.current = resolved;
      const live = livePreviewRef.current;
      if (live) {
        // A committed camera is React's viewBox. Drop any live camera stamp
        // so FieldDiagram cannot write the previous frame back over a wheel
        // or keyboard zoom after it reapplies live paint.
        livePreviewRef.current = {
          ...(live.move === undefined ? {} : { move: live.move }),
          ...(live.pathStrokes === undefined
            ? {}
            : { pathStrokes: live.pathStrokes }),
          ...(live.metrics === undefined ? {} : { metrics: live.metrics }),
        };
      }
      return resolved;
    });
  };
  /** How wide the field is really drawn, watched so a resize is felt. */
  const [fieldWidthPx, setFieldWidthPx] = useState(EDITOR_FRAME.width);
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
  /**
   * Where a pan gesture last was, in client pixels — and, when one finger on
   * open grass started it, where it landed and the press it stands in for,
   * so a finger that lifts without travelling is still the tap it was.
   */
  const panRef = useRef<{
    x: number;
    y: number;
    tap?: {
      readonly x: number;
      readonly y: number;
      readonly input: FieldPointerInput;
    };
  }>(undefined);
  /**
   * Which pointer the Coach has in his hand. An iPad calls itself coarse
   * whichever one it is, so the field watches what actually touches it
   * (ADR 0016).
   */
  const stylusRef = useRef<StylusState>(idleStylus);
  const [precisePointer, setPrecisePointer] = useState(() => !deviceIsCoarse());
  /**
   * A screen below the editor's floor opens straight into the editor laid
   * out for a phone (issue #92) — a two-row header, the tools in a tray
   * along the bottom, the inspector as a sheet over the field. There is no
   * read-only stop on the way in: a Coach who comes back to Chalk after
   * switching apps picks up where he left off.
   */
  const [phoneWorkspace, setPhoneWorkspace] = useState(false);
  /**
   * Below the docked inspector's floor the inspector is a drawer over the
   * field (issue #68). Watched, because a tablet turns over.
   */
  const compactRef = useRef(false);
  const [compact, setCompact] = useState(false);
  /**
   * The inspector stands over the field rather than beside it: a drawer on
   * a tablet, a sheet on a phone. Either goes away when the Coach is done
   * with it — a tap past it, or the pick he opened it for.
   */
  const inspectorFloats = compact || phoneWorkspace;
  /** Whether space is down, which turns any drag into a pan. */
  const spaceHeldRef = useRef(false);
  /** A space-drag consumed the key, so keyup must not also play. */
  const spacePannedRef = useRef(false);
  const timelineRef = useRef<HTMLDivElement>(null);
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
  const playbook = usePlaybookLibrary(runtime, editorStore);
  const animationPlan = useMemo(
    () => planPlay(editor.document),
    [editor.document],
  );
  const [playback, setPlayback] = useState<PlaybackClock>(() =>
    idlePlayback(animationPlan.startMs),
  );
  const playbackRef = useRef(playback);
  const [sceneAnchorMs, setSceneAnchorMs] = useState<number | null>(null);
  const reducedMotion =
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  // The committed Play is what React draws. Mid-drag the live paint loop
  // patches only the SVG that moved, so a pointermove never clones the
  // document or rebuilds the field (ADR 0002).
  useLayoutEffect(() => {
    pendingCommitPaintRef.current = false;
    heldLiveRef.current = undefined;
    const live = livePreviewRef.current;
    livePreviewRef.current = live
      ? {
          ...(live.metrics === undefined ? {} : { metrics: live.metrics }),
          ...(panRef.current !== undefined || pinchRef.current !== undefined
            ? { camera: cameraRef.current }
            : {}),
        }
      : undefined;
    if (fieldSvgRef.current) {
      applyLiveFieldPaint(fieldSvgRef.current, livePreviewRef.current);
    }
  }, [editor.document]);
  const playbackTimeMs = clampPlaybackTime(playback.timeMs, {
    startMs: animationPlan.startMs,
    endMs: animationPlan.endMs,
  });
  const visibleClock: PlaybackClock =
    playbackTimeMs === playback.timeMs
      ? playback
      : { ...playback, timeMs: playbackTimeMs };
  const showAnimation = playbackShowsAnimation(
    visibleClock.timeMs,
    animationPlan.startMs,
    playback.playing,
  );
  const sceneTimeMs = playback.playing
    ? (sceneAnchorMs ?? visibleClock.timeMs)
    : visibleClock.timeMs;
  const scene = useMemo(() => {
    const forView: Presentation =
      activeView === "Present"
        ? { ...presentation, present: true }
        : presentation;
    return buildSvgRenderScene(
      buildRenderScene(editor.document, {
        presentation: forView,
        ...(showAnimation
          ? { atMs: sceneTimeMs, playing: playback.playing }
          : {}),
      }),
    );
  }, [
    activeView,
    editor.document,
    playback.playing,
    presentation,
    sceneTimeMs,
    showAnimation,
  ]);
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
  const routeTiming = (
    path: MovementPath,
  ): Readonly<Record<RouteTimingField, string>> => {
    const player = editor.document.players.find(
      ({ id }) => id === path.playerId,
    );
    const resolved = resolvePathTiming(path, player);
    const committed = {
      delay: resolved.delayBeats.toFixed(1),
      speed: `${resolved.speedMultiplier.toFixed(1)}×`,
      hold: resolved.holdSeconds.toFixed(1),
    };
    return timingDraft?.pathId === path.id
      ? { ...committed, [timingDraft.field]: timingDraft.value }
      : committed;
  };
  const editRouteTiming = (
    pathId: string,
    field: RouteTimingField,
    value: string,
  ): void => {
    setTimingDraft({ pathId, field, value });
    const parsed = Number.parseFloat(value.replace("×", ""));
    if (Number.isNaN(parsed)) return;
    void editorStore
      .applyEdit(
        (current) => setRouteTimingCommand(current, pathId, field, parsed),
        { coalesce: true },
      )
      .catch(() => undefined);
  };
  const bounds = {
    startMs: animationPlan.startMs,
    endMs: animationPlan.endMs,
  };
  const paintPlaybackFrame = (clock: PlaybackClock): void => {
    const svg = fieldSvgRef.current;
    const timeline = timelineRef.current;
    const frame = evaluatePlayAt(
      editorStore.getSnapshot().document,
      clock.timeMs,
      animationPlan,
    );
    const projection = createSvgProjection(
      editorStore.getSnapshot().document.fieldProfile,
    );
    if (svg) {
      applyLiveFieldPaint(svg, {
        playback: {
          players: editorStore.getSnapshot().document.players.map((player) => {
            const position =
              frame.playerPositions[player.id] ?? player.position;
            const point = projectCoordinate(position, projection);
            return { id: player.id, x: point.x, y: point.y };
          }),
          trails: frame.trails.map((trail) => ({
            pathId: `${trail.pathId}-trail`,
            d: trail.points
              .map((point, index) => {
                const projected = projectCoordinate(point, projection);
                return `${index === 0 ? "M" : "L"} ${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`;
              })
              .join(" "),
          })),
        },
      });
      svg.setAttribute("data-playback-time", String(clock.timeMs));
    }
    if (timeline) {
      const span = Math.max(1, bounds.endMs - bounds.startMs);
      const progress = Math.min(
        1,
        Math.max(0, (clock.timeMs - bounds.startMs) / span),
      );
      timeline.setAttribute("data-playback-time", String(clock.timeMs));
      timeline.setAttribute(
        "data-playback-playing",
        clock.playing ? "true" : "false",
      );
      const clockNode = timeline.querySelector("code");
      if (clockNode) {
        clockNode.textContent =
          clockNode.getAttribute("data-clock") === "elapsed"
            ? formatPlaybackClock(clock.timeMs)
            : `${formatPlaybackClock(clock.timeMs)} / ${(bounds.endMs / 1000).toFixed(1)}s`;
      }
      const fill = timeline.querySelector<HTMLElement>(".scrubber-fill");
      if (fill) fill.style.width = `${progress * 100}%`;
      const thumb = timeline.querySelector<HTMLElement>(".scrubber i");
      if (thumb) thumb.style.left = `calc(${progress * 100}% - 6px)`;
    }
  };
  const runPlayback = (next: PlaybackClock): void => {
    if (next.playing && !playbackRef.current.playing) {
      setSceneAnchorMs(next.timeMs);
    } else if (!next.playing) {
      setSceneAnchorMs(null);
    }
    playbackRef.current = next;
    setPlayback(next);
  };
  const togglePlay = (): void => {
    runPlayback(
      togglePlayback(playbackRef.current, readPlaybackNow(), bounds, {
        reducedMotion,
      }),
    );
  };
  const togglePlayRef = useRef(togglePlay);
  const changeRate = (rate: PlaybackRate): void => {
    runPlayback(setPlaybackRate(playbackRef.current, rate, readPlaybackNow()));
  };
  const seekPlay = (timeMs: number): void => {
    runPlayback(seekPlayback(playbackRef.current, timeMs, bounds));
  };
  const resetPlay = (): void => {
    runPlayback(resetPlayback(playbackRef.current, bounds.startMs));
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
      ? editor.document.paths.find(
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
  /** Every call off a catalogue he is already running, by its key. */
  const playerPresets = (player: Player): ReadonlySet<string> =>
    new Set(
      editor.document.paths.flatMap(({ playerId, preset }) =>
        playerId === player.id && preset !== undefined ? [preset] : [],
      ),
    );
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
    publishLiveVisualsRef.current(model);
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
    void editorStore
      .applyCommand(command)
      .then(() => {
        playbook.maybeBroadcast(command);
      })
      .catch(() => undefined);
  };
  /**
   * A call off a catalogue put on the man the Coach has picked out. A route
   * reshapes his base stem, or is drawn from his stance where he has none —
   * without that second case a man with nothing on him has to be given an
   * alternate first and then redrawn, which is not what was asked for. A
   * block or a drop is a whole call rather than a shape, so it replaces what
   * he was doing of that kind, and asking for the one he has takes it off.
   *
   * The selection is left on the man in both cases, for the reason a line
   * call leaves it alone: picking the new line would swap in the Route panel
   * and unmount the very buttons just pressed, and a Coach trying a slant and
   * then a curl is doing exactly that.
   */
  const runQuickCall = (presetKey: string, kind: "route" | "line"): void => {
    const document = editorStore.getSnapshot().document;
    const playerId = interactionRef.current.selection.find(
      (item) => item.kind === "player",
    )?.id;
    if (playerId === undefined) return;
    // Over the field a chosen call is the answer: the sheet or drawer that
    // was covering it goes, and on a phone the quick tray is there for the
    // next one.
    if (inspectorFloats) setInspectorOpen(false);
    runPanelCommand(
      kind === "route"
        ? applyPlayerRoutePresetCommand(document, playerId, presetKey, () =>
            createStableId("path"),
          )
        : applyLinePresetCommand(
            document,
            [playerId],
            presetKey,
            createStableId,
          ),
      {
        selectedNodeIndex: undefined,
        selectedBranchIndex: undefined,
        selectedSegmentIndex: undefined,
      },
    );
  };
  /**
   * A call off a catalogue put on a line the Coach has picked out. A route is
   * reshaped in place, keeping its forks and everything the Coach wrote on
   * it. A block or a drop is a whole call rather than a shape, so it replaces
   * what the man was doing — which is what the original does, and why the two
   * go through different commands.
   */
  const runLinePreset = (pathId: string, presetKey: string): void => {
    const document = editorStore.getSnapshot().document;
    const line = document.paths.find(({ id }) => id === pathId);
    if (inspectorFloats) setInspectorOpen(false);
    runPanelCommand(
      line?.kind === "route"
        ? applyRoutePresetCommand(document, pathId, presetKey)
        : applyLinePresetCommand(
            document,
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
    const previous = interactionRef.current;
    // The scene is only consulted for hit tests, so build it on demand.
    let renderScene: RenderScene | undefined;
    const zoom = fieldWidthPx / cameraRef.current.width;
    const result = fieldInteraction(previous, event, {
      document,
      get scene() {
        renderScene ??= buildRenderScene(document, { presentation });
        return renderScene;
      },
      // What a screen pixel is worth in yards changes with the camera and
      // with the size of the screen, and this is measured from both — so a
      // tolerance the original wrote in pixels stays that many pixels under
      // the Coach's finger wherever he is working.
      screenScale: {
        lateralPixelsPerYard: scene.viewport.lateralPixelsPerYard * zoom,
        depthPixelsPerYard: scene.viewport.depthPixelsPerYard * zoom,
      },
      snap: { enabled: snapEnabled, grid: "off" },
      tool: interactionTool(activeTool),
      depthWindow: fieldDepthWindow(scene.viewport),
      createId: createStableId,
    });
    interactionRef.current = result.model;
    const hold =
      !result.command &&
      !result.requestedTool &&
      !result.editingLabelId &&
      livePaintCanHold(previous, result.model);
    if (!hold) setInteraction(result.model);
    if (result.command) {
      pendingCommitPaintRef.current = true;
      markInsertsPending(result.command);
      void editorStore
        .applyCommand(result.command)
        .then(() => {
          playbook.maybeBroadcast(result.command!);
        })
        .catch(() => undefined);
    }
    // Finishing a route hands the Coach back the select tool, as the
    // original does, so the route he just drew is his to adjust.
    if (result.requestedTool) setActiveTool(result.requestedTool);
    if (result.editingLabelId)
      labelAwaitingTextRef.current = result.editingLabelId;
    publishLiveVisualsRef.current(result.model);
  };
  const livePaintFromModel = (
    model: FieldInteractionModel,
    metrics?: PaintLoopSample,
  ): LiveFieldPaint => {
    const document = editorStore.getSnapshot().document;
    const liveCamera =
      panRef.current !== undefined || pinchRef.current !== undefined;
    const paint: LiveFieldPaint = {
      ...(liveCamera ? { camera: cameraRef.current } : {}),
      ...(metrics === undefined ? {} : { metrics }),
    };
    if (model.gesture.kind === "moving") {
      const delta = projectTranslation(
        model.gesture.translation,
        scene.viewport,
      );
      const affected = affectedLiveEntities(document, model.gesture.items);
      return {
        ...paint,
        move: { dx: delta.x, dy: delta.y, ...affected },
      };
    }
    if (model.gesture.kind === "pressing" || model.gesture.kind === "marquee") {
      heldLiveRef.current = undefined;
    }
    const handlePath = liveHandlePath(model.gesture);
    if (handlePath) {
      const strokes = [
        ...buildPathStrokes(
          handlePath.id,
          handlePath.points,
          handlePath.style,
          scene.viewport,
        ),
        ...handlePath.branches.flatMap((branch, index) => {
          const start = handlePath.points[branch.fromIndex];
          if (!start) return [];
          return [
            ...buildPathStrokes(
              `${handlePath.id}-branch-${index}`,
              [start, ...branch.points],
              branch.style,
              scene.viewport,
            ),
          ];
        }),
      ];
      return { ...paint, pathStrokes: strokes };
    }
    if (
      model.gesture.kind === "idle" &&
      pendingCommitPaintRef.current &&
      heldLiveRef.current
    ) {
      return { ...heldLiveRef.current, ...paint };
    }
    return paint;
  };
  const publishLiveVisuals = (
    model: FieldInteractionModel,
    metrics?: PaintLoopSample,
  ): void => {
    if (model.gesture.kind === "idle" && !pendingCommitPaintRef.current) {
      heldLiveRef.current = undefined;
    }
    const paint = livePaintFromModel(model, metrics);
    if (
      (paint.move || paint.pathStrokes) &&
      (model.gesture.kind !== "idle" || pendingCommitPaintRef.current)
    ) {
      heldLiveRef.current = paint;
    }
    livePreviewRef.current = paint;
    if (fieldSvgRef.current) applyLiveFieldPaint(fieldSvgRef.current, paint);
    liveStore.notify(model);
  };
  const flushLivePaint = (): void => {
    const pending = pendingPointersRef.current;
    pendingPointersRef.current = [];
    for (const event of pending) dispatchFieldRef.current(event);
    const model = interactionRef.current;
    const metrics = paintLoop.sample();
    publishLiveVisuals(model, metrics.frames > 0 ? metrics : undefined);
  };
  const scheduleLivePaint = (inputAtMs: number): void => {
    paintLoop.schedule(inputAtMs, flushLivePaint);
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
  /**
   * A line by hand begins at the man's stance and takes its breaks from the
   * field (ADR 0052). The Text tool is put down first: a line is drawn under
   * Select, and a sheet or drawer over the field goes so the field is there
   * to draw on.
   */
  const startDrawingFrom = (playerId: string, kind: FieldDrawingKind): void => {
    if (interactionRef.current.drawing) return;
    setActiveTool("select");
    if (inspectorFloats) setInspectorOpen(false);
    dispatchField({ type: "start-drawing", kind, playerId, mode: drawingMode });
  };
  const startDrawingFromSelection = (kind: FieldDrawingKind): void => {
    const men = interactionRef.current.selection.filter(
      (item) => item.kind === "player",
    );
    if (men.length !== 1) return;
    startDrawingFrom(men[0]!.id, kind);
  };
  const startDrawingFromSelectionRef = useRef(startDrawingFromSelection);
  useEffect(() => {
    dispatchFieldRef.current = dispatchField;
    drawingRef.current = interaction.drawing;
    selectToolRef.current = selectTool;
    startDrawingFromSelectionRef.current = startDrawingFromSelection;
    publishLiveVisualsRef.current = publishLiveVisuals;
  });
  useEffect(() => () => paintLoop.cancel(), [paintLoop]);

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
    const live = cameraRef.current;
    // Through the camera, not the whole frame: what a client pixel is worth
    // depends on how much of the frame is on screen.
    return {
      x: live.x + ((clientX - bounds.left) / bounds.width) * live.width,
      y: live.y + ((clientY - bounds.top) / bounds.height) * live.height,
    };
  };
  const fieldPointFromClient = (clientX: number, clientY: number) =>
    unprojectPoint(framePointFromClient(clientX, clientY), scene.viewport);
  const fieldPointerInput = (event: {
    clientX: number;
    clientY: number;
    pointerId: number;
    shiftKey: boolean;
    button: number;
    pointerType: string;
  }) => ({
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
      buildRenderScene(document, { presentation }),
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
  /**
   * Whether one finger, pressed here, moves the field rather than what is on
   * it. A phone has no Space bar, no middle button and no trackpad, and the
   * two-finger pan wants a hand that a phone held in one cannot spare; the
   * selection box the desktop draws on empty grass is, as ADR 0016 has it, a
   * desktop gesture. So a finger on the grass pans. A finger on a man, a
   * route or a note still picks it up — a note included, which the menu
   * leaves out but a drag moves — and a finger mid-drawing or holding the
   * Text tool still puts down what it came to put down.
   */
  const fingerPansFrom = (
    clientX: number,
    clientY: number,
    pointerType: string,
  ): boolean => {
    if (pointerType !== "touch") return false;
    if (interactionRef.current.drawing) return false;
    if (interactionTool(activeTool) === "text") return false;
    const document = editorStore.getSnapshot().document;
    // Measured the way the machine measures its own press, zoom included, so
    // the finger is told the same thing here that it would be told there.
    const zoom = fieldWidthPx / cameraRef.current.width;
    const found = hitTestField(
      buildRenderScene(document, { presentation }),
      fieldPointFromClient(clientX, clientY),
      {
        lateralPixelsPerYard: scene.viewport.lateralPixelsPerYard * zoom,
        depthPixelsPerYard: scene.viewport.depthPixelsPerYard * zoom,
      },
      fieldHitOptions(pointerType),
    );
    return found === undefined;
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
    paintLoop.reset();
    // A press is where the pointer is now. The field takes it from here, so
    // the leave of a man it was over may never arrive; what the press picks
    // is what offers the dot, not a hover left behind.
    setHoveredPlayerId(undefined);
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
    // which is what ADR 0016 means by leaving touch the viewport. A
    // middle-mouse drag does the same — the Figma way to pan without
    // giving up the primary button or hunting for a modifier.
    if (
      spaceHeldRef.current ||
      event.altKey ||
      event.button === 1 ||
      touchNavigates(stylusRef.current, event.pointerType)
    ) {
      if (spaceHeldRef.current) spacePannedRef.current = true;
      panRef.current = { x: event.clientX, y: event.clientY };
      cancelLongPress();
      return;
    }
    // Before a Pencil has been out, one finger is the only pointer the Coach
    // has, and on the grass it moves the field the way it always could with
    // two. The press is kept with the pan: a finger that lifts where it
    // landed was a tap on empty grass, which clears the selection the way a
    // click there does, and that is settled when it lifts.
    if (fingerPansFrom(event.clientX, event.clientY, event.pointerType)) {
      panRef.current = {
        x: event.clientX,
        y: event.clientY,
        tap: {
          x: event.clientX,
          y: event.clientY,
          input: fieldPointerInput(event),
        },
      };
      cancelLongPress();
      return;
    }
    if (playbackRef.current.playing) {
      runPlayback(pausePlayback(playbackRef.current));
    }
    dispatchField({ type: "pointer-down", input: fieldPointerInput(event) });
    flushLivePaint();
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
      const perPixel = cameraRef.current.width / (element?.clientWidth ?? 1);
      const anchor = framePointFromClient(now.midX, now.midY);
      cameraRef.current = panCamera(
        zoomCamera(
          cameraRef.current,
          pinch.distance / now.distance,
          EDITOR_FRAME,
          anchor,
        ),
        -(now.midX - pinch.midX) * perPixel,
        -(now.midY - pinch.midY) * perPixel,
        EDITOR_FRAME,
      );
      pinchRef.current = now;
      scheduleLivePaint(event.timeStamp);
      return;
    }
    const from = panRef.current;
    if (from) {
      const perPixel =
        cameraRef.current.width / (fieldSvgRef.current?.clientWidth ?? 1);
      panRef.current = { x: event.clientX, y: event.clientY };
      cameraRef.current = panCamera(
        cameraRef.current,
        -(event.clientX - from.x) * perPixel,
        -(event.clientY - from.y) * perPixel,
        EDITOR_FRAME,
      );
      scheduleLivePaint(event.timeStamp);
      return;
    }
    // The hand that was resting while the Pencil drew is still resting when it
    // comes up, and it slides. Its press was refused, so the machine has no
    // gesture of its own to end — but a route left part-drawn would follow it
    // anyway, which is the one thing a rejected palm can still reach.
    if (touchNavigates(stylusRef.current, event.pointerType)) return;
    const drawing = interactionRef.current.drawing;
    const keepEverySample =
      drawing?.mode === "free" &&
      (drawing.pointerDown || drawing.initialDrag !== undefined);
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const moves = (samples.length > 0 ? samples : [event]).map(
      (sample): FieldInteractionEvent => ({
        type: "pointer-move",
        input: fieldPointerInput(sample),
      }),
    );
    pendingPointersRef.current = keepEverySample
      ? [...pendingPointersRef.current, ...moves]
      : moves.slice(-1);
    scheduleLivePaint(event.timeStamp);
    // Asked after the move, not before it: this very event is what turns a
    // still press into a drag, and reading the gesture first would always find
    // the press it is about to stop being. The pending move is the authority;
    // flush it before reading whether the press survived.
    //
    // The original allowed six pixels of tremor before giving up on the menu.
    // Production asks the machine instead, which lets go at two — one press
    // cannot both be dragging a man and offering a menu about him, and the
    // machine is what already decides which of those is happening.
    if (interactionRef.current.gesture.kind === "pressing") {
      paintLoop.flush();
    }
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
    if (panRef.current || pinching) {
      const tap = panRef.current?.tap;
      panRef.current = undefined;
      setCamera(cameraRef.current);
      // A finger that came down on the grass and lifted within a tap's
      // wobble of the same spot never meant to move anything. It is handed
      // to the machine as the press and release it was, which is how empty
      // grass clears the selection under a mouse too.
      if (
        tap &&
        Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <=
          FINGER_TAP_SLOP_PX
      ) {
        dispatchField({ type: "pointer-down", input: tap.input });
        dispatchField({ type: "pointer-up", input: fieldPointerInput(event) });
        flushLivePaint();
      }
      return;
    }
    paintLoop.flush();
    dispatchField({ type: "pointer-up", input: fieldPointerInput(event) });
    flushLivePaint();
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
    paintLoop.reset();
    flushLivePaint();
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
    flushLivePaint();
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
      const perPixel =
        cameraRef.current.width / (fieldSvgRef.current?.clientWidth ?? 1);
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
  const showShadow = () =>
    setPresentation((current) =>
      current.hideShadow ? { ...current, hideShadow: false } : current,
    );
  const applyCallPick = (callId: string): void => {
    const call = stockDefensiveCalls.find(
      ({ formation }) => formation.id === callId,
    );
    if (!call) return;
    setOverlay(null);
    setPreviewFormationId(undefined);
    if (inspectorFloats) setInspectorOpen(false);
    // On an offensive play the call is the shadow: a hidden shadow he just
    // chose a look for comes back, or the pick would land unseen.
    if (editor.document.unit !== "defense") showShadow();
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
    // The set was the errand; over a phone's field the sheet has done its job.
    if (inspectorFloats) setInspectorOpen(false);
    // On a defensive play the formation is the shadow (ADR 0053).
    if (editor.document.unit === "defense") showShadow();
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
   * Putting each side of the ball back (ADR 0055): in the set or call the
   * Play remembers, or in base. As with the ball spots, a reset that would
   * move nobody is no command at all, which is what greys its button.
   */
  const alignmentResets = useMemo(() => {
    const option = (side: PlayerSideOfBall, target: AlignmentResetTarget) => {
      const { command, result } = resetAlignmentCommand(
        editor.document,
        side,
        target,
        allFormations,
      );
      return result
        ? { name: result.alignment.name, available: command !== undefined }
        : undefined;
    };
    const side = (name: PlayerSideOfBall): SideResets => {
      const chosen = option(name, "chosen");
      return {
        ...(chosen ? { chosen } : {}),
        base: option(name, "base") ?? {
          name: baseAlignment(name).name,
          available: false,
        },
      };
    };
    return { offense: side("offense"), defense: side("defense") };
  }, [allFormations, editor.document]);
  /**
   * The reset is the Coach's whole gesture, the way picking a set is: built
   * from the live Play, one transaction, and a word about what it did where
   * he is already looking.
   */
  const resetMen = (
    side: PlayerSideOfBall,
    target: AlignmentResetTarget,
  ): void => {
    const document = editorStore.getSnapshot().document;
    const { command, result } = resetAlignmentCommand(
      document,
      side,
      target,
      allFormations,
    );
    if (!command || !result) return;
    setOverlay(null);
    // Putting the shadow back is asking to see it.
    if (side !== document.unit) showShadow();
    const men = result.movedCount === 1 ? "1 man" : `${result.movedCount} men`;
    setToast({
      name: result.alignment.name,
      text:
        result.movedCount === 0
          ? "— already aligned"
          : target === "base"
            ? `— base, ${men} moved`
            : `— ${men} back in place`,
    });
    runPanelCommand(command, { selection: [], drawing: undefined });
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

  const goToView = useCallback(
    (view: View): void => {
      setActiveView(view);
      setOpenMenu(null);
      setOverlay(null);
      if (chromeLoadedRef.current) {
        const wasGameDay = chromeRef.current.gameDay === true;
        if (view === "GameDay" || wasGameDay) {
          const { gameDay: _was, ...rest } = chromeRef.current;
          void _was;
          const next: ChromeState =
            view === "GameDay" ? { ...rest, gameDay: true } : rest;
          chromeRef.current = next;
          setChrome(next);
          void runtime.library.saveChrome(next).catch(() => undefined);
        }
      }
    },
    [runtime.library],
  );
  /** Help's tutorials open Demo on the tour named (issue #65). */
  const openTour = useCallback(
    (tourId: DemoTour["id"]): void => {
      setDemoTourId(tourId);
      setDemoPlayName(demoTour(tourId).playName);
      goToView("Demo");
    },
    [goToView],
  );

  const openDemoInEditor = useCallback(
    (tour: DemoTour): void => {
      const current = editorStore.getSnapshot().document;
      const play = demoHandoffPlay(tour, {
        playbookId: current.playbookId,
      });
      void editorStore.adoptPlay(play).then(() => {
        setInteraction(idleFieldInteraction);
        goToView("Editor");
      });
    },
    [editorStore, goToView],
  );

  /**
   * The letter-landscape field sheet. Print preview's "Print this" and
   * Export → Print the field are the same print, as the original's
   * `exportPdf` is.
   */
  const printTheField = (): void => {
    const svg = fieldSvgRef.current;
    if (!svg) return;
    const play = editorStore.getSnapshot().document;
    openPrintField({
      playName: play.name,
      category: formatClassification(play),
      svgMarkup: svgMarkupForPrint(svg, {
        width: scene.viewport.width,
        height: scene.viewport.height,
      }),
    });
    setOpenMenu(null);
  };

  useEffect(() => {
    if (openMenu !== "export") return;
    let cancelled = false;
    const open = editorStore.getSnapshot().document;
    Promise.resolve()
      .then(() => runtime.repository.loadPlaybook(open.playbookId))
      .then((envelope) => {
        if (cancelled || !envelope) return;
        const plays = envelope.plays.map((play) =>
          play.id === open.id ? open : play,
        );
        setLibrary({
          plays: plays.some(({ id }) => id === open.id)
            ? plays
            : [open, ...plays],
          concepts: envelope.concepts,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [editorStore, openMenu, runtime]);

  const libraryPlays = useMemo(
    () => library?.plays ?? [editor.document],
    [editor.document, library],
  );
  const libraryConcepts = useMemo(() => library?.concepts ?? [], [library]);
  const libraryRows = useMemo(
    () =>
      libraryOrder(libraryPlays, libraryConcepts).map(({ play }) => ({
        id: play.id,
        name: play.name,
      })),
    [libraryConcepts, libraryPlays],
  );
  // The original opens the picker with the first eight cells already filled.
  const effectiveWristbandPicks =
    wristbandPicks ?? libraryRows.slice(0, 8).map(({ id }) => id);
  const toggleWristbandPick = (playId: string): void => {
    setWristbandPicks((current) => {
      const picks = current ?? effectiveWristbandPicks;
      if (picks.includes(playId)) return picks.filter((id) => id !== playId);
      return picks.length < 8 ? [...picks, playId] : picks;
    });
  };

  /**
   * The coaching outputs — every Export entry past the field sheet. Each
   * renders the current revision through the editor's own renderer with the
   * inspector's page, type and layers as its base, never mutates the Play,
   * and reads only what is on this device, so it works offline.
   */
  const renderDiagram = createDiagramRenderer(presentation);
  const openConcept = (): Concept | undefined => {
    const conceptId =
      editorStore.getSnapshot().document.conceptSource?.conceptId;
    return conceptId === undefined
      ? undefined
      : libraryConcepts.find(({ id }) => id === conceptId);
  };
  const teaching = () => ({
    render: renderDiagram,
    formations: allFormations,
    ...(openConcept() === undefined ? {} : { concept: openConcept() }),
  });
  const libraryOptions = {
    render: renderDiagram,
    concepts: libraryConcepts,
    formations: allFormations,
  };
  const printOrSay = (html: string | undefined, name: string, text: string) => {
    if (!html) setToast({ name, text });
    else if (!openPrintWindow(html)) {
      // A blocked pop-up is said, and the way round it named (issue #69).
      setToast({
        name: "The browser blocked the print window",
        text: "— open Print & export to print from here",
      });
    }
    setOpenMenu(null);
  };
  const positionAction = (groupId: PositionGroupId) => () => {
    const play = editorStore.getSnapshot().document;
    printOrSay(
      positionViewHtml(play, groupId, teaching()),
      `No ${positionGroup(groupId).name.toLowerCase()} on the field`,
      "",
    );
  };
  const coachingOutputActions: ActionMap = {
    // A scrubbed frame exports as what is on screen — the still is the Play
    // at that moment, and the clock goes into the file name.
    exportPng: () => {
      const play = editorStore.getSnapshot().document;
      const frozen = showAnimation && !playback.playing;
      const svg = standaloneSvg(
        renderDiagram(play, frozen ? { atMs: sceneTimeMs } : {}),
      );
      const name = exportFileName(
        play.name,
        "png",
        frozen ? formatPlaybackClock(sceneTimeMs) : undefined,
      );
      void pngFromSvg(svg)
        .then((blob) => downloadBlob(name, blob))
        .catch(() => {
          setToast({ name: "Could not write the PNG", text: "" });
        });
      setOpenMenu(null);
    },
    exportSvg: () => {
      const play = editorStore.getSnapshot().document;
      downloadText(
        exportFileName(play.name, "svg"),
        standaloneSvg(renderDiagram(play)),
        "image/svg+xml",
      );
      setOpenMenu(null);
    },
    printInstall: () => {
      const play = editorStore.getSnapshot().document;
      printOrSay(installPageHtml(play, teaching()), "", "");
    },
    positionReceivers: positionAction("rec"),
    positionBacks: positionAction("backs"),
    positionLine: positionAction("line"),
    positionQb: positionAction("qb"),
    positionDefense: positionAction("def"),
    printQuiz: () => {
      const play = editorStore.getSnapshot().document;
      printOrSay(
        quizHtml(play, teaching()),
        "Nothing to quiz",
        "— draw some routes first",
      );
    },
    printSlide: () => {
      const play = editorStore.getSnapshot().document;
      printOrSay(slideHtml(play, teaching()), "", "");
    },
    printWristband: () => {
      const ordered = libraryOrder(libraryPlays, libraryConcepts).map(
        ({ play }) => play,
      );
      const picked = ordered.filter(({ id }) =>
        effectiveWristbandPicks.includes(id),
      );
      printOrSay(
        wristbandHtml(picked, libraryOptions),
        "Pick some plays first",
        "",
      );
    },
    printScout: () => {
      const play = editorStore.getSnapshot().document;
      printOrSay(
        scoutCardsHtml(scoutCardPlays(libraryPlays, play), libraryOptions),
        "",
        "",
      );
    },
    printCards: () => {
      const play = editorStore.getSnapshot().document;
      printOrSay(
        practiceCardsHtml(
          practiceCardPlays(libraryPlays, play),
          libraryOptions,
        ),
        "",
        "",
      );
    },
    printCallSheet: () => {
      printOrSay(
        callSheetHtml(libraryPlays, { concepts: libraryConcepts }),
        "",
        "",
      );
    },
    printPlaybook: () => {
      printOrSay(
        playbookHtml(libraryPlays, {
          ...libraryOptions,
          year: new Date().getFullYear(),
        }),
        "The library is empty",
        "— save a play first",
      );
    },
  };

  /**
   * What production can run today. A command the editor cannot yet perform is
   * deliberately absent so the menus show it as unavailable rather than
   * accepting a click and doing nothing.
   */
  /**
   * A blank Play of one unit, drawn in the editor wherever it was asked for.
   * The unit is settled here for good (ADR 0053); the shadow of the other
   * side starts shown so the first call or formation he picks is seen.
   */
  const startPlay = (unit: PlayUnit) => {
    if (interactionRef.current.drawing) {
      dispatchFieldRef.current({ type: "escape" });
    }
    playbook.newPlay(unit);
    setPresentation((current) =>
      current.hideShadow ? { ...current, hideShadow: false } : current,
    );
    setOpenMenu(null);
    goToView("Editor");
  };

  /**
   * The other unit's shadow on or off the field (ADR 0053). One toggle serves
   * the rail button, the H key, the palette and the Layers list; it changes
   * how the Play is shown, never what the Play is.
   */
  const toggleShadow = () =>
    setPresentation((current) => ({
      ...current,
      hideShadow: shadowShown(current),
    }));
  const actions: ActionMap = {
    toolSelect: () => selectTool("select"),
    toolText: () => selectTool("text"),
    drawRoute: () => startDrawingFromSelection("route"),
    drawMotion: () => startDrawingFromSelection("motion"),
    drawBlock: () => startDrawingFromSelection("block"),
    drawZone: () => startDrawingFromSelection("zone"),
    freeDraw: () => setFreeDrawing(!freeDraw),
    focus: () => setPanels(false),
    showPanels: () => setPanels(true),
    toggleInspector: () => setInspectorOpen((shown) => !shown),
    toggleRail: () => setRailOpen((shown) => !shown),
    toggleZones: () => setZonesHidden((hidden) => !hidden),
    toggleShadow,
    settings: () => {
      setOpenMenu(null);
      setOverlay("settings");
    },
    // Reflects what the Coach has picked, or the whole Play when he has
    // picked nothing — the same call either way.
    mirror: () => {
      dispatchFieldRef.current({ type: "mirror" });
      setOpenMenu(null);
    },
    present: () => goToView("Present"),
    print: () => {
      setOutputSpec(defaultOutputSpec(presentation));
      goToView("Print");
    },
    output: () => {
      setOutputSpec(defaultOutputSpec(presentation));
      goToView("Print");
    },
    ...Object.fromEntries(
      outputPresets.map((preset) => [
        `preset:${preset.id}`,
        () => {
          setOutputSpec({
            ...defaultOutputSpec(
              presentation,
              preset.format,
              preset.sourceKind === "book"
                ? { kind: "book" }
                : preset.sourceKind === "plan"
                  ? { kind: "plan", planId: "", copy: "revision" }
                  : preset.sourceKind === "selection"
                    ? { kind: "selection", playIds: [editor.document.id] }
                    : { kind: "current" },
            ),
            options: {
              ...defaultOutputSpec(presentation).options,
              detail: preset.detail,
              mono: preset.mono,
            },
          });
          goToView("Print");
        },
      ]),
    ),
    printField: printTheField,
    printProgression: () => {
      const play = editorStore.getSnapshot().document;
      openProgressionStrip(play, (atMs) =>
        renderToStaticMarkup(
          createElement(FieldDiagram, {
            scene: buildSvgRenderScene(
              buildRenderScene(play, { atMs, playing: true }),
            ),
          }),
        ),
      );
      setOpenMenu(null);
    },
    exportFrames: () => {
      const play = editorStore.getSnapshot().document;
      void downloadFrameSequence(play, (atMs) =>
        renderToStaticMarkup(
          createElement(FieldDiagram, {
            scene: buildSvgRenderScene(
              buildRenderScene(play, { atMs, playing: true }),
            ),
          }),
        ),
      );
      setOpenMenu(null);
    },
    shortcuts: () => setOverlay("shortcuts"),
    palette: () => {
      setOpenMenu(null);
      setOverlay("palette");
    },
    gamePlans: () => {
      setPlaybooksTab("plans");
      goToView("Playbooks");
    },
    editor: () => goToView("Editor"),
    playbooks: () => {
      setPlaybooksTab("plays");
      goToView("Playbooks");
    },
    gameDay: () => goToView("GameDay"),
    demo: () => openTour("tools"),
    ...Object.fromEntries(
      demoTours.map((tour) => [`demo:${tour.id}`, () => openTour(tour.id)]),
    ),
    // Chalk saves continuously (ADR 0012); an explicit Save flushes whatever
    // the Coach is still typing rather than pretending durability is manual.
    savePlay: () => {
      playbook.savePlay();
      setOpenMenu(null);
    },
    saveAsVariant: () => {
      playbook.startVariation();
      setOpenMenu(null);
    },
    newVariation: () => {
      playbook.startVariation();
      setOpenMenu(null);
    },
    newOffensivePlay: () => startPlay("offense"),
    newDefensivePlay: () => startPlay("defense"),
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
    // A reset that would move nobody is unavailable, as its button is grey.
    ...(alignmentResets.offense.chosen?.available
      ? { resetOffense: () => resetMen("offense", "chosen") }
      : {}),
    ...(alignmentResets.offense.base.available
      ? { resetOffenseBase: () => resetMen("offense", "base") }
      : {}),
    ...(alignmentResets.defense.chosen?.available
      ? { resetDefense: () => resetMen("defense", "chosen") }
      : {}),
    ...(alignmentResets.defense.base.available
      ? { resetDefenseBase: () => resetMen("defense", "base") }
      : {}),
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
    ...Object.fromEntries(
      coachFormations.map((formation) => [
        `formation:${formation.id}`,
        () => applyFormationPick(formation.id),
      ]),
    ),
    [`open:${editor.document.id}`]: () => undefined,
    ...Object.fromEntries(
      playbook.snapshot.members.map((member) => [
        `open:${member.playId}`,
        () => {
          if (interactionRef.current.drawing) {
            dispatchFieldRef.current({ type: "escape" });
          }
          void playbook.loadPlay(member.playId);
          setOverlay(null);
          setOpenMenu(null);
        },
      ]),
    ),
    ...coachingOutputActions,
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

  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return;
    const query = globalThis.matchMedia("(max-width: 1023px)");
    const read = () => {
      const was = compactRef.current;
      compactRef.current = query.matches;
      setCompact(query.matches);
      if (query.matches && !was) setInspectorOpen(false);
    };
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  // Watched rather than read once, because a phone turned on its side is a
  // different screen and the Coach turns it over without reloading anything.
  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return;
    const query = globalThis.matchMedia(editorScreenQuery);
    const read = () => {
      const tooSmall = !query.matches;
      setPhoneWorkspace(tooSmall);
      // Whatever corner of the field he had been working in on a bigger
      // screen, a phone shows the Play whole to begin with. He can still go
      // in for a closer look; he should not have to come back out first.
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

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  useEffect(() => {
    togglePlayRef.current = togglePlay;
  });

  useEffect(() => {
    if (!playback.playing) return;
    let frame = 0;
    const loop = (now: number) => {
      const next = tickPlayback(playbackRef.current, now, {
        startMs: animationPlan.startMs,
        endMs: animationPlan.endMs,
      });
      playbackRef.current = next;
      paintPlaybackFrame(next);
      if (!next.playing) {
        setSceneAnchorMs(null);
        setPlayback(next);
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
    // paintPlaybackFrame reads live refs; the loop is owned by playing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.playing, animationPlan.startMs, animationPlan.endMs]);

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

      if (!typing && activeView === "Demo") {
        // Arrows and space belong to the tour; editor shortcuts stay off.
        return;
      }
      if (activeView === "Playbooks" || activeView === "GameDay") {
        // The destinations carry their own keys; the field's shortcuts would
        // draw on a Play nobody is looking at. Escape comes back to it, and
        // the palette still opens.
        if (event.key === "Escape") {
          if (overlay !== null || openMenu !== null) {
            setOverlay(null);
            setOpenMenu(null);
          } else if (!typing) {
            event.preventDefault();
            goToView("Editor");
          }
          return;
        }
        if (meta && key === "k") {
          event.preventDefault();
          setOverlay((current) => (current === "palette" ? null : "palette"));
        }
        return;
      }
      if (!typing && (activeView === "Present" || activeView === "Print")) {
        if (event.key === "Escape") {
          event.preventDefault();
          goToView("Editor");
          return;
        }
        if (activeView === "Present") {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            playbook.stepFamily(event.key === "ArrowRight" ? 1 : -1);
            return;
          }
          if (event.key === " " && !activating) {
            event.preventDefault();
            togglePlayRef.current();
            return;
          }
        }
        return;
      }

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
        // Built when this save runs, not from the document the key found.
        // The menu's reorder may still be in the queue, and a command
        // captured now would paint that older order back over it.
        const direction = key === "]" ? 1 : -1;
        const selection = interactionRef.current.selection;
        void editorStore
          .applyEdit((document) =>
            reorderSelectionCommand(document, selection, direction),
          )
          .catch(() => undefined);
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
      if (
        event.altKey &&
        !meta &&
        !typing &&
        (event.code === "Digit1" || event.code === "Digit2")
      ) {
        // ⌥1 and ⌥2 fold the inspector and the tools, as their titles say.
        event.preventDefault();
        if (event.code === "Digit1") setInspectorOpen((shown) => !shown);
        else setRailOpen((shown) => !shown);
        return;
      }
      if (typing || meta || event.altKey) return;
      if (event.key === " " && !activating) {
        // Held space turns a drag into a pan. A tap with no drag plays and
        // pauses, matching the original.
        event.preventDefault();
        spaceHeldRef.current = true;
        spacePannedRef.current = false;
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
      if (key === "t") {
        selectToolRef.current("text");
        return;
      }
      if (key === "v") {
        selectToolRef.current("select");
        return;
      }
      const drawKind = drawKindForKey(key);
      if (drawKind) {
        // A line by key starts from the one man picked out, as the Draw
        // buttons in his inspector do (ADR 0052); with nobody picked, or
        // several, the key has nobody to start from.
        startDrawingFromSelectionRef.current(drawKind);
        return;
      }
      if (key === "s") setSnapEnabled((enabled) => !enabled);
      if (key === "h") {
        // H takes the other unit's shadow off the field and puts it back;
        // the rail's Shadow button does the same (ADR 0053).
        setPresentation((current) => ({
          ...current,
          hideShadow: shadowShown(current),
        }));
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== " ") return;
      spaceHeldRef.current = false;
      // Present plays on keydown — there is no space-to-pan there. Doing it
      // again here would start and stop in the same tap.
      if (
        activeView === "Editor" &&
        !spacePannedRef.current &&
        animationPlan.items.length > 0
      ) {
        togglePlayRef.current();
      }
      spacePannedRef.current = false;
    };
    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("keyup", onKeyUp);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("keyup", onKeyUp);
    };
  }, [
    activeView,
    animationPlan.items.length,
    contextMenu,
    editorStore,
    goToView,
    openMenu,
    overlay,
    playbook,
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

  // A drawer or sheet over the field goes away on a tap past it — the field,
  // the tools, the top bar. What it opened itself (a browser, a menu, its own
  // handle) is not past it.
  useEffect(() => {
    if (!inspectorOpen || !inspectorFloats) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          ".inspector, .inspector-stub, .overlay, .menu-panel, .context-backdrop, .toast",
        )
      ) {
        return;
      }
      setInspectorOpen(false);
    };
    globalThis.addEventListener("pointerdown", onPointerDown);
    return () => globalThis.removeEventListener("pointerdown", onPointerDown);
  }, [inspectorOpen, inspectorFloats]);

  useEffect(() => {
    let cancelled = false;
    void runtime.library.loadChrome().then((state) => {
      if (cancelled) return;
      chromeRef.current = state;
      setChrome(state);
      // A drawer starts closed so the field has the width; the stub, ⌥1
      // and Layers bring it out.
      setInspectorOpen(state.inspectorOpen && !compactRef.current);
      // A device left on Game Day comes back to it (issue #67).
      if (state.gameDay) setActiveView("GameDay");
      setRailOpen(state.railOpen);
      setFreeDraw(state.freeDraw === true);
      chromeLoadedRef.current = true;
    });
    void runtime.library.loadOutputPresets().then((presets) => {
      if (!cancelled) setOutputPresets(presets);
    });
    return () => {
      cancelled = true;
    };
  }, [runtime.library]);
  const rememberChrome = useCallback(
    (patch: Partial<ChromeState>) => {
      const next = { ...chromeRef.current, ...patch };
      chromeRef.current = next;
      setChrome(next);
      void runtime.library.saveChrome(next).catch(() => undefined);
    },
    [runtime.library],
  );
  useEffect(() => {
    if (!chromeLoadedRef.current) return;
    const current = chromeRef.current;
    if (
      current.inspectorOpen === inspectorOpen &&
      current.railOpen === railOpen
    ) {
      return;
    }
    rememberChrome({ inspectorOpen, railOpen });
  }, [inspectorOpen, railOpen, rememberChrome]);
  const toggleDisclosure = (id: string) =>
    rememberChrome({
      open: { ...chromeRef.current.open, [id]: !chromeRef.current.open[id] },
    });
  /**
   * Free draw on or off — for the next line, and for the one in hand, which
   * keeps the breaks it already has. The inspector's switch, the bar over
   * the field and the palette are the same switch.
   */
  const setFreeDrawing = (enabled: boolean): void => {
    setFreeDraw(enabled);
    rememberChrome({ freeDraw: enabled });
    dispatchField({
      type: "set-drawing-mode",
      mode: enabled ? "free" : "breaks",
    });
  };

  /**
   * Concepts and line calls as one searchable catalogue (issue #64). The
   * buttons the original spread across the idle panel are the same calls;
   * they now sit one intentional action away, starred and recent ones first.
   */
  const presetChoices: readonly PresetChoice[] = [
    ...conceptCommands.map(({ concept, on, command }) => ({
      key: `concept:${concept.key}`,
      name: concept.name,
      group: "concept" as const,
      hint: concept.hint,
      on,
      available: command !== undefined,
    })),
    ...lineCallCommands.map(({ key, name, on, command }) => ({
      key: `line:${key}`,
      name,
      group: "line" as const,
      on,
      available: command !== undefined,
    })),
  ];
  const currentConcept = conceptCommands.find(({ on }) => on)?.concept.name;
  const currentLineCall = lineCallCommands.find(({ on }) => on)?.name;
  const openPresets = (group: "concept" | "line") => {
    setPresetGroup(group);
    setOverlay("presets");
  };
  const pickPreset = (choice: PresetChoice) => {
    const key = choice.key.replace(/^(concept|line):/, "");
    if (choice.group === "concept") runConcept(key);
    else runLineCall(key);
    rememberChrome({
      recentPresets: [
        choice.key,
        ...chromeRef.current.recentPresets.filter((id) => id !== choice.key),
      ].slice(0, 6),
    });
  };
  const togglePresetFavorite = (key: string) =>
    rememberChrome({
      favoritePresets: chromeRef.current.favoritePresets.includes(key)
        ? chromeRef.current.favoritePresets.filter((id) => id !== key)
        : [...chromeRef.current.favoritePresets, key],
    });
  const shadowOnField = shadowShown(presentation);
  /** The shadow by the other unit's name, as the rail and the layers call it. */
  const shadowLayerName =
    editor.document.unit === "defense" ? "Shadow offense" : "Shadow defense";
  const fieldLayers: readonly FieldLayerToggle[] = [
    ...fieldLayerCatalog.map((layer) => ({
      id: layer.id,
      name: layer.name,
      on: presentation.layers[layer.id],
    })),
    // The other unit's shadow is listed with the layers (ADR 0053): the one
    // drawn thing on the field that is not the Play's own.
    {
      id: "shadow",
      name: shadowLayerName,
      on: shadowOnField,
    },
  ];
  const toggleFieldLayer = (id: string) => {
    if (id === "shadow") {
      toggleShadow();
      return;
    }
    setPresentation((current) => ({
      ...current,
      layers: {
        ...current.layers,
        [id]: !current.layers[id as FieldLayerId],
      },
    }));
  };
  const layersPopover = (
    <LayersPopover
      layers={fieldLayers}
      onOpenChange={(shown) => setOpenMenu(shown ? "layers" : null)}
      onToggle={toggleFieldLayer}
      open={openMenu === "layers"}
    />
  );
  const librarySummary = playbook.conceptName
    ? `${playbook.conceptName} · ${playbook.familySize} ${playbook.familySize === 1 ? "version" : "versions"}`
    : `${playbook.snapshot.members.length} ${playbook.snapshot.members.length === 1 ? "play" : "plays"}`;
  /** A new Field Profile is Playbook-wide, so it is made under Playbook settings. */
  const createFieldProfile = (profile: FieldProfile, asDefault: boolean) => {
    const playbookRecord = playbook.snapshot.playbook;
    const fieldProfiles = [
      ...playbookRecord.fieldProfiles.filter(({ id }) => id !== profile.id),
      profile,
    ];
    void runtime.library
      .savePlaybook({
        ...playbookRecord,
        fieldProfiles,
        defaultFieldProfileId: asDefault
          ? profile.id
          : playbookRecord.defaultFieldProfileId,
        updatedAtMs: Date.now(),
      })
      .then(() => playbook.refresh());
    void editorStore
      .applyCommand({
        kind: "set-field-profile",
        fieldProfile: profile,
      })
      .catch(() => undefined);
  };
  /**
   * The Field profile section moved off the rail into Settings — the markings
   * the Play is on, with the stale-profile / stale-formation offers the Coach
   * gets to bring the diagram onto the latest revision.
   */
  const settingsFieldProfile = (
    <FieldProfileSection
      formations={allFormations}
      onApplyProfile={(profile) => {
        void editorStore
          .applyCommand({
            kind: "set-field-profile",
            fieldProfile: profile,
          })
          .catch(() => undefined);
      }}
      onReapplyFormation={(formation) => applyFormationPick(formation.id)}
      play={editor.document}
      playbook={playbook.snapshot.playbook}
    />
  );
  /**
   * Playbook settings keeps the new-profile form — a profile is Playbook-wide
   * — and the pointer to where Play types are managed from.
   */
  const settingsPlaybookSettings = (
    <>
      <NewProfileForm
        current={editor.document.fieldProfile}
        onCreate={createFieldProfile}
      />
      <p>Play types are managed from the Unit · Type pill in the header.</p>
    </>
  );

  /**
   * The Coach's own Type goes into the Playbook beside the built-ins, then
   * the library reloads so every card, chip and pill sees it at once.
   */
  const addPlayType = async (
    name: string,
    unit: PlayDocument["unit"],
  ): Promise<AddPlayTypeOutcome> => {
    const result = addCoachPlayType(playbook.snapshot.playbook, { name, unit });
    if (!result.ok) return result;
    await runtime.library.savePlaybook(result.playbook);
    await playbook.refresh();
    return { ok: true, playType: result.playType };
  };
  const classification = (
    <PlayClassificationControl
      concepts={playbook.snapshot.concepts}
      formations={allFormations}
      onAddPlayType={addPlayType}
      onApply={(command) => {
        void editorStore
          .applyCommand(command)
          .then(() => playbook.refresh())
          .catch(() => undefined);
      }}
      onDismiss={() => setOpenMenu(null)}
      onToggle={() => toggleMenu("classify")}
      open={openMenu === "classify"}
      play={editor.document}
      playbook={playbook.snapshot.playbook}
    />
  );

  const paletteOverlay = (
    <CommandPalette
      actions={actions}
      commands={paletteCommands({
        defenses: stockDefensiveCalls.map((call) => ({
          id: call.formation.id,
          name: call.formation.name,
        })),
        formations: allFormations,
        savedPlays: playbook.snapshot.members.map((member) => ({
          id: member.playId,
          name: member.name,
        })),
        zonesHidden,
      })}
      onClose={() => setOverlay(null)}
    />
  );
  /**
   * Tool names beside the glyphs (issue #65): off until the Coach asks, so
   * the rail keeps the original's footprint; the Aa control that asks is a
   * tap away, and the answer is remembered per device.
   */

  /** Whether an image a prepared Play references is on this device. */
  const hasImage = useCallback(
    (hash: string) =>
      runtime.getImage(hash).then(
        (image) => image !== undefined,
        () => false,
      ),
    [runtime],
  );
  /**
   * What Print & export reads: every stored play with the open one standing
   * in for its copy, so the sheet shows what is on the field (issue #69).
   */
  const outputPorts = useMemo(
    () => ({
      library: runtime.library,
      loadLibrary: async () => {
        const open = editorStore.getSnapshot().document;
        const envelope = await Promise.resolve()
          .then(() => runtime.repository.loadPlaybook(open.playbookId))
          .catch(() => undefined);
        if (!envelope) return { plays: [open], concepts: [] };
        const plays = envelope.plays.map((play) =>
          play.id === open.id ? open : play,
        );
        return {
          plays: plays.some(({ id }) => id === open.id)
            ? plays
            : [open, ...plays],
          concepts: envelope.concepts,
        };
      },
    }),
    [editorStore, runtime.library, runtime.repository],
  );
  const outputSpecKey = `${outputSpec.format}:${outputSpec.source.kind}:${activeView}`;
  const rememberOutput = useCallback(
    (ran: Omit<OutputPreset, "id" | "atMs">) => {
      setOutputPresets((current) => {
        const next = rememberPreset(current, {
          ...ran,
          id: `${ran.format}-${ran.sourceKind}`,
          atMs: Date.now(),
        });
        void runtime.library.saveOutputPresets(next).catch(() => undefined);
        return next;
      });
    },
    [runtime.library],
  );
  const recentOutputs: readonly MenuEntry[] = outputPresets.map((preset) => ({
    id: `preset:${preset.id}`,
    label: preset.name,
    title: "Run this output again",
  }));
  const header = (
    <Header
      actions={actions}
      activeView={activeView}
      canResetPositions={
        animationPlan.items.length > 0 &&
        (visibleClock.playing || visibleClock.timeMs !== animationPlan.startMs)
      }
      classification={classification}
      commitPlayName={commitPlayName}
      demoPlayName={demoPlayName}
      focused={focused}
      onCloseMenu={() => setOpenMenu(null)}
      onCreateVersion={createVersion}
      onMenu={toggleMenu}
      onRedo={redo}
      onResetPositions={resetPlay}
      onRestoreVersion={restoreVersion}
      onUndo={undo}
      onView={goToView}
      openMenu={openMenu}
      playName={editor.draftPlayName}
      resetPlayName={editorStore.resetPlayNameDraft}
      runtime={runtime}
      identity={identity}
      sync={sync}
      syncSnapshot={syncSnapshot}
      onOpenConflicts={() => setOverlay("conflicts")}
      phone={phoneWorkspace}
      recentOutputs={recentOutputs}
      wristband={{
        rows: libraryRows,
        picks: effectiveWristbandPicks,
        onToggle: toggleWristbandPick,
      }}
      setPlayName={editorStore.setPlayNameDraft}
      undo={editor.undo}
      versions={editor.versions}
      zonesHidden={zonesHidden}
    />
  );

  // The handle that brings the inspector back. Beside the field on a tablet;
  // on a phone it floats in the field's bottom corner, where the canvas is
  // empty around a fitted field (issue #92).
  const inspectorStub = (
    <button
      className="inspector-stub"
      onClick={() => setInspectorOpen(true)}
      title="Show the inspector — ⌥1"
      type="button"
    >
      Inspector
    </button>
  );
  /**
   * What the phone's quick tray offers right now, or nothing. A line being
   * drawn has the Done button in the tools and nothing to be given yet; a
   * motion or a ball flight has no catalogue of its own, so they get no row
   * rather than somebody else's.
   */
  const quickTray = (() => {
    if (!phoneWorkspace || interaction.drawing) return null;
    if (selectedPath) {
      const calls =
        selectedPath.kind === "route"
          ? routePresetNames
          : selectedPath.kind === "block"
            ? quickBlockCalls
            : defensiveLineKinds.has(selectedPath.kind)
              ? quickAssignmentCalls
              : [];
      if (calls.length === 0) return null;
      const who = editor.document.players.find(
        ({ id }) => id === selectedPath.playerId,
      );
      return (
        <QuickTray
          calls={calls}
          heading={
            who?.label.trim() ? `${who.label.trim()} · Redraw` : "Redraw"
          }
          onApply={(presetKey) => runLinePreset(selectedPath.id, presetKey)}
          running={
            new Set(
              selectedPath.preset === undefined ? [] : [selectedPath.preset],
            )
          }
          title="Redraw this line as one of the calls it can be"
        />
      );
    }
    if (selectedPlayer) {
      const defense = selectedPlayer.unit === "defense";
      const lineman = isLineman(selectedPlayer);
      const what = defense ? "Assignments" : lineman ? "Blocks" : "Routes";
      const name = selectedPlayer.label.trim();
      return (
        <QuickTray
          calls={
            defense
              ? quickAssignmentCalls
              : lineman
                ? quickBlockCalls
                : routePresetNames
          }
          heading={name ? `${name} · ${what}` : what}
          onApply={(presetKey) =>
            runQuickCall(presetKey, defense || lineman ? "line" : "route")
          }
          running={playerPresets(selectedPlayer)}
          title={
            defense
              ? "Give him this call — it replaces what he was doing"
              : lineman
                ? "Give him this block — the one he has takes it off"
                : "Run this route — drawn from his own stance"
          }
        />
      );
    }
    return null;
  })();
  // The only report of a failed write, so the draft a Coach could not save
  // stays recoverable on every screen, a phone's included (issue #97).
  const saveStateButton = (
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
      title={
        editor.localSave.phase === "error" ? editor.localSave.reason : undefined
      }
    >
      {localSaveStatus(editor.localSave)}
    </button>
  );

  const labelDensity = resolveTypeDensity(presentation).label;
  /**
   * The play's timeline: under the field where there is room for it, and on
   * a phone in the status bar's one row beside the zoom, where the readouts
   * a wider bar carries have gone.
   */
  const playbackBar =
    animationPlan.items.length > 0 ? (
      <div className="timeline-dock" ref={timelineRef}>
        <PlaybackBar
          clock={visibleClock}
          compact={phoneWorkspace}
          onPlay={togglePlay}
          onRate={changeRate}
          onReset={resetPlay}
          onSeek={seekPlay}
          plan={animationPlan}
        />
      </div>
    ) : null;
  const statusHint = editorStatusHint({
    view:
      activeView === "Print"
        ? "print"
        : activeView === "Demo"
          ? "demo"
          : "editor",
    tool: activeTool,
    atFit: isAtFit(camera, EDITOR_FRAME),
    selectionCount: interaction.selection.length,
    drawing: interaction.drawing
      ? {
          depthBuffer: interaction.drawing.depthBuffer,
          mode: interaction.drawing.mode,
        }
      : undefined,
    labelsTooSmall: labelDensity * (fieldWidthPx / camera.width) < 11,
    animating: showAnimation,
    firstUse:
      playbook.snapshot.members.length === 0 &&
      editor.document.players.length === 0 &&
      editor.document.labels.length === 0,
  });

  if (activeView === "Present") {
    return (
      <div className="chalk-shell view-present">
        <PresentMode
          onLeave={() => goToView("Editor")}
          onStep={(direction) => playbook.stepFamily(direction)}
          playName={editor.document.name}
          positionLine={playbook.presentLine}
          scene={scene}
          svgRef={fieldSvgRef}
          timeline={
            animationPlan.items.length > 0 ? (
              <div ref={timelineRef}>
                <PlaybackBar
                  clock={visibleClock}
                  onPlay={togglePlay}
                  onRate={changeRate}
                  onReset={resetPlay}
                  onSeek={seekPlay}
                  plan={animationPlan}
                />
              </div>
            ) : null
          }
        />
      </div>
    );
  }

  if (activeView === "Print") {
    return (
      <div className="chalk-shell view-print">
        {header}
        <OutputWorkspace
          currentPlay={editor.document}
          formations={allFormations}
          initial={outputSpec}
          key={outputSpecKey}
          onClose={() => goToView("Editor")}
          onRan={rememberOutput}
          ports={outputPorts}
          presentation={presentation}
          snapshot={playbook.snapshot}
        />
        <div className="statusbar">
          <span>{statusHint}</span>
        </div>
      </div>
    );
  }

  if (activeView === "Demo") {
    return (
      <div className="chalk-shell view-demo">
        {header}
        <DemoMode
          initialTourId={demoTourId}
          onOpenInEditor={openDemoInEditor}
          onTourChange={(next) => setDemoPlayName(next.playName)}
        />
        <div className="statusbar">
          <span>{statusHint}</span>
        </div>
      </div>
    );
  }

  if (activeView === "Playbooks") {
    // The Playbook and the Game plans are one destination with two pages;
    // opening a Play from either steps back into the editor with it.
    const openPlay = (playId: string) => {
      if (interactionRef.current.drawing) {
        dispatchFieldRef.current({ type: "escape" });
      }
      void playbook.loadPlay(playId);
      goToView("Editor");
    };
    return (
      <div className="chalk-shell view-playbooks">
        {header}
        <main className="destination" aria-label="Playbooks">
          <nav className="destination-tabs" aria-label="Playbooks pages">
            <button
              aria-pressed={playbooksTab === "plays"}
              className={playbooksTab === "plays" ? "active" : undefined}
              onClick={() => setPlaybooksTab("plays")}
              type="button"
            >
              Plays
            </button>
            <button
              aria-pressed={playbooksTab === "plans"}
              className={playbooksTab === "plans" ? "active" : undefined}
              onClick={() => setPlaybooksTab("plans")}
              type="button"
            >
              Game plans
            </button>
            <span className="top-spacer" />
            <NewPlayMenu
              actions={actions}
              buttonClassName="destination-new"
              onDismiss={() => setOpenMenu(null)}
              onToggle={() =>
                setOpenMenu((current) =>
                  current === "newPage" ? null : "newPage",
                )
              }
              open={openMenu === "newPage"}
            />
          </nav>
          {playbooksTab === "plays" ? (
            <PlaybookBrowser
              currentPlayId={editor.document.id}
              embedded
              focusSearch={precisePointer}
              initial={playbook.browserState}
              library={runtime.library}
              members={playbook.snapshot.members}
              onClose={() => goToView("Editor")}
              onOpen={openPlay}
              onOpenGamePlans={() => setPlaybooksTab("plans")}
              onRemember={playbook.rememberBrowser}
              playTypes={playbook.snapshot.playbook.playTypes}
            />
          ) : (
            <GamePlansWorkspace
              embedded
              formations={allFormations}
              library={runtime.library}
              onClose={() => goToView("Editor")}
              onOpenPlay={openPlay}
              render={renderDiagram}
              snapshot={playbook.snapshot}
            />
          )}
        </main>
        {overlay === "palette" ? paletteOverlay : null}
      </div>
    );
  }

  if (activeView === "GameDay") {
    return (
      <div className="chalk-shell view-game-day">
        {header}
        <GameDayView
          hasImage={hasImage}
          library={runtime.library}
          onOpenPlaybooks={() => {
            setPlaybooksTab("plans");
            goToView("Playbooks");
          }}
          snapshot={playbook.snapshot}
        />
        {overlay === "palette" ? paletteOverlay : null}
      </div>
    );
  }

  return (
    <div className={`chalk-shell${phoneWorkspace ? " phone-workspace" : ""}`}>
      {header}
      <div className="workspace">
        {quickTray}
        {railOpen ? (
          <nav className="tool-rail" aria-label="Drawing tools">
            {tools.map((tool) => (
              // Text is the one tool left here (ADR 0052): a note goes on
              // the grass, so it needs a tool; a line goes on a man, so it
              // starts from him. A second press puts the tool down again.
              <button
                className={activeTool === tool.id ? "active" : ""}
                key={tool.id}
                onClick={() =>
                  selectTool(activeTool === tool.id ? "select" : tool.id)
                }
                title={`${tool.label} — ${tool.shortcut}`}
                aria-label={`${tool.label} — ${tool.shortcut}`}
                aria-pressed={activeTool === tool.id}
              >
                <RailIcon glyph={tool.id} />
              </button>
            ))}
            {phoneWorkspace && interaction.drawing ? (
              // A route on a phone ends here; there is no Enter key and a
              // double tap is not a thing a Coach should have to know. It
              // says "route" for every kind of line, as the phone specs do.
              <button
                aria-label="Finish the route — ⏎"
                className="rail-finish"
                onClick={() => dispatchField({ type: "finish-drawing" })}
                title="Finish the route — ⏎"
                type="button"
              >
                Done
              </button>
            ) : null}
            <button
              // Every line off the field at once — routes, motions, blocks,
              // drops and blitzes — with the men left standing, so the next
              // concept is drawn from the same formation. Nothing to wipe
              // leaves it disabled; ⌘Z brings the lines back.
              aria-label="Clear every line"
              className="rail-clear"
              disabled={!erasures.lines}
              onClick={clearAction("lines")}
              title="Clear every line — the men stay where they are"
              type="button"
            >
              <RailIcon glyph="erase" />
            </button>
            <button
              // The other unit under the play, shown or hidden (ADR 0053).
              // Pressed means it is on the field; it stays in the play either way.
              aria-label={`${shadowLayerName} — H`}
              aria-pressed={shadowOnField}
              className="rail-shadow"
              onClick={toggleShadow}
              title={`${shadowLayerName} on / off — H`}
              type="button"
            >
              <RailIcon glyph="shadow" />
            </button>
            <span className="rail-spacer" />
            <button
              aria-label="Delete selection — ⌫"
              className="rail-trash"
              disabled={
                interaction.selection.length === 0 && !interaction.drawing
              }
              onClick={() => dispatchField({ type: "delete" })}
              title="Delete selection — ⌫"
              type="button"
            >
              <RailIcon glyph="trash" />
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
        ) : (
          <button
            className="rail-stub"
            onClick={() => setRailOpen(true)}
            title="Show the tools — ⌥2"
            type="button"
          >
            Tools
          </button>
        )}
        <main className="editor-stage">
          {lifecycle ? (
            <LifecycleNotices
              lifecycle={lifecycle}
              saving={editor.localSave.phase === "saving"}
            />
          ) : null}
          <DeviceNotices
            onDismissRecovery={() => setRecoveryDismissed(true)}
            onReleaseStorage={releaseStorage}
            recovery={recoveryDismissed ? undefined : runtime.recovery}
            storage={storage}
          />
          <div
            className="field-wrap"
            data-busy={playbook.busy ? "true" : undefined}
            data-drawing={interaction.drawing ? "true" : undefined}
            data-tool={activeTool}
          >
            <ScopeBar
              badge={playbook.scopeBadge}
              busy={playbook.busy}
              conceptName={playbook.conceptName}
              offer={playbook.offer}
              onAccept={playbook.acceptOffer}
              onDismiss={playbook.dropOffer}
              onJustThis={() => playbook.setScope("play")}
            />
            {interaction.drawing && !phoneWorkspace ? (
              // A line in hand has its controls over the field, where the
              // pointer already is: Done ends it without a double click or a
              // reach for the keyboard, and the way it is drawn can change
              // mid-line. A phone keeps Done in its tool row instead.
              <div
                aria-label={`${drawingNoun(interaction.drawing.kind, true)} in hand`}
                className="drawing-bar"
                role="group"
              >
                <span>Drawing his {drawingNoun(interaction.drawing.kind)}</span>
                <div
                  aria-label="How the line is drawn"
                  className="drawing-bar-mode"
                  role="group"
                >
                  <button
                    aria-pressed={interaction.drawing.mode === "breaks"}
                    onClick={() => setFreeDrawing(false)}
                    title="Click each break; hold a press to bend the line behind it"
                    type="button"
                  >
                    Breaks
                  </button>
                  <button
                    aria-pressed={interaction.drawing.mode === "free"}
                    onClick={() => setFreeDrawing(true)}
                    title="Trace the line with the pointer held down; lifting finishes it"
                    type="button"
                  >
                    Free draw
                  </button>
                </div>
                <button
                  aria-label="Finish the route — ⏎"
                  className="primary"
                  onClick={() => dispatchField({ type: "finish-drawing" })}
                  title="Finish the route — ⏎"
                  type="button"
                >
                  Done
                </button>
                <button
                  aria-label="Cancel the route — esc"
                  onClick={() => dispatchField({ type: "escape" })}
                  title="Cancel the route — esc"
                  type="button"
                >
                  Cancel
                </button>
              </div>
            ) : null}
            <FieldDiagram
              camera={camera}
              livePreviewRef={livePreviewRef}
              onWheel={onFieldWheel}
              onContextMenu={onFieldContextMenu}
              onPointerCancel={onFieldPointerCancel}
              onPointerDown={onFieldPointerDown}
              onPointerMove={onFieldPointerMove}
              onPointerUp={onFieldPointerUp}
              onDoubleClick={onFieldDoubleClick}
              onHoverPlayer={setHoveredPlayerId}
              onStartRoute={(playerId, event) => {
                // The dot goes as the route starts, and the leave its man
                // would have had goes with it. Without this he keeps
                // offering it after the Coach has tapped away.
                setHoveredPlayerId(undefined);
                dispatchField({
                  type: "start-route",
                  playerId,
                  input: fieldPointerInput(event),
                  mode: drawingMode,
                });
                flushLivePaint();
              }}
              overlay={
                <FieldLiveOverlay
                  document={editor.document}
                  formations={allFormations}
                  getZoom={() => fieldWidthPx / cameraRef.current.width}
                  onHandleDown={onHandleDown}
                  precise={precisePointer}
                  previewFormationId={previewFormationId}
                  projection={scene.viewport}
                  store={liveStore}
                />
              }
              routeDotPlayerId={routeDotPlayerId}
              routeDotPrecise={precisePointer}
              routeDotZoom={camera.width > 0 ? fieldWidthPx / camera.width : 1}
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
            <FieldMinimap
              camera={camera}
              frame={EDITOR_FRAME}
              onCamera={setCamera}
              players={editor.document.players}
            />
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
            {phoneWorkspace && !inspectorOpen ? inspectorStub : null}
          </div>
          {phoneWorkspace ? null : playbackBar}
        </main>
        {inspectorOpen ? (
          <Inspector
            labelEditor={
              selectedPath ? (
                <RouteInspector
                  onToggle={toggleDisclosure}
                  open={chrome.open}
                  branchIndex={interaction.selectedBranchIndex}
                  coaching={routeCoaching(selectedPath)}
                  scopeBadge={playbook.scopeBadge}
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
                  onTiming={(field, value) =>
                    editRouteTiming(selectedPath.id, field, value)
                  }
                  onTimingCommitted={(field) => {
                    editorStore.endCoalescing();
                    setTimingDraft((draft) =>
                      draft?.field === field ? undefined : draft,
                    );
                  }}
                  path={selectedPath}
                  segmentIndex={interaction.selectedSegmentIndex}
                  timing={routeTiming(selectedPath)}
                  unit={
                    editor.document.players.find(
                      ({ id }) => id === selectedPath.playerId,
                    )?.unit ?? editor.document.unit
                  }
                />
              ) : selectedPlayer ? (
                <PlayerInspector
                  onToggle={toggleDisclosure}
                  open={chrome.open}
                  activePresets={playerPresets(selectedPlayer)}
                  scopeBadge={playbook.scopeBadge}
                  lines={playerLines(selectedPlayer)}
                  onApplyPreset={runLinePreset}
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
                  freeDraw={freeDraw}
                  onDeselect={() => dispatchField({ type: "escape" })}
                  onDraw={(kind) => startDrawingFrom(selectedPlayer.id, kind)}
                  onFreeDraw={setFreeDrawing}
                  onFlip={() =>
                    runLabelCommand(
                      flipPlayerLinesCommand(
                        editor.document,
                        selectedPlayer.id,
                      ),
                    )
                  }
                  onQuickCall={runQuickCall}
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
            scopeBadge={playbook.scopeBadge}
            currentConcept={currentConcept}
            currentLineCall={currentLineCall}
            layers={fieldLayers}
            layersPopover={layersPopover}
            librarySummary={librarySummary}
            onCollapse={() => setInspectorOpen(false)}
            sheet={phoneWorkspace}
            onOpenPresets={openPresets}
            onToggle={toggleDisclosure}
            onToggleLayer={toggleFieldLayer}
            onToggleShadow={toggleShadow}
            onReset={resetMen}
            resets={alignmentResets}
            open={chrome.open}
            shadowOn={shadowOnField}
            unit={editor.document.unit}
            library={
              <LibraryPanel
                currentPlayId={editor.document.id}
                onBrowse={() => setOverlay("playbook")}
                onCancelVariation={playbook.cancelVariation}
                onCommitVariation={playbook.commitVariation}
                onDelete={playbook.removePlay}
                onDetach={playbook.detach}
                onLoad={(playId) => {
                  if (interactionRef.current.drawing) {
                    dispatchFieldRef.current({ type: "escape" });
                  }
                  void playbook.loadPlay(playId);
                }}
                onNoteCommit={playbook.noteCommit}
                onPush={playbook.push}
                onScope={playbook.setScope}
                onStartVariation={playbook.startVariation}
                onToggleOpen={playbook.toggleOpen}
                onTogglePick={playbook.togglePick}
                onVariationDraft={playbook.setVariationDraft}
                pickIds={playbook.pickIds}
                report={playbook.report}
                savedFlash={playbook.savedFlash}
                scope={playbook.scope}
                snapshot={playbook.snapshot}
                storedOpen={playbook.storedOpen}
                variationDraft={playbook.variationDraft}
                variationOpen={playbook.variationOpen}
              />
            }
            linemanCount={linemen.length}
            defenderCount={
              editor.document.players.filter(({ unit }) => unit === "defense")
                .length
            }
            formation={onFieldFormation}
            formationHint={formationHint}
            onSpotBall={spotTheBall}
            onOpenDefenses={() => setOverlay("defenses")}
            onOpenFormations={() => setOverlay("formations")}
            onOpenPalette={() => setOverlay("palette")}
            onOpenShortcuts={() => setOverlay("shortcuts")}
          />
        ) : phoneWorkspace ? null : (
          inspectorStub
        )}
      </div>
      <div className="statusbar">
        <span>{statusHint}</span>
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
          {phoneWorkspace ? playbackBar : null}
          <button
            aria-label="Fit to selection"
            className="status-selection"
            onClick={showSelection}
            title="Fit to selection — ⌘2"
            type="button"
          >
            SELECTION
          </button>
          <button
            aria-label="Center on the ball"
            className="status-ball"
            onClick={showTheBall}
            title="Center on the ball"
            type="button"
          >
            BALL
          </button>
          <span data-formation-status>{formationStatus}</span>
          <span className="status-snap">SNAP {snapEnabled ? "ON" : "OFF"}</span>
          <span className="status-count">
            {editor.document.players.length}P · {editor.document.paths.length}R
          </span>
          {saveStateButton}
          {lifecycle ? <LifecycleIndicator lifecycle={lifecycle} /> : null}
          <button
            aria-label={syncStatusLabel(syncSnapshot)}
            className={`sync-state ${syncSnapshot.status}`}
            data-auth-status={identitySession.status}
            data-sync-status={syncSnapshot.status}
            onClick={() => {
              if (syncSnapshot.conflictCount > 0) setOverlay("conflicts");
              else void sync?.syncNow();
            }}
            type="button"
          >
            {syncStatusLabel(syncSnapshot)}
          </button>
        </div>
      </div>
      {overlay === "palette" ? paletteOverlay : null}
      {overlay === "shortcuts" ? (
        <ShortcutReference onClose={() => setOverlay(null)} />
      ) : null}
      {overlay === "defenses" ? (
        <DefenseBrowser
          calls={stockDefensiveCalls}
          focusSearch={precisePointer}
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
      {overlay === "presets" ? (
        <PresetPicker
          choices={presetChoices}
          favorites={chrome.favoritePresets}
          initialGroup={presetGroup}
          onClose={() => setOverlay(null)}
          onPick={pickPreset}
          onToggleFavorite={togglePresetFavorite}
          recents={chrome.recentPresets}
        />
      ) : null}
      {overlay === "playbook" ? (
        <PlaybookBrowser
          currentPlayId={editor.document.id}
          focusSearch={precisePointer}
          initial={playbook.browserState}
          library={runtime.library}
          members={playbook.snapshot.members}
          onClose={() => setOverlay(null)}
          onOpen={(playId) => {
            setOverlay(null);
            if (interactionRef.current.drawing) {
              dispatchFieldRef.current({ type: "escape" });
            }
            void playbook.loadPlay(playId);
          }}
          onOpenGamePlans={() => setOverlay("game-plans")}
          onRemember={playbook.rememberBrowser}
          playTypes={playbook.snapshot.playbook.playTypes}
        />
      ) : null}
      {overlay === "game-plans" ? (
        <GamePlansWorkspace
          formations={allFormations}
          library={runtime.library}
          onClose={() => setOverlay(null)}
          onOpenPlay={(playId) => {
            if (interactionRef.current.drawing) {
              dispatchFieldRef.current({ type: "escape" });
            }
            void playbook.loadPlay(playId);
          }}
          render={renderDiagram}
          snapshot={playbook.snapshot}
        />
      ) : null}
      {overlay === "conflicts" && sync ? (
        <ConflictInboxHost onClose={() => setOverlay(null)} sync={sync} />
      ) : null}
      {overlay === "settings" ? (
        <SettingsOverlay
          fieldProfile={settingsFieldProfile}
          fieldProfileName={editor.document.fieldProfile.name}
          onClose={() => setOverlay(null)}
          onPageKind={(pageKind) =>
            setPresentation((current) => ({ ...current, pageKind }))
          }
          onRestoreVersion={restoreVersion}
          onTypePreset={(typePreset) =>
            setPresentation((current) => ({ ...current, typePreset }))
          }
          pageKind={presentation.pageKind}
          playbookSettings={settingsPlaybookSettings}
          typeHint={
            typePresetCatalog.find(({ id }) => id === presentation.typePreset)
              ?.hint ?? typePresetCatalog[0]!.hint
          }
          typePreset={presentation.typePreset}
          versions={editor.versions}
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

/**
 * Full-window Present: the Play, the name, and esc back. Type is already
 * scaled 1.25× in the scene; this is the chrome around it. Animation and
 * variation stepping wait on later phases — the original's "← → variations"
 * copy stays so the affordance is visible.
 */
function DemoCursorOverlay({
  playback,
  tour,
  viewport,
}: {
  playback: DemoPlayback;
  tour: DemoTour;
  viewport: Parameters<typeof projectCoordinate>[1];
}) {
  const at = (point: { x: number; y: number }) =>
    projectCoordinate(legacyCanvasToYards(point), viewport);
  const cursor = demoCursor(tour, playback);
  return (
    <>
      {demoPulses(tour, playback).map((pulse, index) => {
        const point = at(pulse);
        return (
          <circle
            cx={point.x}
            cy={point.y}
            fill="none"
            key={`pulse-${index}`}
            opacity={pulse.opacity}
            pointerEvents="none"
            r={pulse.r}
            stroke="#0072F5"
            strokeWidth={1.6}
          />
        );
      })}
      {cursor ? (
        <g
          pointerEvents="none"
          transform={`translate(${at(cursor).x} ${at(cursor).y})`}
        >
          <path
            d="M0 0 L0 21 L5.4 16.2 L8.6 23 L12 21.4 L8.8 14.8 L15.6 14.2 Z"
            fill="rgba(0,0,0,0.18)"
            transform="translate(1.5 2)"
          />
          <path
            d="M0 0 L0 21 L5.4 16.2 L8.6 23 L12 21.4 L8.8 14.8 L15.6 14.2 Z"
            fill="#FFFFFF"
            stroke="#171717"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        </g>
      ) : null}
    </>
  );
}

function DemoMode({
  initialTourId = "tools",
  onOpenInEditor,
  onTourChange,
}: {
  /** The tour Help asked for; the panel's own tabs take over from there. */
  initialTourId?: DemoTour["id"];
  onOpenInEditor: (tour: DemoTour) => void;
  onTourChange: (tour: DemoTour) => void;
}) {
  const [playback, setPlayback] = useState<DemoPlayback>(() =>
    startDemo(initialTourId, performance.now()),
  );
  const tour = demoTour(playback.tourId);
  const step = tour.steps[playback.stepIndex] ?? tour.steps[0]!;
  const scene = useMemo(
    () => buildSvgRenderScene(buildRenderScene(demoTour(playback.tourId).play)),
    [playback.tourId],
  );
  const lastStep = tour.steps.length - 1;

  useEffect(() => {
    onTourChange(tour);
  }, [onTourChange, tour]);

  useEffect(() => {
    if (!playback.playing) return;
    let frame = 0;
    const loop = (now: number) => {
      setPlayback((current) =>
        tickDemo(current, demoTour(current.tourId), now),
      );
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playback.playing]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPlayback((current) =>
          gotoDemoStep(
            current,
            demoTour(current.tourId),
            current.stepIndex + 1,
            performance.now(),
          ),
        );
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPlayback((current) =>
          gotoDemoStep(
            current,
            demoTour(current.tourId),
            current.stepIndex - 1,
            performance.now(),
          ),
        );
      } else if (event.key === " ") {
        event.preventDefault();
        setPlayback((current) =>
          toggleDemoPlay(current, demoTour(current.tourId), performance.now()),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const playLabel = demoPlayLabel(playback, tour);
  const reveal = (id: string) => demoItemOpacity(tour, playback, id);

  return (
    <div aria-label="Demo" className="demo-mode" role="region">
      <nav aria-label="Drawing tools" className="demo-rail">
        {demoToolIds.map((tool) => {
          // The tour replays the original's rail as it was filmed; the
          // editor's own rail has since kept only Text (ADR 0052).
          const active = step.tool === tool;
          return (
            <div className={active ? "active" : undefined} key={tool}>
              <RailIcon glyph={tool} />
              <span>{demoToolShortcuts[tool]}</span>
            </div>
          );
        })}
      </nav>
      <div className="demo-stage">
        <div className="demo-canvas">
          <FieldDiagram
            overlay={
              <DemoCursorOverlay
                playback={playback}
                tour={tour}
                viewport={scene.viewport}
              />
            }
            reveal={reveal}
            scene={scene}
          />
        </div>
        <div className="demo-caption">
          <div className="demo-caption-copy">
            <div className="demo-caption-head">
              <strong>{step.title}</strong>
              <span className="demo-keys">{step.keys}</span>
              <span className="demo-step-num">
                {playback.stepIndex + 1} / {tour.steps.length}
              </span>
            </div>
            <p>{step.caption}</p>
          </div>
          <div className="demo-dots">
            {tour.steps.map((candidate, index) => (
              <button
                aria-label={candidate.title}
                aria-current={index === playback.stepIndex ? "true" : undefined}
                className={
                  index < playback.stepIndex
                    ? "done"
                    : index === playback.stepIndex
                      ? "current"
                      : undefined
                }
                key={candidate.title}
                onClick={() =>
                  setPlayback((current) =>
                    gotoDemoStep(current, tour, index, performance.now()),
                  )
                }
                title={candidate.title}
                type="button"
              />
            ))}
          </div>
          <div className="demo-controls">
            <button
              disabled={playback.stepIndex <= 0}
              onClick={() =>
                setPlayback((current) =>
                  gotoDemoStep(
                    current,
                    tour,
                    current.stepIndex - 1,
                    performance.now(),
                  ),
                )
              }
              type="button"
            >
              Back
            </button>
            <button
              className="primary"
              onClick={() =>
                setPlayback((current) =>
                  toggleDemoPlay(current, tour, performance.now()),
                )
              }
              type="button"
            >
              {playLabel}
            </button>
            <button
              disabled={playback.stepIndex >= lastStep}
              onClick={() =>
                setPlayback((current) =>
                  gotoDemoStep(
                    current,
                    tour,
                    current.stepIndex + 1,
                    performance.now(),
                  ),
                )
              }
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </div>
      <aside className="demo-panel" aria-label="Demos">
        <div className="demo-kicker">Demos</div>
        <div className="demo-tabs">
          {demoTours.map((candidate) => (
            <button
              className={candidate.id === tour.id ? "active" : undefined}
              key={candidate.id}
              onClick={() =>
                setPlayback(startDemo(candidate.id, performance.now()))
              }
              type="button"
            >
              {candidate.tab}
            </button>
          ))}
        </div>
        <div className="demo-kicker">{step.panel}</div>
        <div className="demo-rows">
          {step.rows.map((row, index) => {
            const on = demoPanelRowOn(step, playback.progress, index);
            return (
              <div className={on ? "on" : undefined} key={row[0]}>
                <i />
                <span>{row[1]}</span>
              </div>
            );
          })}
        </div>
        <p className="demo-panel-note">
          This panel mirrors the real right-hand inspector — whatever is
          selected on the field is what you style.
        </p>
        <button
          className="primary demo-open"
          onClick={() => onOpenInEditor(tour)}
          type="button"
        >
          Open this play in the editor
        </button>
      </aside>
    </div>
  );
}

function PresentMode({
  onLeave,
  onStep,
  playName,
  positionLine,
  scene,
  svgRef,
  timeline,
}: {
  onLeave: () => void;
  /** Previous and Next variation, for a thumb as well as the arrow keys (issue #67). */
  onStep: (direction: 1 | -1) => void;
  playName: string;
  positionLine: string;
  scene: SvgRenderScene;
  svgRef?: Ref<SVGSVGElement>;
  timeline?: ReactNode;
}) {
  return (
    <div aria-label="Present" className="present-mode" role="region">
      <div className="present-stage">
        <FieldDiagram scene={scene} svgRef={svgRef} />
      </div>
      {timeline}
      <div className="present-bar">
        <button
          aria-label="Previous variation"
          className="present-step"
          onClick={() => onStep(-1)}
          title="Previous variation — ←"
          type="button"
        >
          ‹
        </button>
        <button
          aria-label="Next variation"
          className="present-step"
          onClick={() => onStep(1)}
          title="Next variation — →"
          type="button"
        >
          ›
        </button>
        <div className="present-name">{playName}</div>
        <div className="present-pos">{positionLine}</div>
        <div className="present-hint">← → variations</div>
        <button
          aria-label="Back to the editor"
          onClick={onLeave}
          title="Back to the editor — esc"
          type="button"
        >
          Back <kbd>esc</kbd>
        </button>
      </div>
    </div>
  );
}

function Header({
  actions,
  activeView,
  canResetPositions,
  classification,
  commitPlayName,
  demoPlayName,
  focused,
  onCloseMenu,
  onCreateVersion,
  onMenu,
  onRedo,
  onResetPositions,
  onRestoreVersion,
  onUndo,
  onView,
  openMenu,
  playName,
  resetPlayName,
  runtime,
  identity,
  sync,
  syncSnapshot,
  onOpenConflicts,
  phone,
  recentOutputs,
  setPlayName,
  undo,
  versions,
  wristband,
  zonesHidden,
}: {
  actions: ActionMap;
  wristband: WristbandPicker;
  /** Outputs run lately, under Recent in Print & export (issue #69). */
  recentOutputs?: readonly MenuEntry[];
  activeView: View;
  /** Men are off the snap — put them back where the play starts. */
  canResetPositions: boolean;
  /** The Unit · Type pill, bound to the open Play (issue #63). */
  classification: React.ReactNode;
  commitPlayName: () => void;
  demoPlayName: string;
  focused: boolean;
  onCloseMenu: () => void;
  onCreateVersion: (label: string) => void;
  onMenu: (menu: "more" | "export" | "save" | "help" | "new") => void;
  onRedo: () => void;
  onResetPositions: () => void;
  onRestoreVersion: (revisionId: string) => void;
  onUndo: () => void;
  onView: (view: View) => void;
  openMenu: Menu;
  playName: string;
  resetPlayName: () => void;
  runtime: ChalkRuntime;
  identity: IdentityPort;
  sync?: SyncOrchestrator;
  syncSnapshot: SyncSnapshot;
  onOpenConflicts: () => void;
  /** A screen below the floor: the two-row header of issue #92. */
  phone: boolean;
  setPlayName: (name: string) => void;
  undo: EditorUndoState;
  versions: readonly EditorVersionSummary[];
  zonesHidden: boolean;
}) {
  return (
    <header className={phone ? "topbar phone-topbar" : "topbar"}>
      <div className="chalk-mark" aria-hidden="true">
        <i />
      </div>
      <strong className="brand">{PRODUCT_NAME}</strong>
      <nav className="view-tabs" aria-label="Workspace views">
        {destinations.map(({ view, label }) => (
          <button
            aria-current={activeView === view ? "page" : undefined}
            className={activeView === view ? "active" : ""}
            key={view}
            onClick={() => onView(view)}
          >
            {label}
          </button>
        ))}
      </nav>
      {activeView === "Demo" ? (
        <>
          <span className="slash">/</span>
          <span className="demo-title">{DEMO_HEADER_TITLE}</span>
          <span className="demo-play-name">{demoPlayName}</span>
        </>
      ) : (
        <>
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
          {classification}
          {/* Where a narrow header breaks into its second row (issue #68). */}
          <span className="top-break" aria-hidden="true" />
          <span className="top-spacer" />
          <button
            className="quiet"
            disabled={!undo.canUndo}
            onClick={onUndo}
            title={
              undo.undoLabel ? `Undo ${undo.undoLabel}` : "Nothing to undo"
            }
          >
            Undo
          </button>
          <button
            className="quiet"
            disabled={!undo.canRedo}
            onClick={onRedo}
            title={
              undo.redoLabel ? `Redo ${undo.redoLabel}` : "Nothing to redo"
            }
          >
            Redo
          </button>
          <span className="divider" />
          <NewPlayMenu
            actions={actions}
            onDismiss={onCloseMenu}
            onToggle={() => onMenu("new")}
            open={openMenu === "new"}
          />
          <button
            className="quiet reset-positions"
            disabled={!canResetPositions}
            onClick={onResetPositions}
            title="Put every man back at the snap"
            type="button"
          >
            Reset positions
          </button>
          <button
            className="quiet present"
            disabled={!actions.present || activeView === "Present"}
            onClick={actions.present}
            title="Present the play full-window — esc returns"
            type="button"
          >
            Present
          </button>
          <HelpMenu
            actions={actions}
            onDismiss={onCloseMenu}
            onToggle={() => onMenu("help")}
            open={openMenu === "help"}
          />
          <MoreMenu
            actions={actions}
            focused={focused}
            onDismiss={onCloseMenu}
            onToggle={() => onMenu("more")}
            open={openMenu === "more"}
            zonesHidden={zonesHidden}
          >
            <PlaySharePanel runtime={runtime} />
            <BackupPanel runtime={runtime} />
            <AccountPanel
              identity={identity}
              onKeepLocalData={async () => {
                await identity.signOut();
              }}
              onOpenConflicts={onOpenConflicts}
              onRemoveLocalData={async () => {
                await identity.signOut();
                await runtime.destroyLocalData();
              }}
              snapshot={syncSnapshot}
              sync={sync}
            />
          </MoreMenu>
          <ExportMenu
            actions={actions}
            onDismiss={onCloseMenu}
            onToggle={() => onMenu("export")}
            open={openMenu === "export"}
            recent={recentOutputs}
            wristband={wristband}
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
        </>
      )}
    </header>
  );
}
